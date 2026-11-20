import { app, BrowserWindow, Menu, nativeImage, Tray } from "electron";
import path from "node:path";
import type { AppSettings } from "../shared/types.js";

/** Own the macOS menu-bar item for as long as the application is running. */
export class MenuBar {
  private readonly tray: Tray;
  constructor(
    private readonly settings: () => AppSettings,
    private readonly show: () => void,
    private readonly run: () => Promise<void>,
    private readonly busy: () => boolean,
    private readonly onError: (error: unknown) => void,
  ) {
    const image = nativeImage.createFromPath(
      path.join(app.getAppPath(), "assets/branding/trayTemplate.png"),
    );
    image.setTemplateImage(true);
    this.tray = new Tray(image);
    this.tray.setToolTip("Site Runner");
    const open = () => this.tray.popUpContextMenu(this.menu());
    this.tray.on("click", open);
    this.tray.on("right-click", open);
    this.tray.on("double-click", this.show);
  }

  private menu(): Menu {
    const settings = this.settings();
    const zh = settings.language === "zh-CN";
    return Menu.buildFromTemplate([
      { label: zh ? "打开 Site Runner" : "Open Site Runner", click: this.show },
      {
        label: zh ? "运行全部已启用任务" : "Run all enabled tasks",
        enabled: !this.busy(),
        click: () => {
          void this.run().catch(this.onError);
        },
      },
      { type: "separator" },
      {
        label: settings.dailyRunEnabled
          ? zh
            ? `每天 ${settings.dailyRunTime} 自动执行`
            : `Runs daily at ${settings.dailyRunTime}`
          : zh
            ? "每日定时已关闭"
            : "Daily schedule is off",
        enabled: false,
      },
      { type: "separator" },
      {
        label: zh ? "退出 Site Runner" : "Quit Site Runner",
        accelerator: "Command+Q",
        click: () => app.quit(),
      },
    ]);
  }

  hide(window: BrowserWindow): void {
    window.hide();
    app.dock?.hide();
  }

  destroy(): void {
    this.tray.destroy();
  }
}
