import { randomUUID } from "node:crypto";
import type {
  ActiveBatch,
  BatchResult,
  SiteRunResult,
  RunTrigger,
} from "../../shared/types.js";
import type { AutomationRunner } from "./runner.js";
import type { DataService } from "../services/data-service.js";
import { RunCancelledError } from "./concurrency-limiter.js";

export class BatchRunner {
  private stopping = false;
  private readonly active = new Set<Promise<BatchResult>>();
  private readonly controllers = new Map<string, AbortController>();
  private readonly states = new Map<string, ActiveBatch>();
  private readonly listeners = new Set<() => void>();
  getActiveBatches(): ActiveBatch[] {
    return [...this.states.values()].map((batch) => ({
      ...batch,
      siteIds: [...batch.siteIds],
      activeSiteIds: [...(batch.activeSiteIds ?? [])],
      pendingSiteIds: [...(batch.pendingSiteIds ?? [])],
    }));
  }
  onState(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  private changed(): void {
    for (const listener of this.listeners) listener();
  }
  constructor(
    private readonly data: DataService,
    private readonly runner: Pick<AutomationRunner, "runSite"> &
      Partial<Pick<AutomationRunner, "isStopping">>,
    private readonly onComplete?: (result: BatchResult) => Promise<void>,
  ) {}

  async runEnabledSites(): Promise<BatchResult> {
    return this.runSites(
      this.data
        .listSites()
        .filter((item) => item.enabled)
        .map((item) => item.id),
    );
  }

  async runSites(
    siteIds: string[],
    headless?: boolean,
    trigger: RunTrigger = "batch",
  ): Promise<BatchResult> {
    if (this.stopping || this.runner.isStopping?.())
      throw new Error("Application is closing; new batches are not accepted");
    const work = this.performBatch(siteIds, headless, trigger);
    this.active.add(work);
    void work.then(
      () => this.active.delete(work),
      () => this.active.delete(work),
    );
    return work;
  }

  stopBatch(id: string): boolean {
    const state = this.states.get(id);
    if (!state || state.phase !== "running") return false;
    state.stopRequested = true;
    this.controllers.get(id)?.abort();
    this.changed();
    return true;
  }

  async shutdown(): Promise<void> {
    this.stopping = true;
    for (const controller of this.controllers.values()) controller.abort();
    await Promise.allSettled([...this.active]);
  }

  private async performBatch(
    siteIds: string[],
    headless?: boolean,
    trigger: RunTrigger = "batch",
  ): Promise<BatchResult> {
    const sites = [...new Set(siteIds)].map((id) => this.data.getSite(id));
    const startedAt = new Date().toISOString();
    const concurrency = this.data.getSettings().maxConcurrency;
    const state: ActiveBatch = {
      id: randomUUID(),
      siteIds: sites.map((site) => site.id),
      pendingSiteIds: sites.map((site) => site.id),
      activeSiteIds: [],
      concurrency,
      trigger,
      total: sites.length,
      completed: 0,
      success: 0,
      failed: 0,
      currentSiteId: null,
      phase: "running",
    };
    const controller = new AbortController();
    this.controllers.set(state.id, controller);
    this.states.set(state.id, state);
    this.changed();
    const canStart = () =>
      !this.stopping && !this.runner.isStopping?.() && !state.stopRequested;
    try {
      // Slots pull the next job as soon as they finish. Preserve input order in the final report.
      const ordered: Array<SiteRunResult | undefined> = new Array(sites.length);
      let nextIndex = 0;
      const worker = async () => {
        while (canStart() && nextIndex < sites.length) {
          const index = nextIndex++,
            site = sites[index]!;
          state.activeSiteIds!.push(site.id);
          state.currentSiteId = state.activeSiteIds![0] ?? null;
          this.changed();
          try {
            ordered[index] = await this.runner.runSite(
              site.id,
              trigger,
              headless,
              canStart,
              controller.signal,
            );
          } catch (error) {
            if (!(error instanceof RunCancelledError))
              ordered[index] = {
                siteId: site.id,
                siteName: site.name,
                status: "failed",
                message: null,
                error: error instanceof Error ? error.message : String(error),
                startedAt: new Date().toISOString(),
                finishedAt: new Date().toISOString(),
                screenshotPath: null,
              };
          } finally {
            state.activeSiteIds = state.activeSiteIds!.filter(
              (id) => id !== site.id,
            );
            state.currentSiteId = state.activeSiteIds[0] ?? null;
            if (ordered[index]) {
              state.completed++;
              if (ordered[index]!.status === "success") state.success++;
              else state.failed++;
              state.pendingSiteIds = state.pendingSiteIds!.filter(
                (id) => id !== site.id,
              );
            }
            this.changed();
          }
        }
      };
      await Promise.all(
        Array.from({ length: Math.min(concurrency, sites.length) }, worker),
      );
      const results = ordered.filter(
        (result): result is SiteRunResult => result !== undefined,
      );
      const batch: BatchResult = {
        startedAt,
        finishedAt: new Date().toISOString(),
        total: results.length,
        success: state.success,
        failed: state.failed,
        results,
        planned: sites.length,
        stopped: results.length < sites.length,
      };
      if (batch.total && this.onComplete) {
        state.phase = "notifying";
        this.changed();
        await this.onComplete(batch);
      }
      return batch;
    } finally {
      this.controllers.delete(state.id);
      this.states.delete(state.id);
      this.changed();
    }
  }
}
