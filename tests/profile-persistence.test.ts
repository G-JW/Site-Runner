import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';
import { expect, it } from 'vitest';

it('persists Chromium cookies and localStorage across profile restarts', async () => {
  const profilePath = mkdtempSync(path.join(tmpdir(), 'site-runner-browser-'));
  const first = await chromium.launchPersistentContext(profilePath, { headless: true });
  await first.route('https://state.test/**', (route) => route.fulfill({ body: '<title>State</title>' }));
  const page = first.pages()[0] ?? await first.newPage();
  await page.goto('https://state.test/');
  await first.addCookies([{ name: 'site-runner', value: 'saved', url: 'https://state.test/', expires: 2_000_000_000 }]);
  await page.evaluate(() => localStorage.setItem('site-runner', 'saved'));
  await first.close();

  const second = await chromium.launchPersistentContext(profilePath, { headless: true });
  await second.route('https://state.test/**', (route) => route.fulfill({ body: '<title>State</title>' }));
  const reopened = second.pages()[0] ?? await second.newPage();
  await reopened.goto('https://state.test/');
  const cookies = await second.cookies('https://state.test/');
  expect(cookies).toContainEqual(expect.objectContaining({ name: 'site-runner', value: 'saved' }));
  expect(await reopened.evaluate(() => localStorage.getItem('site-runner'))).toBe('saved');
  await second.close();
});
