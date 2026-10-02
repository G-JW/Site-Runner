import { chromium } from 'playwright';
import { expect, it } from 'vitest';
import { convertRecording } from '../src/main/recording/convert.js';
import { runTrustedScript } from '../src/main/automation/script-runner.js';

it('converts a recorder test into a runnable script, preserving actions and assertions', async () => {
  const source = `import { test, expect } from '@playwright/test';
test('test', async ({ page }) => {
  await page.getByRole('button', { name: 'Run' }).click();
  await expect(page.getByText('Done', { exact: true })).toBeVisible();
});`;
  const script = convertRecording(source);
  expect(script).not.toContain("import { test");
  expect(script).toContain('export default async function run');
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent('<button onclick="this.outerHTML=\'<p>Done</p>\'">Run</button>');
    await runTrustedScript(script, { page, config: {}, log: { info: () => undefined, warn: () => undefined, error: () => undefined } });
    expect(await page.getByText('Done', { exact: true }).isVisible()).toBe(true);
    await page.setContent('<button>Run</button>');
    await expect(runTrustedScript(script.replace('toBeVisible()', 'toBeVisible({ timeout: 100 })'), { page, config: {}, log: { info: () => undefined, warn: () => undefined, error: () => undefined } })).rejects.toThrow();
  } finally { await browser.close(); }
});

it('preserves multiline literals and rejects invalid or empty recordings', () => {
  const source = "import { test } from '@playwright/test'; test('test', async ({ page }) => {\n await page.locator('textarea').fill(`line1\n   line2`);\n });";
  expect(convertRecording(source)).toContain('`line1\n   line2`');
  expect(() => convertRecording('bad syntax !')).toThrow();
  expect(() => convertRecording("test('test', async ({ page }) => {});")).toThrow(/No actions/);
});
