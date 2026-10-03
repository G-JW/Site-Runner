import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BatchResult } from '../src/shared/types.js';
import { AppDatabase } from '../src/main/database/database.js';
import { NotificationService, buildBatchNotification } from '../src/main/notifications/service.js';
import { DataService } from '../src/main/services/data-service.js';

const batch = (failed = 0): BatchResult => ({
  startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(), total: 2,
  success: 2 - failed, failed,
  results: [
    { siteId: 'a', siteName: 'A', status: failed ? 'failed' : 'success', message: null,
      error: failed ? 'boom' : null, startedAt: '', finishedAt: '', screenshotPath: null },
    { siteId: 'b', siteName: 'B', status: 'success', message: null, error: null, startedAt: '', finishedAt: '', screenshotPath: null },
  ],
});

describe('NotificationService', () => {
  const databases: AppDatabase[] = [];
  afterEach(() => databases.splice(0).forEach((database) => database.close()));
  function setup() {
    const directory = mkdtempSync(path.join(tmpdir(), 'site-runner-notify-'));
    const database = new AppDatabase(path.join(directory, 'test.sqlite3')); databases.push(database);
    return new DataService(database.connection);
  }

  it('builds normal and alert summaries', () => {
    expect(buildBatchNotification(batch()).level).toBe('normal');
    expect(buildBatchNotification(batch(1))).toMatchObject({ level: 'alert', batch: { failedSites: ['A'] } });
  });

  it('includes concise failure reasons without stacks or assertion call logs', () => {
    const result = batch(1);
    result.results[0].error = 'Error: 点击签到后未出现已签到图标\n\nLocator: locator(".btnvisted")\nExpected: visible\nCall log:\n  - waiting\n    at run (script.js:5:1)';
    const message = buildBatchNotification(result);
    expect(message.body).toContain('- A: 点击签到后未出现已签到图标');
    expect(message.body).not.toMatch(/Locator:|Call log:|script.js/);
    result.results[0].error = 'TimeoutError: locator.click: Timeout 8000ms exceeded.\nCall log:\n  - waiting for locator';
    expect(buildBatchNotification(result).body).toContain('- A: locator.click: Timeout 8000ms exceeded.');
    result.results[0].error = 'Error: ' + '长'.repeat(300);
    expect(buildBatchNotification(result).body).toContain('长'.repeat(179) + '…');
    expect(buildBatchNotification(result).body).not.toContain('长'.repeat(180));
    result.results[0].error = null;
    expect(buildBatchNotification(result).body).toContain('- A: Unknown error');
  });

  it('routes by policy and isolates provider failures', async () => {
    const data = setup();
    data.saveChannel({ name: 'Normal', providerType: 'webhook', enabled: true, eventPolicy: 'normal', config: {} });
    data.saveChannel({ name: 'Alert', providerType: 'ntfy', enabled: true, eventPolicy: 'alert', config: {} });
    data.saveChannel({ name: 'All', providerType: 'webhook', enabled: true, eventPolicy: 'all', config: {} });
    const normalSend = vi.fn(async () => undefined);
    const failingSend = vi.fn(async () => { throw new Error('offline'); });
    const service = new NotificationService(data, {
      webhook: () => ({ send: normalSend }), ntfy: () => ({ send: failingSend }),
    });
    const deliveries = await service.notifyBatch(batch(1));
    expect(deliveries).toHaveLength(2);
    expect(deliveries.map((item) => item.success)).toEqual([false, true]);
    expect(failingSend).toHaveBeenCalledOnce(); expect(normalSend).toHaveBeenCalledOnce();
  });

  it('does nothing when no channels are configured', async () => {
    expect(await new NotificationService(setup()).notifyBatch(batch())).toEqual([]);
  });
});
