// Real macOS bundle replacement and GUI restart, using a signed local artifact.
// No real user profiles, application installation or system scheduling are touched.
import { fork } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
} from "node:fs";
import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { UpdateService } from "../../dist/main/main/updates/update-service.js";
import { AppDatabase } from "../../dist/main/main/database/database.js";
import { DataService } from "../../dist/main/main/services/data-service.js";

const script = fileURLToPath(import.meta.url);
const worker = process.argv[2] === "--worker";
if (worker) {
  const [directory, archive, manifestFile] = process.argv.slice(3);
  const userData = path.join(directory, "data"),
    current = path.join(directory, "Site Runner.app");
  const envelope = JSON.parse(readFileSync(manifestFile, "utf8"));
  const manifest = JSON.parse(Buffer.from(envelope.payload, "base64"));
  const transport = async (url) => {
    if (String(url).endsWith("/releases/latest"))
      return Response.json({
        tag_name: `v${manifest.version}`,
        draft: false,
        prerelease: false,
      });
    if (String(url).endsWith("site-runner-update.json"))
      return Response.json(envelope);
    return new Response(Readable.toWeb(createReadStream(archive)));
  };
  const updates = new UpdateService({
    currentVersion: "0.3.7",
    platform: "darwin",
    arch: process.arch,
    packaged: true,
    executable: path.join(current, "Contents/MacOS/Site Runner"),
    userData,
    fetch: transport,
    isBusy: () => false,
    beforeInstall: async () => undefined,
    quit: () => process.exit(0),
    logError: (stage, error) => console.error(stage, error),
  });
  await updates.initialize();
  assert.equal((await updates.check()).phase, "available");
  assert.equal((await updates.download()).phase, "ready");
  const result = await updates.install();
  throw new Error(`Installer did not restart: ${JSON.stringify(result)}`);
} else {
  assert.equal(process.platform, "darwin");
  const { version } = JSON.parse(readFileSync("package.json", "utf8"));
  const archive = path.resolve(
    `release/Site-Runner-${version}-darwin-${process.arch}.zip`,
  );
  const manifestFile = path.resolve("release/site-runner-update.json");
  assert.ok(existsSync(archive));
  assert.ok(existsSync(manifestFile));
  const directory = mkdtempSync(
    path.join(os.tmpdir(), "site-runner-update-e2e-"),
  );
  const userData = path.join(directory, "data"),
    receipt = path.join(userData, "updates/install-result.json");
  mkdirSync(userData);
  const databasePath = path.join(userData, "site-runner.sqlite3");
  const database = new AppDatabase(databasePath);
  const data = new DataService(database.connection);
  const profile = data.createProfile("Update fixture");
  const savedTask = data.saveSite({
    name: "Preserved task",
    url: "https://example.com",
    enabled: false,
    script: null,
    browserProfileId: profile.id,
    timeoutMs: 30000,
    schedule: { enabled: false, cron: "0 9 * * *" },
  });
  database.close();
  const profilePath = path.join(userData, "profiles", profile.id);
  mkdirSync(profilePath, { recursive: true });
  writeFileSync(
    path.join(profilePath, "fixture-session.txt"),
    "synthetic login state",
  );
  mkdirSync(path.join(directory, "Site Runner.app/Contents/MacOS"), {
    recursive: true,
  });
  writeFileSync(
    path.join(directory, "Site Runner.app/previous.txt"),
    "old fixture bundle",
  );
  writeFileSync(path.join(userData, "preserved.txt"), "synthetic user data");
  const child = fork(script, ["--worker", directory, archive, manifestFile], {
    stdio: "inherit",
  });
  await new Promise((resolve, reject) => {
    child.once("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`Worker failed: ${code}`)),
    );
    child.once("error", reject);
  });
  let result, restartPID;
  try {
    const until = Date.now() + 180_000;
    while (Date.now() < until) {
      if (existsSync(receipt)) {
        result = JSON.parse(readFileSync(receipt, "utf8"));
        if (result.success === false)
          throw new Error("Installer rolled back; inspect fixture");
        if (result.success) {
          restartPID = result.pid;
          break;
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    assert.equal(result?.success, true);
    assert.equal(result.version, version);
    assert.equal(
      readFileSync(path.join(userData, "preserved.txt"), "utf8"),
      "synthetic user data",
    );
    assert.ok(Number.isInteger(restartPID));
    const retained = new DatabaseSync(databasePath, { readOnly: true });
    try {
      assert.equal(
        retained
          .prepare("SELECT name FROM sites WHERE id = ?")
          .get(savedTask.id).name,
        "Preserved task",
      );
    } finally {
      retained.close();
    }
    assert.equal(
      readFileSync(path.join(profilePath, "fixture-session.txt"), "utf8"),
      "synthetic login state",
    );
    console.log(
      JSON.stringify({
        signedArtifact: "passed",
        macOSBundleReplacement: "passed",
        realGUIRestart: "passed",
        dataPreservation: "passed",
        localTransport: true,
        version,
        fixture: directory,
      }),
    );
  } finally {
    // PID comes only from the newly launched isolated app's startup confirmation.
    if (restartPID) {
      try {
        process.kill(restartPID, "SIGTERM");
      } catch {
        /* The isolated app may already have exited. */
      }
    }
  }
}
