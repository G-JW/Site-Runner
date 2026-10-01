import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { BatchRunner } from '../src/main/automation/batch-runner.js';
import { AppDatabase } from '../src/main/database/database.js';
import { DataService } from '../src/main/services/data-service.js';

describe('BatchRunner', () => {
  const databases: AppDatabase[] = [];
  afterEach(() => databases.splice(0).forEach((database) => database.close()));
  it('runs enabled sites serially and isolates failures', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'site-runner-batch-'));
    const database = new AppDatabase(path.join(root, 'test.sqlite3')); databases.push(database);
    const data = new DataService(database.connection); const profile = data.createProfile('Default');
    const sites = ['A', 'B', 'C'].map((name) => data.saveSite({ name, url: `https://${name.toLowerCase()}.test`,
      enabled: true, script: null, browserProfileId: profile.id, timeoutMs: 30_000,
      schedule: { enabled: false, cron: '0 9 * * *' } }));
    const order: string[] = [];
    const runner = { runSite: async (id: string) => {
      const site = sites.find((item) => item.id === id)!; order.push(site.name);
      if (site.name === 'B') throw new Error('intentional');
      return { siteId: id, siteName: site.name, status: 'success' as const, message: 'done', error: null,
        startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(), screenshotPath: null };
    } };
    const result = await new BatchRunner(data, runner).runEnabledSites();
    expect(order).toEqual(['A', 'B', 'C']);
    expect(result).toMatchObject({ total: 3, success: 2, failed: 1 });
  });
});
