import { mkdtempSync } from 'node:fs';
import path from 'node:path';
import { expect, it, vi } from 'vitest';
import { AppDatabase } from '../src/main/database/database.js';
import { DataService } from '../src/main/services/data-service.js';
import { ProfileService } from '../src/main/profiles/profile-service.js';
import { AutomationRunner } from '../src/main/automation/runner.js';
import { BatchRunner } from '../src/main/automation/batch-runner.js';
import { RuntimeService } from '../src/main/services/runtime-service.js';
import { SchedulerService } from '../src/main/scheduler/scheduler-service.js';
import { NotificationService } from '../src/main/notifications/service.js';
import { CleanupService } from '../src/main/services/cleanup-service.js';
import { registerDataIpc } from '../src/main/ipc/register-data-ipc.js';
import { registerRunIpc } from '../src/main/ipc/register-run-ipc.js';
const handlers = vi.hoisted(() => new Map<string, (...args: unknown[]) => unknown>());
vi.mock('electron', () => ({ ipcMain: { handle: (name: string, fn: (...args: unknown[]) => unknown) => handlers.set(name, fn) }, BrowserWindow: { getAllWindows: () => [] }, dialog: {}, shell: {} }));

it('rejects edits, deletes, profile use and overlapping manual runs for pending batch sites on the server', async () => {
  handlers.clear(); const root = mkdtempSync('/private/tmp/site-runner-runtime-ipc-'), database = new AppDatabase(path.join(root, 'test.sqlite3'));
  let finish!: () => void; const gate = new Promise<void>((resolve) => { finish = resolve; });
  try {
    const data = new DataService(database.connection), profiles = new ProfileService(data, path.join(root, 'profiles'));
    const sites = ['A', 'B'].map((name) => data.saveSite({ name, url: 'https://example.com', enabled: true, script: null, browserProfileId: profiles.create(name).id, timeoutMs: 30000, schedule: { enabled: false, cron: '0 9 * * *' } }));
    const runner = new AutomationRunner(data, profiles, path.join(root, 'screenshots'), () => undefined, async (request) => { await gate; return { siteId: request.siteId, siteName: request.siteName, status: 'success', message: null, error: null, startedAt: '', finishedAt: '', screenshotPath: null, lastUrl: null }; });
    const batch = new BatchRunner(data, runner), runtime = new RuntimeService(runner, [batch]), scheduler = new SchedulerService(data, runner);
    registerDataIpc(data, profiles, scheduler, new NotificationService(data), new CleanupService(data, root), runtime); registerRunIpc(runner, batch, runtime, data);
    const call = (name: string, ...args: unknown[]) => handlers.get(name)!(null, ...args);
    const work = batch.runEnabledSites(), pending = sites[1]!;
    for (const action of [() => call('sites:save', { ...pending, name: 'Changed' }), () => call('sites:remove', pending.id), () => call('profiles:open', pending.browserProfileId), () => call('profiles:remove', pending.browserProfileId), () => call('runs:runSite', pending.id), () => call('runs:runEnabledSites'), () => call('runs:runSites', [pending.id])]) expect(action).toThrow(/waiting|running/);
    const closing = vi.spyOn(runner, 'isStopping').mockReturnValue(true);
    for (const action of [() => call('runs:runSite', pending.id), () => call('runs:runEnabledSites'), () => call('runs:runSites', [pending.id])]) expect(action).toThrow(/closing/);
    closing.mockRestore();
    expect(data.getSite(pending.id).name).toBe('B'); finish(); await work;
    call('sites:save', { ...pending, name: 'After' }); expect(data.getSite(pending.id).name).toBe('After'); expect(data.listRuns()).toHaveLength(2);
    call('sites:remove', pending.id); expect(data.listSites()).toHaveLength(1);
  } finally { finish(); database.close(); }
});
