// Verify Electron system-theme notifications in an isolated app, without changing macOS preferences.
import { _electron, expect } from "playwright/test";
import electronPath from "electron";
import { fileURLToPath } from "node:url";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
const root = mkdtempSync(path.join(os.tmpdir(), "site-runner-system-theme-"));
const output = fileURLToPath(
  new URL("../../.runtime/system-theme/", import.meta.url),
);
mkdirSync(output, { recursive: true });
const executablePath = process.env.SITE_RUNNER_TEST_EXECUTABLE ?? electronPath;
const args = process.env.SITE_RUNNER_TEST_EXECUTABLE
  ? []
  : [fileURLToPath(new URL("../..", import.meta.url))];
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
  // Observe native theme changes without a browser media override.
  await page.emulateMedia({ colorScheme: null });
  await page.bringToFront();
  page.on("pageerror", (error) => errors.push(error.message));
  await page.getByTestId("nav-settings").click();
  return page;
}
try {
  let page = await launch();
  const info = await page.evaluate(() => window.siteRunner.app.info());
  await expect(page.getByTestId("theme-select")).toHaveValue("system");
  const systemTheme = async (theme) =>
    app.evaluate(({ nativeTheme }, value) => {
      nativeTheme.themeSource = value;
    }, theme);
  await systemTheme("dark");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.screenshot({
    path: path.join(output, "system-dark.png"),
    animations: "disabled",
    scale: "css",
  });
  await systemTheme("light");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.screenshot({
    path: path.join(output, "system-light.png"),
    animations: "disabled",
    scale: "css",
  });
  await page.getByTestId("theme-select").selectOption("dark");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await systemTheme("dark");
  await systemTheme("light");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByTestId("theme-select").selectOption("system");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect
    .poll(() =>
      page.evaluate(async () => (await window.siteRunner.settings.get()).theme),
    )
    .toBe("system");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await systemTheme("dark");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await app.close();
  app = undefined;
  page = await launch();
  await expect(page.getByTestId("theme-select")).toHaveValue("system");
  await systemTheme("light");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await systemTheme("dark");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(errors).toEqual([]);
  const report = {
    version: info.version,
    defaultSystemTheme: "passed",
    electronThemeChanges: "passed",
    manualOverride: "passed",
    rendererReload: "passed",
    applicationRestart: "passed",
    rendererErrors: errors,
    isolatedUserData: root,
    systemPreferencesModified: false,
  };
  writeFileSync(
    path.join(output, "verification.json"),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report));
} finally {
  if (app) await app.close();
}
