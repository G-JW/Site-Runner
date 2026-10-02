import { chromium } from 'playwright';
import { expect, it } from 'vitest';
import { scriptTemplates } from '../src/renderer/script-templates';
import { runTrustedScript } from '../src/main/automation/script-runner';

it('runs all actionable templates against controlled pages and rejects missing success', async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const messages: string[] = [];
  const context = { page, config: {}, log: { info: (text: string) => messages.push(text), warn: () => undefined, error: () => undefined } };
  page.setDefaultTimeout(500);
  try {
    expect(scriptTemplates.find((item) => item.id === 'visit')?.script).toBeNull();
    for (const id of ['click', 'verified-click', 'already-done']) {
      await page.setContent('<button onclick="this.outerHTML=\'<p>签到成功</p>\'">签到</button>');
      await runTrustedScript(scriptTemplates.find((item) => item.id === id)!.script!, context);
      expect(await page.getByText('签到成功', { exact: true }).isVisible()).toBe(true);
    }
    await page.setContent('<p>今日已签到</p>');
    await runTrustedScript(scriptTemplates.find((item) => item.id === 'already-done')!.script!, context);
    expect(messages).toContain('Already checked in today');
    await page.setContent(`<a href="#tasks">每日任务</a><button onclick="document.querySelector('[role=dialog]').hidden=false">签到</button><div role="dialog" hidden><button onclick="document.body.innerHTML='<p>签到成功</p>'">确认</button></div>`);
    await runTrustedScript(scriptTemplates.find((item) => item.id === 'multi-step')!.script!, context);
    expect(await page.getByText('签到成功').isVisible()).toBe(true);
    await page.setContent('<label>备注<input></label><button onclick="this.outerHTML=\'<p>提交成功</p>\'">提交</button>');
    await runTrustedScript(scriptTemplates.find((item) => item.id === 'form')!.script!, context);
    expect(await page.getByLabel('备注').inputValue()).toBe('每日打卡');
    await page.setContent('<button>签到</button>');
    await expect(runTrustedScript(scriptTemplates.find((item) => item.id === 'verified-click')!.script!, context)).rejects.toThrow(/Timeout/);
  } finally { await browser.close(); }
});
