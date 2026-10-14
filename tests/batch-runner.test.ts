import { tmpdir as systemTemporaryDirectory } from "node:os";
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

  it('stops starting remaining sites and waits for the final notification before shutdown resolves', async () => {
    const database = new AppDatabase(path.join(mkdtempSync(path.join(systemTemporaryDirectory(), 'site-runner-batch-exit-')), 'test.sqlite3')); databases.push(database);
    const data = new DataService(database.connection), profile = data.createProfile('Default');
    const sites = ['A', 'B'].map((name) => data.saveSite({ name, url: 'https://example.com', enabled: true, script: null, browserProfileId: profile.id, timeoutMs: 30000, schedule: { enabled: false, cron: '0 9 * * *' } }));
    let finish!: () => void, send!: () => void, notify!: () => void;
    const gate = new Promise<void>((resolve) => { finish = resolve; }), delivery = new Promise<void>((resolve) => { send = resolve; }), sending = new Promise<void>((resolve) => { notify = resolve; });
    const order: string[] = [];
    const batch = new BatchRunner(data, { runSite: async (id) => {
      order.push(id); await gate;
      return { siteId: id, siteName: 'A', status: 'success', message: null, error: null, startedAt: '', finishedAt: '', screenshotPath: null };
    } }, async () => { notify(); await delivery; });
    const work = batch.runEnabledSites(); let drained = false; const shutdown = batch.shutdown().then(() => { drained = true; });
    await expect(batch.runEnabledSites()).rejects.toThrow(/closing/); finish(); await sending;
    expect(drained).toBe(false); expect(order).toEqual([sites[0]!.id]); send();
    await expect(work).resolves.toMatchObject({ total: 1, success: 1 }); await shutdown; expect(drained).toBe(true);
  });
});
