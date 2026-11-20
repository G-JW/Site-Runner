import { existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import type {
  BrowserSource,
  BrowserRuntimeStatus,
} from "../../shared/types.js";
import type { DataService } from "../services/data-service.js";

export type BrowserLaunchOptions = { channel: string; executablePath?: string };
export type BrowserInstaller = (
  progress: (message: string) => void,
  signal: AbortSignal,
) => Promise<void>;

export function localBrowserPath(
  source: "chrome" | "msedge",
  platform = process.platform,
  env = process.env,
  home = os.homedir(),
  exists = existsSync,
): string | null {
  const app = source === "chrome" ? "Google Chrome" : "Microsoft Edge";
  const win =
    source === "chrome"
      ? ["Google", "Chrome", "Application", "chrome.exe"]
      : ["Microsoft", "Edge", "Application", "msedge.exe"];
  const candidates =
    platform === "darwin"
      ? [
          `/Applications/${app}.app/Contents/MacOS/${app}`,
          path.join(
            home,
            "Applications",
            `${app}.app`,
            "Contents",
            "MacOS",
            app,
          ),
        ]
      : platform === "win32"
        ? [env.PROGRAMFILES, env["PROGRAMFILES(X86)"], env.LOCALAPPDATA]
            .filter((root): root is string => Boolean(root))
            .map((root) => path.win32.join(root, ...win))
        : source === "chrome"
          ? [
              "/usr/bin/google-chrome",
              "/usr/bin/google-chrome-stable",
              "/opt/google/chrome/chrome",
            ]
          : [
              "/usr/bin/microsoft-edge",
              "/usr/bin/microsoft-edge-stable",
              "/opt/microsoft/msedge/msedge",
            ];
  return candidates.find(exists) ?? null;
}

export class BrowserService {
  private managedPath: string | undefined;
  private controller: AbortController | null = null;
  private work: Promise<BrowserRuntimeStatus> | null = null;
  private phase: BrowserRuntimeStatus["phase"] = "idle";
  private message = "";
  private readonly listeners = new Set<
    (status: BrowserRuntimeStatus) => void
  >();
  constructor(
    private readonly data: Pick<DataService, "getSettings">,
    readonly cacheDirectory: string,
    private readonly installBrowser: BrowserInstaller,
    private readonly busy: () => boolean,
    private readonly managedExecutable: () => Promise<string> = async () =>
      (await import("playwright")).chromium.executablePath(),
    private readonly systemExecutable: (
      source: "chrome" | "msedge",
    ) => string | null = localBrowserPath,
  ) {}

  source(): BrowserSource {
    return this.data.getSettings().browserSource;
  }
  profilePath(root: string, id: string): string {
    return path.join(
      root,
      this.source() === "managed" ? id : `${id}-${this.source()}`,
    );
  }
  onState(listener: (status: BrowserRuntimeStatus) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  async status(): Promise<BrowserRuntimeStatus> {
    this.managedPath = await this.managedExecutable();
    const managed = this.managedReady(this.managedPath);
    const installed = {
      managed,
      chrome: Boolean(this.systemExecutable("chrome")),
      msedge: Boolean(this.systemExecutable("msedge")),
    };
    return {
      source: this.source(),
      ready:
        installed[this.source()] &&
        !(this.source() === "managed" && this.phase === "downloading"),
      installed,
      phase: this.phase,
      message: this.message,
      cacheDirectory: this.cacheDirectory,
    };
  }
  private managedReady(executable: string): boolean {
    const directory = path
      .relative(this.cacheDirectory, executable)
      .split(path.sep)[0];
    return Boolean(
      directory &&
      /^chromium-\d+$/.test(directory) &&
      existsSync(executable) &&
      existsSync(
        path.join(this.cacheDirectory, directory, "INSTALLATION_COMPLETE"),
      ),
    );
  }
  isInstalling(): boolean {
    return this.phase === "downloading";
  }
  readySync(): boolean {
    const source = this.source();
    if (source === "managed" && this.phase === "downloading") return false;
    return source === "managed"
      ? Boolean(this.managedPath && this.managedReady(this.managedPath))
      : Boolean(this.systemExecutable(source));
  }
  private async publish(): Promise<void> {
    const state = await this.status();
    for (const listener of this.listeners) listener(state);
  }
  async launchOptions(): Promise<BrowserLaunchOptions> {
    const source = this.source();
    const executablePath =
      source === "managed"
        ? await this.managedExecutable()
        : this.systemExecutable(source);
    if (
      !executablePath ||
      (source === "managed"
        ? !this.managedReady(executablePath)
        : !existsSync(executablePath))
    )
      throw new Error(
        this.data.getSettings().language === "zh-CN"
          ? "浏览器未就绪，请在设置 → 执行 → 浏览器中下载 Chromium 或选择已安装的 Chrome/Edge。"
          : "Browser is not ready. Download Chromium or choose an installed Chrome/Edge in Settings → Execution → Browser.",
      );
    return {
      channel: source === "managed" ? "chromium" : source,
      executablePath,
    };
  }
  install(): Promise<BrowserRuntimeStatus> {
    if (this.work) return this.work;
    if (this.busy())
      return Promise.reject(
        new Error(
          "Close task/login/recorder browsers before installing Chromium",
        ),
      );
    const controller = new AbortController();
    this.controller = controller;
    this.phase = "downloading";
    this.message = "";
    const task = (async () => {
      await this.publish();
      try {
        await this.installBrowser((message) => {
          this.message = message.slice(-600);
          void this.publish().catch(() => undefined);
        }, controller.signal);
        if (!this.managedReady(await this.managedExecutable()))
          throw new Error(
            "Chromium download completed but its executable is missing",
          );
        this.phase = "idle";
        this.message = "";
      } catch (error) {
        this.phase = controller.signal.aborted ? "idle" : "error";
        this.message = controller.signal.aborted
          ? ""
          : error instanceof Error
            ? error.message
            : String(error);
      } finally {
        this.controller = null;
      }
      await this.publish();
      return this.status();
    })();
    this.work = task;
    void task
      .finally(() => {
        if (this.work === task) this.work = null;
      })
      .catch(() => undefined);
    return task;
  }
  cancel(): void {
    this.controller?.abort();
  }
  async shutdown(): Promise<void> {
    this.cancel();
    await this.work;
  }
}
