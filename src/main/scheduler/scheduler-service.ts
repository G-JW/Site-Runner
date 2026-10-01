import cron, { type ScheduledTask } from 'node-cron';
import type { AutomationRunner } from '../automation/runner.js';
import type { DataService } from '../services/data-service.js';
import type { Site } from '../../shared/types.js';

export function validateCron(expression: string): boolean { return cron.validate(expression); }

export class SchedulerService {
  private readonly tasks = new Map<string, ScheduledTask>();

  constructor(private readonly data: DataService, private readonly runner: Pick<AutomationRunner, 'runSite'>) {}

  start(): void { this.refreshAll(); }

  refreshAll(): void {
    this.stop();
    for (const site of this.data.listSites()) this.refresh(site);
  }

  refresh(site: Site): void {
    this.remove(site.id);
    if (!site.schedule.enabled) return;
    if (!validateCron(site.schedule.cron)) throw new Error('Invalid cron expression');
    const task = cron.schedule(site.schedule.cron, () => {
      void this.runner.runSite(site.id, 'schedule').catch((error: unknown) => {
        console.error(`Scheduled run failed for ${site.name}:`, error);
      });
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
