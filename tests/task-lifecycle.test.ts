import { mkdtempSync, readdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { AppDatabase } from "../src/main/database/database.js";
import { DataService } from "../src/main/services/data-service.js";
import { SchedulerService } from "../src/main/scheduler/scheduler-service.js";
import { BatchRunner } from "../src/main/automation/batch-runner.js";
import {
  effectiveSchedule,
  resultKind,
} from "../src/shared/task-presentation.js";
import { exportSiteRules, parseSiteRules } from "../src/main/site-rules.js";
import { executeAutomation } from "../src/main/automation/worker-execution.js";
import type { SiteInput } from "../src/shared/types.js";

const databases: AppDatabase[] = [];
afterEach(() => databases.splice(0).forEach((database) => database.close()));
function fixture() {
  const root = mkdtempSync("/private/tmp/site-runner-lifecycle-");
  const database = new AppDatabase(path.join(root, "db.sqlite3"));
  databases.push(database);
  const data = new DataService(database.connection),
    profile = data.createProfile("Default");
  const input: SiteInput = {
    name: "Task",
    url: "https://example.com",
    script: null,
    enabled: true,
    browserProfileId: profile.id,
    timeoutMs: 10000,
    schedule: { enabled: false, cron: "0 9 * * *" },
  };
  return { root, data, input };
}
describe("task lifecycle", () => {
  it("upgrades a v5 database with a recoverable snapshot and preserves scripts, profiles and historical results", () => {
    const { root, data, input } = fixture();
    const script = 'export default async function run() { return "legacy"; }';
    const site = data.saveSite({ ...input, script });
    data.saveRun({
      id: "legacy",
      siteId: site.id,
      siteName: site.name,
      startedAt: "2026-10-01T00:00:00Z",
      finishedAt: "2026-10-01T00:01:00Z",
      status: "success",
      message: "legacy",
      error: null,
      lastUrl: site.url,
      screenshotPath: null,
      trigger: "manual",
    });
    const v5 = databases.pop()!;
    v5.connection.exec(
      "ALTER TABLE sites DROP COLUMN schedule_mode; ALTER TABLE run_records DROP COLUMN outcome; PRAGMA user_version = 5;",
    );
    v5.close();
    const upgraded = new AppDatabase(path.join(root, "db.sqlite3"));
    databases.push(upgraded);
    const restored = new DataService(upgraded.connection);
    expect(restored.getSite(site.id)).toMatchObject({
      script,
      browserProfileId: input.browserProfileId,
      lastRun: { id: "legacy", status: "success" },
    });
    expect(restored.listProfiles()).toHaveLength(1);
    expect(
      upgraded.connection.prepare("PRAGMA user_version").get(),
    ).toMatchObject({ user_version: 6 });
    const file = readdirSync(path.join(root, "backups")).find((name) =>
      name.startsWith("before-v5-"),
    )!;
    const snapshot = new DatabaseSync(path.join(root, "backups", file), {
      readOnly: true,
    });
    try {
      expect(snapshot.prepare("PRAGMA user_version").get()).toMatchObject({
        user_version: 5,
      });
      expect(
        snapshot.prepare("SELECT script FROM sites WHERE id = ?").get(site.id),
      ).toMatchObject({ script });
      expect(snapshot.prepare("SELECT id FROM run_records").all()).toEqual([
        { id: "legacy" },
      ]);
    } finally {
      snapshot.close();
    }
  });

  it("persists manual-only plans, exports them, and imports a custom plan without enabling it", () => {
    const { data, input } = fixture();
    const manual = data.saveSite({
      ...input,
      schedule: { ...input.schedule, mode: "manual" },
    });
    const exported = parseSiteRules(exportSiteRules([manual]));
    expect(exported[0]?.schedule.mode).toBe("manual");
    expect(data.getSite(manual.id).schedule.mode).toBe("manual");
    const imported = data.importSiteRules([
      {
        ...input,
        schedule: { enabled: true, cron: "0 9 * * *", mode: "custom" },
      },
    ]);
    expect(imported[0]).toMatchObject({
      enabled: false,
      schedule: { enabled: false, mode: "manual" },
    });
  });
  it("gives one effective plan to each task and previews the same plan the scheduler uses", async () => {
    const { data, input } = fixture();
    const group = data.saveFolder({
      name: "Daily",
      schedule: { enabled: true, cron: "0 9 * * *" },
    });
    const inherited = data.saveSite({
      ...input,
      folderId: group.id,
      schedule: { ...input.schedule, mode: "inherit" },
    });
    const custom = data.saveSite({
      ...input,
      name: "Custom",
      folderId: group.id,
      schedule: { enabled: true, cron: "0 17 * * *", mode: "custom" },
    });
    const manual = data.saveSite({
      ...input,
      name: "Manual",
      folderId: group.id,
      schedule: { ...input.schedule, mode: "manual" },
    });
    const disabled = data.saveSite({
      ...input,
      name: "Disabled",
      enabled: false,
      folderId: group.id,
    });
    const scheduler = new SchedulerService(
      data,
      {
        runSite: async () => {
          throw new Error("Not expected");
        },
      },
      undefined,
      async () => {},
    );
    try {
      scheduler.start();
      const previews = scheduler.nextSchedules();
      expect(previews[inherited.id]).toBeTruthy();
      expect(previews[custom.id]).toBeTruthy();
      expect(previews[inherited.id]).not.toBe(previews[custom.id]);
      expect(previews[manual.id]).toBeNull();
      expect(previews[disabled.id]).toBeNull();
      expect(effectiveSchedule(inherited, [group])).toMatchObject({
        source: "inherit",
        cron: group.schedule.cron,
      });
      expect(effectiveSchedule(custom, [group])).toMatchObject({
        source: "custom",
        cron: custom.schedule.cron,
      });
      expect(effectiveSchedule(manual, [group])).toBeNull();
      expect(() => scheduler.preview("not a plan")).toThrow(/Invalid/);
      expect(scheduler.preview("0 9 * * *")).toBeTruthy();
    } finally {
      await scheduler.shutdown();
    }
  });
  it("stops only the requested batch after its current task, retains actual results, and accepts subsequent batches", async () => {
    const { data, input } = fixture();
    const sites = ["A", "B"].map((name) => data.saveSite({ ...input, name }));
    let finish!: () => void;
    const gate = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const calls: string[] = [];
    const batch = new BatchRunner(data, {
      runSite: async (id) => {
        calls.push(id);
        await gate;
        return {
          siteId: id,
          siteName: id,
          status: "success",
          message: "",
          error: null,
          startedAt: "",
          finishedAt: "",
          screenshotPath: null,
        };
      },
    });
    const work = batch.runEnabledSites();
    const state = batch.getActiveBatches()[0]!;
    expect(batch.stopBatch(state.id)).toBe(true);
    expect(batch.getActiveBatches()[0]?.stopRequested).toBe(true);
    finish();
    expect(await work).toMatchObject({ planned: 2, total: 1, stopped: true });
    expect(calls).toEqual([sites[0]!.id]);
    expect(batch.getActiveBatches()).toEqual([]);
    expect(await batch.runEnabledSites()).toMatchObject({
      total: 2,
      stopped: false,
    });
  });
  it("normalizes saved and imported legacy checks and preserves history and user messages", () => {
    const { data, input } = fixture();
    const site = data.saveSite({ ...input, visitOptions: Object.assign({ stayMs: 0, detectChallenges: false }, { check: "text", value: "" }) });
    expect(site.visitOptions).toEqual({ stayMs: 0, detectChallenges: false });
    const legacyRule = Object.assign({}, exportSiteRules([site]).sites[0], { visitOptions: { stayMs: 0, detectChallenges: false, check: "selector", value: "#missing" } });
    expect(parseSiteRules({ format: "site-runner-sites", version: 1, sites: [legacyRule] })[0]?.visitOptions).toEqual({ stayMs: 0, detectChallenges: false });
    for (const [id, message] of [["default", "Page visited (login and business results not verified)"], ["custom", "My task completed"]]) {
      data.saveRun({ id: id!, siteId: site.id, siteName: site.name, startedAt: "2026-10-01T00:00:00Z", finishedAt: "2026-10-01T00:01:00Z", status: "success", message: message!, error: null, lastUrl: site.url, screenshotPath: null, trigger: "manual" });
    }
    expect(data.getRun("default").message).toBe("Page visited");
    expect(data.getRun("custom").message).toBe("My task completed");
    expect(data.listRuns()).toHaveLength(2);
    expect(data.listRuns().every((run) => !("outcome" in run))).toBe(true);
  });
  it("presents ordinary execution results without verification metadata", () => {
    expect(resultKind({ status: "success" })).toBe("success");
    expect(resultKind(Object.assign({ status: "success" as const }, { outcome: "unverified" }))).toBe("success");
    expect(resultKind(Object.assign({ status: "failed" as const }, { outcome: "verified" }))).toBe("failed");
    expect(resultKind(null)).toBe("idle");
  });
  it("ignores legacy post-run checks while retaining explicit script failures", async () => {
    const { root } = fixture();
    const base = {
      siteId: "task", siteName: "Task",
      url: "data:text/html,<p>Waiting</p>", timeoutMs: 600, headless: true,
      screenshotPath: path.join(root, "failure.png"),
      visitOptions: { stayMs: 0, detectChallenges: false, check: "selector" as const, value: "#missing" },
    };
    for (const [id, script] of [["visit", null], ["script", 'export default async function run() { return "done"; }']] as const) {
      const result = await executeAutomation({ ...base, script, profilePath: path.join(root, id) }, () => {});
      expect(result.status).toBe("success");
      expect(result).not.toHaveProperty("outcome");
    }
    const failed = await executeAutomation({ ...base, script: 'export default async function run() { throw new Error("Explicit check failed"); }', profilePath: path.join(root, "failure") }, () => {});
    expect(failed).toMatchObject({ status: "failed", error: expect.stringContaining("Explicit check failed") });
    expect(failed.screenshotPath).toBeTruthy();
  });
});
