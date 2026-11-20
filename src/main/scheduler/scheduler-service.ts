import {
  dailyCron,
  localDay,
  dailyTimeReached,
  ranOnDay,
} from "../../shared/daily-schedule.js";
import cron, { type ScheduledTask } from "node-cron";
import type { AutomationRunner } from "../automation/runner.js";
import type { DataService } from "../services/data-service.js";
import type { Site, SiteRunResult } from "../../shared/types.js";

export function validateCron(expression: string): boolean {
  return cron.validate(expression);
}

export class SchedulerService {
  private readonly tasks = new Map<string, ScheduledTask>();
  private readonly active = new Set<Promise<unknown>>();
  private closing = false;
  private runningDaily = false;

  private track(work: Promise<unknown>): void {
    this.active.add(work);
    void work.then(
      () => this.active.delete(work),
      () => this.active.delete(work),
    );
  }

  async shutdown(): Promise<void> {
    this.closing = true;
    this.stop();
    await Promise.allSettled([...this.active]);
  }

  constructor(
    private readonly data: DataService,
    private readonly runner: Pick<AutomationRunner, "runSite">,
    private readonly onComplete?: (result: SiteRunResult) => Promise<void>,
    private readonly runFolder?: (folderId: string) => Promise<void>,
    private readonly canRun: (siteId: string) => boolean = () => true,
    private readonly runDaily?: (catchUp?: boolean) => Promise<void>,
    private readonly canRunDaily: () => boolean = () => true,
  ) {}

  private readonly runningFolders = new Set<string>();

  nextSchedules(): Record<string, string | null> {
    const next: Record<string, string | null> = {};
    for (const site of this.data.listSites()) {
      const task = this.dailyEnabled()
        ? this.tasks.get("daily")
        : site.schedule.enabled
          ? this.tasks.get(site.id)
          : site.schedule.mode !== "manual" && site.folderId
            ? this.tasks.get(`folder:${site.folderId}`)
            : undefined;
      next[site.id] = site.enabled
        ? (task?.getNextRun()?.toISOString() ?? null)
        : null;
    }
    return next;
  }

  preview(expression: string): string | null {
    if (!validateCron(expression)) throw new Error("Invalid cron expression");
    const task = cron.schedule(expression, () => {});
    try {
      return task.getNextRun()?.toISOString() ?? null;
    } finally {
      task.destroy();
    }
  }

  private dailyEnabled(): boolean {
    return Boolean(this.runDaily && this.data.getSettings().dailyRunEnabled);
  }

  start(): void {
    this.refreshAll();
    this.catchUp();
  }

  /** Check only on application startup / reopening, never while changing preferences. */
  catchUp(now = new Date()): void {
    const settings = this.data.getSettings();
    if (
      this.closing ||
      !this.dailyEnabled() ||
      !settings.dailyCatchUpEnabled ||
      !dailyTimeReached(settings.dailyRunTime, now)
    )
      return;
    const day = localDay(now);
    if (
      !this.data
        .listSites()
        .some((site) => site.enabled && !ranOnDay(site.lastRun, day))
    )
      return;
    this.runDailyOnce(true, day);
  }

  private runDailyOnce(catchUp = false, day = localDay()): void {
    if (
      !this.canRunDaily() ||
      this.runningDaily ||
      !this.data.claimDailyRun(day)
    )
      return;
    this.runningDaily = true;
    this.track(
      Promise.resolve()
        .then(() => this.runDaily!(catchUp))
        .catch((error: unknown) =>
          console.error("Daily schedule failed", error),
        )
        .finally(() => {
          this.runningDaily = false;
        }),
    );
  }

  refreshAll(): void {
    if (this.closing) return;
    this.stop();
    if (this.dailyEnabled()) {
      const time = this.data.getSettings().dailyRunTime;
      const task = cron.schedule(dailyCron(time), () => {
        if (
          this.closing ||
          this.runningDaily ||
          !this.dailyEnabled() ||
          this.data.getSettings().dailyRunTime !== time
        )
          return;
        this.runDailyOnce();
      });
      this.tasks.set("daily", task);
      return;
    }
    for (const site of this.data.listSites()) this.refresh(site);
    if (this.runFolder)
      for (const folder of this.data.listFolders()) {
        if (!folder.schedule.enabled) continue;
        const task = cron.schedule(folder.schedule.cron, () => {
          if (
            this.closing ||
            this.dailyEnabled() ||
            this.runningFolders.has(folder.id) ||
            !this.data
              .listFolders()
              .some((item) => item.id === folder.id && item.schedule.enabled)
          )
            return;
          this.runningFolders.add(folder.id);
          this.track(
            this.runFolder!(folder.id)
              .catch((error: unknown) =>
                console.error("Folder schedule failed", error),
              )
              .finally(() => this.runningFolders.delete(folder.id)),
          );
        });
        this.tasks.set(`folder:${folder.id}`, task);
      }
  }

  refresh(site: Site): void {
    if (this.closing) return;
    this.remove(site.id);
    if (this.dailyEnabled() || !site.enabled || !site.schedule.enabled) return;
    if (!validateCron(site.schedule.cron))
      throw new Error("Invalid cron expression");
    const task = cron.schedule(site.schedule.cron, () => {
      if (this.closing || this.dailyEnabled()) return;
      const current = this.data.getSite(site.id);
      if (
        !current.enabled ||
        !current.schedule.enabled ||
        !this.canRun(site.id)
      )
        return;
      this.track(
        this.runner
          .runSite(site.id, "schedule")
          .then((result) => this.onComplete?.(result))
          .catch((error: unknown) => {
            console.error(`Scheduled run failed for ${site.name}:`, error);
          }),
      );
    });
    this.tasks.set(site.id, task);
  }

  remove(siteId: string): void {
    const task = this.tasks.get(siteId);
    task?.stop();
    task?.destroy();
    this.tasks.delete(siteId);
  }

  stop(): void {
    for (const siteId of [...this.tasks.keys()]) this.remove(siteId);
  }
}
