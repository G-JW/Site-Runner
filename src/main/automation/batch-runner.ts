import type { BatchResult, SiteRunResult, RunTrigger } from '../../shared/types.js';
import type { AutomationRunner } from './runner.js';
import type { DataService } from '../services/data-service.js';

export class BatchRunner {
  constructor(
    private readonly data: DataService,
    private readonly runner: Pick<AutomationRunner, 'runSite'>,
    private readonly onComplete?: (result: BatchResult) => Promise<void>,
  ) {}

  async runEnabledSites(): Promise<BatchResult> {
    return this.runSites(this.data.listSites().filter((item) => item.enabled).map((item) => item.id));
  }

  async runSites(siteIds: string[], headless?: boolean, trigger: RunTrigger = 'batch'): Promise<BatchResult> {
    const sites = siteIds.map((id) => this.data.getSite(id));
    const startedAt = new Date().toISOString();
    const results: SiteRunResult[] = [];
    for (const site of sites) {
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
    await this.onComplete?.(batch);
    return batch;
  }
}
