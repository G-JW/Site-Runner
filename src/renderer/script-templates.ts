import type { AppLanguage } from '../shared/types';

export interface ScriptTemplate {
  id: string;
  name: Record<AppLanguage, string>;
  description: Record<AppLanguage, string>;
  instructions: Record<AppLanguage, string>;
  script: string | null;
}

export const scriptTemplates: ScriptTemplate[] = [
  {
    id: 'visit',
    name: { en: 'Open the webpage', 'zh-CN': '只打开网页' },
    description: { en: 'Visit the site URL without additional actions.', 'zh-CN': '访问站点网址，无需额外操作。' },
    instructions: { en: 'Leaves the script empty. A loaded page does not prove a successful check-in.', 'zh-CN': '保持脚本为空。页面加载成功并不代表签到成功。' },
    script: null,
  },
  {
    id: 'click',
    name: { en: 'Click a check-in button', 'zh-CN': '点击签到按钮' },
    description: { en: 'Find a button by its visible name and click it.', 'zh-CN': '根据按钮显示名称找到并点击签到按钮。' },
    instructions: { en: 'Replace 签到 with the exact button name. Add a result check if business success must be verified.', 'zh-CN': '将“签到”替换为实际按钮名称；需要确认业务成功时，请使用带结果检查的模板。' },
    script: `export default async function run({ page, log }: AutomationContext) {
  // Replace this with the button name shown on your site / 替换为实际按钮名称
  await page.getByRole('button', { name: '签到', exact: true }).click();
  log.info('Check-in button clicked');
}`,
  },
  {
    id: 'verified-click',
    name: { en: 'Check in and verify the result', 'zh-CN': '签到并检查结果' },
    description: { en: 'Click the button and wait for a success message.', 'zh-CN': '点击签到按钮，并等待成功提示出现。' },
    instructions: { en: 'Replace the button name and success message. Missing success text causes a failed run.', 'zh-CN': '替换按钮名称和成功提示文字。未出现成功提示时，任务会失败。' },
    script: `export default async function run({ page, log }: AutomationContext) {
  await page.getByRole('button', { name: '签到', exact: true }).click();
  // Replace this with the real success message / 替换为实际成功提示
  await page.getByText('签到成功', { exact: true }).waitFor({ state: 'visible' });
  log.info('Check-in success verified');
}`,
  },
  {
    id: 'multi-step',
    name: { en: 'Multiple clicks and confirmation', 'zh-CN': '多步点击与确认' },
    description: { en: 'Open an activity page, check in, confirm, and verify.', 'zh-CN': '打开活动页面、点击签到、确认弹窗并验证结果。' },
    instructions: { en: 'Replace every link, button and result text with your site’s values. Remove steps your site does not need.', 'zh-CN': '替换各步骤中的链接、按钮和结果文字，删除网站不需要的步骤。' },
    script: `export default async function run({ page, log }: AutomationContext) {
  await page.getByRole('link', { name: '每日任务', exact: true }).click();
  await page.getByRole('button', { name: '签到', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.waitFor({ state: 'visible' });
  await dialog.getByRole('button', { name: '确认', exact: true }).click();
  await page.getByText('签到成功', { exact: true }).waitFor({ state: 'visible' });
  log.info('All steps completed');
}`,
  },
  {
    id: 'already-done',
    name: { en: 'Skip an already completed check-in', 'zh-CN': '已签到时跳过' },
    description: { en: 'Wait for either a completed status or an available check-in button.', 'zh-CN': '等待已签到状态或可点击的签到按钮，避免重复操作。' },
    instructions: { en: 'Replace both status texts and the button name. The completed status and button must be distinct.', 'zh-CN': '替换已签到提示、签到按钮及成功提示；已签到状态和按钮应使用不同定位。' },
    script: `export default async function run({ page, log }: AutomationContext) {
  const done = page.getByText('今日已签到', { exact: true });
  const button = page.getByRole('button', { name: '签到', exact: true });
  await done.or(button).first().waitFor({ state: 'visible' });
  if (await done.isVisible()) {
    log.info('Already checked in today');
    return;
  }
  await button.click();
  await page.getByText('签到成功', { exact: true }).waitFor({ state: 'visible' });
  log.info('Check-in success verified');
}`,
  },
  {
    id: 'form',
    name: { en: 'Fill a form and submit', 'zh-CN': '填写表单并提交' },
    description: { en: 'Fill a labeled field, submit, and wait for confirmation.', 'zh-CN': '填写带标签的输入框，提交表单并等待确认。' },
    instructions: { en: 'Replace the field label, input value, submit button and confirmation text. Keep account passwords out of scripts.', 'zh-CN': '替换输入框标签、填写内容、提交按钮和确认文字。不要在脚本中保存账号密码。' },
    script: `export default async function run({ page, log }: AutomationContext) {
  await page.getByLabel('备注', { exact: true }).fill('每日打卡');
  await page.getByRole('button', { name: '提交', exact: true }).click();
  await page.getByText('提交成功', { exact: true }).waitFor({ state: 'visible' });
  log.info('Form submission verified');
}`,
  },
];
