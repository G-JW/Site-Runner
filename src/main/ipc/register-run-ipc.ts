import { BrowserWindow, ipcMain } from 'electron';
import type { RunLogEntry } from '../../shared/types.js';
import type { AutomationRunner } from '../automation/runner.js';
import type { BatchRunner } from '../automation/batch-runner.js';
import type { RuntimeService } from '../services/runtime-service.js';
import type { DataService } from '../services/data-service.js';

export function broadcastRunLog(entry: RunLogEntry): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed() && !window.webContents.isDestroyed()) window.webContents.send('runs:log', entry);
  }
}

export function registerRunIpc(runner: AutomationRunner, batch: BatchRunner, runtime: RuntimeService, data: DataService): void {
  const assertAccepting = () => { if (runner.isStopping()) throw new Error('Application is closing; new tasks are not accepted'); };
  ipcMain.handle('runs:state', () => runtime.snapshot());
  runtime.onState((state) => {
    for (const window of BrowserWindow.getAllWindows()) if (!window.isDestroyed() && !window.webContents.isDestroyed()) window.webContents.send('runs:state', state);
  });
  ipcMain.handle('runs:runSite', (_event, id: string) => { assertAccepting(); runtime.assertIdle(id); return runner.runSite(id, 'manual'); });
  ipcMain.handle('runs:runEnabledSites', () => {
    assertAccepting();
    const ids = data.listSites().filter((site) => site.enabled).map((site) => site.id);
    ids.forEach((id) => runtime.assertIdle(id)); return batch.runSites(ids);
  });
  ipcMain.handle('runs:runSites', (_event, ids: string[]) => {
    assertAccepting();
    if (!Array.isArray(ids) || !ids.length || ids.some((id) => typeof id !== 'string')) throw new Error('Select sites to run');
    ids.forEach((id) => runtime.assertIdle(id));
    return batch.runSites([...new Set(ids)]);
  });
}
