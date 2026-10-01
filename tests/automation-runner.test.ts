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
});
