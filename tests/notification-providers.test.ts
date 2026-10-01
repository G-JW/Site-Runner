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
  it('sends a fixed webhook JSON payload', async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 204 })); vi.stubGlobal('fetch', fetch);
    await createWebhookProvider({ url: 'https://example.com/hook', headers: { 'x-token': 'secret' } }).send(message);
    expect(fetch).toHaveBeenCalledWith(new URL('https://example.com/hook'), expect.objectContaining({ method: 'POST', body: JSON.stringify(message), headers: expect.objectContaining({ 'content-type': 'application/json', 'x-token': 'secret' }) }));
  });
});
