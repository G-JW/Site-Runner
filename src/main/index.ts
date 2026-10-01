import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getAppPaths } from './paths.js';
import { AppDatabase } from './database/database.js';
import { registerDataIpc } from './ipc/register-data-ipc.js';
import { DataService } from './services/data-service.js';

const currentDir = path.dirname(fileURLToPath(import.meta.url));

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1320,
    height: 840,
    minWidth: 1040,
    minHeight: 680,
    title: 'Site Runner',
    backgroundColor: '#f4f3ef',
    webPreferences: {
      preload: path.join(currentDir, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  const developmentUrl = process.env.VITE_DEV_SERVER_URL;
  if (developmentUrl) {
    void window.loadURL(developmentUrl);
  } else {
    void window.loadFile(path.join(currentDir, '../../renderer/index.html'));
  }

  return window;
}

app.whenReady().then(() => {
  const paths = getAppPaths();
  const database = new AppDatabase(paths.database);
  const data = new DataService(database.connection);
  if (data.listProfiles().length === 0) data.createProfile('Default');
  registerDataIpc(data);
  ipcMain.handle('app:info', () => ({
    name: 'Site Runner',
    version: app.getVersion(),
    userDataPath: getAppPaths().userData,
  }));

  const window = createWindow();
  if (process.argv.includes('--smoke-test')) {
    window.webContents.once('did-finish-load', () => app.quit());
    setTimeout(() => app.quit(), 10_000).unref();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
  app.once('before-quit', () => database.close());
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
