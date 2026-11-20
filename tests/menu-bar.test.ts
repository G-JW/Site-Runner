import { expect, it, vi } from "vitest";
import type { BrowserWindow } from "electron";
import type { AppSettings } from "../src/shared/types.js";
const native = vi.hoisted(() => ({
  handlers: new Map<string, () => void>(),
  popup: vi.fn(),
  destroy: vi.fn(),
  template: vi.fn(),
  dockHide: vi.fn(),
  quit: vi.fn(),
}));
vi.mock("electron", () => ({
  app: {
    getAppPath: () => "/app",
    dock: { hide: native.dockHide },
    quit: native.quit,
  },
  nativeImage: {
    createFromPath: () => ({ setTemplateImage: native.template }),
  },
  Tray: class {
    on(name: string, cb: () => void) {
      native.handlers.set(name, cb);
    }
    setToolTip() {}
    popUpContextMenu(menu: unknown) {
      native.popup(menu);
    }
    destroy() {
      native.destroy();
    }
  },
  Menu: { buildFromTemplate: (items: unknown) => items },
}));
import { MenuBar } from "../src/main/menu-bar.js";
it("uses a template icon, hides both the window and Dock, and keeps reopen/quit actions available", () => {
  const settings = {
    language: "zh-CN",
    dailyRunEnabled: true,
    dailyRunTime: "09:00",
  } as AppSettings;
  const show = vi.fn();
  const bar = new MenuBar(
    () => settings,
    show,
    vi.fn(),
    () => false,
    vi.fn(),
  );
  expect(native.template).toHaveBeenCalledWith(true);
  const hide = vi.fn();
  bar.hide({ hide } as unknown as BrowserWindow);
  expect(hide).toHaveBeenCalledOnce();
  expect(native.dockHide).toHaveBeenCalledOnce();
  native.handlers.get("click")!();
  const menu = native.popup.mock.lastCall![0];
  expect(menu[3].label).toContain("09:00");
  menu[0].click();
  expect(show).toHaveBeenCalledOnce();
  menu[5].click();
  expect(native.quit).toHaveBeenCalledOnce();
  bar.destroy();
  expect(native.destroy).toHaveBeenCalledOnce();
});
it("rebuilds menu status from current preferences and disables execution while busy", () => {
  let busy = false;
  const settings = {
    language: "en",
    dailyRunEnabled: false,
    dailyRunTime: "18:30",
  } as AppSettings;
  new MenuBar(
    () => settings,
    vi.fn(),
    vi.fn(),
    () => busy,
    vi.fn(),
  );
  native.handlers.get("right-click")!();
  let menu = native.popup.mock.lastCall![0];
  expect(menu[3].label).toBe("Daily schedule is off");
  expect(menu[1].enabled).toBe(true);
  settings.dailyRunEnabled = true;
  busy = true;
  native.handlers.get("click")!();
  menu = native.popup.mock.lastCall![0];
  expect(menu[3].label).toContain("18:30");
  expect(menu[1].enabled).toBe(false);
});
