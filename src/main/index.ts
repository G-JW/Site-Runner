import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getAppPaths } from './paths.js';
import { AppDatabase } from './database/database.js';
import { registerDataIpc } from './ipc/register-data-ipc.js';
import { DataService } from './services/data-service.js';
import { ProfileService } from './profiles/profile-service.js';
import { AutomationRunner } from './automation/runner.js';
import { broadcastRunLog, registerRunIpc } from './ipc/register-run-ipc.js';
import { BatchRunner } from './automation/batch-runner.js';
import { SchedulerService } from './scheduler/scheduler-service.js';
import { NotificationService } from './notifications/service.js';
import { createLogger } from './logging.js';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const userDataOverride = process.env.SITE_RUNNER_USER_DATA;
if (userDataOverride) app.setPath('userData', path.resolve(userDataOverride));
if (app.isPackaged) {
  process.env.PLAYWRIGHT_BROWSERS_PATH = path.join(process.resourcesPath, 'playwright-browsers');
  process.env.ESBUILD_BINARY_PATH = path.join(
    process.resourcesPath,
    'app.asar.unpacked',
    'node_modules',
    '@esbuild',
    `${process.platform}-${process.arch}`,
    'bin',
    process.platform === 'win32' ? 'esbuild.exe' : 'esbuild',
  );
}

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1320,
    height: 840,
    minWidth: 1040,
    minHeight: 680,
    title: 'Site Runner',
    backgroundColor: '#f4f3ef',
    webPreferences: {
      preload: path.join(currentDir, '../preload/index.cjs'),
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

app.whenReady().then(async () => {
  const paths = getAppPaths();
  const logger = createLogger(paths.logs);
  const database = new AppDatabase(paths.database);
  const data = new DataService(database.connection);
  const profiles = new ProfileService(data, paths.profiles);
  const runner = new AutomationRunner(data, profiles, paths.screenshots, (entry) => {
    logger[entry.level]({ siteId: entry.siteId }, entry.message);
    broadcastRunLog(entry);
  });
  const notifications = new NotificationService(data);
  const batch = new BatchRunner(data, runner, (result) => notifications.notifyBatch(result).then(() => undefined));
  const scheduler = new SchedulerService(data, runner);
  if (data.listProfiles().length === 0) profiles.create('Default');
  registerDataIpc(data, profiles, scheduler, notifications);
  registerRunIpc(runner, batch);
  scheduler.start();
  ipcMain.handle('app:info', () => ({
    name: 'Site Runner',
    version: app.getVersion(),
    userDataPath: getAppPaths().userData,
  }));

  app.once('before-quit', () => {
    scheduler.stop();
    void profiles.closeAll();
    database.close();
  });

  if (process.argv.includes('--automation-smoke-test')) {
    data.updateSettings({ browserHeadless: true });
    const profile = data.listProfiles()[0] ?? profiles.create('Default');
    const markup = encodeURIComponent('<button onclick="document.body.dataset.done=\'yes\'">Run</button>');
    for (const [name, script] of [
      ['A', null],
      ['B', "export default async function run({ page }) { await page.getByRole('button', { name: 'Missing' }).click(); }"],
      ['C', "export default async function run({ page }) { await page.getByRole('button', { name: 'Run' }).click(); if (await page.locator('body').getAttribute('data-done') !== 'yes') throw new Error('Click failed'); }"],
    ] as const) {
      data.saveSite({ name, url: `data:text/html;charset=utf-8,${markup}`, enabled: true, script,
        browserProfileId: profile.id, timeoutMs: 1_000, schedule: { enabled: false, cron: '0 9 * * *' } });
    }
    const result = await batch.runEnabledSites();
    console.log(`AUTOMATION_SMOKE ${JSON.stringify({ total: result.total, success: result.success, failed: result.failed })}`);
    const exitCode = result.total === 3 && result.success === 2 && result.failed === 1 ? 0 : 1;
    scheduler.stop();
    await profiles.closeAll();
    database.close();
    app.exit(exitCode);
    return;
  }

  const window = createWindow();
  if (process.argv.includes('--smoke-test')) {
    window.webContents.once('did-finish-load', () => {
      void window.webContents.executeJavaScript(`new Promise((resolve) => setTimeout(() => resolve({
        shell: Boolean(document.querySelector('.app-shell')),
        api: typeof window.siteRunner?.sites?.list === 'function',
        text: document.body.innerText.slice(0, 200)
      }), 250))`).then((result: { shell: boolean; api: boolean; text: string }) => {
        console.log(`RENDERER_SMOKE ${JSON.stringify(result)}`);
        app.exit(result.shell && result.api ? 0 : 1);
      }).catch((error: unknown) => {
        console.error('RENDERER_SMOKE failed', error);
        app.exit(1);
      });
    });
    window.webContents.once('did-fail-load', (_event, code, description) => {
      console.error(`RENDERER_SMOKE load failed: ${code} ${description}`);
      app.exit(1);
    });
    setTimeout(() => app.exit(1), 10_000).unref();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
  logger.info({ userData: paths.userData }, 'Site Runner started');
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
