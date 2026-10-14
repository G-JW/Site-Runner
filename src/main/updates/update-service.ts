import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import {
  access,
  mkdir,
  mkdtemp,
  open,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  compareVersions,
  type UpdateArtifact,
  type UpdateError,
  type UpdateState,
} from "../../shared/updates.js";
import { updateConfig } from "../../shared/update-config.js";
import { verifyManifest } from "./manifest.js";
import { launchInstaller, type InstallPlan } from "./installers.js";

const execute = promisify(execFile);
interface Options {
  currentVersion: string;
  platform: string;
  arch: string;
  executable: string;
  portablePath?: string;
  userData: string;
  packaged: boolean;
  fetch?: typeof fetch;
  publicKey?: string;
  isBusy(): boolean | Promise<boolean>;
  beforeInstall(): Promise<void>;
  quit(): void;
  installer?: typeof launchInstaller;
  logError?(stage: string, error: unknown): void;
}

export class UpdateService {
  private state: UpdateState;
  private readonly directory: string;
  private readonly receipt: string;
  private artifact: UpdateArtifact | null = null;
  private assetURL: string | null = null;
  private staged: string | null = null;
  private downloaded: string | null = null;
  private operation: Promise<UpdateState> | null = null;
  private controller: AbortController | null = null;
  private readonly listeners = new Set<(state: UpdateState) => void>();
  private readonly request: typeof fetch;
  private readonly supported: boolean;
  private previousInstall: {
    success?: boolean;
    pending?: boolean;
    version?: string;
  } | null = null;

  constructor(private readonly options: Options) {
    this.directory = path.join(options.userData, "updates");
    this.receipt = path.join(this.directory, "install-result.json");
    this.request = options.fetch ?? fetch;
    this.supported =
      options.packaged &&
      ["darwin", "win32"].includes(options.platform) &&
      ["arm64", "x64"].includes(options.arch) &&
      (options.platform !== "win32" || Boolean(options.portablePath));
    this.state = {
      phase: this.supported ? "idle" : "unsupported",
      currentVersion: options.currentVersion,
    };
  }

  async initialize(): Promise<void> {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    try {
      this.previousInstall = JSON.parse(
        (await readFile(this.receipt, "utf8")).replace(/^\uFEFF/, ""),
      );
      if (this.supported && this.previousInstall?.success === false)
        this.publish({ ...this.state, phase: "error", error: "install" });
    } catch {
      /* No receipt on first launch. */
    }
  }

  async confirmStartup(): Promise<void> {
    if (
      this.previousInstall?.pending &&
      this.previousInstall.version === this.options.currentVersion
    ) {
      await writeFile(
        this.receipt,
        JSON.stringify({
          success: true,
          version: this.options.currentVersion,
          pid: process.pid,
        }),
        { mode: 0o600 },
      );
      // The helper no longer needs cached packages once the new UI has started.
      for (const entry of await readdir(this.directory)) {
        if (entry === "install-result.json") continue;
        await rm(path.join(this.directory, entry), {
          recursive: true,
          force: true,
        }).catch(() => undefined);
      }
    }
  }

  snapshot(): UpdateState {
    return { ...this.state };
  }
  onState(listener: (state: UpdateState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  private publish(next: UpdateState): void {
    this.state = next;
    for (const listener of this.listeners) listener(this.snapshot());
  }
  private failure(error: UpdateError): UpdateState {
    this.publish({ ...this.state, phase: "error", error });
    return this.snapshot();
  }
  private single(work: () => Promise<UpdateState>): Promise<UpdateState> {
    if (this.operation) return this.operation;
    const operation = work();
    this.operation = operation;
    void operation
      .finally(() => {
        if (this.operation === operation) this.operation = null;
      })
      .catch(() => undefined);
    return operation;
  }

  private async smallJSON(url: string): Promise<unknown> {
    const response = await this.request(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": `SiteRunner/${this.options.currentVersion}`,
      },
      signal: this.controller
        ? AbortSignal.any([this.controller.signal, AbortSignal.timeout(30_000)])
        : AbortSignal.timeout(30_000),
    });
    if (response.status === 404) return null;
    if (!response.ok || !response.body)
      throw new Error("Cannot fetch update metadata");
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        length += chunk.value.byteLength;
        if (length > 200_000) throw new Error("Metadata too large");
        chunks.push(chunk.value);
      }
    } finally {
      await reader.cancel().catch(() => undefined);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  }

  check(): Promise<UpdateState> {
    if (
      !this.supported ||
      this.state.phase === "ready" ||
      this.state.phase === "installing"
    )
      return Promise.resolve(this.snapshot());
    return this.single(async () => {
      this.controller = new AbortController();
      this.publish({
        phase: "checking",
        currentVersion: this.options.currentVersion,
      });
      let kind: UpdateError = "network";
      try {
        const release = (await this.smallJSON(
          `https://api.github.com/repos/${updateConfig.owner}/${updateConfig.repo}/releases/latest`,
        )) as {
          tag_name: string;
          body?: string;
          draft: boolean;
          prerelease: boolean;
        } | null;
        if (!release) {
          this.publish({
            phase: "current",
            currentVersion: this.options.currentVersion,
          });
          return this.snapshot();
        }
        kind = "manifest";
        if (
          release.draft ||
          release.prerelease ||
          !/^v\d+\.\d+\.\d+$/.test(release.tag_name)
        )
          throw new Error("Invalid stable release");
        const base = `https://github.com/${updateConfig.owner}/${updateConfig.repo}/releases/download/${release.tag_name}`;
        const envelope = await this.smallJSON(
          `${base}/site-runner-update.json`,
        );
        const manifest = verifyManifest(
          envelope,
          this.options.publicKey ?? updateConfig.publicKey,
        );
        if (`v${manifest.version}` !== release.tag_name)
          throw new Error("Version mismatch");
        this.artifact = null;
        this.assetURL = null;
        this.staged = null;
        this.downloaded = null;
        if (
          compareVersions(manifest.version, this.options.currentVersion) <= 0
        ) {
          this.publish({
            phase: "current",
            currentVersion: this.options.currentVersion,
          });
        } else {
          const artifact = manifest.artifacts.find(
            (item) =>
              item.platform === this.options.platform &&
              item.arch === this.options.arch,
          );
          if (!artifact) return this.failure("platform");
          this.artifact = artifact;
          this.assetURL = `${base}/${artifact.name}`;
          this.publish({
            phase: "available",
            currentVersion: this.options.currentVersion,
            version: manifest.version,
            notes: (release.body ?? "").slice(0, 20_000),
            size: artifact.size,
          });
        }
        return this.snapshot();
      } catch (error) {
        this.options.logError?.("check", error);
        return this.failure(kind);
      } finally {
        this.controller = null;
      }
    });
  }

  download(): Promise<UpdateState> {
    if (
      !this.supported ||
      this.state.phase === "ready" ||
      this.state.phase === "installing"
    )
      return Promise.resolve(this.snapshot());
    return this.single(async () => {
      if (!this.artifact || !this.assetURL || !this.state.version)
        return this.failure("manifest");
      const artifact = this.artifact;
      const partial = path.join(this.directory, `${randomUUID()}.partial`);
      this.controller = new AbortController();
      this.publish({
        phase: "downloading",
        currentVersion: this.options.currentVersion,
        version: this.state.version,
        size: artifact.size,
        progress: 0,
        transferred: 0,
      });
      try {
        const response = await this.request(this.assetURL, {
          signal: AbortSignal.any([
            this.controller.signal,
            AbortSignal.timeout(30 * 60_000),
          ]),
        });
        if (!response.ok || !response.body)
          throw new Error("Update download failed");
        const hash = createHash("sha256"),
          file = await open(partial, "wx", 0o600);
        const reader = response.body.getReader();
        let transferred = 0,
          lastProgress = 0;
        try {
          while (true) {
            const chunk = await reader.read();
            if (chunk.done) break;
            transferred += chunk.value.byteLength;
            if (transferred > artifact.size)
              throw new Error("Download exceeds signed size");
            hash.update(chunk.value);
            await file.writeFile(chunk.value);
            if (
              Date.now() - lastProgress > 150 ||
              transferred === artifact.size
            ) {
              this.publish({
                ...this.state,
                progress: Math.min(100, (transferred * 100) / artifact.size),
                transferred,
              });
              lastProgress = Date.now();
            }
          }
          if (
            transferred !== artifact.size ||
            hash.digest("hex") !== artifact.sha256
          )
            throw new Error("Download checksum mismatch");
          await file.sync();
        } finally {
          await file.close();
          await reader.cancel().catch(() => undefined);
        }
        this.downloaded = path.join(this.directory, artifact.name);
        await rename(partial, this.downloaded);
        const previous = this.staged;
        this.staged = await this.prepare(this.downloaded);
        if (
          previous &&
          previous !== this.staged &&
          this.options.platform === "darwin"
        )
          await rm(path.dirname(previous), { recursive: true, force: true });
        this.publish({ ...this.state, phase: "ready", progress: 100 });
        return this.snapshot();
      } catch (error) {
        this.options.logError?.("download", error);
        await rm(partial, { force: true });
        this.staged = null;
        return this.failure("download");
      } finally {
        this.controller = null;
      }
    });
  }

  private async prepare(filename: string): Promise<string> {
    if (this.options.platform === "win32") return filename;
    const list = await execute("/usr/bin/unzip", ["-Z1", filename], {
      maxBuffer: 32 * 1024 * 1024,
    });
    for (const entry of list.stdout.split("\n").filter(Boolean)) {
      if (
        entry.includes("\\") ||
        entry.startsWith("/") ||
        entry.split("/").includes("..") ||
        !(
          entry === "Site Runner.app/" ||
          entry.startsWith("Site Runner.app/") ||
          entry.startsWith("__MACOSX/")
        )
      )
        throw new Error("Unsafe archive entry");
    }
    const destination = await mkdtemp(path.join(this.directory, "staged-"));
    try {
      await execute("/usr/bin/ditto", ["-x", "-k", filename, destination]);
      const app = path.join(destination, "Site Runner.app");
      const canonicalApp = await realpath(app);
      const plist = path.join(app, "Contents/Info.plist");
      const { stdout: identity } = await execute("/usr/libexec/PlistBuddy", [
        "-c",
        "Print :CFBundleIdentifier",
        plist,
      ]);
      const { stdout: version } = await execute("/usr/libexec/PlistBuddy", [
        "-c",
        "Print :CFBundleShortVersionString",
        plist,
      ]);
      if (
        identity.trim() !== "com.siterunner.desktop" ||
        version.trim() !== this.state.version
      )
        throw new Error("Wrong app identity");
      await access(
        path.join(app, "Contents/MacOS/Site Runner"),
        constants.X_OK,
      );
      const assertInside = async (directory: string): Promise<void> => {
        for (const item of await readdir(directory, { withFileTypes: true })) {
          const itemPath = path.join(directory, item.name);
          if (item.isSymbolicLink()) {
            const resolved = await realpath(itemPath);
            if (!resolved.startsWith(`${canonicalApp}${path.sep}`))
              throw new Error("Archive symlink escapes app");
          } else if (item.isDirectory()) await assertInside(itemPath);
        }
      };
      await assertInside(app);
      return app;
    } catch (error) {
      await rm(destination, { recursive: true, force: true });
      throw error;
    }
  }

  install(): Promise<UpdateState> {
    return this.single(async () => {
      if (
        !this.staged ||
        !this.downloaded ||
        !this.artifact ||
        !this.state.version ||
        !["ready", "error"].includes(this.state.phase)
      )
        return this.failure("install");
      if (await this.options.isBusy()) return this.failure("busy");
      const current =
        this.options.platform === "darwin"
          ? path.resolve(path.dirname(this.options.executable), "../..")
          : this.options.portablePath;
      if (!current) return this.failure("platform");
      let kind: UpdateError = "download";
      try {
        // Verify again immediately before installation, including after long idle periods.
        const handle = await open(this.downloaded, "r"),
          hash = createHash("sha256");
        try {
          for await (const chunk of handle.createReadStream({
            autoClose: false,
          }))
            hash.update(chunk);
        } finally {
          await handle.close();
        }
        if (
          hash.digest("hex") !== this.artifact.sha256 ||
          (await stat(this.downloaded)).size !== this.artifact.size
        )
          return this.failure("download");
        if (this.options.platform === "darwin") {
          const previous = this.staged;
          this.staged = await this.prepare(this.downloaded);
          if (previous !== this.staged)
            await rm(path.dirname(previous), { recursive: true, force: true });
        }
        const probe = path.join(
          path.dirname(current),
          `.site-runner-permission-${randomUUID()}`,
        );
        kind = "permission";
        await mkdir(probe, { mode: 0o700 });
        await rm(probe, { recursive: true });
        if (await this.options.isBusy()) return this.failure("busy");
        kind = "install";
        this.publish({ ...this.state, phase: "installing" });
        await this.options.beforeInstall();
        const plan: InstallPlan = {
          platform: this.options.platform as InstallPlan["platform"],
          current,
          staged: this.staged,
          pid: process.pid,
          receipt: this.receipt,
          userData: this.options.userData,
          version: this.state.version!,
        };
        await (this.options.installer ?? launchInstaller)(plan, this.directory);
        this.options.quit();
        return this.snapshot();
      } catch (error) {
        this.options.logError?.("install", error);
        return this.failure(kind);
      }
    });
  }

  async shutdown(): Promise<void> {
    this.controller?.abort();
    await this.operation?.catch(() => undefined);
  }
}
