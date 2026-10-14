import { mkdirSync } from 'node:fs';
import path from 'node:path';
import type { BrowserContext, Page } from 'playwright';
import type { RunLogEntry } from '../../shared/types.js';
import { runTrustedScript } from './script-runner.js';
import { legacyVisitOptions } from '../../shared/visit-options.js';
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
    const { chromium } = await import('playwright');
    context = await chromium.launchPersistentContext(request.profilePath, { headless: request.headless });
    context.setDefaultTimeout(request.timeoutMs);
    context.setDefaultNavigationTimeout(request.timeoutMs);
    page = context.pages()[0] ?? await context.newPage();
    const response = await page.goto(request.url, { waitUntil: 'domcontentloaded', timeout: request.timeoutMs });
    if (response && response.status() >= 400) throw new Error(`HTTP ${response.status()}`);
    const options = request.visitOptions ?? legacyVisitOptions;
    if (!request.script && options.stayMs) await page.waitForTimeout(options.stayMs);
    if (options.detectChallenges) {
      const title = await page.title();
      const challengeHeader = response?.headers()['cf-mitigated'] === 'challenge';
      if (challengeHeader || /^(just a moment|attention required|security verification|verify you are human)/i.test(title.trim()) || await page.locator('#challenge-running, #challenge-stage').count() > 0)
        throw new Error('Page blocked by a security challenge; normal content was not confirmed');
    }
    let message = request.script ? 'Automation completed' : 'Page loaded';
    if (request.script) {
      log('info', 'Running site script');
      const scriptMessage = await runTrustedScript(request.script, {
        page,
        log: { info: (message) => log('info', message), warn: (message) => log('warn', message), error: (message) => log('error', message) },
        config: {},
      });
      if (scriptMessage) message = scriptMessage;
    } else {
      if (options.stayMs || options.detectChallenges) message = 'Page visited';
      log('info', 'URL loaded; no site script configured');
    }
    log('info', 'Run completed');
    return {
      siteId: request.siteId, siteName: request.siteName, status: 'success',
      message, error: null,
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
