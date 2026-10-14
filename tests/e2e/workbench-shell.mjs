// Isolated workbench interaction checks. All screenshots and records are synthetic.
import { _electron, expect } from "playwright/test";
import electronPath from "electron";
import { fileURLToPath } from "node:url";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { AppDatabase } from "../../dist/main/main/database/database.js";
import { DataService } from "../../dist/main/main/services/data-service.js";
import { compileFlow } from "../../dist/main/shared/automation-flow.js";

const root = mkdtempSync(
  path.join(os.tmpdir(), "site-runner-workbench-shell-"),
);
const output = fileURLToPath(
  new URL("../../.runtime/workbench-preview/", import.meta.url),
);
mkdirSync(output, { recursive: true });
const server = http.createServer((_req, res) => {
  res.setHeader("Content-Type", "text/html");
  res.end("<button>Check in</button><p>Done</p>");
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const url = `http://127.0.0.1:${server.address().port}`;
const database = new AppDatabase(path.join(root, "site-runner.sqlite3"));
const data = new DataService(database.connection);
const profile = data.createProfile("个人账号");
data.createProfile("工作账号");
data.updateSettings({
  language: "zh-CN",
  theme: "dark",
  browserHeadless: true,
});
const daily = data.saveFolder({
  name: "每日签到",
  schedule: { enabled: true, cron: "59 23 * * *" },
});
const work = data.saveFolder({ name: "工作巡检" });
const names = [
  "开发者社区签到",
  "论坛每日奖励",
  "账号状态检查",
  "项目门户巡检",
  "文档入口检查",
  "测试中的任务",
];
const tasks = names.map((name, index) =>
  data.saveSite({
    name,
    url: index === 0 ? url : `https://example.com/task/${index + 1}`,
    browserProfileId: profile.id,
    timeoutMs: 10000,
    enabled: index !== 5,
    script:
      index === 0
        ? 'export default async function run({ page, log }) { log.info("开始检查网页"); await page.waitForTimeout(1800); log.info("页面检查完成"); return "检查已完成"; }'
        : compileFlow({
            version: 1,
            message: "今日操作已完成",
            steps: [
              {
                action: "click",
                locator: "button",
                target: "Check in",
                value: "",
              },
              {
                action: "assertText",
                locator: "text",
                target: "Done",
                value: "",
              },
            ],
          }),
    folderId: index < 3 ? daily.id : index < 5 ? work.id : null,
    schedule: {
      enabled: false,
      cron: "0 9 * * *",
      mode: index < 3 ? "inherit" : "manual",
    },
  }),
);
for (const [index, task] of tasks.entries()) {
  if (index === 2 || index === 5) continue;
  const timestamp = new Date(Date.now() - (index + 1) * 60000).toISOString();
  data.saveRun({
    id: `sample-${index}`,
    siteId: task.id,
    siteName: task.name,
    startedAt: timestamp,
    finishedAt: timestamp,
    status: index === 1 ? "failed" : "success",
    message: index === 1 ? null : "测试样例：检查已完成",
    error: index === 1 ? "Timeout: sample locator did not appear" : null,
    lastUrl: task.url,
    screenshotPath: null,
    trigger: index < 2 ? "schedule" : "manual",
  });
}
database.close();
let app;
const errors = [];
try {
  app = await _electron.launch({
    executablePath: process.env.SITE_RUNNER_TEST_EXECUTABLE ?? electronPath,
    args: process.env.SITE_RUNNER_TEST_EXECUTABLE
      ? []
      : [fileURLToPath(new URL("../..", import.meta.url))],
    env: { ...process.env, SITE_RUNNER_USER_DATA: root },
    timeout: 20000,
  });
  const page = await app.firstWindow();
  page.on("pageerror", (error) => errors.push(error.message));
  await expect(page.getByTestId("site-row-" + tasks[0].id)).toBeVisible();
  await page.screenshot({ path: path.join(output, "tasks-dark.png") });

  // View state survives navigation. A hidden selection never expands execution scope.
  await page.getByTestId(`folder-${daily.id}`).click();
  await page.getByTestId("site-search").fill("开发者");
  await page
    .getByTestId(`site-row-${tasks[0].id}`)
    .locator("input[type=checkbox]")
    .check();
  await page.getByTestId("nav-history").click();
  await page.getByTestId("nav-sites").click();
  await expect(page.getByTestId("site-search")).toHaveValue("开发者");
  await expect(
    page.getByTestId(`site-row-${tasks[0].id}`).locator("input[type=checkbox]"),
  ).toBeChecked();
  await expect(page.getByTestId("run-tasks")).toContainText("1");
  await page.getByTestId("site-search").fill("");
  await expect(
    page.getByTestId(`site-row-${tasks[0].id}`).locator("input[type=checkbox]"),
  ).not.toBeChecked();
  await page.getByTestId("folder-all").click();

  // Command search opens an existing task, with keyboard step navigation and draft protection.
  await page.getByTestId("open-command-palette").click();
  await page.locator(".command-palette").getByRole("combobox").fill("项目门户");
  await page.locator(".command-palette").getByRole("combobox").press("Enter");
  const dialog = page.getByTestId("site-dialog");
  await expect(dialog.getByTestId("task-name")).toHaveValue("项目门户巡检");
  const workspaceBounds = await page.locator(".workspace-main").boundingBox();
  const editorBounds = await dialog.boundingBox();
  expect(Math.abs(editorBounds.x - workspaceBounds.x)).toBeLessThan(2);
  expect(Math.abs(editorBounds.width - workspaceBounds.width)).toBeLessThan(2);
  await page.getByTestId("task-tab-actions").click();
  await expect(page.getByTestId("flow-step")).toHaveCount(2);
  await page.screenshot({ path: path.join(output, "editor-dark.png") });
  await page.getByTestId("task-tab-actions").press("ArrowDown");
  await expect(page.getByTestId("task-tab-trial")).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await page.getByTestId("task-tab-website").click();
  await page.getByTestId("task-name").fill("未保存的草稿");
  await expect(dialog.locator(".unsaved-mark")).toBeVisible();
  await dialog.getByRole("button", { name: "取消", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "放弃未保存的修改？" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "放弃修改", exact: true }).click();

  // The sidebar switches one main view; no page tab strip or hidden active view.
  for (const section of [
    "history",
    "sites",
    "settings",
    "templates",
    "profiles",
    "notifications",
    "data",
    "automation",
    "sites",
  ]) {
    await page.getByTestId(`nav-${section}`).click();
    await expect(page.locator(".workspace-tabs")).toHaveCount(0);
    await expect(page.locator("main > .workspace-page:visible")).toHaveCount(1);
    await expect(
      page.locator("main > .workspace-page:visible"),
    ).toHaveAttribute("data-page", section);
  }

  // System guide uses actual paths, stable IDs, editable time and both OS examples.
  await expect(page.locator(".activity-bar")).toHaveCount(0);
  await expect(page.locator(".explorer-workspace")).toHaveCount(0);
  await expect(page.locator(".feature-nav > button")).toHaveCount(8);
  await page.getByTestId("nav-automation").click();
  await expect(page.getByTestId("automation-data")).toHaveValue(root);
  const info = await page.evaluate(() => window.siteRunner.app.info());
  await expect(page.getByTestId("automation-executable")).toHaveValue(
    info.executablePath,
  );
  await page.getByTestId("automation-time").fill("18:25");
  await page.getByTestId("automation-scope").selectOption("folder");
  await expect(page.locator(".guide-code")).toHaveCount(0);
  await page.getByTestId("automation-target").selectOption(daily.id);
  await expect(page.getByTestId("automation-guide")).toContainText(
    "--run-folder",
  );
  await expect(page.getByTestId("automation-guide")).toContainText(daily.id);
  await expect(page.getByTestId("automation-guide")).toContainText(
    "<key>Hour</key><integer>18</integer>",
  );
  await page.getByRole("tab", { name: "Windows", exact: true }).click();
  await expect(page.getByTestId("automation-guide")).toContainText(
    "Register-ScheduledTask",
  );
  await expect(page.getByTestId("automation-guide")).toContainText(
    "-At '18:25'",
  );
  await page.getByRole("tab", { name: "macOS", exact: true }).click();
  await expect(page.getByTestId("automation-data")).toHaveValue(root);
  await page.screenshot({ path: path.join(output, "automation-dark.png") });

  // Leaving a live template recording would lose its controls; finish/cancel first.
  await page.getByTestId("nav-templates").click();
  await page.getByTestId("recording-url").fill(url);
  await page.getByTestId("start-recording").click();
  await expect(page.getByTestId("finish-recording")).toBeEnabled({
    timeout: 40000,
  });
  await page.getByTestId("nav-sites").click();
  await expect(page.locator("main > .workspace-page:visible")).toHaveAttribute(
    "data-page",
    "templates",
  );
  await expect(page.getByRole("alert")).toContainText("请先完成或放弃录制");
  await page.getByTestId("cancel-recording").click();
  await expect(page.getByTestId("start-recording")).toBeEnabled();
  await page.getByTestId("nav-sites").click();
  await expect(page.locator("main > .workspace-page:visible")).toHaveAttribute(
    "data-page",
    "sites",
  );

  // Output remains accessible while a real local run is in progress on another page.
  const execution = page.evaluate(
    (id) => window.siteRunner.runs.runSite(id),
    tasks[0].id,
  );
  await expect(page.getByTestId("active-tasks")).toBeVisible();
  await page.getByTestId("nav-history").click();
  await expect(page.getByTestId("active-tasks")).toBeVisible();
  const result = await execution;
  expect(result.status).toBe("success");
  await expect(page.getByTestId("output-lines")).toContainText("页面检查完成");
  await page.getByTestId("log-site-filter").selectOption(tasks[0].id);
  await expect(page.getByTestId("output-lines")).toContainText(
    "开发者社区签到",
  );
  await page.getByTestId("nav-sites").click();
  await page.screenshot({ path: path.join(output, "tasks-output-dark.png") });

  // Layout controls and shortcuts restore their preferences after a renderer reload.
  await page.getByTestId("toggle-sidebar").click();
  await expect(page.locator(".app-shell")).toHaveClass(/sidebar-hidden/);
  await expect(page.getByTestId("nav-automation")).toBeVisible();
  await page.reload();
  await expect(page.locator(".app-shell")).toHaveClass(/sidebar-hidden/);
  await expect(page.getByTestId("nav-automation")).toBeVisible();
  await page.getByTestId("toggle-sidebar").click();
  await expect(page.locator(".app-shell")).not.toHaveClass(/sidebar-hidden/);
  await page.getByTestId("toggle-output").click();
  await page.getByTestId("nav-settings").click();
  await page.getByTestId("theme-select").selectOption("light");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.screenshot({ path: path.join(output, "settings-light.png") });
  await page.getByTestId("nav-sites").click();
  await page.screenshot({ path: path.join(output, "tasks-light.png") });
  await page.getByTestId("open-command-palette").click();
  await page.screenshot({ path: path.join(output, "command-light.png") });
  await page.locator(".command-palette").getByRole("combobox").fill("创建任务");
  await page.locator(".command-palette").getByRole("combobox").press("Enter");
  await expect(page.getByTestId("site-dialog")).toBeVisible();
  await page
    .getByTestId("site-dialog")
    .getByRole("button", { name: "取消", exact: true })
    .click();

  // Keep the supported minimum window size usable in both languages.
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setSize(1040, 680),
  );
  for (const language of ["en", "zh-CN"]) {
    await page.getByTestId("nav-settings").click();
    await page.getByTestId("language-select").selectOption(language);
    for (const section of [
      "sites",
      "history",
      "settings",
      "templates",
      "profiles",
      "notifications",
      "data",
      "automation",
    ]) {
      await page.getByTestId(`nav-${section}`).click();
      expect(
        await page
          .locator("main")
          .evaluate((node) => node.scrollWidth <= node.clientWidth + 1),
      ).toBe(true);
      expect(
        await page
          .locator(".app-shell")
          .evaluate((node) => node.scrollWidth <= node.clientWidth + 1),
      ).toBe(true);
      await page.screenshot({
        path: path.join(output, `${section}-${language}-1040.png`),
      });
    }
    await page.getByTestId("nav-sites").click();
    await page
      .getByTestId(`site-row-${tasks[3].id}`)
      .locator(".task-name-button")
      .click();
    await page.getByTestId("task-tab-actions").click();
    expect(
      await page
        .getByTestId("site-dialog")
        .evaluate((node) => node.scrollWidth <= node.clientWidth + 1),
    ).toBe(true);
    const smallWorkspace = await page.locator(".workspace-main").boundingBox();
    const smallEditor = await page.getByTestId("site-dialog").boundingBox();
    expect(Math.abs(smallEditor.width - smallWorkspace.width)).toBeLessThan(2);
    await page.screenshot({
      path: path.join(output, `editor-${language}-1040.png`),
    });
    await page
      .getByTestId("site-dialog")
      .getByRole("button", {
        name: language === "en" ? "Cancel" : "取消",
        exact: true,
      })
      .click();
  }
  expect(errors).toEqual([]);
  const report = {
    viewRetention: "passed",
    selectionScope: "passed",
    taskSearch: "passed",
    draftProtection: "passed",
    singleMainView: "passed",
    recordingNavigationGuard: "passed",
    crossPageOutput: "passed",
    layoutPersistence: "passed",
    completeSidebar: "passed",
    systemAutomationGuide: "passed",
    createCommand: "passed",
    minimumWindowBilingual: "passed",
    rendererErrors: errors,
    screenshots: output,
    fixture: root,
  };
  writeFileSync(
    path.join(output, "verification.json"),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report));
} finally {
  if (app) await app.close();
  await new Promise((resolve) => server.close(resolve));
}
