// Run with Electron, not Node: only Electron virtualizes ASAR archives.
import { app } from "electron";
import fs from "node:fs";
import raw from "original-fs";
import path from "node:path";
import os from "node:os";
import assert from "node:assert/strict";

const root = raw.mkdtempSync(
  path.join(os.tmpdir(), "site-runner-asar-regression-"),
);
app.setPath("userData", path.join(root, "data"));
if (process.platform === "darwin") app.setActivationPolicy("prohibited");
app
  .whenReady()
  .then(async () => {
    const { updateFileSystem } =
      await import("../../dist/main/main/updates/filesystem.js");
    const stage = path.join(root, "staged-fixture");
    raw.mkdirSync(stage);
    raw.copyFileSync(
      path.join(process.resourcesPath, "default_app.asar"),
      path.join(stage, "app.asar"),
    );
    let legacyError = null;
    try {
      await fs.promises.rm(stage, { recursive: true, force: true });
    } catch (error) {
      legacyError = error.code;
    }
    await updateFileSystem.rm(stage, { recursive: true, force: true });
    assert.equal(raw.existsSync(stage), false);
    await raw.promises.rm(root, { recursive: true, force: true });
    console.log(
      JSON.stringify({
        asarRemoval: "passed",
        legacyError,
        electron: process.versions.electron,
      }),
    );
    app.exit(0);
  })
  .catch((error) => {
    console.error(error);
    app.exit(1);
  });
