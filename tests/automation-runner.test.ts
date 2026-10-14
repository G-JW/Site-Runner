import { tmpdir as systemTemporaryDirectory } from "node:os";
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { AutomationRunner, type AutomationExecutor } from '../src/main/automation/runner.js';
import { AppDatabase } from '../src/main/database/database.js';
import { ProfileService } from '../src/main/profiles/profile-service.js';
import { DataService } from '../src/main/services/data-service.js';

describe('AutomationRunner', () => {
  const databases: AppDatabase[] = [];
  afterEach(() => databases.splice(0).forEach((database) => database.close()));

  it('rejects a concurrent run and releases its lock afterward', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'site-runner-lock-'));
    const database = new AppDatabase(path.join(root, 'test.sqlite3')); databases.push(database);
    const data = new DataService(database.connection);
    const profiles = new ProfileService(data, path.join(root, 'profiles'));
    const profile = profiles.create('Default');
    const site = data.saveSite({ name: 'Lock', url: 'https://example.com', enabled: true, script: null,
      browserProfileId: profile.id, timeoutMs: 30_000, schedule: { enabled: false, cron: '0 9 * * *' } });
    let finish!: () => void;
    const gate = new Promise<void>((resolve) => { finish = resolve; });
    const executor: AutomationExecutor = async (request) => {
      await gate;
      return { siteId: request.siteId, siteName: request.siteName, status: 'success', message: 'done', error: null,
        startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(), screenshotPath: null, lastUrl: request.url };
    };
    const runner = new AutomationRunner(data, profiles, path.join(root, 'screenshots'), () => undefined, executor);
    const first = runner.runSite(site.id, 'manual');
    await expect(runner.runSite(site.id, 'manual')).rejects.toThrow(/already running/);
    finish();
    await expect(first).resolves.toMatchObject({ status: 'success' });
    expect(runner.isRunning(site.id)).toBe(false);
    expect(data.listRuns(site.id)).toHaveLength(1);
  });

  it('waits for active work, saves cancelled queued runs and rejects new work during shutdown', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'site-runner-shutdown-'));
    const database = new AppDatabase(path.join(root, 'test.sqlite3')); databases.push(database);
    const data = new DataService(database.connection), profiles = new ProfileService(data, path.join(root, 'profiles')), profile = profiles.create('Default');
    const sites = ['Active', 'Queued', 'New'].map((name) => data.saveSite({ name, url: 'https://example.com', enabled: true, script: null, browserProfileId: profile.id, timeoutMs: 30000, schedule: { enabled: false, cron: '0 9 * * *' } }));
    let started!: () => void, finish!: () => void;
    const entered = new Promise<void>((resolve) => { started = resolve; }), gate = new Promise<void>((resolve) => { finish = resolve; });
    const executed: string[] = [];
    const executor: AutomationExecutor = async (request, emit) => {
      executed.push(request.siteId); started(); await gate;
      emit({ siteId: request.siteId, level: 'info', message: 'Saved on exit', timestamp: new Date().toISOString() });
      return { siteId: request.siteId, siteName: request.siteName, status: 'success', message: 'Finished', error: null, startedAt: '', finishedAt: '', screenshotPath: null, lastUrl: request.url };
    };
    const runner = new AutomationRunner(data, profiles, path.join(root, 'screenshots'), () => undefined, executor);
    const active = runner.runSite(sites[0]!.id, 'manual'); await entered;
    const queued = runner.runSite(sites[1]!.id, 'manual');
    let drained = false; const shutdown = runner.shutdown().then(() => { drained = true; });
    await expect(runner.runSite(sites[2]!.id, 'manual')).rejects.toThrow(/closing/);
    expect(drained).toBe(false); finish();
    await expect(active).resolves.toMatchObject({ status: 'success' });
    await expect(queued).resolves.toMatchObject({ status: 'failed', error: expect.stringContaining('Queued run cancelled') });
    await shutdown; expect(drained).toBe(true); expect(executed).toEqual([sites[0]!.id]);
    const records = data.listRuns(); expect(records).toHaveLength(2);
    expect(data.runDetail(records.find((run) => run.status === 'success')!.id).logs[0]?.message).toBe('Saved on exit');
    expect(data.runDetail(records.find((run) => run.status === 'failed')!.id).logs[0]?.message).toContain('Queued run cancelled');
    expect(runner.isRunning(sites[0]!.id) || runner.isRunning(sites[1]!.id)).toBe(false);
  });

  it('bounds live log messages before publishing and retaining them in memory', async () => {
    const root = mkdtempSync(path.join(systemTemporaryDirectory(), 'site-runner-log-bound-')), database = new AppDatabase(path.join(root, 'test.sqlite3')); databases.push(database);
    const data = new DataService(database.connection), profiles = new ProfileService(data, path.join(root, 'profiles'));
    const site = data.saveSite({ name: 'Logs', url: 'https://example.com', enabled: true, script: null, browserProfileId: profiles.create('Default').id, timeoutMs: 30000, schedule: { enabled: false, cron: '0 9 * * *' } });
    const messages: string[] = [];
    const runner = new AutomationRunner(data, profiles, path.join(root, 'screenshots'), (entry) => messages.push(entry.message), async (request, emit) => {
      emit({ siteId: request.siteId, level: 'info', message: 'x'.repeat(100000), timestamp: '' });
      return { siteId: request.siteId, siteName: request.siteName, status: 'success', message: null, error: null, startedAt: '', finishedAt: '', screenshotPath: null, lastUrl: null };
    });
    await runner.runSite(site.id, 'manual'); expect(messages[0]).toHaveLength(4000); expect(messages[0]?.endsWith('…')).toBe(true);
    expect(data.runDetail(data.listRuns()[0]!.id).logs[0]?.message).toBe(messages[0]);
  });
});
