import { mkdtempSync } from 'node:fs';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { AppDatabase } from '../src/main/database/database.js';
import { DataService } from '../src/main/services/data-service.js';
import { ProfileService } from '../src/main/profiles/profile-service.js';
import { AutomationRunner, type AutomationExecutor } from '../src/main/automation/runner.js';
import { BatchRunner } from '../src/main/automation/batch-runner.js';
import { RuntimeService } from '../src/main/services/runtime-service.js';
const databases: AppDatabase[] = [];
afterEach(() => databases.splice(0).forEach((db) => db.close()));
function setup(executor: AutomationExecutor) {
  const root = mkdtempSync('/private/tmp/site-runner-runtime-'), database = new AppDatabase(path.join(root, 'test.sqlite3')); databases.push(database);
  const data = new DataService(database.connection), profiles = new ProfileService(data, path.join(root, 'profiles')), profile = profiles.create('Default');
  const sites = ['A', 'B'].map((name) => data.saveSite({ name, url: 'https://example.com', enabled: true, script: null, browserProfileId: profile.id, timeoutMs: 30000, schedule: { enabled: false, cron: '0 9 * * *' } }));
  return { data, sites, runner: new AutomationRunner(data, profiles, path.join(root, 'screenshots'), () => undefined, executor) };
}
function gate() { let release!: () => void; const promise = new Promise<void>((resolve) => { release = resolve; }); return { promise, release }; }

it('publishes batch progress, protects pending sites, releases completed sites and distinguishes notification delivery', async () => {
  const first = gate(), second = gate(), notification = gate();
  const { data, sites, runner } = setup(async (request) => {
    await (request.siteName === 'A' ? first.promise : second.promise);
    return { siteId: request.siteId, siteName: request.siteName, status: request.siteName === 'A' ? 'success' : 'failed', message: null, error: request.siteName === 'B' ? 'boom' : null, startedAt: '', finishedAt: '', screenshotPath: null, lastUrl: null };
  });
  const batch = new BatchRunner(data, runner, async () => notification.promise), runtime = new RuntimeService(runner, [batch]);
  const revisions: number[] = []; runtime.onState((state) => revisions.push(state.revision));
  const work = batch.runSites([sites[0]!.id, sites[0]!.id, sites[1]!.id]);
  await vi.waitFor(() => expect(runtime.snapshot().runs[0]?.phase).toBe('running'));
  expect(runtime.snapshot().batches[0]?.total).toBe(2); expect(() => runtime.assertIdle(sites[1]!.id)).toThrow(/waiting/);
  runtime.snapshot().batches[0]!.siteIds.length = 0; expect(runtime.isBusy(sites[1]!.id)).toBe(true);
  first.release(); await vi.waitFor(() => expect(runtime.snapshot().batches[0]?.completed).toBe(1));
  expect(runtime.isBusy(sites[0]!.id)).toBe(false); expect(runtime.isBusy(sites[1]!.id)).toBe(true);
  second.release(); await vi.waitFor(() => expect(runtime.snapshot().batches[0]?.phase).toBe('notifying'));
  expect(runtime.snapshot().batches[0]).toMatchObject({ completed: 2, success: 1, failed: 1 }); expect(runtime.snapshot().runs).toEqual([]);
  expect(runtime.isBusy(sites[1]!.id)).toBe(false); notification.release(); await work;
  expect(runtime.snapshot().batches).toEqual([]); expect(data.listRuns()).toHaveLength(2);
  expect(revisions.every((revision, index) => index === 0 || revision > revisions[index - 1]!)).toBe(true);
});

it('distinguishes a profile queue from running work and clears both after completion', async () => {
  const finish = gate();
  const { runner, sites } = setup(async (request) => { await finish.promise; return { siteId: request.siteId, siteName: request.siteName, status: 'success', message: null, error: null, startedAt: '', finishedAt: '', screenshotPath: null, lastUrl: null }; });
  const runtime = new RuntimeService(runner, []); const first = runner.runSite(sites[0]!.id, 'manual');
  await vi.waitFor(() => expect(runtime.snapshot().runs[0]?.phase).toBe('running'));
  const second = runner.runSite(sites[1]!.id, 'manual'); expect(runtime.snapshot().runs.find((run) => run.siteId === sites[1]!.id)?.phase).toBe('queued');
  finish.release(); await Promise.all([first, second]); expect(runtime.snapshot().runs).toEqual([]);
});

it('clears state after a batch notification fails and isolates subscriber failures', async () => {
  const { data, runner, sites } = setup(async (request) => ({ siteId: request.siteId, siteName: request.siteName, status: 'success', message: null, error: null, startedAt: '', finishedAt: '', screenshotPath: null, lastUrl: null }));
  const batch = new BatchRunner(data, runner, async () => { throw new Error('offline'); }), runtime = new RuntimeService(runner, [batch]);
  const stderr = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  runtime.onState(() => { throw new Error('Disconnected UI'); });
  try { await expect(batch.runSites([sites[0]!.id])).rejects.toThrow('offline'); expect(runtime.snapshot().runs).toEqual([]); expect(runtime.snapshot().batches).toEqual([]); expect(data.listRuns()).toHaveLength(1); }
  finally { stderr.mockRestore(); }
});
