import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { AppDatabase } from "../src/main/database/database.js";
import { DataService } from "../src/main/services/data-service.js";
import { SchedulerService } from "../src/main/scheduler/scheduler-service.js";
import { dailyCron } from "../src/shared/daily-schedule.js";

const scheduled = vi.hoisted(
  () =>
    [] as Array<{
      expression: string;
      fire(): void;
      destroy: ReturnType<typeof vi.fn>;
    }>,
);
vi.mock("node-cron", () => ({
  default: {
    validate: () => true,
    schedule: (expression: string, fire: () => void) => {
      const entry = { expression, fire, destroy: vi.fn() };
      scheduled.push(entry);
      return {
        ...entry,
        stop: vi.fn(),
        getNextRun: () => new Date("2026-11-22T01:00:00Z"),
      };
    },
  },
}));
const databases: AppDatabase[] = [];
afterEach(() => {
  databases.forEach((db) => db.close());
  databases.length = 0;
  scheduled.length = 0;
});
function setup() {
  const db = new AppDatabase(
    path.join(mkdtempSync(path.join(tmpdir(), "sr-daily-")), "test.sqlite3"),
  );
  databases.push(db);
  const data = new DataService(db.connection);
  data.updateSettings({ dailyCatchUpEnabled: false });
  const profile = data.createProfile("Default");
  const folder = data.saveFolder({
    name: "Daily",
    schedule: { enabled: true, cron: "0 10 * * *" },
  });
  const site = data.saveSite({
    name: "A",
    url: "https://example.com",
    enabled: true,
    script: null,
    browserProfileId: profile.id,
    folderId: folder.id,
    timeoutMs: 30000,
    schedule: { enabled: true, cron: "0 11 * * *" },
  });
  return { data, site };
}
it("validates and persists daily time and switch without partially saving malformed input", () => {
  const { data } = setup();
  expect(data.getSettings()).toMatchObject({
    dailyRunEnabled: true,
    dailyRunTime: "09:00",
  });
  data.updateSettings({ dailyRunTime: "23:59", dailyRunEnabled: false });
  expect(data.getSettings()).toMatchObject({
    dailyRunEnabled: false,
    dailyRunTime: "23:59",
  });
  for (const time of ["24:00", "09:60", "9:00", "", null])
    expect(() =>
      data.updateSettings({ dailyRunTime: time as string }),
    ).toThrow();
  expect(data.getSettings().dailyRunTime).toBe("23:59");
  expect(dailyCron("09:05")).toBe("5 9 * * *");
});
it("uses one global timer, overrides folder/site plans, and prevents re-execution after refresh or restart", async () => {
  const { data, site } = setup();
  const runDaily = vi.fn(async () => undefined),
    runSite = vi.fn(),
    runFolder = vi.fn();
  const scheduler = new SchedulerService(
    data,
    { runSite },
    undefined,
    runFolder,
    undefined,
    runDaily,
  );
  scheduler.start();
  expect(scheduled.map((t) => t.expression)).toEqual(["0 9 * * *"]);
  expect(scheduler.nextSchedules()[site.id]).toBe("2026-11-22T01:00:00.000Z");
  scheduled[0]!.fire();
  scheduled[0]!.fire();
  await vi.waitFor(() => expect(runDaily).toHaveBeenCalledOnce());
  scheduler.refreshAll();
  scheduled[1]!.fire();
  expect(runDaily).toHaveBeenCalledOnce();
  await scheduler.shutdown();
  const restarted = new SchedulerService(
    data,
    { runSite },
    undefined,
    runFolder,
    undefined,
    runDaily,
  );
  restarted.start();
  scheduled[2]!.fire();
  expect(runDaily).toHaveBeenCalledOnce();
  expect(runSite).not.toHaveBeenCalled();
  expect(runFolder).not.toHaveBeenCalled();
  await restarted.shutdown();
});
it("replaces the timer after a time change and restores individual plans when disabled", async () => {
  const { data } = setup();
  const runDaily = vi.fn(async () => undefined);
  const scheduler = new SchedulerService(
    data,
    { runSite: vi.fn() },
    undefined,
    vi.fn(),
    undefined,
    runDaily,
  );
  scheduler.start();
  data.updateSettings({ dailyRunTime: "18:30" });
  scheduler.refreshAll();
  expect(scheduled[0]!.destroy).toHaveBeenCalledOnce();
  expect(scheduled[1]!.expression).toBe("30 18 * * *");
  scheduled[0]!.fire();
  expect(runDaily).not.toHaveBeenCalled();
  data.updateSettings({ dailyRunEnabled: false });
  scheduler.refreshAll();
  expect(scheduled.slice(2).map((t) => t.expression)).toEqual([
    "0 11 * * *",
    "0 10 * * *",
  ]);
  scheduled[1]!.fire();
  expect(runDaily).not.toHaveBeenCalled();
  await scheduler.shutdown();
});
it("waits for an in-flight daily batch on quit and ignores later callbacks", async () => {
  const { data } = setup();
  let finish!: () => void;
  const runDaily = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  const scheduler = new SchedulerService(
    data,
    { runSite: vi.fn() },
    undefined,
    undefined,
    undefined,
    runDaily,
  );
  scheduler.start();
  scheduled[0]!.fire();
  let done = false;
  const shutting = scheduler.shutdown().then(() => {
    done = true;
  });
  scheduled[0]!.fire();
  await Promise.resolve();
  expect(done).toBe(false);
  finish();
  await shutting;
  expect(done).toBe(true);
  expect(runDaily).toHaveBeenCalledOnce();
});

it("catches up only after today's time, honors its switch, and deduplicates startup, reopen and cron", async () => {
  const { data } = setup();
  data.updateSettings({ dailyRunTime: "01:00", dailyCatchUpEnabled: true });
  const runDaily = vi.fn(async () => undefined);
  const scheduler = new SchedulerService(
    data,
    { runSite: vi.fn() },
    undefined,
    undefined,
    undefined,
    runDaily,
  );
  const day = new Date(2026, 10, 21, 0, 59);
  scheduler.catchUp(day);
  expect(runDaily).not.toHaveBeenCalled();
  data.updateSettings({ dailyCatchUpEnabled: false });
  scheduler.catchUp(new Date(2026, 10, 21, 2, 0));
  expect(runDaily).not.toHaveBeenCalled();
  data.updateSettings({ dailyCatchUpEnabled: true });
  scheduler.catchUp(new Date(2026, 10, 21, 2, 0));
  scheduler.catchUp(new Date(2026, 10, 21, 3, 0));
  await vi.waitFor(() => expect(runDaily).toHaveBeenCalledOnce());
  expect(runDaily).toHaveBeenCalledWith(true);
  await scheduler.shutdown();
  const reopened = new SchedulerService(
    data,
    { runSite: vi.fn() },
    undefined,
    undefined,
    undefined,
    runDaily,
  );
  reopened.catchUp(new Date(2026, 10, 21, 4, 0));
  await Promise.resolve();
  expect(runDaily).toHaveBeenCalledOnce();
  reopened.catchUp(new Date(2026, 10, 22, 2, 0));
  await vi.waitFor(() => expect(runDaily).toHaveBeenCalledTimes(2));
  await reopened.shutdown();
});

it("does not catch up disabled tasks or tasks already attempted today, even when failed", async () => {
  const { data, site } = setup();
  data.updateSettings({ dailyRunTime: "01:00", dailyCatchUpEnabled: true });
  const now = new Date(2026, 10, 21, 3, 0);
  data.saveRun({
    id: "attempt",
    siteId: site.id,
    siteName: site.name,
    startedAt: new Date(2026, 10, 21, 1, 0).toISOString(),
    finishedAt: new Date(2026, 10, 21, 1, 1).toISOString(),
    status: "failed",
    message: null,
    error: "Timeout",
    lastUrl: site.url,
    screenshotPath: null,
    trigger: "manual",
  });
  const runDaily = vi.fn(async () => undefined);
  const scheduler = new SchedulerService(
    data,
    { runSite: vi.fn() },
    undefined,
    undefined,
    undefined,
    runDaily,
  );
  scheduler.catchUp(now);
  await Promise.resolve();
  expect(runDaily).not.toHaveBeenCalled();
  data.saveSite({ ...site, enabled: false });
  scheduler.catchUp(new Date(2026, 10, 22, 3, 0));
  await Promise.resolve();
  expect(runDaily).not.toHaveBeenCalled();
  await scheduler.shutdown();
});

it("checks missed work on startup but does not launch catch-up merely when refreshing settings", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  try {
    vi.setSystemTime(new Date(2026, 10, 21, 2, 0));
    const { data } = setup();
    data.updateSettings({ dailyRunTime: "01:00", dailyCatchUpEnabled: true });
    const runDaily = vi.fn(async () => undefined);
    const scheduler = new SchedulerService(
      data,
      { runSite: vi.fn() },
      undefined,
      undefined,
      undefined,
      runDaily,
    );
    scheduler.refreshAll();
    await Promise.resolve();
    expect(runDaily).not.toHaveBeenCalled();
    scheduler.start();
    await Promise.resolve();
    expect(runDaily).toHaveBeenCalledWith(true);
    await scheduler.shutdown();
  } finally {
    vi.useRealTimers();
  }
});
