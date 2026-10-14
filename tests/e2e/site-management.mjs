// Run after building; optionally target a packaged executable; all data and webhook traffic stay in an isolated local fixture.
import { _electron, expect } from "playwright/test";
import electronPath from "electron";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { AppDatabase } from "../../dist/main/main/database/database.js";
import { DataService } from "../../dist/main/main/services/data-service.js";

const executablePath = process.env.SITE_RUNNER_TEST_EXECUTABLE ?? electronPath;
const launchArgs = process.env.SITE_RUNNER_TEST_EXECUTABLE
  ? []
  : [fileURLToPath(new URL("../..", import.meta.url))];
const root = mkdtempSync(path.join(os.tmpdir(), "site-runner-management-"));
const receipts = [],
  rendererErrors = [];
const server = http.createServer((req, res) => {
  if (req.url !== "/notify") {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end("<h1>Local fixture</h1>");
    return;
  }
  let body = "";
  req.on("data", (chunk) => {
    body += chunk;
  });
  req.on("end", () => {
    receipts.push(JSON.parse(body));
    res.writeHead(200);
    res.end("{}");
  });
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const url = `http://127.0.0.1:${server.address().port}`;
const database = new AppDatabase(path.join(root, "site-runner.sqlite3"));
const data = new DataService(database.connection),
  profile = data.createProfile("Fixture");
data.updateSettings({ language: "zh-CN", browserHeadless: true });
const folder = data.saveFolder({ name: "Daily" }),
  other = data.saveFolder({ name: "Other" });
function site(name, folderId, enabled = true) {
  return data.saveSite({
    name,
    folderId,
    enabled,
    url,
    browserProfileId: profile.id,
    timeoutMs: 15000,
    schedule: { enabled: false, cron: "0 9 * * *" },
    script: `export default async function run({ page }) { await page.waitForTimeout(1500); return '${name} done'; }`,
  });
}
const delta = site("Delta", folder.id),
  beta = site("Beta", folder.id),
  alpha = site("Alpha", folder.id);
const disabled = site("Disabled", folder.id, false),
  elsewhere = site("Elsewhere", other.id),
  unfiled = site("Unfiled", null);
function record(item, status, age) {
  const timestamp = new Date(Date.now() - age).toISOString();
  data.saveRun({
    id: randomUUID(),
    siteId: item.id,
    siteName: item.name,
    status,
    startedAt: timestamp,
    finishedAt: timestamp,
    message: null,
    error: status === "failed" ? "Fixture failure" : null,
    lastUrl: url,
    screenshotPath: null,
    trigger: "manual",
  });
}
record(delta, "failed", 120000);
record(beta, "success", 60000);
record(disabled, "failed", 30000);
record(elsewhere, "failed", 10000);
data.saveChannel({
  name: "Local fixture",
  providerType: "webhook",
  enabled: true,
  eventPolicy: "all",
  config: { url: `${url}/notify`, headers: {}, method: "POST" },
});
database.close();
let app;
try {
  app = await _electron.launch({
    executablePath,
    args: launchArgs,
    env: { ...process.env, SITE_RUNNER_USER_DATA: root },
    timeout: 20000,
  });
  const page = await app.firstWindow();
  page.on("pageerror", (error) => rendererErrors.push(error.message));
  await page.getByTestId("nav-sites").click();
  const rows = page.locator(".sites-table .table-row");
  const filter = page.getByTestId("site-status-filter"),
    sort = page.getByTestId("site-sort");
  await expect(rows).toHaveCount(6);
  for (const [value, count] of [
    ["enabled", 5],
    ["disabled", 1],
    ["success", 1],
    ["failed", 3],
    ["notRun", 2],
    ["active", 0],
  ]) {
    await filter.selectOption(value);
    await expect(rows).toHaveCount(count);
  }
  await filter.selectOption("all");
  await sort.selectOption("name");
  await expect(rows.first()).toContainText("Alpha");
  await sort.selectOption("recent");
  await expect(rows.first()).toContainText("Elsewhere");
  await sort.selectOption("default");
  await page.getByTestId(`folder-${folder.id}`).click();
  await filter.selectOption("failed");
  await expect(rows).toHaveCount(2);
  await page.getByTestId("run-scope").selectOption("failed");
  await expect(page.getByTestId("run-tasks")).toHaveText("运行 1 个任务");
  await page.getByTestId("run-tasks").click();
  await expect(page.getByTestId("active-batch")).toContainText("0/1");
  await expect(page.getByTestId("run-tasks")).toBeDisabled();
  await expect(page.getByTestId("active-tasks")).toHaveCount(0, {
    timeout: 20000,
  });
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("Disabled");
  await expect(page.getByTestId("run-tasks")).toBeDisabled();
  await expect.poll(() => receipts.length).toBe(1);
  expect(receipts[0].batch.total).toBe(1);
  const firstRun = await page.evaluate(async () =>
    (await window.siteRunner.runs.list()).filter(
      (run) => run.trigger === "batch",
    ),
  );
  expect(firstRun.map((run) => run.siteId)).toEqual([delta.id]);

  await filter.selectOption("all");
  for (const item of [alpha, beta, disabled])
    await page.getByTestId(`site-row-${item.id}`).getByRole("checkbox").check();
  await page.getByTestId("run-scope").selectOption("selected");
  await expect(page.getByTestId("run-tasks")).toHaveText("运行 2 个任务");
  await page.getByTestId("site-search").fill("Alpha");
  await expect(page.getByTestId("run-tasks")).toBeDisabled(); // Hidden selections cannot run.
  await page.getByTestId("site-search").fill("");
  for (const item of [alpha, beta, disabled])
    await page.getByTestId(`site-row-${item.id}`).getByRole("checkbox").check();
  await page.getByTestId("run-tasks").click();
  await expect(page.getByTestId("active-batch")).toContainText("0/2");
  await filter.selectOption("active");
  await expect(rows).toHaveCount(2);
  await expect(page.getByTestId("run-tasks")).toBeDisabled();
  await expect(page.getByTestId("run-tasks")).toBeDisabled();
  await expect(page.getByTestId("active-tasks")).toHaveCount(0, {
    timeout: 20000,
  });
  await expect(rows).toHaveCount(0);
  await expect.poll(() => receipts.length).toBe(2);
  expect(receipts[1].batch.total).toBe(2);
  const batchRuns = await page.evaluate(async () =>
    (await window.siteRunner.runs.list()).filter(
      (run) => run.trigger === "batch",
    ),
  );
  expect(batchRuns.map((run) => run.siteId).sort()).toEqual(
    [alpha.id, beta.id, delta.id].sort(),
  );
  expect(batchRuns.every((run) => run.status === "success")).toBe(true);

  await filter.selectOption("disabled");
  await expect(page.getByTestId("run-tasks")).toBeDisabled();
  await page.getByTestId("select-all-sites").check();
  await expect(page.getByTestId("run-tasks")).toBeDisabled();
  await filter.selectOption("all");
  await page.getByTestId("folder-ungrouped").click();
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText(unfiled.name);
  await page.getByTestId("folder-all").click();
  await page.getByTestId("run-scope").selectOption("selected");
  for (const item of [alpha, beta])
    await page.getByTestId(`site-row-${item.id}`).getByRole("checkbox").check();
  const beforeStop = await page.evaluate(
    async () => (await window.siteRunner.runs.list()).length,
  );
  await page.getByTestId("run-tasks").click();
  await page
    .getByRole("button", { name: "完成当前任务后停止", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "将在当前任务结束后停止", exact: true }),
  ).toBeDisabled();
  await expect(page.getByTestId("active-tasks")).toHaveCount(0, {
    timeout: 20000,
  });
  await expect(page.getByTestId("batch-summary")).toContainText(
    "已停止后续任务",
  );
  await expect(page.getByTestId("batch-summary")).toContainText("已执行 1/2");
  expect(
    await page.evaluate(
      async () => (await window.siteRunner.runs.list()).length,
    ),
  ).toBe(beforeStop + 1);
  await expect.poll(() => receipts.length).toBe(3);
  expect(receipts[2].body).toContain("Stopped after 1 of 2 tasks");
  await page.getByTestId("nav-settings").click();
  await page.getByTestId("language-select").selectOption("en");
  await page.getByTestId("nav-sites").click();
  await page.getByTestId("run-scope").selectOption("selected");
  await expect(page.getByTestId("run-tasks")).toHaveText("Run 0 tasks");
  await page.getByTestId("run-scope").selectOption("failed");
  await expect(page.getByTestId("run-tasks")).toHaveText("Run 1 tasks");
  await app.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0];
    window.setSize(window.getMinimumSize()[0], 800);
  });
  const minimumWidth = await app.evaluate(
    ({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getMinimumSize()[0],
  );
  await expect
    .poll(() => page.evaluate(() => window.innerWidth))
    .toBe(minimumWidth);
  const overflow = await page
    .locator(".sites-tools, .site-selection")
    .evaluateAll((nodes) =>
      nodes.some((node) => node.scrollWidth > node.clientWidth + 1),
    );
  expect(overflow).toBe(false);
  await page.screenshot({ path: path.join(root, "management.png") });
  expect(rendererErrors).toEqual([]);
  console.log(
    JSON.stringify({
      filters: "passed",
      sorting: "passed",
      selectedRuns: "passed",
      retryScope: "passed",
      disabledSitesExcluded: "passed",
      notifications: receipts.map((receipt) => receipt.batch.total),
      bilingual: "passed",
      compactLayout: "passed",
      stopBatch: "passed",
      rendererErrors,
      fixture: root,
    }),
  );
} finally {
  if (app) await app.close();
  await new Promise((resolve) => server.close(resolve));
}
