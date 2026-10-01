import { BrowserWindow, ipcMain } from 'electron';
import type { RunLogEntry } from '../../shared/types.js';
import type { AutomationRunner } from '../automation/runner.js';

export function broadcastRunLog(entry: RunLogEntry): void {
  for (const window of BrowserWindow.getAllWindows()) window.webContents.send('runs:log', entry);
}

export function registerRunIpc(runner: AutomationRunner): void {
  ipcMain.handle('runs:runSite', (_event, id: string) => runner.runSite(id, 'manual'));
}
