import { ipcMain, shell } from 'electron';
import type { NotificationChannelInput, SiteInput } from '../../shared/types.js';
import type { DataService } from '../services/data-service.js';
import type { ProfileService } from '../profiles/profile-service.js';

export function registerDataIpc(data: DataService, profiles: ProfileService): void {
  ipcMain.handle('app:openPath', (_event, targetPath: string) => shell.openPath(targetPath));
  ipcMain.handle('sites:list', () => data.listSites());
  ipcMain.handle('sites:save', (_event, input: SiteInput) => data.saveSite(input));
  ipcMain.handle('sites:remove', (_event, id: string) => data.removeSite(id));
  ipcMain.handle('profiles:list', () => data.listProfiles());
  ipcMain.handle('profiles:create', (_event, name: string) => profiles.create(name));
  ipcMain.handle('profiles:remove', (_event, id: string) => profiles.remove(id));
  ipcMain.handle('profiles:open', (_event, id: string) => profiles.open(id));
  ipcMain.handle('runs:list', (_event, siteId?: string) => data.listRuns(siteId));
  ipcMain.handle('notifications:list', () => data.listChannels());
  ipcMain.handle('notifications:save', (_event, input: NotificationChannelInput) => data.saveChannel(input));
  ipcMain.handle('notifications:remove', (_event, id: string) => data.removeChannel(id));
  ipcMain.handle('settings:get', () => data.getSettings());
  ipcMain.handle('settings:update', (_event, patch) => data.updateSettings(patch));
}
