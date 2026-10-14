import { afterEach, describe, expect, it, vi } from "vitest";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn, spawnSync } from "node:child_process";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { compareVersions, type UpdateManifest } from "../src/shared/updates.js";
import { verifyManifest } from "../src/main/updates/manifest.js";
import { UpdateService } from "../src/main/updates/update-service.js";
import {
  installerScript,
  type InstallPlan,
} from "../src/main/updates/installers.js";

const execute = promisify(execFile);
const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});
const root = () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "site-runner-update-"));
  roots.push(directory);
  return directory;
};
const keys = generateKeyPairSync("ed25519");
const publicKey = keys.publicKey
  .export({ type: "spki", format: "pem" })
  .toString();
const envelope = (manifest: UpdateManifest) => {
  const bytes = Buffer.from(JSON.stringify(manifest));
  return {
    payload: bytes.toString("base64"),
    signature: sign(null, bytes, keys.privateKey).toString("base64"),
  };
};

function fixture() {
  const directory = root(),
    userData = path.join(directory, "data"),
    executable = path.join(directory, "Runner's app.exe");
  mkdirSync(userData);
  writeFileSync(executable, "old app");
  writeFileSync(path.join(userData, "tasks.json"), "saved tasks");
  const bytes = Buffer.from("new executable"),
    body = { bytes },
    busy = { value: false };
  const artifact = {
    platform: "win32" as const,
    arch: "x64" as const,
    name: "Site-Runner-0.3.7-win32-x64.exe",
    size: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
  const manifest: UpdateManifest = {
    format: "site-runner-update",
    schema: 1,
    version: "0.3.7",
    artifacts: [artifact],
  };
  const metadata = { value: envelope(manifest) };
  const transport = vi.fn(async (url: string | URL | Request) => {
    const address = String(url);
    if (address.endsWith("/releases/latest"))
      return Response.json({
        tag_name: "v0.3.7",
        body: "Release notes",
        draft: false,
        prerelease: false,
      });
    if (address.endsWith("/site-runner-update.json"))
      return Response.json(metadata.value);
    return new Response(new Uint8Array(body.bytes));
  });
  const installer = vi.fn(async () => undefined),
    quit = vi.fn();
  const service = new UpdateService({
    currentVersion: "0.3.6",
    platform: "win32",
    arch: "x64",
    packaged: true,
    executable,
    portablePath: executable,
    userData,
    publicKey,
    fetch: transport,
    isBusy: async () => busy.value,
    beforeInstall: async () => undefined,
    installer,
    quit,
  });
  return {
    service,
    manifest,
    metadata,
    body,
    busy,
    installer,
    quit,
    transport,
    executable,
    userData,
  };
}

describe("signed update manifests", () => {
  it("compares versions numerically and rejects prerelease / downgrade confusion", () => {
    expect(compareVersions("0.3.10", "0.3.9")).toBe(1);
    expect(compareVersions("1.0.0", "1.0.0")).toBe(0);
    expect(compareVersions("0.3.5", "0.3.6")).toBe(-1);
    expect(() => compareVersions("0.3.7-beta", "0.3.6")).toThrow();
  });
  it("rejects tampering, an unknown key, traversal filenames and duplicate CPU targets", () => {
    const f = fixture();
    expect(verifyManifest(f.metadata.value, publicKey)).toEqual(f.manifest);
    const modified = {
      ...f.metadata.value,
      payload: Buffer.from(
        JSON.stringify({ ...f.manifest, version: "9.0.0" }),
      ).toString("base64"),
    };
    expect(() => verifyManifest(modified, publicKey)).toThrow(/signature/);
    const other = generateKeyPairSync("ed25519")
      .publicKey.export({ type: "spki", format: "pem" })
      .toString();
    expect(() => verifyManifest(f.metadata.value, other)).toThrow();
    expect(() =>
      verifyManifest(
        envelope({
          ...f.manifest,
          artifacts: [{ ...f.manifest.artifacts[0]!, name: "../payload.exe" }],
        }),
        publicKey,
      ),
    ).toThrow();
    expect(() =>
      verifyManifest(
        envelope({
          ...f.manifest,
          artifacts: [...f.manifest.artifacts, ...f.manifest.artifacts],
        }),
        publicKey,
      ),
    ).toThrow(/Duplicate/);
  });
});

describe("update lifecycle", () => {
  it("coalesces checks, verifies downloads, retains user data and launches an installer only when explicitly requested", async () => {
    const f = fixture();
    await f.service.initialize();
    const a = f.service.check(),
      b = f.service.check();
    expect(a).toBe(b);
    expect((await a).phase).toBe("available");
    expect(f.transport).toHaveBeenCalledTimes(2);
    expect((await f.service.download()).phase).toBe("ready");
    expect(f.installer).not.toHaveBeenCalled();
    expect((await f.service.install()).phase).toBe("installing");
    expect(f.installer).toHaveBeenCalledOnce();
    expect(f.quit).toHaveBeenCalledOnce();
    expect(readFileSync(f.executable, "utf8")).toBe("old app");
    expect(readFileSync(path.join(f.userData, "tasks.json"), "utf8")).toBe(
      "saved tasks",
    );
  });
  it("does not download when signature validation fails", async () => {
    const f = fixture();
    await f.service.initialize();
    f.metadata.value.signature = Buffer.alloc(64).toString("base64");
    expect((await f.service.check()).error).toBe("manifest");
    expect((await f.service.download()).error).toBe("manifest");
    expect(f.transport).toHaveBeenCalledTimes(2);
    expect(f.installer).not.toHaveBeenCalled();
  });
  it("rejects a corrupted or truncated payload, and a tampered cached download", async () => {
    const f = fixture();
    await f.service.initialize();
    await f.service.check();
    f.body.bytes = Buffer.from("corrupted");
    expect((await f.service.download()).error).toBe("download");
    f.body.bytes = Buffer.from("new executable");
    expect((await f.service.download()).phase).toBe("ready");
    writeFileSync(
      path.join(f.userData, "updates", f.manifest.artifacts[0]!.name),
      "tampered data",
    );
    expect((await f.service.install()).error).toBe("download");
    expect(f.installer).not.toHaveBeenCalled();
    expect(f.quit).not.toHaveBeenCalled();
  });
  it("blocks an install during tasks / recording and allows retry after they finish", async () => {
    const f = fixture();
    await f.service.initialize();
    await f.service.check();
    await f.service.download();
    f.busy.value = true;
    expect((await f.service.install()).error).toBe("busy");
    expect(f.installer).not.toHaveBeenCalled();
    f.busy.value = false;
    expect((await f.service.install()).phase).toBe("installing");
    expect(f.installer).toHaveBeenCalledOnce();
  });
  it("rejects old releases and reports the absence of an architecture package", async () => {
    const f = fixture();
    await f.service.initialize();
    f.metadata.value = envelope({ ...f.manifest, version: "0.3.5" });
    expect((await f.service.check()).error).toBe("manifest");
    f.metadata.value = envelope({
      ...f.manifest,
      artifacts: [{ ...f.manifest.artifacts[0]!, arch: "arm64" }],
    });
    expect((await f.service.check()).error).toBe("platform");
  });
});

describe("install helpers", () => {
  it("quotes Windows paths, preserves the data directory and does not change execution policy", () => {
    const script = installerScript(
      {
        platform: "win32",
        current: "C:\\Runner's app.exe",
        staged: "C:\\new.exe",
        pid: 123,
        receipt: "C:\\receipt.json",
        userData: "C:\\User's data",
        version: "0.3.7",
      },
      "fixture",
    );
    expect(script).toContain("'C:\\Runner''s app.exe'");
    expect(script).toContain("$env:SITE_RUNNER_USER_DATA = 'C:\\User''s data'");
    expect(script).not.toContain("ExecutionPolicy");
    expect(script).toContain("Wait-Process");
    expect(script).toContain("pending");
  });
  it.skipIf(process.platform !== "darwin")(
    "waits for the old app to exit, swaps a real fixture bundle and confirms the restart",
    async () => {
      const directory = root(),
        current = path.join(directory, "Runner's app.app"),
        staged = path.join(directory, "new.app"),
        receipt = path.join(directory, "receipt.json"),
        userData = path.join(directory, "data");
      mkdirSync(userData);
      writeFileSync(path.join(userData, "saved.json"), "preserved");
      for (const app of [current, staged])
        mkdirSync(path.join(app, "Contents/MacOS"), { recursive: true });
      writeFileSync(path.join(current, "old.txt"), "old version");
      writeFileSync(
        path.join(staged, "Contents/MacOS/Site Runner"),
        `#!/bin/sh\nprintf '%s' '{"success":true,"version":"0.3.7"}' > '${receipt}'\nprintf '%s' "$SITE_RUNNER_USER_DATA" > '${path.join(directory, "restarted.txt")}'\n`,
        { mode: 0o755 },
      );
      const old = spawn(
        process.execPath,
        ["-e", "setTimeout(() => {}, 10000)"],
        { stdio: "ignore" },
      );
      const plan: InstallPlan = {
        platform: "darwin",
        current,
        staged,
        pid: old.pid!,
        receipt,
        userData,
        version: "0.3.7",
      };
      const script = installerScript(plan, "fixture");
      expect(spawnSync("/bin/sh", ["-n"], { input: script }).status).toBe(0);
      const scriptPath = path.join(directory, "install.sh");
      writeFileSync(scriptPath, script);
      const installation = execute("/bin/sh", [scriptPath]);
      await new Promise((resolve) => setTimeout(resolve, 200));
      expect(readFileSync(path.join(current, "old.txt"), "utf8")).toBe(
        "old version",
      );
      old.kill();
      await installation;
      expect(
        readFileSync(path.join(current + ".backup-fixture", "old.txt"), "utf8"),
      ).toBe("old version");
      expect(JSON.parse(readFileSync(receipt, "utf8"))).toEqual({
        success: true,
        version: "0.3.7",
      });
      expect(readFileSync(path.join(directory, "restarted.txt"), "utf8")).toBe(
        userData,
      );
      expect(readFileSync(path.join(userData, "saved.json"), "utf8")).toBe(
        "preserved",
      );
    },
  );
});
