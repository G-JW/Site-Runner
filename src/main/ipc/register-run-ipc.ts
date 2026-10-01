import { BrowserWindow, ipcMain } from 'electron';
import type { RunLogEntry } from '../../shared/types.js';
import type { AutomationRunner } from '../automation/runner.js';
import type { BatchRunner } from '../automation/batch-runner.js';

export function broadcastRunLog(entry: RunLogEntry): void {
  for (const window of BrowserWindow.getAllWindows()) window.webContents.send('runs:log', entry);
}

export function registerRunIpc(runner: AutomationRunner, batch: BatchRunner): void {
  ipcMain.handle('runs:runSite', (_event, id: string) => runner.runSite(id, 'manual'));
  ipcMain.handle('runs:runEnabledSites', () => batch.runEnabledSites());
}
