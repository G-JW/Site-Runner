import { ipcMain, shell } from 'electron';
import type { NotificationChannelInput, SiteInput, ScriptTemplateInput } from '../../shared/types.js';
import type { DataService } from '../services/data-service.js';
import type { ProfileService } from '../profiles/profile-service.js';
import type { SchedulerService } from '../scheduler/scheduler-service.js';
import type { NotificationService } from '../notifications/service.js';

export function registerDataIpc(data: DataService, profiles: ProfileService, scheduler: SchedulerService, notifications: NotificationService): void {
  ipcMain.handle('sites:list', () => data.listSites());
  ipcMain.handle('templates:list', () => data.listTemplates());
  ipcMain.handle('templates:save', (_event, input: ScriptTemplateInput) => data.saveTemplate(input));
  ipcMain.handle('templates:remove', (_event, id: string) => data.removeTemplate(id));
  ipcMain.handle('templates:restoreDefaults', () => data.restoreDefaultTemplates());
  ipcMain.handle('sites:save', (_event, input: SiteInput) => {
    const site = data.saveSite(input); scheduler.refresh(site); return site;
  });
  ipcMain.handle('sites:remove', (_event, id: string) => { scheduler.remove(id); data.removeSite(id); });
  ipcMain.handle('profiles:list', () => data.listProfiles());
  ipcMain.handle('profiles:create', (_event, name: string) => profiles.create(name));
  ipcMain.handle('profiles:remove', (_event, id: string) => profiles.remove(id));
  ipcMain.handle('profiles:open', (_event, id: string) => profiles.open(id));
  ipcMain.handle('runs:list', (_event, siteId?: string) => data.listRuns(siteId));
  ipcMain.handle('runs:openScreenshot', (_event, runId: string) => {
    const run = data.getRun(runId);
    if (!run.screenshotPath) throw new Error('This run has no screenshot');
    return shell.openPath(run.screenshotPath);
  });
  ipcMain.handle('notifications:list', () => data.listChannels());
  ipcMain.handle('notifications:save', (_event, input: NotificationChannelInput) => data.saveChannel(input));
  ipcMain.handle('notifications:remove', (_event, id: string) => data.removeChannel(id));
  ipcMain.handle('notifications:test', (_event, id: string) => notifications.testChannel(id));
  ipcMain.handle('settings:get', () => data.getSettings());
  ipcMain.handle('settings:update', (_event, patch) => data.updateSettings(patch));
}
