import { dialog, ipcMain, shell } from 'electron';
import { readFile, writeFile } from 'node:fs/promises';
import { exportSiteRules, parseSiteRules } from '../site-rules.js';
import { exportTemplates, parseTemplateFile } from '../template-files.js';
import { exportConfiguration, importConfiguration, parseConfiguration } from '../configuration.js';
import { getAppPaths } from '../paths.js';
import type { NotificationChannelInput, SiteInput, ScriptTemplateInput } from '../../shared/types.js';
import type { DataService } from '../services/data-service.js';
import type { ProfileService } from '../profiles/profile-service.js';
import type { SchedulerService } from '../scheduler/scheduler-service.js';
import type { NotificationService } from '../notifications/service.js';
import type { CleanupService } from '../services/cleanup-service.js';
import type { RuntimeService } from '../services/runtime-service.js';

export function registerDataIpc(data: DataService, profiles: ProfileService, scheduler: SchedulerService, notifications: NotificationService, cleanup: CleanupService, runtime: RuntimeService): void {
  ipcMain.handle('cleanup:preview', () => cleanup.preview());
  ipcMain.handle('cleanup:execute', (_event, id: string) => cleanup.execute(id));
  ipcMain.handle('cleanup:status', () => data.getCleanupStatus());
  ipcMain.handle('app:openDataFolder', () => shell.openPath(getAppPaths().userData).then((error) => { if (error) throw new Error(error); }));
  ipcMain.handle('sites:list', () => data.listSites());
  ipcMain.handle('folders:list', () => data.listFolders());
  ipcMain.handle('folders:save', (_event, input: Parameters<DataService['saveFolder']>[0]) => { const folder = data.saveFolder(input); scheduler.refreshAll(); return folder; });
  ipcMain.handle('folders:remove', (_event, id: string) => { data.removeFolder(id); scheduler.refreshAll(); });
  ipcMain.handle('folders:moveSites', (_event, ids: string[], folderId: string | null) => { ids.forEach((id) => runtime.assertIdle(id)); data.moveSites(ids, folderId); scheduler.refreshAll(); });
  ipcMain.handle('runs:nextSchedules', () => scheduler.nextSchedules());
  ipcMain.handle('runs:schedulePreview', (_event, expression: string) => scheduler.preview(expression));
  ipcMain.handle('sites:exportRules', async (_event, ids: string[]) => {
    if (!Array.isArray(ids) || ids.length === 0) throw new Error('Select sites to export');
    const file = exportSiteRules([...new Set(ids)].map((id) => data.getSite(id)));
    const { canceled, filePath } = await dialog.showSaveDialog({ defaultPath: 'site-runner-sites.json', filters: [{ name: 'JSON', extensions: ['json'] }] });
    if (canceled || !filePath) return false;
    await writeFile(filePath, JSON.stringify(file, null, 2), { mode: 0o600 });
    return true;
  });
  ipcMain.handle('sites:previewImport', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({ properties: ['openFile'], filters: [{ name: 'JSON', extensions: ['json'] }] });
    if (canceled || !filePaths[0]) return null;
    const content = await readFile(filePaths[0]);
    if (content.length > 10 * 1024 * 1024) throw new Error('Rules file exceeds 10 MB');
    return parseSiteRules(JSON.parse(content.toString('utf8')));
  });
  ipcMain.handle('sites:importRules', (_event, rules: unknown, profileId: string) => {
    const validated = parseSiteRules({ format: 'site-runner-sites', version: 1, sites: rules });
    return data.importSiteRules(validated.map((rule) => ({ ...rule, browserProfileId: profileId })));
  });
  ipcMain.handle('templates:list', () => data.listTemplates());
  ipcMain.handle('templates:save', (_event, input: ScriptTemplateInput) => data.saveTemplate(input));
  ipcMain.handle('templates:remove', (_event, id: string) => data.removeTemplate(id));
  ipcMain.handle('templates:restoreDefaults', () => data.restoreDefaultTemplates());
  ipcMain.handle('templates:exportFiles', async (_event, ids: string[]) => {
    if (!Array.isArray(ids) || !ids.length) throw new Error('Select templates to export');
    const templates = data.listTemplates();
    const selected = [...new Set(ids)].map((id) => {
      const template = templates.find((item) => item.id === id);
      if (!template) throw new Error('Template not found');
      return template;
    });
    const { canceled, filePath } = await dialog.showSaveDialog({ defaultPath: 'site-runner-templates.json', filters: [{ name: 'JSON', extensions: ['json'] }] });
    if (canceled || !filePath) return false;
    await writeFile(filePath, JSON.stringify(exportTemplates(selected), null, 2), { mode: 0o600 });
    return true;
  });
  ipcMain.handle('templates:previewImport', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({ properties: ['openFile'], filters: [{ name: 'JSON', extensions: ['json'] }] });
    if (canceled || !filePaths[0]) return null;
    const content = await readFile(filePaths[0]);
    if (content.length > 10 * 1024 * 1024) throw new Error('Templates file exceeds 10 MB');
    return parseTemplateFile(JSON.parse(content.toString('utf8')));
  });
  ipcMain.handle('templates:importFiles', (_event, inputs: unknown) => data.importTemplates(parseTemplateFile({ format: 'site-runner-templates', version: 1, templates: inputs })));
  ipcMain.handle('sites:save', (_event, input: SiteInput) => {
    if (input.id) runtime.assertIdle(input.id);
    const site = data.saveSite(input); scheduler.refresh(site); return site;
  });
  ipcMain.handle('sites:remove', (_event, id: string) => { runtime.assertIdle(id); scheduler.remove(id); data.removeSite(id); });
  ipcMain.handle('profiles:list', () => data.listProfiles());
  ipcMain.handle('profiles:create', (_event, name: string) => profiles.create(name));
  const assertProfileIdle = (id: string) => { if (data.listSites().some((site) => site.browserProfileId === id && runtime.isBusy(site.id))) throw new Error('This profile has running or waiting tasks'); };
  ipcMain.handle('profiles:remove', (_event, id: string) => { assertProfileIdle(id); profiles.remove(id); });
  ipcMain.handle('profiles:open', (_event, id: string, url?: string) => { assertProfileIdle(id); return profiles.open(id, url); });
  ipcMain.handle('runs:search', (_event, query) => data.searchRuns(query));
  ipcMain.handle('runs:detail', (_event, id: string) => data.runDetail(id));
  ipcMain.handle('notifications:receipts', () => data.listReceipts());
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
  ipcMain.handle('settings:exportConfiguration', async () => {
    const file = exportConfiguration(data);
    const { canceled, filePath } = await dialog.showSaveDialog({ defaultPath: 'site-runner-configuration.json', filters: [{ name: 'JSON', extensions: ['json'] }] });
    if (canceled || !filePath) return false;
    await writeFile(filePath, JSON.stringify(file, null, 2), { mode: 0o600 }); return true;
  });
  ipcMain.handle('settings:previewConfiguration', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({ properties: ['openFile'], filters: [{ name: 'JSON', extensions: ['json'] }] });
    if (canceled || !filePaths[0]) return null;
    const file = await readFile(filePaths[0]);
    if (file.length > 10 * 1024 * 1024) throw new Error('Configuration file exceeds 10 MB');
    return parseConfiguration(JSON.parse(file.toString('utf8')));
  });
  ipcMain.handle('settings:importConfiguration', (_event, file: unknown, applySettings: boolean) => {
    const result = importConfiguration(data, file, applySettings === true); scheduler.refreshAll(); return result;
  });
  ipcMain.handle('settings:update', (_event, patch) => data.updateSettings(patch));
}
