// Packaged-app regression. Uses temporary data and a local notification endpoint only.
import { _electron, expect } from "playwright/test";
import electronPath from "electron";
import { fileURLToPath } from "node:url";
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
const root = mkdtempSync(path.join(os.tmpdir(), "site-runner-notifications-"));
const requests = [],
  errors = [];
let failWebhook = true;
const server = http.createServer((req, res) => {
  let body = "";
  req.on("data", (chunk) => {
    body += chunk;
  });
  req.on("end", () =>
    requests.push({
      url: req.url,
      headers: req.headers,
      body,
      respond() {
        if (res.writableEnded) return;
        res.writeHead(req.url === "/webhook" && failWebhook ? 503 : 200);
        res.end("{}");
      },
    }),
  );
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const url = `http://127.0.0.1:${server.address().port}`;
const database = new AppDatabase(path.join(root, "site-runner.sqlite3")),
  data = new DataService(database.connection);
data.updateSettings({
  language: "zh-CN",
  notificationEnabled: false,
  notifyScheduledRuns: false,
});
const normal = data.saveChannel({
  name: "Success",
  providerType: "ntfy",
  enabled: true,
  eventPolicy: "normal",
  config: { serverUrl: url, topic: "normal" },
});
const alert = data.saveChannel({
  name: "Failure",
  providerType: "webhook",
  enabled: true,
  eventPolicy: "alert",
  config: { url: `${url}/webhook`, method: "POST", headers: {} },
});
const disabled = data.saveChannel({
  name: "Disabled",
  providerType: "ntfy",
  enabled: false,
  eventPolicy: "all",
  config: { serverUrl: url, topic: "disabled" },
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
  page.on("pageerror", (error) => errors.push(error.message));
  await page.getByTestId("nav-settings").click();
  await page.getByTestId("nav-notifications").click();
  await expect(page.getByTestId("notification-global-warning")).toBeVisible();
  await expect(page.getByTestId("notification-normal-route")).toContainText(
    "全部成功时匹配的渠道：1",
  );
  await expect(page.getByTestId("notification-normal-route")).toContainText(
    "Success",
  );
  await expect(page.getByTestId("notification-alert-route")).toContainText(
    "存在失败时匹配的渠道：1",
  );
  await expect(page.getByTestId("notification-alert-route")).toContainText(
    "Failure",
  );
  await expect(page.getByTestId("notification-setup")).toContainText(
    "手动运行单个站点不会发送批量汇总",
  );
  const normalButton = page.getByTestId(`test-channel-${normal.id}`);
  await normalButton.click();
  await expect(normalButton).toBeDisabled();
  await expect(normalButton).toHaveText("正在测试…");
  await expect.poll(() => requests.length).toBe(1);
  await page.evaluate((id) => {
    window.pendingTests = Promise.allSettled([
      window.siteRunner.notifications.test(id),
      window.siteRunner.notifications.test(id),
    ]);
  }, normal.id);
  await page.getByTestId("nav-sites").click();
  await page.getByTestId("nav-settings").click();
  await page.getByTestId("nav-notifications").click();
  await normalButton.click();
  await expect(normalButton).toBeDisabled();
  expect(requests).toHaveLength(1);
  expect(requests[0].headers.title).toBe("Site Runner test");
  expect(requests[0].headers.tags).toBeUndefined();
  requests[0].respond();
  await expect(normalButton).toBeEnabled();
  await expect(page.locator(".receipt-row")).toHaveCount(1);
  await expect(page.locator(".success-callout")).toContainText(
    "测试通知已发送",
  );

  const alertButton = page.getByTestId(`test-channel-${alert.id}`);
  await alertButton.click();
  await expect(alertButton).toBeDisabled();
  await expect.poll(() => requests.length).toBe(2);
  requests[1].respond();
  await expect(alertButton).toBeEnabled();
  await expect(page.locator(".receipt-row")).toHaveCount(2);
  await expect(page.locator(".receipt-row")).toContainText([
    "Webhook returned HTTP 503",
    "Site Runner test",
  ]);
  failWebhook = false;
  await alertButton.click();
  await expect.poll(() => requests.length).toBe(3);
  requests[2].respond();
  await expect(alertButton).toBeEnabled();
  await expect(page.locator(".receipt-row")).toHaveCount(3);
  const disabledButton = page.getByTestId(`test-channel-${disabled.id}`);
  await disabledButton.click();
  await expect.poll(() => requests.length).toBe(4);
  requests[3].respond();
  await expect(disabledButton).toBeEnabled();
  await expect(page.locator(".receipt-row")).toHaveCount(4);

  await page.evaluate(async (id) => {
    const channels = await window.siteRunner.notifications.list();
    const channel = channels.find((item) => item.id === id);
    await window.siteRunner.notifications.save({ ...channel, enabled: false });
  }, normal.id);
  await page.getByTestId("refresh-notifications").click();
  await expect(page.getByTestId("notification-normal-route")).toContainText(
    "没有启用的渠道接收普通事件",
  );
  await page.getByTestId("nav-settings").click();
  await expect(page.getByTestId("language-select")).toBeVisible();
  await page.evaluate(() =>
    window.siteRunner.settings.update({
      notificationEnabled: true,
      notifyScheduledRuns: true,
    }),
  );
  await page.getByTestId("language-select").selectOption("en");
  await page.getByTestId("nav-settings").click();
  await page.getByTestId("nav-notifications").click();
  await expect(page.getByTestId("notification-global-warning")).toHaveCount(0);
  await expect(page.getByTestId("notification-global-state")).toContainText(
    "Enabled",
  );
  await expect(page.getByTestId("notification-schedule-state")).toContainText(
    "Enabled",
  );
  await expect(page.getByTestId("notification-normal-route")).toContainText(
    "No enabled channel accepts normal events",
  );
  await expect(page.getByTestId("notification-alert-route")).toContainText(
    "Channels for batches with failures: 1",
  );
  await page.getByRole("button", { name: "Edit", exact: true }).first().click();
  await expect(page.getByTestId("channel-dialog")).toBeVisible();
  await page.getByTestId("save-channel").click();
  await expect(page.getByTestId("channel-dialog")).toHaveCount(0);
  await expect(page.getByTestId("notification-alert-route")).toContainText(
    "Channels for batches with failures: 1",
  );
  await app.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0];
    window.setSize(window.getMinimumSize()[0], 800);
  });
  const overflow = await page
    .getByTestId("notification-setup")
    .evaluate((node) => node.scrollWidth > node.clientWidth + 1);
  expect(overflow).toBe(false);
  await page.screenshot({
    path: path.join(root, "notifications.png"),
    fullPage: true,
  });
  expect(errors).toEqual([]);
  const receipts = await page.evaluate(() =>
    window.siteRunner.notifications.receipts(),
  );
  expect(receipts).toHaveLength(4);
  expect(receipts.filter((item) => !item.success)).toHaveLength(1);
  console.log(
    JSON.stringify({
      configuration: "passed",
      concurrentTests: "passed",
      directDisabledChannelTest: "passed",
      failureRetry: "passed",
      receiptRefresh: "passed",
      settingsNavigation: "passed",
      bilingual: "passed",
      compactLayout: "passed",
      rendererErrors: errors,
      fixture: root,
    }),
  );
} finally {
  for (const request of requests) {
    try {
      request.respond();
    } catch {
      /* Already completed response. */
    }
  }
  if (app) await app.close();
  await new Promise((resolve) => server.close(resolve));
}
