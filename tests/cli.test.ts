import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { executeCliCommand, parseCliCommand } from '../src/main/cli.js';
import { AppDatabase } from '../src/main/database/database.js';
import { DataService } from '../src/main/services/data-service.js';
import { AutomationRunner, type AutomationExecutor } from '../src/main/automation/runner.js';
import { ProfileService } from '../src/main/profiles/profile-service.js';

describe('one-shot CLI', () => {
  const databases: AppDatabase[] = [];
  afterEach(() => databases.splice(0).forEach((database) => database.close()));
  function setup() {
    const root = mkdtempSync(path.join(tmpdir(), 'site-runner-cli-'));
    const database = new AppDatabase(path.join(root, 'test.sqlite3')); databases.push(database);
    const data = new DataService(database.connection);
    const profiles = new ProfileService(data, path.join(root, 'profiles'));
    const profile = profiles.create('Default');
    const sites = ['Pass', 'Fail', 'Disabled'].map((name) => data.saveSite({ name, url: 'https://example.com', enabled: name !== 'Disabled',
      script: null, browserProfileId: profile.id, timeoutMs: 1_000, schedule: { enabled: true, cron: '* * * * *' } }));
    const headlessModes: boolean[] = [];
    const executor: AutomationExecutor = async (request) => {
      headlessModes.push(request.headless);
      return { siteId: request.siteId, siteName: request.siteName, status: request.siteName === 'Fail' ? 'failed' : 'success',
        message: null, error: request.siteName === 'Fail' ? 'intentional failure' : null, screenshotPath: null, lastUrl: request.url,
        startedAt: new Date().toISOString(), finishedAt: new Date().toISOString() };
    };
    const runner = new AutomationRunner(data, profiles, path.join(root, 'screenshots'), () => undefined, executor);
    const notifications = { notifyBatch: vi.fn(async () => []) };
    return { data, sites, runner, notifications, headlessModes };
  }

  it('parses quoted values, uses headless by default, and leaves GUI launches alone', () => {
    expect(parseCliCommand([])).toBeNull();
    expect(parseCliCommand(['--smoke-test'])).toBeNull();
    expect(parseCliCommand(['--run-site', 'My Site', '--user-data', '/tmp/CLI Data', '--headed'])).toEqual({ action: 'run-site', site: 'My Site', userData: '/tmp/CLI Data', headless: false });
    expect(parseCliCommand(['--run-all'])?.headless).toBe(true);
    for (const args of [['--run-site'], ['--run-all', '--run-site', 'A'], ['--user-data', '--run-all'], ['--run-all', '--unknown'], ['--run-all', '--headed', '--headless']]) {
      expect(() => parseCliCommand(args)).toThrow();
    }
  });

  it('runs enabled sites, persists history, notifies once, and never changes GUI browser settings', async () => {
    const { data, runner, notifications, headlessModes } = setup();
    data.updateSettings({ browserHeadless: false });
    const result = await executeCliCommand(parseCliCommand(['--run-all'])!, data, runner, notifications);
    expect(result.exitCode).toBe(1);
    expect(result.output).toMatchObject({ total: 2, success: 1, failed: 1 });
    expect(data.listRuns()).toHaveLength(2);
    expect(headlessModes).toEqual([true, true]);
    expect(data.getSettings().browserHeadless).toBe(false);
    expect(notifications.notifyBatch).toHaveBeenCalledTimes(1);
  });

  it('runs an explicitly selected disabled site and rejects ambiguous or missing names', async () => {
    const { data, sites, runner, notifications, headlessModes } = setup();
    const disabled = sites[2]!;
    const result = await executeCliCommand(parseCliCommand(['--run-site', disabled.id, '--headed'])!, data, runner, notifications);
    expect(result.exitCode).toBe(0);
    expect(result.output).toMatchObject({ total: 1, success: 1 });
    expect(headlessModes).toEqual([false]);
    data.saveSite({ ...disabled, id: undefined, name: 'Pass' });
    for (const name of ['Pass', 'Missing']) {
      expect((await executeCliCommand(parseCliCommand(['--run-site', name])!, data, runner, notifications)).exitCode).toBe(2);
    }
    expect(data.listRuns()).toHaveLength(1);
  });

  it('lists sites without running them or exposing scripts and handles empty batches without notifications', async () => {
    const { data, sites, runner, notifications } = setup();
    const list = await executeCliCommand(parseCliCommand(['--list-sites'])!, data, runner, notifications);
    expect(list.output).toEqual({ sites: sites.map(({ id, name, enabled }) => ({ id, name, enabled })) });
    expect(data.listRuns()).toHaveLength(0);
    sites.forEach((site) => data.saveSite({ ...site, enabled: false }));
    const empty = await executeCliCommand(parseCliCommand(['--run-all'])!, data, runner, notifications);
    expect(empty.exitCode).toBe(0);
    expect(empty.output).toMatchObject({ total: 0 });
    expect(notifications.notifyBatch).not.toHaveBeenCalled();
  });

  it('returns failure when an applicable notification channel fails', async () => {
    const { data, runner } = setup();
    const notifications = { notifyBatch: vi.fn(async () => [{ channelId: 'test', channelName: 'Test', success: false, error: 'offline' }]) };
    const result = await executeCliCommand(parseCliCommand(['--run-site', 'Pass'])!, data, runner, notifications);
    expect(result.exitCode).toBe(1);
    expect(result.output).toMatchObject({ success: 1, notifications: [{ success: false }] });
  });
});
