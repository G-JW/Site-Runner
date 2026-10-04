import cron, { type ScheduledTask } from 'node-cron';
import type { AutomationRunner } from '../automation/runner.js';
import type { DataService } from '../services/data-service.js';
import type { Site, SiteRunResult } from '../../shared/types.js';

export function validateCron(expression: string): boolean { return cron.validate(expression); }

export class SchedulerService {
  private readonly tasks = new Map<string, ScheduledTask>();
  private readonly active = new Set<Promise<unknown>>();
  private closing = false;

  private track(work: Promise<unknown>): void {
    this.active.add(work);
    void work.then(() => this.active.delete(work), () => this.active.delete(work));
  }

  async shutdown(): Promise<void> {
    this.closing = true; this.stop();
    await Promise.allSettled([...this.active]);
  }

  constructor(private readonly data: DataService, private readonly runner: Pick<AutomationRunner, 'runSite'>, private readonly onComplete?: (result: SiteRunResult) => Promise<void>, private readonly runFolder?: (folderId: string) => Promise<void>) {}

  private readonly runningFolders = new Set<string>();

  start(): void { this.refreshAll(); }

  refreshAll(): void {
    if (this.closing) return;
    this.stop();
    for (const site of this.data.listSites()) this.refresh(site);
    if (this.runFolder) for (const folder of this.data.listFolders()) {
      if (!folder.schedule.enabled) continue;
      const task = cron.schedule(folder.schedule.cron, () => {
        if (this.closing || this.runningFolders.has(folder.id) || !this.data.listFolders().some((item) => item.id === folder.id && item.schedule.enabled)) return;
        this.runningFolders.add(folder.id);
        this.track(this.runFolder!(folder.id).catch((error: unknown) => console.error('Folder schedule failed', error)).finally(() => this.runningFolders.delete(folder.id)));
      });
      this.tasks.set(`folder:${folder.id}`, task);
    }
  }

  refresh(site: Site): void {
    if (this.closing) return;
    this.remove(site.id);
    if (!site.enabled || !site.schedule.enabled) return;
    if (!validateCron(site.schedule.cron)) throw new Error('Invalid cron expression');
    const task = cron.schedule(site.schedule.cron, () => {
      if (this.closing) return;
      const current = this.data.getSite(site.id);
      if (!current.enabled || !current.schedule.enabled) return;
      this.track(this.runner.runSite(site.id, 'schedule').then((result) => this.onComplete?.(result)).catch((error: unknown) => {
        console.error(`Scheduled run failed for ${site.name}:`, error);
      }));
    });
    this.tasks.set(site.id, task);
  }

  remove(siteId: string): void {
    const task = this.tasks.get(siteId);
    task?.stop(); task?.destroy(); this.tasks.delete(siteId);
  }

  stop(): void {
    for (const siteId of [...this.tasks.keys()]) this.remove(siteId);
  }
}
