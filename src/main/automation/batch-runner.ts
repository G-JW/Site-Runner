import type { BatchResult, SiteRunResult, RunTrigger } from '../../shared/types.js';
import type { AutomationRunner } from './runner.js';
import type { DataService } from '../services/data-service.js';

export class BatchRunner {
  private stopping = false;
  private readonly active = new Set<Promise<BatchResult>>();
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

  async shutdown(): Promise<void> {
    this.stopping = true;
    await Promise.allSettled([...this.active]);
  }

  private async performBatch(siteIds: string[], headless?: boolean, trigger: RunTrigger = 'batch'): Promise<BatchResult> {
    const sites = siteIds.map((id) => this.data.getSite(id));
    const startedAt = new Date().toISOString();
    const results: SiteRunResult[] = [];
    for (const site of sites) {
      if (this.stopping || this.runner.isStopping?.()) break;
      try {
        results.push(await this.runner.runSite(site.id, trigger, headless));
      } catch (error) {
        results.push({
          siteId: site.id, siteName: site.name, status: 'failed', message: null,
          error: error instanceof Error ? error.message : String(error),
          startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(), screenshotPath: null,
        });
      }
    }
    const batch: BatchResult = {
      startedAt, finishedAt: new Date().toISOString(), total: results.length,
      success: results.filter((result) => result.status === 'success').length,
      failed: results.filter((result) => result.status === 'failed').length, results,
    };
    if (batch.total) await this.onComplete?.(batch);
    return batch;
  }
}
