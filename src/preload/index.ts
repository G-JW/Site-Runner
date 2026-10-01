import { contextBridge, ipcRenderer } from 'electron';
import type { SiteRunnerApi } from '../shared/types.js';

const api: SiteRunnerApi = {
  app: {
    info: () => ipcRenderer.invoke('app:info') as ReturnType<SiteRunnerApi['app']['info']>,
  },
};

contextBridge.exposeInMainWorld('siteRunner', api);
