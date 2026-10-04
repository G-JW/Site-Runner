import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AppDatabase } from '../src/main/database/database.js';
import { DataService } from '../src/main/services/data-service.js';

describe('DataService', () => {
  let database: AppDatabase;
  let data: DataService;
  beforeEach(() => {
    const directory = mkdtempSync(path.join(tmpdir(), 'site-runner-data-'));
    database = new AppDatabase(path.join(directory, 'test.sqlite3'));
    data = new DataService(database.connection);
  });
  afterEach(() => database.close());

  it('persists, edits and deletes a complete site', () => {
    const profile = data.createProfile('Default');
    const site = data.saveSite({ name: 'Example', url: 'https://example.com', enabled: true, script: null,
      browserProfileId: profile.id, timeoutMs: 30_000, schedule: { enabled: false, cron: '0 9 * * *' } });
    expect(data.saveSite({ ...site, name: 'Edited' }).name).toBe('Edited');
    expect(data.listSites()).toHaveLength(1);
    data.removeSite(site.id);
    expect(data.listSites()).toEqual([]);
  });

  it('protects profiles referenced by sites', () => {
    const profile = data.createProfile('Shared');
    data.saveSite({ name: 'Example', url: 'https://example.com', enabled: true, script: null,
      browserProfileId: profile.id, timeoutMs: 30_000, schedule: { enabled: false, cron: '0 9 * * *' } });
    expect(() => data.removeProfile(profile.id)).toThrow(/used/);
  });

  it('persists settings and notification channels', () => {
    expect(data.updateSettings({ browserHeadless: true, language: 'zh-CN' })).toMatchObject({ browserHeadless: true, language: 'zh-CN' });
    const channel = data.saveChannel({ name: 'Alert', providerType: 'webhook', enabled: true,
      eventPolicy: 'alert', config: { url: 'https://example.com/hook' } });
    expect(data.listChannels()[0]).toMatchObject({ id: channel.id, eventPolicy: 'alert' });
    data.removeChannel(channel.id);
    expect(data.listChannels()).toEqual([]);
  });

  it('queries history beyond the latest 500 and associates logs with each run', () => {
    const profile = data.createProfile('Default');
    const site = data.saveSite({ name: 'History', url: 'https://example.com', enabled: true, script: null, browserProfileId: profile.id, timeoutMs: 30000, schedule: { enabled: false, cron: '0 9 * * *' } });
    for (let index = 0; index < 505; index++) data.saveRun({ id: `r${index}`, siteId: site.id, siteName: site.name, startedAt: new Date(Date.UTC(2026, 9, 3, 12, 0, index)).toISOString(), finishedAt: '', status: index % 2 ? 'failed' : 'success', message: 'done', error: null, lastUrl: site.url, screenshotPath: null, trigger: 'manual' }, [{ siteId: site.id, level: 'info', message: `log ${index}`, timestamp: '2026-10-03T12:00:00Z' }]);
    expect(data.searchRuns({ offset: 500 })).toHaveLength(5);
    expect(data.searchRuns({ status: 'failed' }).every((run) => run.status === 'failed')).toBe(true);
    expect(data.searchRuns({ from: '2026-10-04' })).toEqual([]);
    expect(data.runDetail('r504').logs[0]?.message).toBe('log 504');
    expect(() => data.searchRuns({ offset: -1 })).toThrow();
  });
});
