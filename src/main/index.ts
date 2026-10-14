import { app, BrowserWindow, ipcMain, nativeTheme, net } from 'electron';
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
import { cliHelp, executeCliCommand, parseCliCommand, type CliCommand } from './cli.js';
import { RecorderService } from './recording/recorder-service.js';
import { CleanupService } from './services/cleanup-service.js';
import { RuntimeService } from './services/runtime-service.js';
import { UpdateService } from './updates/update-service.js';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
let cliCommand: CliCommand | null = null;
try {
  cliCommand = parseCliCommand(process.argv.slice(app.isPackaged ? 1 : 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  app.exit(2);
}
if (cliCommand?.action === 'help') {
  console.log(cliHelp);
  app.exit(0);
}
const userDataOverride = cliCommand?.userData ?? process.env.SITE_RUNNER_USER_DATA;
if (userDataOverride) app.setPath('userData', path.resolve(userDataOverride));
if (!app.requestSingleInstanceLock()) {
  console.error('Another Site Runner instance is using this data directory. Close it before running this command.');
  app.exit(3);
}
if (cliCommand) {
  app.disableHardwareAcceleration();
  if (process.platform === 'darwin') app.setActivationPolicy('prohibited');
}
app.on('second-instance', (_event, argv) => {
  if (argv.some((arg) => ['--run-all', '--run-site', '--run-folder', '--list-sites', '--list-folders'].includes(arg))) return;
  const window = BrowserWindow.getAllWindows()[0];
  if (window) { if (window.isMinimized()) window.restore(); window.focus(); }
});
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

function createWindow(theme: 'system' | 'light' | 'dark' = 'system'): BrowserWindow {
  const window = new BrowserWindow({
    width: 1320,
    height: 840,
    minWidth: 1040,
    minHeight: 680,
    title: 'Site Runner',
    backgroundColor: theme === 'light' || (theme === 'system' && !nativeTheme.shouldUseDarkColors) ? '#fafafa' : '#1e1e1e',
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
  const logging = createLogger(paths.logs);
  const logger = logging.logger;
  const database = new AppDatabase(paths.database);
  const data = new DataService(database.connection);
  const cleanup = new CleanupService(data, paths.userData);
  const profiles = new ProfileService(data, paths.profiles);
  const runner = new AutomationRunner(data, profiles, paths.screenshots, (entry) => {
    logger[entry.level]({ siteId: entry.siteId }, entry.message);
    broadcastRunLog(entry);
  });
  const notifications = new NotificationService(data);
  if (cliCommand) {
    let exitCode = 1;
    try {
      if (cliCommand.action.startsWith('run-')) {
        try { cleanup.runAutomatic(); } catch (error) { logger.error({ error }, 'Automatic cleanup failed'); }
      }
      const result = await executeCliCommand(cliCommand, data, runner, notifications);
      console.log(JSON.stringify(result.output));
      exitCode = result.exitCode;
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
    } finally {
      await profiles.closeAll();
      database.close();
      logging.close();
      // Let macOS finish its ready event before exiting commands with no browser work.
      setTimeout(() => app.exit(exitCode), 100);
    }
    return;
  }
  const batch = new BatchRunner(data, runner, (result) => notifications.notifyBatch(result).then(() => undefined));
  const scheduledBatch = new BatchRunner(data, runner, async (result) => {
    if (result.total && data.getSettings().notifyScheduledRuns) await notifications.notifyBatch(result);
  });
  const runtime = new RuntimeService(runner, [batch, scheduledBatch]);
  const scheduler = new SchedulerService(data, runner, async (result) => {
    if (!data.getSettings().notifyScheduledRuns) return;
    await notifications.notifyBatch({ startedAt: result.startedAt, finishedAt: result.finishedAt, total: 1,
      success: result.status === 'success' ? 1 : 0, failed: result.status === 'failed' ? 1 : 0, results: [result] });
  }, async (folderId) => {
    const ids = data.listSites().filter((site) => site.enabled && site.folderId === folderId && !site.schedule.enabled && site.schedule.mode !== 'manual' && !runtime.isBusy(site.id)).map((site) => site.id);
    if (!ids.length) return;
    await scheduledBatch.runSites(ids, undefined, 'schedule');
  }, (id) => !runtime.isBusy(id));
  const recorder = new RecorderService(profiles, path.join(paths.userData, 'recordings'), (id) => data.listSites().some((site) => site.browserProfileId === id && runtime.isBusy(site.id)));
  const updates = new UpdateService({
    currentVersion: app.getVersion(), platform: process.platform, arch: process.arch,
    executable: process.execPath, userData: paths.userData, packaged: app.isPackaged,
    ...(process.env.PORTABLE_EXECUTABLE_FILE ? { portablePath: process.env.PORTABLE_EXECUTABLE_FILE } : {}),
    fetch: (url, options) => net.fetch(url as string, options),
    isBusy: () => { const snapshot = runtime.snapshot(); return snapshot.runs.length > 0 || snapshot.batches.length > 0 || profiles.hasOpenBrowsers() || ['recording', 'ready'].includes(recorder.getStatus().state); },
    beforeInstall: async () => undefined,
    quit: () => app.quit(),
    logError: (stage, error) => logger.warn({ stage, error }, 'Application update failed'),
  });
  await updates.initialize();
  updates.onState((state) => { for (const window of BrowserWindow.getAllWindows()) { if (!window.isDestroyed()) window.webContents.send('updates:state', state); } });
  ipcMain.handle('updates:state', () => updates.snapshot());
  ipcMain.handle('updates:check', () => updates.check());
  ipcMain.handle('updates:download', () => updates.download());
  ipcMain.handle('updates:install', () => updates.install());
  ipcMain.handle('recorder:start', (_event, input) => { if (runner.isStopping()) throw new Error('Application is closing'); return recorder.start(input); });
  ipcMain.handle('recorder:status', () => recorder.getStatus());
  ipcMain.handle('recorder:finish', () => recorder.finish());
  ipcMain.handle('recorder:cancel', () => recorder.cancel());
  if (data.listProfiles().length === 0) profiles.create('Default');
  registerDataIpc(data, profiles, scheduler, notifications, cleanup, runtime);
  registerRunIpc(runner, batch, runtime, data);
  scheduler.start();
  cleanup.start();
  ipcMain.handle('app:info', () => ({
    name: 'Site Runner',
    version: app.getVersion(),
    userDataPath: getAppPaths().userData,
    platform: process.platform,
    executablePath: process.env.PORTABLE_EXECUTABLE_FILE || process.execPath,
    cliAppPath: app.isPackaged ? undefined : app.getAppPath(),
  }));

  let closing = false;
  app.on('before-quit', (event) => {
    event.preventDefault();
    if (closing) return;
    closing = true;
    cleanup.stop();
    const finishing = [scheduler.shutdown(), batch.shutdown(), scheduledBatch.shutdown(), runner.shutdown(), recorder.cancel(), profiles.closeAll(), updates.shutdown()];
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed() && !window.webContents.isDestroyed()) window.webContents.send('app:closing');
    }
    void Promise.allSettled(finishing).then(async (results) => {
      await notifications.shutdown();
      const errors = results.filter((result) => result.status === 'rejected');
      if (errors.length) logger.error({ errors }, 'Exit cleanup failed');
      database.close(); logging.close(); app.exit(errors.length ? 1 : 0);
    }).catch((error: unknown) => { logger.error({ error }, 'Exit cleanup failed'); logging.close(); app.exit(1); });
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
    logging.close();
    app.exit(exitCode);
    return;
  }

  const window = createWindow(data.getSettings().theme);
  window.webContents.once('did-finish-load', () => {
    void (async () => {
      for (let attempt = 0; attempt < 30; attempt++) {
        const mounted = await window.webContents.executeJavaScript("Boolean(document.querySelector('[data-testid=nav-sites]') && document.querySelector('[data-testid=nav-settings]'))");
        if (mounted) { await updates.confirmStartup(); return; }
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      throw new Error('Updated renderer did not mount');
    })().catch((error: unknown) => logger.error({ error }, 'Update startup confirmation failed'));
  });
  if (process.argv.includes('--smoke-test')) {
    const rendererErrors: string[] = [];
    window.webContents.on('console-message', (details) => {
      if (details.level === 'error') rendererErrors.push(details.message);
    });
    window.webContents.once('did-finish-load', () => {
      void window.webContents.executeJavaScript(`(async () => {
        const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
        await wait(250);
        document.querySelector('[data-testid="nav-sites"]')?.click();
        await wait(100);
        document.querySelector('[data-testid="add-site"]')?.click();
        await wait(1_000);
        const siteDialog = Boolean(document.querySelector('[data-testid="site-dialog"]'));
        document.querySelector('[data-testid="site-dialog"] .close')?.click();
        document.querySelector('[data-testid="nav-settings"]')?.click();
        await wait(100);
        document.querySelector('[data-testid="nav-templates"]')?.click();
        await wait(100);
        document.querySelector('[data-testid="template-multi-step"]')?.click();
        await wait(100);
        const templatePreview = document.querySelector('[data-testid="template-code"]')?.textContent.includes("getByRole('dialog')");
        document.querySelector('[data-testid="create-from-template"]')?.click();
        await wait(300);
        const setInput = (input, value) => {
          Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
          input.dispatchEvent(new Event('input', { bubbles: true }));
        };
        const fillSite = async (name) => {
          document.querySelector('[data-testid="task-tab-website"]')?.click();
          await wait(100);
          const inputs = document.querySelectorAll('[data-testid="site-dialog"] .form-grid input');
          setInput(inputs[0], name);
          await wait(50);
          setInput(inputs[1], 'https://example.com');
          await wait(50);
        };
        await fillSite('Template smoke');
        document.querySelector('[data-testid="site-dialog"] .modal-actions .primary')?.click();
        await wait(200);
        const templateSite = (await window.siteRunner.sites.list()).find((site) => site.name === 'Template smoke');
        const templateCreated = templateSite?.script.includes("getByRole('dialog')");
        document.querySelector('[data-testid="nav-settings"]')?.click();
        await wait(100);
        document.querySelector('[data-testid="nav-templates"]')?.click();
        await wait(100);
        document.querySelector('[data-testid="template-verified-click"]')?.click();
        await wait(50);
        document.querySelector('[data-testid="create-from-template"]')?.click();
        await wait(300);
        await fillSite('Visit smoke');
        document.querySelector('[data-testid="task-tab-actions"]')?.click();
        await wait(100);
        document.querySelector('[data-testid="choose-template"]')?.click();
        await wait(50);
        document.querySelector('[data-testid="apply-template"]')?.click();
        await wait(50);
        const overwriteGuard = Boolean(document.querySelector('[data-testid="site-dialog"] [role="alert"]'));
        document.querySelector('[data-testid="apply-template"]')?.click();
        await wait(50);
        await fillSite('Visit smoke');
        document.querySelector('[data-testid="site-dialog"] .modal-actions .primary')?.click();
        await wait(200);
        const visitSite = (await window.siteRunner.sites.list()).find((site) => site.name === 'Visit smoke');
        const templateCleared = visitSite?.script === null;
        if (templateSite) await window.siteRunner.sites.remove(templateSite.id);
        if (visitSite) await window.siteRunner.sites.remove(visitSite.id);
        document.querySelector('[data-testid="nav-settings"]')?.click();
        await wait(100);
        document.querySelector('[data-testid="nav-profiles"]')?.click();
        await wait(100);
        document.querySelector('[data-testid="new-profile"]')?.click();
        await wait(100);
        const profileDialog = Boolean(document.querySelector('[data-testid="profile-dialog"]'));
        document.querySelector('[data-testid="profile-dialog"] .close')?.click();
        document.querySelector('[data-testid="nav-settings"]')?.click();
        await wait(100);
        const languageSelect = document.querySelector('[data-testid="language-select"]');
        if (languageSelect) {
          languageSelect.value = 'zh-CN';
          languageSelect.dispatchEvent(new Event('change', { bubbles: true }));
        }
        await wait(300);
        return {
          shell: Boolean(document.querySelector('.app-shell')),
          api: typeof window.siteRunner?.sites?.list === 'function',
          siteDialog,
          templatePreview,
          templateCreated,
          overwriteGuard,
          templateCleared,
          profileDialog,
          chinese: document.documentElement.lang === 'zh-CN' && document.body.innerText.includes('简体中文'),
          text: document.body.innerText.slice(0, 200)
        };
      })()`).then((result: { shell: boolean; api: boolean; siteDialog: boolean; templatePreview: boolean; templateCreated: boolean; overwriteGuard: boolean; templateCleared: boolean; profileDialog: boolean; chinese: boolean; text: string }) => {
        const report = { ...result, rendererErrors };
        console.log(`RENDERER_SMOKE ${JSON.stringify(report)}`);
        app.exit(result.shell && result.api && result.siteDialog && result.templatePreview && result.templateCreated && result.overwriteGuard && result.templateCleared && result.profileDialog && result.chinese && rendererErrors.length === 0 ? 0 : 1);
      }).catch((error: unknown) => {
        console.error('RENDERER_SMOKE failed', error);
        app.exit(1);
      });
    });
    window.webContents.once('did-fail-load', (_event, code, description) => {
      console.error(`RENDERER_SMOKE load failed: ${code} ${description}`);
      app.exit(1);
    });
    setTimeout(() => {
      console.error('RENDERER_SMOKE timed out', rendererErrors);
      void window.webContents.executeJavaScript('document.body.innerText').then((body: string) => {
        console.error(body.slice(0, 2_000));
        app.exit(1);
      }).catch(() => app.exit(1));
    }, 20_000).unref();
  }

  app.on('activate', () => {
    if (closing) return;
    if (BrowserWindow.getAllWindows().length === 0) createWindow(data.getSettings().theme);
  });
  logger.info({ userData: paths.userData }, 'Site Runner started');
}).catch((error: unknown) => {
  console.error('Site Runner startup failed', error instanceof Error ? error.message : String(error));
  app.exit(1);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
