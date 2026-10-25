// Exercise the actual 0.3.7 GUI, including Electron filesystem behavior.
// --local uses a locally signed package; the default uses public GitHub Releases.
import { _electron, expect } from "playwright/test";
import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
  copyFileSync,
  rmSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { AppDatabase } from "../../dist/main/main/database/database.js";
import { DataService } from "../../dist/main/main/services/data-service.js";

const local = process.argv.includes("--local");
const { version } = JSON.parse(readFileSync("package.json", "utf8"));
const source = path.resolve(
  process.env.SITE_RUNNER_OLD_APP ??
    ".runtime/v037-client-check/Site Runner.app",
);
const root = mkdtempSync(path.join(os.tmpdir(), "site-runner-old-client-ui-"));
const current = path.join(root, "Site Runner.app"),
  userData = path.join(root, "data");
const output = path.resolve(".runtime/update-ui-verification");
mkdirSync(output, { recursive: true });
execFileSync("/usr/bin/ditto", [source, current]);
mkdirSync(userData);
const databasePath = path.join(userData, "site-runner.sqlite3");
const database = new AppDatabase(databasePath),
  data = new DataService(database.connection);
const profile = data.createProfile("Preserved login fixture");
const task = data.saveSite({
  name: "Preserved update task",
  url: "https://example.com",
  enabled: false,
  script: null,
  browserProfileId: profile.id,
  timeoutMs: 30000,
  schedule: { enabled: false, cron: "0 9 * * *" },
});
database.close();
const profileMarker = path.join(
  userData,
  "profiles",
  profile.id,
  "session-fixture.txt",
);
mkdirSync(path.dirname(profileMarker), { recursive: true });
writeFileSync(profileMarker, "synthetic login state");
const stale = path.join(userData, "updates/staged-legacy/app.asar");
mkdirSync(path.dirname(stale), { recursive: true });
copyFileSync(path.join(current, "Contents/Resources/default_app.asar"), stale);
let app,
  restartPID,
  succeeded = false;
try {
  app = await _electron.launch({
    executablePath: path.join(current, "Contents/MacOS/Site Runner"),
    env: { ...process.env, SITE_RUNNER_USER_DATA: userData },
  });
  const page = await app.firstWindow();
  await expect(page.getByTestId("nav-settings")).toBeVisible();
  const info = await page.evaluate(() => window.siteRunner.app.info());
  assert.equal(info.version, "0.3.7");
  if (local) {
    const envelope = JSON.parse(
      readFileSync("release/site-runner-update.json", "utf8"),
    );
    const archive = path.resolve(
      `release/Site-Runner-${version}-darwin-${process.arch}.zip`,
    );
    await app.evaluate(
      ({ net }, { envelope, archive, version }) => {
        const fs = process.getBuiltinModule("fs"),
          stream = process.getBuiltinModule("stream");
        net.fetch = async (url) => {
          const address = String(url);
          if (address.endsWith("/releases/latest"))
            return Response.json({
              tag_name: `v${version}`,
              draft: false,
              prerelease: false,
            });
          if (address.endsWith("/site-runner-update.json"))
            return Response.json(envelope);
          if (address.endsWith(".zip"))
            return new Response(
              stream.Readable.toWeb(fs.createReadStream(archive)),
            );
          throw new Error("Unexpected update request");
        };
      },
      { envelope, archive, version },
    );
  }
  await page.getByTestId("nav-settings").click();
  await page.getByTestId("check-update").click();
  await expect
    .poll(() => page.evaluate(() => window.siteRunner.updates.state()), {
      timeout: 60000,
    })
    .toMatchObject({ phase: "available", version });
  let closed = false;
  app.on("close", () => {
    closed = true;
  });
  await page.getByTestId("check-update").click();
  const receipt = path.join(userData, "updates/install-result.json");
  const deadline = Date.now() + 10 * 60_000;
  let result;
  while (Date.now() < deadline) {
    if (existsSync(receipt)) {
      result = JSON.parse(readFileSync(receipt, "utf8"));
      if (result.success === false) throw new Error("Installer rolled back");
      if (result.success) {
        restartPID = result.pid;
        break;
      }
    }
    if (!closed) {
      const state = await page
        .evaluate(() => window.siteRunner.updates.state())
        .catch(() => null);
      if (state?.phase === "error")
        throw new Error(`Old client update failed: ${JSON.stringify(state)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  assert.equal(result?.success, true);
  assert.equal(result.version, version);
  const retained = new DatabaseSync(databasePath, { readOnly: true });
  try {
    assert.equal(
      retained.prepare("SELECT name FROM sites WHERE id = ?").get(task.id).name,
      task.name,
    );
  } finally {
    retained.close();
  }
  assert.equal(readFileSync(profileMarker, "utf8"), "synthetic login state");
  // Startup confirmation precedes cleanup; allow the cache cleanup to finish.
  const cleanupDeadline = Date.now() + 30000;
  while (existsSync(stale) && Date.now() < cleanupDeadline)
    await new Promise((resolve) => setTimeout(resolve, 250));
  assert.equal(existsSync(stale), false);
  const report = {
    oldVersion: info.version,
    version,
    localTransport: local,
    actualOldClientGUI: "passed",
    downloadVerification: "passed",
    stagedBundleCleanup: "passed",
    realGUIRestart: "passed",
    taskPreservation: "passed",
    loginDirectoryPreservation: "passed",
    legacyAsarCacheCleanup: "passed",
  };
  writeFileSync(
    path.join(output, local ? "local.json" : "github.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report));
  succeeded = true;
} finally {
  if (restartPID) {
    try {
      process.kill(restartPID, "SIGTERM");
    } catch {
      /* The isolated updated app may already have exited. */
    }
  }
  if (app) await app.close().catch(() => undefined);
  if (succeeded) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    rmSync(root, { recursive: true, force: true, maxRetries: 5 });
  } else console.error(`Failed fixture retained at ${root}`);
}
