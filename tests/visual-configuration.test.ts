import { tmpdir as systemTemporaryDirectory } from "node:os";
import { mkdtempSync } from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";
import { AppDatabase } from "../src/main/database/database.js";
import { DataService } from "../src/main/services/data-service.js";
import {
  parseConfiguration,
  exportConfiguration,
  importConfiguration,
} from "../src/main/configuration.js";
import {
  readSchedule,
  writeSchedule,
  type ScheduleDraft,
} from "../src/shared/schedule.js";
import { buildHeaders } from "../src/shared/headers.js";
import {
  compileFlow,
  readFlow,
  validateFlow,
  type AutomationFlow,
} from "../src/shared/automation-flow.js";
import { runTrustedScript } from "../src/main/automation/script-runner.js";
import { chromium } from "playwright";

it("round trips common local schedules and preserves advanced expressions as custom", () => {
  for (const expression of [
    "0 9 * * *",
    "15 8 * * 1-5",
    "30 20 * * 0",
    "7 * * * *",
    "*/20 * * * *",
  ]) {
    expect(writeSchedule(readSchedule(expression))).toBe(expression);
  }
  for (const custom of ["0 0 1 * *", "0 9,17 * * 1,3,5", "0 0 9 * * *"])
    expect(readSchedule(custom).frequency).toBe("custom");
  const draft: ScheduleDraft = {
    frequency: "weekly",
    time: "23:59",
    day: 6,
    minute: 0,
    interval: 30,
  };
  expect(writeSchedule(draft)).toBe("59 23 * * 6");
  expect(() => writeSchedule({ ...draft, time: "24:00" })).toThrow();
  expect(() =>
    writeSchedule({ ...draft, frequency: "interval", interval: 60 }),
  ).toThrow();
});

it("preserves header values without prototype mutation and rejects silent duplicate overrides", () => {
  const headers = buildHeaders([
    { name: "Authorization", value: "Bearer private-value" },
    { name: "__proto__", value: "literal" },
    { name: "", value: "" },
  ]);
  expect(Object.getPrototypeOf(headers)).toBe(Object.prototype);
  expect(Object.hasOwn(headers, "__proto__")).toBe(true);
  expect(headers.Authorization).toBe("Bearer private-value");
  expect(() =>
    buildHeaders([
      { name: "Content-Type", value: "a" },
      { name: "content-type", value: "b" },
    ]),
  ).toThrow("headers.duplicate");
  expect(() =>
    buildHeaders([{ name: "Authorization", value: "bad\r\nInjected: true" }]),
  ).toThrow("headers.invalid");
  expect(() => buildHeaders([{ name: "", value: "lost" }])).toThrow(
    "headers.invalid",
  );
});

it("restores graphical workflows only when the script still matches, preserving hand edits", () => {
  const flow: AutomationFlow = {
    version: 1,
    steps: [
      {
        action: "click",
        locator: "button",
        target: 'Sign "in"\nnow',
        value: "",
      },
    ],
    message: "Done",
  };
  const script = compileFlow(flow)!;
  expect(readFlow(script)).toEqual(flow);
  expect(readFlow(script.trim())).toEqual(flow);
  expect(
    readFlow(script.replace("await page", "// Custom change\n  await page")),
  ).toBeNull();
  expect(readFlow("export default async function run() {}")).toBeNull();
  expect(readFlow(null)).toEqual({ version: 1, steps: [], message: "" });
  expect(() =>
    validateFlow({ ...flow, steps: [{ ...flow.steps[0], target: "" }] }),
  ).toThrow();
  expect(() =>
    validateFlow({
      ...flow,
      steps: [
        { ...flow.steps[0], action: "navigate", target: "javascript:alert(1)" },
      ],
    }),
  ).toThrow();
});

it("persists appearance without a schema migration and reads older portable backups", () => {
  const root = mkdtempSync(path.join(systemTemporaryDirectory(), 'site-runner-appearance-')),
    file = path.join(root, "test.sqlite3");
  let database = new AppDatabase(file);
  try {
    let data = new DataService(database.connection);
    expect(data.getSettings()).toMatchObject({
      theme: "system",
      density: "comfortable",
    });
    data.updateSettings({ theme: "dark", density: "compact" });
    database.close();
    database = new AppDatabase(file);
    data = new DataService(database.connection);
    expect(data.getSettings()).toMatchObject({
      theme: "dark",
      density: "compact",
    });
    const backup = exportConfiguration(data);
    const legacy: Partial<typeof backup.settings> = { ...backup.settings };
    delete legacy.theme;
    delete legacy.density;
    expect(
      parseConfiguration({ ...backup, settings: legacy }).settings,
    ).toMatchObject({ theme: "system", density: "comfortable" });
    importConfiguration(
      data,
      { ...backup, settings: { ...backup.settings, theme: "light" } },
      true,
    );
    expect(data.getSettings().theme).toBe("light");
    const snapshot = data.getSettings();
    expect(() => data.updateSettings({ theme: "neon" as "dark" })).toThrow();
    expect(() =>
      parseConfiguration({
        ...backup,
        settings: { ...backup.settings, density: "tiny" },
      }),
    ).toThrow();
    expect(data.getSettings()).toEqual(snapshot);
  } finally {
    database.close();
  }
});

it("executes visual steps with real Chromium, verifies success and skips completed work", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(1500);
    const target = `Quotation " and \\ newline\n'; throw new Error('injected'); //`;
    await page.setContent(
      '<label>Account<input /></label><button>Submit</button><p id="result">Waiting</p>',
    );
    await page.locator("button").evaluate(
      (button, text) =>
        button.addEventListener("click", () => {
          document.querySelector("#result")!.textContent = text;
        }),
      target,
    );
    const flow: AutomationFlow = {
      version: 1,
      steps: [
        { action: "fill", locator: "label", target: "Account", value: "alice" },
        { action: "waitFor", locator: "selector", target: "button", value: "" },
        { action: "click", locator: "button", target: "Submit", value: "" },
        { action: "assertText", locator: "text", target, value: "" },
      ],
      message: "Verified",
    };
    const context = {
      page,
      log: { info() {}, warn() {}, error() {} },
      config: {},
    };
    expect(await runTrustedScript(compileFlow(flow)!, context)).toBe(
      "Verified",
    );
    expect(await page.locator("input").inputValue()).toBe("alice");
    const skip: AutomationFlow = {
      ...flow,
      steps: [
        {
          action: "skipIfText",
          locator: "text",
          target,
          value: "Already done",
        },
        { action: "click", locator: "button", target: "Missing", value: "" },
      ],
    };
    expect(await runTrustedScript(compileFlow(skip)!, context)).toBe(
      "Already done",
    );
    const failed = {
      ...flow,
      steps: [
        {
          action: "assertText" as const,
          locator: "text" as const,
          target: "Missing success",
          value: "",
        },
      ],
    };
    await expect(
      runTrustedScript(compileFlow(failed)!, context),
    ).rejects.toThrow();
  } finally {
    await browser.close();
  }
});
