import { randomUUID } from 'node:crypto';
import type { ActiveBatch, BatchResult, SiteRunResult, RunTrigger } from '../../shared/types.js';
import type { AutomationRunner } from './runner.js';
import type { DataService } from '../services/data-service.js';

export class BatchRunner {
  private stopping = false;
  private readonly active = new Set<Promise<BatchResult>>();
  private readonly states = new Map<string, ActiveBatch>();
  private readonly listeners = new Set<() => void>();
  getActiveBatches(): ActiveBatch[] { return [...this.states.values()].map((batch) => ({ ...batch, siteIds: [...batch.siteIds] })); }
  onState(listener: () => void): () => void { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  private changed(): void { for (const listener of this.listeners) listener(); }
  constructor(
    private readonly data: DataService,
    private readonly runner: Pick<AutomationRunner, 'runSite'> & Partial<Pick<AutomationRunner, 'isStopping'>>,
    private readonly onComplete?: (result: BatchResult) => Promise<void>,
  ) {}

  async runEnabledSites(): Promise<BatchResult> {
    return this.runSites(this.data.listSites().filter((item) => item.enabled).map((item) => item.id));
  }

  async runSites(siteIds: string[], headless?: boolean, trigger: RunTrigger = 'batch'): Promise<BatchResult> {
    if (this.stopping || this.runner.isStopping?.()) throw new Error('Application is closing; new batches are not accepted');
    const work = this.performBatch(siteIds, headless, trigger);
    this.active.add(work);
    void work.then(() => this.active.delete(work), () => this.active.delete(work));
    return work;
  }

  stopBatch(id: string): boolean {
    const state = this.states.get(id);
    if (!state || state.phase !== 'running') return false;
    state.stopRequested = true; this.changed(); return true;
  }

  async shutdown(): Promise<void> {
    this.stopping = true;
    await Promise.allSettled([...this.active]);
  }

  private async performBatch(siteIds: string[], headless?: boolean, trigger: RunTrigger = 'batch'): Promise<BatchResult> {
    const sites = [...new Set(siteIds)].map((id) => this.data.getSite(id));
    const startedAt = new Date().toISOString();
    const state: ActiveBatch = { id: randomUUID(), siteIds: sites.map((site) => site.id), trigger, total: sites.length, completed: 0, success: 0, failed: 0, currentSiteId: null, phase: 'running' };
    this.states.set(state.id, state); this.changed();
    try {
      const results: SiteRunResult[] = [];
      for (const site of sites) {
        if (this.stopping || this.runner.isStopping?.() || state.stopRequested) break;
        state.currentSiteId = site.id; this.changed();
        try {
          results.push(await this.runner.runSite(site.id, trigger, headless));
        } catch (error) {
          results.push({
            siteId: site.id, siteName: site.name, status: 'failed', message: null,
            error: error instanceof Error ? error.message : String(error),
            startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(), screenshotPath: null,
          });
        }
        state.completed = results.length;
        state.success = results.filter((result) => result.status === 'success').length;
        state.failed = results.length - state.success; state.currentSiteId = null; this.changed();
      }
      const batch: BatchResult = {
        startedAt, finishedAt: new Date().toISOString(), total: results.length,
        success: results.filter((result) => result.status === 'success').length,
        failed: results.filter((result) => result.status === 'failed').length, results, planned: sites.length, stopped: results.length < sites.length,
      };
      if (batch.total && this.onComplete) { state.phase = 'notifying'; this.changed(); await this.onComplete(batch); }
      return batch;
    } finally { this.states.delete(state.id); this.changed(); }
  }
}
