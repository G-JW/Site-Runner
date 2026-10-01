import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { chromium, type BrowserContext, type Page } from 'playwright';
import type { RunLogEntry } from '../../shared/types.js';
import { runTrustedScript } from './script-runner.js';
import type { AutomationExecutionResult, AutomationRequest } from './types.js';

export async function executeAutomation(request: AutomationRequest, emit: (entry: RunLogEntry) => void): Promise<AutomationExecutionResult> {
  const startedAt = new Date().toISOString();
  let context: BrowserContext | null = null;
  let page: Page | null = null;
  let screenshotPath: string | null = null;
  const log = (level: RunLogEntry['level'], message: string) => emit({
    siteId: request.siteId, level, message, timestamp: new Date().toISOString(),
  });
  try {
    log('info', `Opening ${request.url}`);
    context = await chromium.launchPersistentContext(request.profilePath, { headless: request.headless });
    context.setDefaultTimeout(request.timeoutMs);
    context.setDefaultNavigationTimeout(request.timeoutMs);
    page = context.pages()[0] ?? await context.newPage();
    const response = await page.goto(request.url, { waitUntil: 'domcontentloaded', timeout: request.timeoutMs });
    if (response && response.status() >= 400) throw new Error(`HTTP ${response.status()}`);
    if (request.script) {
      log('info', 'Running site script');
      await runTrustedScript(request.script, {
        page,
        log: { info: (message) => log('info', message), warn: (message) => log('warn', message), error: (message) => log('error', message) },
        config: {},
      });
    } else {
      log('info', 'URL loaded; no site script configured');
    }
    log('info', 'Run completed');
    return {
      siteId: request.siteId, siteName: request.siteName, status: 'success',
      message: request.script ? 'Automation completed' : 'Page loaded (no result assertion)', error: null,
      startedAt, finishedAt: new Date().toISOString(), screenshotPath: null, lastUrl: page.url(),
    };
  } catch (error) {
    const original = error instanceof Error ? error : new Error(String(error));
    log('error', original.message);
    if (page && !page.isClosed()) {
      try {
        mkdirSync(path.dirname(request.screenshotPath), { recursive: true });
        await page.screenshot({ path: request.screenshotPath, fullPage: true, timeout: Math.min(request.timeoutMs, 10_000) });
        screenshotPath = request.screenshotPath;
        log('info', `Failure screenshot saved to ${request.screenshotPath}`);
      } catch (screenshotError) {
        log('warn', `Could not save screenshot: ${screenshotError instanceof Error ? screenshotError.message : String(screenshotError)}`);
      }
    }
    return {
      siteId: request.siteId, siteName: request.siteName, status: 'failed', message: null,
      error: original.stack ?? original.message, startedAt, finishedAt: new Date().toISOString(),
      screenshotPath, lastUrl: page?.isClosed() === false ? page.url() : null,
    };
  } finally {
    if (context) await context.close().catch((error: unknown) => log('warn', `Could not close browser: ${String(error)}`));
  }
}
