import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { AppDatabase } from "../src/main/database/database.js";
import { DataService } from "../src/main/services/data-service.js";
import { BatchRunner } from "../src/main/automation/batch-runner.js";
import {
  AutomationRunner,
  type AutomationExecutor,
} from "../src/main/automation/runner.js";
import { ProfileService } from "../src/main/profiles/profile-service.js";
import { RuntimeService } from "../src/main/services/runtime-service.js";
import {
  exportConfiguration,
  importConfiguration,
  parseConfiguration,
} from "../src/main/configuration.js";

const databases: AppDatabase[] = [];
afterEach(() => databases.splice(0).forEach((database) => database.close()));
function setup(count = 5) {
  const root = mkdtempSync(path.join(tmpdir(), "site-runner-concurrency-"));
  const database = new AppDatabase(path.join(root, "db.sqlite3"));
  databases.push(database);
  const data = new DataService(database.connection);
  const profiles = new ProfileService(data, path.join(root, "profiles"));
  const sites = Array.from({ length: count }, (_, index) =>
    data.saveSite({
      name: `Task ${index}`,
      url: "https://example.com",
      script: null,
      enabled: true,
      browserProfileId: profiles.create(`Profile ${index}`).id,
      timeoutMs: 30000,
      schedule: { enabled: false, cron: "0 9 * * *" },
    }),
  );
  return { data, root, profiles, sites };
}
function success(id: string) {
  return {
    siteId: id,
    siteName: id,
    status: "success" as const,
    message: null,
    error: null,
    startedAt: "",
    finishedAt: "",
    screenshotPath: null,
    lastUrl: null,
  };
}
function gates() {
  const finish = new Map<string, () => void>();
  const running = new Set<string>();
  let peak = 0;
  const execute: AutomationExecutor = async (request) => {
    running.add(request.siteId);
    peak = Math.max(peak, running.size);
    await new Promise<void>((resolve) => finish.set(request.siteId, resolve));
    running.delete(request.siteId);
    return success(request.siteId);
  };
  return { finish, running, execute, peak: () => peak };
}

it("persists validated limits, round-trips them, and accepts backups without the new setting", () => {
  const { data } = setup(1);
  expect(data.getSettings().maxConcurrency).toBe(3);
  for (const invalid of [0, 11, 1.5, NaN, "3"])
    expect(() =>
      data.updateSettings({ maxConcurrency: invalid as number }),
    ).toThrow(/Concurrency/);
  expect(data.getSettings().maxConcurrency).toBe(3);
  data.updateSettings({ maxConcurrency: 7 });
  const backup = exportConfiguration(data);
  expect(parseConfiguration(backup).settings.maxConcurrency).toBe(7);
  data.updateSettings({ maxConcurrency: 1 });
  importConfiguration(data, backup, true);
  expect(data.getSettings().maxConcurrency).toBe(7);
  const legacy = JSON.parse(JSON.stringify(backup));
  delete legacy.settings.maxConcurrency;
  expect(parseConfiguration(legacy).settings.maxConcurrency).toBe(3);
  expect(() =>
    parseConfiguration({
      ...backup,
      settings: { ...backup.settings, maxConcurrency: 0 },
    }),
  ).toThrow(/Concurrency/);
});

it("refills a bounded batch as tasks finish out of order and only unlocks finished sites", async () => {
  const { data, sites } = setup(4);
  data.updateSettings({ maxConcurrency: 2 });
  const finish = new Map<string, () => void>();
  const entered: string[] = [];
  let active = 0,
    peak = 0,
    notified = 0;
  const batch = new BatchRunner(
    data,
    {
      runSite: async (id) => {
        entered.push(id);
        active++;
        peak = Math.max(peak, active);
        await new Promise<void>((resolve) => finish.set(id, resolve));
        active--;
        if (id === sites[1]!.id) throw new Error("isolated failure");
        return success(id);
      },
    },
    async () => {
      notified++;
    },
  );
  const work = batch.runSites(sites.map((site) => site.id));
  expect(entered).toEqual(sites.slice(0, 2).map((site) => site.id));
  finish.get(sites[1]!.id)!();
  await vi.waitFor(() => expect(entered).toHaveLength(3));
  const state = batch.getActiveBatches()[0]!;
  expect(state).toMatchObject({ completed: 1, failed: 1, concurrency: 2 });
  expect(state.pendingSiteIds).toContain(sites[0]!.id);
  expect(state.pendingSiteIds).not.toContain(sites[1]!.id);
  // Snapshot arrays are copies, not references to internal scheduler state.
  state.pendingSiteIds!.length = 0;
  expect(batch.getActiveBatches()[0]!.pendingSiteIds).toHaveLength(3);
  finish.get(sites[0]!.id)!();
  await vi.waitFor(() => expect(entered).toHaveLength(4));
  finish.get(sites[2]!.id)!();
  finish.get(sites[3]!.id)!();
  const result = await work;
  expect(result.results.map((run) => run.siteId)).toEqual(
    sites.map((site) => site.id),
  );
  expect(result).toMatchObject({
    total: 4,
    success: 3,
    failed: 1,
    stopped: false,
  });
  expect(peak).toBe(2);
  expect(notified).toBe(1);
});

it("waits for all active tasks on Stop and never starts remaining tasks", async () => {
  const { data, sites } = setup();
  data.updateSettings({ maxConcurrency: 2 });
  const run = gates();
  const batch = new BatchRunner(data, {
    runSite: async (id) =>
      run.execute(
        { siteId: id } as Parameters<AutomationExecutor>[0],
        () => undefined,
      ),
  });
  const work = batch.runEnabledSites();
  expect(run.running.size).toBe(2);
  batch.stopBatch(batch.getActiveBatches()[0]!.id);
  let completed = false;
  void work.then(() => {
    completed = true;
  });
  run.finish.get(sites[0]!.id)!();
  await vi.waitFor(() =>
    expect(batch.getActiveBatches()[0]!.completed).toBe(1),
  );
  expect(completed).toBe(false);
  expect(run.finish.size).toBe(2);
  run.finish.get(sites[1]!.id)!();
  await expect(work).resolves.toMatchObject({
    total: 2,
    planned: 5,
    stopped: true,
  });
  expect(run.finish.size).toBe(2);
});

it("shares a global limit across simultaneous batches and manual runs, and skips stopped queued work", async () => {
  const { data, root, profiles, sites } = setup();
  data.updateSettings({ maxConcurrency: 2 });
  const run = gates();
  const runner = new AutomationRunner(
    data,
    profiles,
    path.join(root, "shots"),
    () => undefined,
    run.execute,
  );
  const first = new BatchRunner(data, runner),
    second = new BatchRunner(data, runner);
  const runtime = new RuntimeService(runner, [first, second]);
  const a = first.runSites([sites[0]!.id, sites[1]!.id]);
  await vi.waitFor(() => expect(run.running.size).toBe(2));
  const b = second.runSites([sites[2]!.id, sites[3]!.id]);
  const manual = runner.runSite(sites[4]!.id, "manual");
  second.stopBatch(second.getActiveBatches()[0]!.id);
  // A stopped batch waiting behind unrelated work should finish immediately.
  await expect(b).resolves.toMatchObject({
    total: 0,
    planned: 2,
    stopped: true,
  });
  expect(runtime.isBusy(sites[0]!.id)).toBe(true);
  run.finish.get(sites[1]!.id)!();
  await vi.waitFor(() => expect(run.running.has(sites[4]!.id)).toBe(true));
  expect(runtime.isBusy(sites[0]!.id)).toBe(true);
  expect(runtime.isBusy(sites[1]!.id)).toBe(false);
  run.finish.get(sites[0]!.id)!();
  run.finish.get(sites[4]!.id)!();
  await Promise.all([a, manual]);
  await expect(b).resolves.toMatchObject({
    total: 0,
    planned: 2,
    stopped: true,
  });
  expect(run.peak()).toBe(2);
  expect(run.finish.size).toBe(3);
  expect(data.listRuns()).toHaveLength(3);
  expect(runtime.snapshot()).toMatchObject({ runs: [], batches: [] });
});

it("honors a lower limit as active tasks finish without interrupting them", async () => {
  const { data, root, profiles, sites } = setup(3);
  data.updateSettings({ maxConcurrency: 2 });
  const run = gates();
  const runner = new AutomationRunner(
    data,
    profiles,
    path.join(root, "shots"),
    () => undefined,
    run.execute,
  );
  const works = sites.map((site) => runner.runSite(site.id, "manual"));
  await vi.waitFor(() => expect(run.running.size).toBe(2));
  data.updateSettings({ maxConcurrency: 1 });
  run.finish.get(sites[0]!.id)!();
  await vi.waitFor(() => expect(runner.isRunning(sites[0]!.id)).toBe(false));
  expect(run.finish.has(sites[2]!.id)).toBe(false);
  run.finish.get(sites[1]!.id)!();
  await vi.waitFor(() => expect(run.running.has(sites[2]!.id)).toBe(true));
  run.finish.get(sites[2]!.id)!();
  await Promise.all(works);
  expect(data.listRuns()).toHaveLength(3);
});
