import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { executeAutomation } from '../src/main/automation/worker-execution.js';

const html = encodeURIComponent(`<!doctype html><meta charset="utf-8"><button onclick="document.querySelector('[role=status]').textContent='签到成功'">签到</button><p role="status">等待</p>`);
const script = `export default async function run({ page, log }: AutomationContext) {
  log.info('Clicking check-in');
  await page.getByRole('button', { name: '签到' }).click();
  const result = await page.getByRole('status').textContent();
  if (result !== '签到成功') throw new Error('Check-in was not confirmed');
}`;

describe('Playwright automation execution', () => {
  it('supports URL-only and scripted click workflows', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'site-runner-flow-'));
    const base = { siteName: 'Demo', url: `data:text/html;charset=utf-8,${html}`, timeoutMs: 2_000,
      screenshotPath: path.join(root, 'failure.png'), headless: true };
    const visit = await executeAutomation({ ...base, siteId: 'visit', script: null, profilePath: path.join(root, 'visit') }, () => undefined);
    const click = await executeAutomation({ ...base, siteId: 'click', script, profilePath: path.join(root, 'click') }, () => undefined);
    expect(visit).toMatchObject({ status: 'success', message: 'Page loaded (no result assertion)' });
    expect(click).toMatchObject({ status: 'success', message: 'Automation completed' });
  });

  it('captures a PNG when a locator fails', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'site-runner-failure-'));
    const screenshotPath = path.join(root, 'failure.png');
    const result = await executeAutomation({
      siteId: 'failure', siteName: 'Failure', url: `data:text/html;charset=utf-8,${html}`,
      script: `export default async function run({ page }) { await page.getByRole('button', { name: 'Missing' }).click(); }`,
      timeoutMs: 500, profilePath: path.join(root, 'profile'), screenshotPath, headless: true,
    }, () => undefined);
    expect(result.status).toBe('failed');
    expect(result.error).toContain('Timeout');
    expect(readFileSync(screenshotPath).subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  });

  it('checks visit content, rejects challenge pages and preserves script success messages', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'site-runner-visit-check-'));
    const execute = (id: string, markup: string, script: string | null, check: 'none' | 'text' = 'none', value = '') => executeAutomation({
      siteId: id, siteName: id, url: `data:text/html,${encodeURIComponent(markup)}`, script, timeoutMs: 1000,
      visitOptions: { stayMs: 0, detectChallenges: true, check, value }, profilePath: path.join(root, id), screenshotPath: path.join(root, `${id}.png`), headless: true,
    }, () => undefined);
    expect(await execute('normal', '<h1>Account ready</h1>', null, 'text', 'Account ready')).toMatchObject({ status: 'success', message: 'Expected page content verified' });
    expect(await execute('missing', '<h1>Log in</h1>', null, 'text', 'Account ready')).toMatchObject({ status: 'failed' });
    expect(await execute('challenge', '<title>Just a moment...</title><p>Checking browser</p>', null)).toMatchObject({ status: 'failed', error: expect.stringContaining('security challenge') });
    expect(await execute('message', '<h1>Normal</h1>', "export default async function run() { return { message: '今日已签到' }; }")).toMatchObject({ status: 'success', message: '今日已签到' });
  });
});
