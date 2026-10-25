import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync } from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const { version } = JSON.parse(readFileSync("package.json", "utf8"));
const directory = path.resolve("release");
mkdirSync(directory, { recursive: true });
const run = (command, args) => {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    env: { ...process.env, CSC_IDENTITY_AUTO_DISCOVERY: "false" },
  });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(`${command} failed with exit code ${result.status}`);
};
const cli = require.resolve("electron-builder/cli.js");
// CI can skip dependency lifecycle scripts; prepare the pinned Electron runtime explicitly.
if (!existsSync(path.resolve("node_modules/electron/dist"))) {
  run(process.execPath, [
    path.join(
      path.dirname(require.resolve("electron/package.json")),
      "install.js",
    ),
  ]);
}
if (process.platform === "darwin") {
  run(process.execPath, [
    cli,
    "--mac",
    "--dir",
    `--${process.arch}`,
    "--publish",
    "never",
  ]);
  const app = path.join(
    directory,
    process.arch === "arm64" ? "mac-arm64" : "mac",
    "Site Runner.app",
  );
  const archive = path.join(
    directory,
    `Site-Runner-${version}-darwin-${process.arch}.zip`,
  );
  run("/usr/bin/ditto", [
    "-c",
    "-k",
    "--sequesterRsrc",
    "--keepParent",
    app,
    archive,
  ]);
  console.log(`Release artifact: ${path.basename(archive)}`);
} else if (process.platform === "win32") {
  run(process.execPath, [
    cli,
    "--win",
    "portable",
    "--x64",
    "--publish",
    "never",
  ]);
  const source = path.join(directory, "Site Runner.exe");
  const artifact = path.join(directory, `Site-Runner-${version}-win32-x64.exe`);
  renameSync(source, artifact);
  console.log(`Release artifact: ${path.basename(artifact)}`);
} else {
  throw new Error("Release packaging currently supports macOS and Windows.");
}
