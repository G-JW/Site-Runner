// Real parallel workers, a shared persistent profile, and controlled local HTTP gates.
import { _electron, expect, chromium } from "playwright/test";
import electronPath from "electron";
import { fileURLToPath } from "node:url";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { AppDatabase } from "../../dist/main/main/database/database.js";
import { DataService } from "../../dist/main/main/services/data-service.js";

const version = JSON.parse(
  readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
).version;
const root = mkdtempSync(path.join(os.tmpdir(), "site-runner-parallel-"));
const output = fileURLToPath(
  new URL("../../.runtime/concurrency-preview/", import.meta.url),
);
mkdirSync(output, { recursive: true });
const pending = new Map(),
  entered = [],
  cookies = [],
  errors = [];
let active = 0,
  peak = 0;
const server = http.createServer((req, res) => {
  if (!req.url.startsWith("/job/")) {
    res.end("<h1>Seed</h1>");
    return;
  }
  const name = req.url.slice(5);
  entered.push(name);
  active++;
  peak = Math.max(peak, active);
  cookies.push(req.headers.cookie ?? "");
  pending.set(name, () => {
    active--;
    res.writeHead(name === "B" ? 503 : 200, { "Content-Type": "text/html" });
    res.end(`<h1>${name}</h1>`);
    pending.delete(name);
  });
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const url = `http://127.0.0.1:${server.address().port}`;
const database = new AppDatabase(path.join(root, "site-runner.sqlite3"));
const data = new DataService(database.connection);
const profile = data.createProfile("Shared login");
data.updateSettings({
  language: "zh-CN",
  browserHeadless: true,
  theme: "light",
  maxConcurrency: 3,
});
const sites = ["A", "B", "C", "D", "E", "F"].map((name) =>
  data.saveSite({
    name,
    url: `${url}/job/${name}`,
    enabled: true,
    browserProfileId: profile.id,
    timeoutMs: 30000,
    visitOptions: { stayMs: 0, detectChallenges: false },
    schedule: { enabled: false, cron: "0 9 * * *", mode: "manual" },
    script: `export default async function run({ page }) {
    if ((await page.locator('h1').innerText()) !== '${name}') throw new Error('Wrong task page');
    if ((await page.evaluate(() => localStorage.getItem('session'))) !== 'preserved') throw new Error('Lost localStorage');
    return 'Independent page ${name}';
  }`,
  }),
);
database.close();
const context = await chromium.launchPersistentContext(
  path.join(root, "profiles", profile.id),
  { headless: true },
);
await context.addCookies([
  {
    name: "session",
    value: "preserved",
    url,
    expires: Math.floor(Date.now() / 1000) + 86400,
  },
]);
const seed = await context.newPage();
await seed.goto(url);
await seed.evaluate(() => localStorage.setItem("session", "preserved"));
await context.close();
let app;
const executablePath = process.env.SITE_RUNNER_TEST_EXECUTABLE ?? electronPath;
try {
  app = await _electron.launch({
    executablePath,
    args: process.env.SITE_RUNNER_TEST_EXECUTABLE
      ? []
      : [fileURLToPath(new URL("../..", import.meta.url))],
    env: { ...process.env, SITE_RUNNER_USER_DATA: root },
    timeout: 20000,
  });
  const page = await app.firstWindow();
  expect(
    (await page.evaluate(() => window.siteRunner.app.info())).version,
  ).toBe(version);
  page.on("pageerror", (error) => errors.push(error.message));
  await expect(page.getByTestId(`site-row-${sites[0].id}`)).toBeVisible();
  await page.getByTestId("toggle-output").click();
  const work = page.evaluate(
    (ids) => window.siteRunner.runs.runSites(ids),
    sites.slice(0, 4).map((site) => site.id),
  );
  await expect.poll(() => entered.length, { timeout: 20000 }).toBe(3);
  expect(new Set(entered)).toEqual(new Set(["A", "B", "C"]));
  expect(peak).toBe(3);
  await expect(page.getByTestId("active-batch")).toContainText(
    "3 个任务进行中",
  );
  await page.screenshot({
    path: path.join(output, "parallel-running.png"),
    animations: "disabled",
    scale: "css",
  });
  pending.get("B")();
  await expect.poll(() => entered.length, { timeout: 20000 }).toBe(4);
  expect(entered[3]).toBe("D");
  expect(peak).toBe(3);
  // Out-of-order completion must unlock B, while A remains protected.
  await expect(
    page.getByTestId(`site-row-${sites[1].id}`).locator(".task-name-button"),
  ).toBeEnabled();
  await expect(
    page.getByTestId(`site-row-${sites[0].id}`).locator(".task-name-button"),
  ).toBeDisabled();
  pending.get("D")();
  pending.get("C")();
  pending.get("A")();
  const result = await work;
  expect(result).toMatchObject({
    total: 4,
    success: 3,
    failed: 1,
    stopped: false,
  });
  expect(result.results.map((run) => run.siteId)).toEqual(
    sites.slice(0, 4).map((site) => site.id),
  );
  expect(
    result.results
      .filter((run) => run.status === "success")
      .map((run) => run.message),
  ).toEqual(["Independent page A", "Independent page C", "Independent page D"]);
  expect(cookies.every((cookie) => cookie.includes("session=preserved"))).toBe(
    true,
  );
  await expect(page.getByTestId("active-tasks")).toHaveCount(0);

  // Set 2 through the real settings UI, then stop an actual 6-task batch with 2 pages active.
  await page.getByTestId("nav-settings").click();
  await page.getByTestId("settings-category-execution").click();
  await page.getByTestId("concurrency-select").selectOption("2");
  await expect
    .poll(() =>
      page.evaluate(
        async () => (await window.siteRunner.settings.get()).maxConcurrency,
      ),
    )
    .toBe(2);
  await page.getByTestId("toggle-output").click();
  await page.getByTestId("concurrency-select").scrollIntoViewIfNeeded();
  await page.screenshot({
    path: path.join(output, "concurrency-settings.png"),
    animations: "disabled",
    scale: "css",
  });
  await page.getByTestId("nav-sites").click();
  await page.getByTestId("toggle-output").click();
  entered.length = 0;
  peak = 0;
  const stopped = page.evaluate(
    (ids) => window.siteRunner.runs.runSites(ids),
    sites.map((site) => site.id),
  );
  await expect.poll(() => entered.length, { timeout: 20000 }).toBe(2);
  await page.getByTestId("active-batch").getByRole("button").click();
  const beforeStop = [...entered];
  for (const name of beforeStop) pending.get(name)();
  const stoppedResult = await stopped;
  expect(stoppedResult).toMatchObject({ total: 2, planned: 6, stopped: true });
  expect(entered).toHaveLength(2);
  expect(peak).toBe(2);
  await expect(page.getByTestId("active-tasks")).toHaveCount(0);
  expect(
    await page.evaluate(
      async () => (await window.siteRunner.runs.list()).length,
    ),
  ).toBe(6);
  // Settings survive a renderer restart, and 1 retains the serial option.
  await page.reload();
  await page.getByTestId("nav-settings").click();
  await page.getByTestId("settings-category-execution").click();
  await expect(page.getByTestId("concurrency-select")).toHaveValue("2");
  await page.getByTestId("concurrency-select").selectOption("1");
  await expect
    .poll(() =>
      page.evaluate(
        async () => (await window.siteRunner.settings.get()).maxConcurrency,
      ),
    )
    .toBe(1);
  // A blocked user script stays in its own worker. Terminating it must not close a sibling page.
  await page.getByTestId("concurrency-select").selectOption("2");
  await expect
    .poll(() =>
      page.evaluate(
        async () => (await window.siteRunner.settings.get()).maxConcurrency,
      ),
    )
    .toBe(2);
  const timeoutSites = await page.evaluate(
    async ({ url, profileId }) => {
      const definitions = [
        {
          name: "Blocked worker",
          timeoutMs: 1000,
          script: "export default async function run() { while (true) {} }",
        },
        {
          name: "Survivor",
          timeoutMs: 15000,
          script:
            "export default async function run({page}) { await page.waitForTimeout(7500); return 'Sibling survived'; }",
        },
        {
          name: "Refill",
          timeoutMs: 5000,
          script:
            "export default async function run() { return 'Queue refilled'; }",
        },
      ];
      const tasks = [];
      for (const definition of definitions)
        tasks.push(
          await window.siteRunner.sites.save({
            ...definition,
            url,
            enabled: true,
            browserProfileId: profileId,
            visitOptions: { stayMs: 0, detectChallenges: false },
            schedule: { enabled: false, cron: "0 9 * * *", mode: "manual" },
          }),
        );
      return tasks;
    },
    { url, profileId: profile.id },
  );
  const timedResult = await page.evaluate(
    (ids) => window.siteRunner.runs.runSites(ids),
    timeoutSites.map((site) => site.id),
  );
  expect(timedResult).toMatchObject({ total: 3, success: 2, failed: 1 });
  expect(timedResult.results[0].error).toContain("exceeded 1000ms");
  expect(timedResult.results[1].message).toBe("Sibling survived");
  expect(timedResult.results[2].message).toBe("Queue refilled");
  expect(errors).toEqual([]);
  const report = {
    version,
    sharedProfileParallelism: "passed",
    maxObservedConcurrency: 3,
    configuredLimitEnforced: "passed",
    isolatedPages: "passed",
    cookiesAndLocalStorage: "passed",
    outOfOrderProgress: "passed",
    failureIsolation: "passed",
    stopActiveTasks: "passed",
    settingsPersistence: "passed",
    serialOption: "passed",
    blockedWorkerIsolation: "passed",
    rendererErrors: errors,
    fixture: root,
    screenshots: output,
  };
  writeFileSync(
    path.join(output, "verification.json"),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report));
} finally {
  for (const finish of [...pending.values()]) finish();
  if (app) await app.close();
  await new Promise((resolve) => server.close(resolve));
}
