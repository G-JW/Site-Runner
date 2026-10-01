import { contextBridge, ipcRenderer } from 'electron';
import type { SiteRunnerApi } from '../shared/types.js';

const api: SiteRunnerApi = {
  app: {
    info: () => ipcRenderer.invoke('app:info') as ReturnType<SiteRunnerApi['app']['info']>,
    openPath: (path) => ipcRenderer.invoke('app:openPath', path) as ReturnType<SiteRunnerApi['app']['openPath']>,
  },
  sites: {
    list: () => ipcRenderer.invoke('sites:list') as ReturnType<SiteRunnerApi['sites']['list']>,
    save: (input) => ipcRenderer.invoke('sites:save', input) as ReturnType<SiteRunnerApi['sites']['save']>,
    remove: (id) => ipcRenderer.invoke('sites:remove', id) as ReturnType<SiteRunnerApi['sites']['remove']>,
  },
  profiles: {
    list: () => ipcRenderer.invoke('profiles:list') as ReturnType<SiteRunnerApi['profiles']['list']>,
    create: (name) => ipcRenderer.invoke('profiles:create', name) as ReturnType<SiteRunnerApi['profiles']['create']>,
    remove: (id) => ipcRenderer.invoke('profiles:remove', id) as ReturnType<SiteRunnerApi['profiles']['remove']>,
    open: (id) => ipcRenderer.invoke('profiles:open', id) as ReturnType<SiteRunnerApi['profiles']['open']>,
  },
  runs: {
    runSite: (id) => ipcRenderer.invoke('runs:runSite', id) as ReturnType<SiteRunnerApi['runs']['runSite']>,
    runEnabledSites: () => ipcRenderer.invoke('runs:runEnabledSites') as ReturnType<SiteRunnerApi['runs']['runEnabledSites']>,
    list: (siteId) => ipcRenderer.invoke('runs:list', siteId) as ReturnType<SiteRunnerApi['runs']['list']>,
    onLog: (listener) => {
      const handler = (_event: Electron.IpcRendererEvent, entry: Parameters<typeof listener>[0]) => listener(entry);
      ipcRenderer.on('runs:log', handler);
      return () => ipcRenderer.removeListener('runs:log', handler);
    },
  },
  notifications: {
    list: () => ipcRenderer.invoke('notifications:list') as ReturnType<SiteRunnerApi['notifications']['list']>,
    save: (input) => ipcRenderer.invoke('notifications:save', input) as ReturnType<SiteRunnerApi['notifications']['save']>,
    remove: (id) => ipcRenderer.invoke('notifications:remove', id) as ReturnType<SiteRunnerApi['notifications']['remove']>,
    test: (id) => ipcRenderer.invoke('notifications:test', id) as ReturnType<SiteRunnerApi['notifications']['test']>,
  },
  settings: {
    get: () => ipcRenderer.invoke('settings:get') as ReturnType<SiteRunnerApi['settings']['get']>,
    update: (settings) => ipcRenderer.invoke('settings:update', settings) as ReturnType<SiteRunnerApi['settings']['update']>,
  },
};

contextBridge.exposeInMainWorld('siteRunner', api);
