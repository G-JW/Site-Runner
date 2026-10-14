// Exercise the redesigned workspace against temporary data and a local browser fixture.
import { _electron, expect } from "playwright/test";
import electronPath from "electron";
import { fileURLToPath } from "node:url";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { AppDatabase } from "../../dist/main/main/database/database.js";
import { DataService } from "../../dist/main/main/services/data-service.js";

const root = mkdtempSync(path.join(os.tmpdir(), "site-runner-workspace-"));
const executablePath = process.env.SITE_RUNNER_TEST_EXECUTABLE ?? electronPath;
const args = process.env.SITE_RUNNER_TEST_EXECUTABLE
  ? []
  : [fileURLToPath(new URL("../..", import.meta.url))];
const errors = [],
  deliveries = [];
const server = http.createServer((req, res) => {
  if (req.url === "/notify") {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      deliveries.push({ headers: req.headers, body: JSON.parse(body) });
      res.end("{}");
    });
  } else {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end(
      "<label>Account<input /></label><button onclick=\"document.querySelector('p').textContent='Completed'\">Check in</button><p>Waiting</p>",
    );
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const url = `http://127.0.0.1:${server.address().port}`;
const database = new AppDatabase(path.join(root, "site-runner.sqlite3"));
const data = new DataService(database.connection);
const profile = data.createProfile("Personal browser");
data.updateSettings({ language: "zh-CN", browserHeadless: true });
const original = data.saveSite({
  name: "Custom script",
  url,
  browserProfileId: profile.id,
  script: 'export default async function run() { return "Custom untouched"; }',
  timeoutMs: 10000,
  enabled: false,
  schedule: { enabled: false, cron: "0 9,17 * * 1,3,5" },
});
const legacy = data.saveSite({ name: "Legacy visit", url, browserProfileId: profile.id, script: null, timeoutMs: 10000, enabled: false, schedule: { enabled: false, cron: "0 9 * * *" } });
database.connection.prepare("UPDATE sites SET visit_options_json = ? WHERE id = ?").run(JSON.stringify({ stayMs: 0, detectChallenges: false, check: "text", value: "Missing old result" }), legacy.id);
data.saveRun({ id: "legacy-run", siteId: legacy.id, siteName: legacy.name, status: "success", message: "Page visited (login and business results not verified)", error: null, lastUrl: url, screenshotPath: null, trigger: "manual", startedAt: new Date().toISOString(), finishedAt: new Date().toISOString() });
database.connection.prepare("UPDATE run_records SET outcome = 'unverified' WHERE id = ?").run("legacy-run");
data.saveFolder({ name: "Daily routines" });
database.close();
let app;
async function launch() {
  app = await _electron.launch({
    executablePath,
    args,
    env: { ...process.env, SITE_RUNNER_USER_DATA: root },
    timeout: 20000,
  });
  const page = await app.firstWindow();
  page.on("pageerror", (error) => errors.push(error.message));
  await expect(page.getByTestId("nav-settings")).toContainText("设置");
  return page;
}
try {
  let page = await launch();
  const legacyRow = page.getByTestId(`site-row-${legacy.id}`);
  await expect(legacyRow).toContainText("执行成功");
  await expect(page.locator("body")).not.toContainText("未验证");
  await legacyRow.getByRole("button", { name: "运行", exact: true }).click();
  await expect(page.getByTestId("run-detail-dialog")).toContainText("执行成功", { timeout: 20000 });
  await expect(page.getByTestId("run-detail-dialog")).not.toContainText("verified");
  await page.getByTestId("run-detail-dialog").locator(".modal-actions .primary").click();

  await page.getByTestId("nav-settings").click();
  await page.getByTestId("theme-select").selectOption("dark");
  await page.getByTestId("density-select").selectOption("compact");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("html")).toHaveAttribute("data-density", "compact");
  await page.getByTestId("settings-search").fill("超时");
  await expect(page.getByTestId("default-timeout")).toBeVisible();
  await expect(page.getByTestId("theme-select")).toHaveCount(0);
  await page.getByTestId("default-timeout").fill("45000");
  await page.locator(".setting-input-group").getByRole("button").click();
  await expect
    .poll(() =>
      page.evaluate(
        async () => (await window.siteRunner.settings.get()).defaultTimeoutMs,
      ),
    )
    .toBe(45000);
  await page.getByTestId("settings-search").fill("");
  await page.screenshot({ path: path.join(root, "settings-dark.png") });
  await page.getByTestId("theme-select").selectOption("light");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.screenshot({ path: path.join(root, "settings-light.png") });
  await page.getByTestId("theme-select").selectOption("system");
  await expect(page.getByTestId("theme-select")).toHaveValue("system");
  await page.bringToFront();
  await page.emulateMedia({ colorScheme: "dark" });
  await expect.poll(() => page.evaluate(() => matchMedia("(prefers-color-scheme: dark)").matches)).toBe(true);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.emulateMedia({ colorScheme: "light" });
  await expect.poll(() => page.evaluate(() => matchMedia("(prefers-color-scheme: dark)").matches)).toBe(false);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.getByTestId("theme-select").selectOption("dark");

  await page.getByTestId("open-command-palette").click();
  await page.getByRole("combobox", { name: "搜索页面" }).fill("sites");
  await page.getByRole("combobox", { name: "搜索页面" }).press("Enter");
  await expect(page.getByTestId("add-site")).toBeVisible();
  await page.getByTestId("add-site").click();
  const dialog = page.getByTestId("site-dialog");
  await dialog.getByLabel("名称", { exact: true }).fill("Visual check-in");
  await dialog.getByLabel("网址", { exact: true }).fill(url);
  await dialog
    .locator("details")
    .getByText("高级设置", { exact: true })
    .click();
  await expect(page.getByTestId("task-timeout")).toHaveValue("45");
  await page.getByTestId("task-tab-plan").click();
  await page.getByTestId("task-plan-mode").selectOption("custom");
  await page.getByTestId("site-frequency").selectOption("weekly");
  await page.getByTestId("site-schedule-time").fill("23:59");
  await page.getByTestId("site-schedule-day").selectOption("5");
  await expect(page.locator(".schedule-preview code")).toHaveText(
    "59 23 * * 5",
  );
  await page.getByTestId("task-tab-actions").click();
  await page.getByTestId("add-flow-step").click();
  let step = page.getByTestId("flow-step").nth(0);
  await step.getByLabel("操作", { exact: true }).selectOption("fill");
  await step.getByLabel("定位方式").selectOption("label");
  await step.getByLabel("元素或文字").fill("Account");
  await step.getByLabel("填写内容").fill("alice");
  await page.getByTestId("add-flow-step").click();
  await page
    .getByTestId("flow-step")
    .nth(1)
    .getByLabel("元素或文字")
    .fill("Check in");
  await page.getByTestId("add-flow-step").click();
  step = page.getByTestId("flow-step").nth(2);
  await step.getByLabel("操作", { exact: true }).selectOption("assertText");
  await step.getByLabel("元素或文字").fill("Completed");
  await page.getByTestId("flow-message").fill("Check-in completed");
  await page.getByTestId("task-tab-trial").click();
  await expect(page.getByTestId("visit-check")).toHaveCount(0);
  await expect(dialog).toContainText("跳过试运行");
  await page.getByTestId("test-task").click();
  await expect(page.getByTestId("result-panel")).toContainText("执行成功", {
    timeout: 20000,
  });
  await expect(dialog).toBeVisible();
  await page.getByTestId("save-task").click();
  await expect(dialog).toHaveCount(0);
  const visual = await page.evaluate(async () =>
    (await window.siteRunner.sites.list()).find(
      (site) => site.name === "Visual check-in",
    ),
  );
  expect(visual.schedule).toEqual({
    enabled: true,
    cron: "59 23 * * 5",
    mode: "custom",
  });
  const row = page.getByTestId(`site-row-${visual.id}`);
  await row.getByRole("button", { name: "编辑", exact: true }).click();
  await page.getByTestId("task-tab-actions").click();
  await expect(page.getByTestId("flow-step")).toHaveCount(3);
  await expect(page.getByTestId("flow-message")).toHaveValue(
    "Check-in completed",
  );
  await page.screenshot({ path: path.join(root, "workflow-dark.png") });
  await dialog.getByRole("button", { name: "取消", exact: true }).click();
  await row.getByRole("button", { name: "运行", exact: true }).click();
  await expect
    .poll(
      () =>
        page.evaluate(
          async () =>
            (await window.siteRunner.runs.list()).find(
              (run) => run.siteName === "Visual check-in",
            )?.message,
        ),
      { timeout: 20000 },
    )
    .toBe("Check-in completed");
  await expect(page.getByTestId("active-tasks")).toHaveCount(0);
  await expect(page.getByTestId("run-detail-dialog")).toContainText(
    "执行成功",
  );
  await page
    .getByTestId("run-detail-dialog")
    .locator(".modal-actions .primary")
    .click();
  await page
    .getByTestId(`site-row-${original.id}`)
    .getByRole("button", { name: "编辑", exact: true })
    .click();
  await page.getByTestId("task-tab-actions").click();
  await expect(
    dialog.getByRole("tab", { name: "TypeScript 代码" }),
  ).toHaveAttribute("aria-selected", "true");
  await page.getByTestId("task-tab-plan").click();
  await page.getByTestId("task-plan-mode").selectOption("custom");
  await expect(page.getByTestId("site-frequency")).toHaveValue("custom");
  await expect(page.getByTestId("site-cron")).toHaveValue("0 9,17 * * 1,3,5");
  await page.getByTestId("task-tab-actions").click();
  await dialog.getByRole("tab", { name: "可视化流程" }).click();
  await expect(
    page.getByRole("dialog", { name: "替换现有脚本？" }),
  ).toBeVisible();
  await page
    .getByRole("dialog", { name: "替换现有脚本？" })
    .getByRole("button", { name: "取消", exact: true })
    .click();
  await dialog.getByRole("button", { name: "取消", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "放弃未保存的修改？" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "放弃修改", exact: true }).click();
  expect(
    await page.evaluate(
      async (id) =>
        (await window.siteRunner.sites.list()).find((site) => site.id === id)
          ?.script,
      original.id,
    ),
  ).toBe(original.script);

  const templateCount = await page.evaluate(
    async () => (await window.siteRunner.templates.list()).length,
  );
  await page.getByTestId("add-site").click();
  await page.getByTestId("task-name").fill("Recorded visit");
  await page.getByTestId("task-url").fill(url);
  await page.getByTestId("task-tab-actions").click();
  await page.getByTestId("task-record").click();
  await page.getByTestId("start-recording").click();
  await expect(page.getByTestId("finish-recording")).toBeEnabled({
    timeout: 40000,
  });
  await expect(page.getByTestId("save-task")).toBeDisabled();
  await page.getByTestId("finish-recording").click();
  await expect(dialog).toContainText("录制内容已应用到此任务", {
    timeout: 20000,
  });
  await page.getByTestId("save-task").click();
  await expect(dialog).toHaveCount(0);
  expect(
    await page.evaluate(
      async () => (await window.siteRunner.templates.list()).length,
    ),
  ).toBe(templateCount);
  const recorded = await page.evaluate(async () =>
    (await window.siteRunner.sites.list()).find(
      (site) => site.name === "Recorded visit",
    ),
  );
  expect(recorded.script).toContain(url);
  const recordedRow = page.getByTestId(`site-row-${recorded.id}`);
  await recordedRow.getByRole("button", { name: "运行", exact: true }).click();
  await expect(page.getByTestId("run-detail-dialog")).toContainText(
    "执行成功",
    { timeout: 20000 },
  );
  await page
    .getByTestId("run-detail-dialog")
    .locator(".modal-actions .primary")
    .click();
  await page.screenshot({ path: path.join(root, "tasks-dark.png") });

  await page.getByTestId("add-folder").click();
  await page.getByTestId("folder-name").fill("Weekly group");
  await page.getByTestId("folder-schedule").check();
  await page.getByTestId("folder-frequency").selectOption("weekdays");
  await page.getByTestId("folder-schedule-time").fill("23:58");
  await page.getByTestId("save-folder").click();
  expect(
    await page.evaluate(
      async () =>
        (await window.siteRunner.folders.list()).find(
          (folder) => folder.name === "Weekly group",
        )?.schedule.cron,
    ),
  ).toBe("58 23 * * 1-5");

  await page.getByTestId("nav-settings").click();
  await page.getByTestId("nav-notifications").click();
  await page.getByRole("button", { name: "添加渠道", exact: true }).click();
  const channel = page.getByTestId("channel-dialog");
  await channel.getByLabel("名称", { exact: true }).fill("Local webhook");
  await channel.getByLabel("Provider").selectOption("webhook");
  await channel.getByLabel("Webhook URL").fill(`${url}/notify`);
  await page.getByTestId("add-header").click();
  await channel.getByLabel("请求头名称").fill("X-Workspace-Fixture");
  await channel.getByLabel("值", { exact: true }).fill("preserved");
  await page.getByTestId("save-channel").click();
  const webhook = await page.evaluate(async () =>
    (await window.siteRunner.notifications.list()).find(
      (item) => item.name === "Local webhook",
    ),
  );
  expect(webhook.config.headers).toEqual({
    "X-Workspace-Fixture": "preserved",
  });
  await page.getByTestId(`test-channel-${webhook.id}`).click();
  await expect.poll(() => deliveries.length).toBe(1);
  expect(deliveries[0].headers["x-workspace-fixture"]).toBe("preserved");

  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setSize(1040, 720),
  );
  for (const language of ["zh-CN", "en"]) {
    await page.getByTestId("nav-settings").click();
    await page.getByTestId("language-select").selectOption(language);
    for (const section of [
      "sites",
      "templates",
      "profiles",
      "history",
      "notifications",
      "settings",
    ]) {
      if (["templates", "profiles", "notifications"].includes(section))
        await page.getByTestId("nav-settings").click();
      await page.getByTestId(`nav-${section}`).click();
      expect(
        await page
          .locator("main")
          .evaluate((node) => node.scrollWidth <= node.clientWidth + 1),
      ).toBe(true);
      await page.screenshot({
        path: path.join(root, `${section}-${language}.png`),
      });
    }
  }
  await page.getByTestId("language-select").selectOption("zh-CN");
  await app.close();
  app = undefined;
  page = await launch();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("html")).toHaveAttribute("data-density", "compact");
  await page.getByTestId("nav-settings").click();
  await expect(page.getByTestId("default-timeout")).toHaveValue("45000");
  expect(errors).toEqual([]);
  console.log(
    JSON.stringify({
      appearance: "passed",
      settingsSearch: "passed",
      scheduleForms: "passed",
      workflow: "passed",
      taskRecording: "passed",
      legacyChecksIgnored: "passed",
      optionalTrial: "passed",
      executionResults: "passed",
      customScriptPreserved: "passed",
      headerDelivery: "passed",
      bilingualLayout: "passed",
      restartPersistence: "passed",
      rendererErrors: errors,
      fixture: root,
    }),
  );
} finally {
  console.log(`WORKSPACE_FIXTURE ${root}`);
  if (app) await app.close();
  await new Promise((resolve) => server.close(resolve));
}
