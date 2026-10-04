import { contextBridge, ipcRenderer } from 'electron';
import type { SiteRunnerApi } from '../shared/types.js';

const api: SiteRunnerApi = {
  cleanup: {
    preview: () => ipcRenderer.invoke('cleanup:preview') as ReturnType<SiteRunnerApi['cleanup']['preview']>,
    execute: (id) => ipcRenderer.invoke('cleanup:execute', id) as ReturnType<SiteRunnerApi['cleanup']['execute']>,
    status: () => ipcRenderer.invoke('cleanup:status') as ReturnType<SiteRunnerApi['cleanup']['status']>,
  },
  app: {
    onClosing: (listener) => {
      const handler = () => listener();
      ipcRenderer.on('app:closing', handler);
      return () => ipcRenderer.removeListener('app:closing', handler);
    },
    info: () => ipcRenderer.invoke('app:info') as ReturnType<SiteRunnerApi['app']['info']>,
    openDataFolder: () => ipcRenderer.invoke('app:openDataFolder') as ReturnType<SiteRunnerApi['app']['openDataFolder']>,
  },
  sites: {
    list: () => ipcRenderer.invoke('sites:list') as ReturnType<SiteRunnerApi['sites']['list']>,
    save: (input) => ipcRenderer.invoke('sites:save', input) as ReturnType<SiteRunnerApi['sites']['save']>,
    remove: (id) => ipcRenderer.invoke('sites:remove', id) as ReturnType<SiteRunnerApi['sites']['remove']>,
    exportRules: (ids) => ipcRenderer.invoke('sites:exportRules', ids) as ReturnType<SiteRunnerApi['sites']['exportRules']>,
    previewImport: () => ipcRenderer.invoke('sites:previewImport') as ReturnType<SiteRunnerApi['sites']['previewImport']>,
    importRules: (rules, profileId) => ipcRenderer.invoke('sites:importRules', rules, profileId) as ReturnType<SiteRunnerApi['sites']['importRules']>,
  },
  folders: {
    list: () => ipcRenderer.invoke('folders:list') as ReturnType<SiteRunnerApi['folders']['list']>,
    save: (input) => ipcRenderer.invoke('folders:save', input) as ReturnType<SiteRunnerApi['folders']['save']>,
    remove: (id) => ipcRenderer.invoke('folders:remove', id) as ReturnType<SiteRunnerApi['folders']['remove']>,
    moveSites: (ids, folderId) => ipcRenderer.invoke('folders:moveSites', ids, folderId) as ReturnType<SiteRunnerApi['folders']['moveSites']>,
  },
  templates: {
    exportFiles: (ids) => ipcRenderer.invoke('templates:exportFiles', ids) as ReturnType<SiteRunnerApi['templates']['exportFiles']>,
    previewImport: () => ipcRenderer.invoke('templates:previewImport') as ReturnType<SiteRunnerApi['templates']['previewImport']>,
    importFiles: (inputs) => ipcRenderer.invoke('templates:importFiles', inputs) as ReturnType<SiteRunnerApi['templates']['importFiles']>,
    list: () => ipcRenderer.invoke('templates:list') as ReturnType<SiteRunnerApi['templates']['list']>,
    save: (input) => ipcRenderer.invoke('templates:save', input) as ReturnType<SiteRunnerApi['templates']['save']>,
    remove: (id) => ipcRenderer.invoke('templates:remove', id) as ReturnType<SiteRunnerApi['templates']['remove']>,
    restoreDefaults: () => ipcRenderer.invoke('templates:restoreDefaults') as ReturnType<SiteRunnerApi['templates']['restoreDefaults']>,
  },
  recorder: {
    start: (input) => ipcRenderer.invoke('recorder:start', input) as ReturnType<SiteRunnerApi['recorder']['start']>,
    status: () => ipcRenderer.invoke('recorder:status') as ReturnType<SiteRunnerApi['recorder']['status']>,
    finish: () => ipcRenderer.invoke('recorder:finish') as ReturnType<SiteRunnerApi['recorder']['finish']>,
    cancel: () => ipcRenderer.invoke('recorder:cancel') as ReturnType<SiteRunnerApi['recorder']['cancel']>,
  },
  profiles: {
    list: () => ipcRenderer.invoke('profiles:list') as ReturnType<SiteRunnerApi['profiles']['list']>,
    create: (name) => ipcRenderer.invoke('profiles:create', name) as ReturnType<SiteRunnerApi['profiles']['create']>,
    remove: (id) => ipcRenderer.invoke('profiles:remove', id) as ReturnType<SiteRunnerApi['profiles']['remove']>,
    open: (id) => ipcRenderer.invoke('profiles:open', id) as ReturnType<SiteRunnerApi['profiles']['open']>,
  },
  runs: {
    state: () => ipcRenderer.invoke('runs:state') as ReturnType<SiteRunnerApi['runs']['state']>,
    onState: (listener) => {
      const handler = (_event: Electron.IpcRendererEvent, state: Parameters<typeof listener>[0]) => listener(state);
      ipcRenderer.on('runs:state', handler);
      return () => ipcRenderer.removeListener('runs:state', handler);
    },
    search: (query) => ipcRenderer.invoke('runs:search', query) as ReturnType<SiteRunnerApi['runs']['search']>,
    detail: (id) => ipcRenderer.invoke('runs:detail', id) as ReturnType<SiteRunnerApi['runs']['detail']>,
    runSites: (ids) => ipcRenderer.invoke('runs:runSites', ids) as ReturnType<SiteRunnerApi['runs']['runSites']>,
    runSite: (id) => ipcRenderer.invoke('runs:runSite', id) as ReturnType<SiteRunnerApi['runs']['runSite']>,
    runEnabledSites: () => ipcRenderer.invoke('runs:runEnabledSites') as ReturnType<SiteRunnerApi['runs']['runEnabledSites']>,
    list: (siteId) => ipcRenderer.invoke('runs:list', siteId) as ReturnType<SiteRunnerApi['runs']['list']>,
    openScreenshot: (runId) => ipcRenderer.invoke('runs:openScreenshot', runId) as ReturnType<SiteRunnerApi['runs']['openScreenshot']>,
    onLog: (listener) => {
      const handler = (_event: Electron.IpcRendererEvent, entry: Parameters<typeof listener>[0]) => listener(entry);
      ipcRenderer.on('runs:log', handler);
      return () => ipcRenderer.removeListener('runs:log', handler);
    },
  },
  notifications: {
    receipts: () => ipcRenderer.invoke('notifications:receipts') as ReturnType<SiteRunnerApi['notifications']['receipts']>,
    list: () => ipcRenderer.invoke('notifications:list') as ReturnType<SiteRunnerApi['notifications']['list']>,
    save: (input) => ipcRenderer.invoke('notifications:save', input) as ReturnType<SiteRunnerApi['notifications']['save']>,
    remove: (id) => ipcRenderer.invoke('notifications:remove', id) as ReturnType<SiteRunnerApi['notifications']['remove']>,
    test: (id) => ipcRenderer.invoke('notifications:test', id) as ReturnType<SiteRunnerApi['notifications']['test']>,
  },
  settings: {
    exportConfiguration: () => ipcRenderer.invoke('settings:exportConfiguration') as ReturnType<SiteRunnerApi['settings']['exportConfiguration']>,
    previewConfiguration: () => ipcRenderer.invoke('settings:previewConfiguration') as ReturnType<SiteRunnerApi['settings']['previewConfiguration']>,
    importConfiguration: (file, applySettings) => ipcRenderer.invoke('settings:importConfiguration', file, applySettings) as ReturnType<SiteRunnerApi['settings']['importConfiguration']>,
    get: () => ipcRenderer.invoke('settings:get') as ReturnType<SiteRunnerApi['settings']['get']>,
    update: (settings) => ipcRenderer.invoke('settings:update', settings) as ReturnType<SiteRunnerApi['settings']['update']>,
  },
};

contextBridge.exposeInMainWorld('siteRunner', api);
