// Fresh 2.0 setup, default profile creation and persistence, using local data only.
import { _electron, expect } from "playwright/test";
import electronPath from "electron";
import { fileURLToPath } from "node:url";
import { mkdtempSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";

const root = mkdtempSync(path.join(os.tmpdir(), "site-runner-first-run-"));
const executablePath = process.env.SITE_RUNNER_TEST_EXECUTABLE ?? electronPath;
const args = process.env.SITE_RUNNER_TEST_EXECUTABLE
  ? []
  : [fileURLToPath(new URL("../..", import.meta.url))];
const server = http.createServer((_req, res) => res.end("<h1>Local page</h1>"));
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const url = `http://127.0.0.1:${server.address().port}`;
const version = JSON.parse(
  readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
).version;
const errors = [];
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
  await expect(page.locator(".task-empty")).toBeVisible();
  return page;
}
try {
  let page = await launch();
  expect(
    (await page.evaluate(() => window.siteRunner.app.info())).version,
  ).toBe(version);
  // Also cover a user who removed the default profile before creating a task.
  const defaults = await page.evaluate(() => window.siteRunner.profiles.list());
  expect(defaults).toHaveLength(1);
  await page.evaluate(
    (id) => window.siteRunner.profiles.remove(id),
    defaults[0].id,
  );
  await page.reload();
  await expect(page.locator(".task-empty")).toBeVisible();
  expect(await page.evaluate(() => window.siteRunner.profiles.list())).toEqual(
    [],
  );
  await page.getByTestId("add-site").click();
  await expect(page.getByTestId("site-dialog")).toBeVisible();
  await page.getByTestId("task-name").fill("First local task");
  await page.getByTestId("task-url").fill(url);
  await page.getByTestId("task-tab-plan").click();
  await page.getByTestId("task-plan-mode").selectOption("manual");
  await page.getByTestId("save-task").click();
  await expect(page.getByTestId("site-dialog")).toHaveCount(0);
  const profiles = await page.evaluate(() => window.siteRunner.profiles.list());
  const [task] = await page.evaluate(() => window.siteRunner.sites.list());
  expect(profiles.length).toBe(1);
  expect(task.browserProfileId).toBe(profiles[0].id);
  expect(task.script).toBeNull();
  expect(task.schedule.mode).toBe("manual");
  const row = page.getByTestId(`site-row-${task.id}`);
  await row.locator("summary").click();
  await row.getByRole("button", { name: /Disable|停用/ }).click();
  await expect(row).toHaveClass(/task-disabled/);
  await expect(page.getByTestId("run-tasks")).toBeDisabled();
  await app.close();
  app = await _electron.launch({
    executablePath,
    args,
    env: { ...process.env, SITE_RUNNER_USER_DATA: root },
    timeout: 20000,
  });
  page = await app.firstWindow();
  page.on("pageerror", (error) => errors.push(error.message));
  await expect(page.getByTestId(`site-row-${task.id}`)).toHaveClass(
    /task-disabled/,
  );
  expect(
    (await page.evaluate(() => window.siteRunner.sites.list()))[0].url,
  ).toBe(url);
  await page
    .getByTestId(`site-row-${task.id}`)
    .locator(".task-name-button")
    .click();
  await expect(page.getByTestId("task-name")).toHaveValue("First local task");
  await page.getByTestId("task-name").fill("Draft to discard");
  await page.getByTestId("task-name").press("Escape");
  await expect(page.locator(".confirm-modal")).toBeVisible();
  await page
    .locator(".confirm-modal")
    .locator(".primary, .danger-button")
    .click();
  expect(
    (await page.evaluate(() => window.siteRunner.sites.list()))[0].name,
  ).toBe("First local task");
  expect(errors).toEqual([]);
  console.log(
    JSON.stringify({
      firstRun: "passed",
      automaticProfile: "passed",
      saveWithoutTrial: "passed",
      togglePersistence: "passed",
      discardDraft: "passed",
      version,
      fixture: root,
      rendererErrors: errors,
    }),
  );
} finally {
  if (app) await app.close();
  await new Promise((resolve) => server.close(resolve));
}
