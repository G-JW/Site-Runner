import { mkdtempSync } from 'node:fs';
import path from 'node:path';
import { expect, it, vi } from 'vitest';
import { AppDatabase } from '../src/main/database/database.js';
import { DataService } from '../src/main/services/data-service.js';
import { SchedulerService } from '../src/main/scheduler/scheduler-service.js';

const callbacks = vi.hoisted(() => [] as Array<() => void>);
vi.mock('node-cron', async (original) => {
  const actual = await original<typeof import('node-cron')>();
  return { default: { ...actual.default, schedule: vi.fn((_cron, callback) => { callbacks.push(callback); return { stop: vi.fn(), destroy: vi.fn() }; }) } };
});

it('does not schedule disabled sites and delivers completed scheduled results', async () => {
  callbacks.length = 0;
  const database = new AppDatabase(path.join(mkdtempSync('/private/tmp/site-runner-schedule-'), 'test.sqlite3'));
  try {
    const data = new DataService(database.connection); const profile = data.createProfile('Default');
    const site = data.saveSite({ name: 'A', url: 'https://example.com', enabled: false, script: null, browserProfileId: profile.id, timeoutMs: 30000, schedule: { enabled: true, cron: '0 9 * * *' } });
    const result = { siteId: site.id, siteName: site.name, status: 'success' as const, message: 'done', error: null, startedAt: '', finishedAt: '', screenshotPath: null };
    const runSite = vi.fn(async () => result), delivered = vi.fn(async () => undefined);
    const scheduler = new SchedulerService(data, { runSite }, delivered);
    scheduler.start(); expect(callbacks).toHaveLength(0);
    scheduler.refresh(data.saveSite({ ...site, enabled: true })); expect(callbacks).toHaveLength(1);
    callbacks[0]!(); await vi.waitFor(() => expect(delivered).toHaveBeenCalledWith(result));
    expect(runSite).toHaveBeenCalledWith(site.id, 'schedule');
    data.saveSite({ ...site, enabled: false }); callbacks[0]!(); expect(runSite).toHaveBeenCalledTimes(1);
    scheduler.stop();
  } finally { database.close(); }
});
