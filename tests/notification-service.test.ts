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
    expect(buildBatchNotification(batch()).body).not.toMatch(/Verified|Unverified/);
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
    expect(data.listReceipts()).toHaveLength(2);
    expect(data.listReceipts()).toEqual(expect.arrayContaining([expect.objectContaining({ channelName: 'Alert', success: false, error: 'offline' }), expect.objectContaining({ channelName: 'All', success: true })]));
  });

  it('does nothing when no channels are configured', async () => {
    expect(await new NotificationService(setup()).notifyBatch(batch())).toEqual([]);
  });

  it('does not turn an accepted delivery into a failure if receipt storage fails', async () => {
    const data = setup();
    data.saveChannel({ name: 'Accepted', providerType: 'ntfy', enabled: true, eventPolicy: 'all', config: {} });
    vi.spyOn(data, 'saveReceipt').mockImplementation(() => { throw new Error('disk full'); });
    const service = new NotificationService(data, { ntfy: () => ({ send: async () => undefined }) });
    expect(await service.notifyBatch(batch())).toEqual([expect.objectContaining({ success: true, error: null })]);
  });

  it('waits for a pending channel test receipt and rejects new deliveries after shutdown starts', async () => {
    const data = setup(), channel = data.saveChannel({ name: 'Pending', providerType: 'ntfy', enabled: true, eventPolicy: 'all', config: {} });
    let finish!: () => void; const gate = new Promise<void>((resolve) => { finish = resolve; });
    const service = new NotificationService(data, { ntfy: () => ({ send: async () => gate }) });
    const test = service.testChannel(channel.id); let drained = false; const shutdown = service.shutdown().then(() => { drained = true; });
    await expect(service.testChannel(channel.id)).rejects.toThrow(/closing/); await expect(service.notifyBatch(batch())).rejects.toThrow(/closing/);
    expect(drained).toBe(false); finish(); await test; await shutdown;
    expect(data.listReceipts()).toEqual([expect.objectContaining({ channelName: 'Pending', success: true })]);
  });

  it('shares concurrent tests for one channel while independent channels can send, even when notifications are disabled', async () => {
    const data = setup(); data.updateSettings({ notificationEnabled: false, notifyScheduledRuns: false });
    const first = data.saveChannel({ name: 'First', providerType: 'ntfy', enabled: false, eventPolicy: 'alert', config: { key: 'first' } });
    const second = data.saveChannel({ name: 'Second', providerType: 'ntfy', enabled: true, eventPolicy: 'all', config: { key: 'second' } });
    let release!: () => void; const gate = new Promise<void>((resolve) => { release = resolve; });
    const send = vi.fn(async () => gate);
    const service = new NotificationService(data, { ntfy: () => ({ send }) });
    const requests = [service.testChannel(first.id), service.testChannel(first.id), service.testChannel(second.id)];
    expect(send).toHaveBeenCalledTimes(2); expect(data.listReceipts()).toHaveLength(0);
    release(); await Promise.all(requests);
    expect(data.listReceipts()).toHaveLength(2);
    await service.testChannel(first.id); expect(send).toHaveBeenCalledTimes(3);
  });

  it('shares test failures and allows a fresh attempt after the pending request finishes', async () => {
    const data = setup(), channel = data.saveChannel({ name: 'Retry', providerType: 'ntfy', enabled: true, eventPolicy: 'all', config: {} });
    let release!: () => void; const gate = new Promise<void>((resolve) => { release = resolve; });
    const send = vi.fn().mockImplementationOnce(async () => { await gate; throw new Error('HTTP 503'); }).mockResolvedValue(undefined);
    const service = new NotificationService(data, { ntfy: () => ({ send }) });
    const requests = [service.testChannel(channel.id), service.testChannel(channel.id)];
    const settled = Promise.allSettled(requests); expect(send).toHaveBeenCalledOnce(); release();
    expect(await settled).toEqual([expect.objectContaining({ status: 'rejected', reason: expect.objectContaining({ message: 'HTTP 503' }) }), expect.objectContaining({ status: 'rejected', reason: expect.objectContaining({ message: 'HTTP 503' }) })]);
    expect(data.listReceipts()).toEqual([expect.objectContaining({ success: false, error: 'HTTP 503' })]);
    await service.testChannel(channel.id); expect(send).toHaveBeenCalledTimes(2);
    expect(data.listReceipts()).toHaveLength(2);
  });
});
