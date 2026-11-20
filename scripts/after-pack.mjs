import { readdir, rm } from "node:fs/promises";
import path from "node:path";

// Bridge release for clients <= 0.3.8: their Electron fs cannot remove .asar
// archives from a staged bundle. Keep the Mac update tree entirely unpacked.
export default async function afterPack(context) {
  // Both headed and headless execution use the bundled full Chromium channel.
  // Keep FFmpeg for Playwright features, but exclude the duplicate headless browser.
  const resources =
    context.electronPlatformName === "darwin"
      ? path.join(context.appOutDir, "Site Runner.app/Contents/Resources")
      : path.join(context.appOutDir, "resources");
  const browsers = path.join(resources, "playwright-browsers");
  for (const name of await readdir(browsers)) {
    if (name.startsWith("chromium_headless_shell-"))
      await rm(path.join(browsers, name), { recursive: true, force: true });
  }
  if (context.electronPlatformName !== "darwin") return;
  const app = path.join(context.appOutDir, "Site Runner.app");
  await rm(path.join(app, "Contents/Resources/default_app.asar"), {
    force: true,
  });
  async function inspect(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.name.toLowerCase().endsWith(".asar"))
        throw new Error(
          `Legacy updater cannot remove ASAR archives: ${entry.name}`,
        );
      if (entry.isDirectory()) await inspect(path.join(directory, entry.name));
    }
  }
  await inspect(app);
}
