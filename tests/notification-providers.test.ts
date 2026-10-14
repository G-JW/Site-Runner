import http from 'node:http';
import { buildBatchNotification } from '../src/main/notifications/service.js';
import type { BatchResult } from '../src/shared/types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createNtfyProvider } from '../src/main/notifications/providers/ntfy.js';
import { createWebhookProvider } from '../src/main/notifications/providers/webhook.js';

const message = { title: 'Title', body: 'Body', level: 'alert' as const, timestamp: '2026-10-01T00:00:00.000Z' };
describe('notification provider payloads', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('sends the NTFY text payload and authorization', async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 200 })); vi.stubGlobal('fetch', fetch);
    await createNtfyProvider({ serverUrl: 'https://ntfy.sh/', topic: 'runner', token: 'secret' }).send(message);
    expect(fetch).toHaveBeenCalledWith('https://ntfy.sh/runner', expect.objectContaining({ method: 'POST', body: 'Body', headers: expect.objectContaining({ Authorization: 'Bearer secret', Priority: 'high' }) }));
  });
  it('delivers readable batch titles without emoji tags and retains UTF-8 failure details', async () => {
    const received: Array<{ headers: http.IncomingHttpHeaders; body: string }> = [];
    const server = http.createServer((request, response) => {
      request.setEncoding('utf8');
      let body = '';
      request.on('data', (chunk) => { body += chunk; });
      request.on('end', () => {
        received.push({ headers: request.headers, body });
        response.end('{}');
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address() as { port: number };
      const provider = createNtfyProvider({ serverUrl: `http://127.0.0.1:${address.port}`, topic: 'runner' });
      for (const state of ['success', 'failed', 'stopped'] as const) {
        const result: BatchResult = {
          startedAt: message.timestamp, finishedAt: message.timestamp, total: 1,
          success: state === 'failed' ? 0 : 1, failed: state === 'failed' ? 1 : 0,
          stopped: state === 'stopped', planned: state === 'stopped' ? 2 : 1,
          results: [{ siteId: 'task', siteName: '签到网站', status: state === 'failed' ? 'failed' : 'success',
            message: null, error: state === 'failed' ? '操作超时' : null, startedAt: message.timestamp,
            finishedAt: message.timestamp, screenshotPath: null }],
        };
        await provider.send(buildBatchNotification(result));
      }
      expect(received.map((entry) => entry.headers.title)).toEqual([
        'Site Runner - Execution finished', 'Site Runner - Attention needed', 'Site Runner - Batch stopped',
      ]);
      expect(received.every((entry) => entry.headers.tags === undefined)).toBe(true);
      expect(received.map((entry) => entry.headers.priority)).toEqual(['default', 'high', 'default']);
      expect(received[1]?.body).toContain('- 签到网站: 操作超时');
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
  it('sends a fixed webhook JSON payload', async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 204 })); vi.stubGlobal('fetch', fetch);
    await createWebhookProvider({ url: 'https://example.com/hook', headers: { 'x-token': 'secret' } }).send(message);
    expect(fetch).toHaveBeenCalledWith(new URL('https://example.com/hook'), expect.objectContaining({ method: 'POST', body: JSON.stringify(message), headers: expect.objectContaining({ 'content-type': 'application/json', 'x-token': 'secret' }) }));
  });
});
