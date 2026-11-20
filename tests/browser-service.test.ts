import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { AppDatabase } from "../src/main/database/database.js";
import { DataService } from "../src/main/services/data-service.js";
import {
  BrowserService,
  localBrowserPath,
  type BrowserInstaller,
} from "../src/main/browsers/browser-service.js";
import { ProfileService } from "../src/main/profiles/profile-service.js";
const databases: AppDatabase[] = [];
afterEach(() => {
  databases.splice(0).forEach((db) => db.close());
});
function markReady(exe: string) {
  mkdirSync(path.dirname(exe), { recursive: true });
  writeFileSync(exe, "browser");
  writeFileSync(path.join(path.dirname(exe), "INSTALLATION_COMPLETE"), "");
}
function setup(
  install: BrowserInstaller = async () => undefined,
  busy = () => false,
) {
  const root = mkdtempSync(path.join(tmpdir(), "sr-browser-"));
  const db = new AppDatabase(path.join(root, "test.sqlite3"));
  databases.push(db);
  const data = new DataService(db.connection),
    exe = path.join(root, "chromium-1234", "browser"),
    chrome = path.join(root, "chrome");
  const service = new BrowserService(
    data,
    root,
    install,
    busy,
    async () => exe,
    (source) => (source === "chrome" && existsSync(chrome) ? chrome : null),
  );
  return { root, data, exe, chrome, service };
}
it("reports missing engines, rejects launches with actionable guidance and never silently downloads", async () => {
  const install = vi.fn(async () => undefined),
    { service } = setup(install);
  expect(await service.status()).toMatchObject({
    source: "managed",
    ready: false,
    installed: { managed: false, chrome: false, msedge: false },
  });
  await expect(service.launchOptions()).rejects.toThrow(/Browser is not ready/);
  expect(install).not.toHaveBeenCalled();
  expect(service.readySync()).toBe(false);
});
it("deduplicates downloads, publishes progress, verifies the executable and reuses the installed browser", async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const install = vi.fn<BrowserInstaller>(async (progress) => {
    progress("50%");
    await gate;
    markReady(exe);
  });
  const { service, exe } = setup(install),
    states: string[] = [];
  service.onState((state) => states.push(state.phase));
  const first = service.install();
  expect(service.install()).toBe(first);
  await Promise.resolve();
  expect(service.isInstalling()).toBe(true);
  release();
  expect(await first).toMatchObject({ ready: true, phase: "idle" });
  expect(install).toHaveBeenCalledOnce();
  expect(states).toContain("downloading");
  expect(await service.launchOptions()).toEqual({
    channel: "chromium",
    executablePath: exe,
  });
  expect(service.readySync()).toBe(true);
  await service.shutdown();
});
it("supports cancellation and retry without claiming a partial download is ready", async () => {
  let started!: () => void;
  const gate = new Promise<void>((resolve) => {
    started = resolve;
  });
  let attempt = 0;
  const install: BrowserInstaller = async (_progress, signal) => {
    if (++attempt === 1) {
      started();
      await new Promise<never>((_resolve, reject) =>
        signal.addEventListener("abort", () => reject(new Error("cancelled")), {
          once: true,
        }),
      );
    } else markReady(exe);
  };
  const { service, exe } = setup(install);
  const work = service.install();
  await gate;
  service.cancel();
  expect(await work).toMatchObject({ ready: false, phase: "idle" });
  expect(await service.install()).toMatchObject({ ready: true, phase: "idle" });
  await service.shutdown();
});
it("rejects engine installation while a profile is in use and surfaces incomplete downloads", async () => {
  const busy = setup(
    async () => undefined,
    () => true,
  );
  await expect(busy.service.install()).rejects.toThrow(/Close/);
  const { service } = setup();
  expect(await service.install()).toMatchObject({
    ready: false,
    phase: "error",
  });
});
it("keeps Chromium and local Chrome login directories separate and removes all variants explicitly", async () => {
  const { service, data, root, chrome } = setup();
  writeFileSync(chrome, "browser");
  const profiles = new ProfileService(
      data,
      path.join(root, "profiles"),
      service,
    ),
    profile = profiles.create("Default");
  const managed = profiles.getProfilePath(profile.id);
  writeFileSync(path.join(managed, "login-marker"), "managed");
  data.updateSettings({ browserSource: "chrome" });
  const local = profiles.getProfilePath(profile.id);
  expect(local).not.toBe(managed);
  expect(local).toBe(path.join(root, "profiles", profile.id + "-chrome"));
  expect(existsSync(path.join(managed, "login-marker"))).toBe(true);
  expect(await service.launchOptions()).toEqual({
    channel: "chrome",
    executablePath: chrome,
  });
  mkdirSync(local);
  profiles.remove(profile.id);
  expect(existsSync(local)).toBe(false);
  expect(existsSync(managed)).toBe(false);
});
it("detects supported system browser locations across platforms without using default user profiles", () => {
  expect(
    localBrowserPath("chrome", "darwin", {}, "/test/home", (p) =>
      String(p).startsWith("/Applications/Google Chrome"),
    ),
  ).toContain("Contents/MacOS/Google Chrome");
  expect(
    localBrowserPath(
      "msedge",
      "win32",
      { PROGRAMFILES: "C:\\Program Files" },
      "",
      (p) => String(p).endsWith("msedge.exe"),
    ),
  ).toBe("C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe");
  expect(
    localBrowserPath("chrome", "darwin", {}, "/test/home", () => false),
  ).toBeNull();
});

it("does not treat a partially extracted Chromium executable as installed", async () => {
  const { service, exe } = setup();
  mkdirSync(path.dirname(exe), { recursive: true });
  writeFileSync(exe, "partial");
  expect((await service.status()).installed.managed).toBe(false);
  await expect(service.launchOptions()).rejects.toThrow(/not ready/);
});

it("keeps tasks blocked until the whole managed browser installation completes", async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const { service, exe } = setup(async () => {
    markReady(exe);
    await gate;
  });
  const work = service.install();
  await Promise.resolve();
  await Promise.resolve();
  expect((await service.status()).ready).toBe(false);
  expect(service.readySync()).toBe(false);
  release();
  expect((await work).ready).toBe(true);
  expect(service.readySync()).toBe(true);
});
