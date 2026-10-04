import { EventEmitter } from 'node:events';
import { afterEach, expect, it, vi } from 'vitest';
import { runInWorker } from '../src/main/automation/runner.js';
import type { AutomationRequest } from '../src/main/automation/types.js';
const state = vi.hoisted(() => ({ worker: null as (EventEmitter & { terminate: () => Promise<number> }) | null }));
vi.mock('node:worker_threads', async () => {
  const { EventEmitter } = await import('node:events');
  return { Worker: class extends EventEmitter {
    terminate = vi.fn(async () => 0);
    constructor() { super(); state.worker = this; }
  } };
});
const request: AutomationRequest = { siteId: 'test', siteName: 'Test', url: 'https://example.com', script: null, timeoutMs: 10, profilePath: '/private/tmp/test', screenshotPath: '/private/tmp/test.png', headless: true };
afterEach(() => { vi.useRealTimers(); state.worker = null; });
it('fails immediately when a worker exits cleanly without returning a result', async () => {
  const work = runInWorker(request, () => undefined); const rejected = expect(work).rejects.toThrow('code 0 without a result');
  state.worker!.emit('exit', 0); await rejected;
});
it('waits for worker termination before reporting a timeout and releasing its profile', async () => {
  vi.useFakeTimers(); const work = runInWorker(request, () => undefined); const rejected = expect(work).rejects.toThrow('exceeded 10ms');
  let finish!: () => void; const termination = new Promise<void>((resolve) => { finish = resolve; });
  state.worker!.terminate = vi.fn(async () => { await termination; return 0; });
  let settled = false; void work.catch(() => { settled = true; });
  vi.advanceTimersByTime(5010); await Promise.resolve(); expect(settled).toBe(false);
  finish(); await rejected; expect(state.worker!.terminate).toHaveBeenCalledOnce();
});
