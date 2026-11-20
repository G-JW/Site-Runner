import { utilityProcess } from "electron";
import { fileURLToPath } from "node:url";
import type { BrowserInstaller } from "./browser-service.js";

export function browserInstaller(cacheDirectory: string): BrowserInstaller {
  return (progress, signal) =>
    new Promise<void>((resolve, reject) => {
      if (signal.aborted) {
        reject(new Error("Download cancelled"));
        return;
      }
      const child = utilityProcess.fork(
        fileURLToPath(new URL("./download-worker.js", import.meta.url)),
        [],
        {
          env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: cacheDirectory },
          stdio: "pipe",
          serviceName: "Site Runner Browser Download",
        },
      );
      let tail = "";
      const read = (chunk: Buffer) => {
        const text = chunk.toString();
        tail = (tail + text).slice(-2000);
        progress(
          tail
            .trim()
            .split(/[\r\n]+/)
            .at(-1) ?? "",
        );
      };
      child.stdout?.on("data", read);
      child.stderr?.on("data", read);
      const abort = () => child.kill();
      signal.addEventListener("abort", abort, { once: true });
      child.once("exit", (code) => {
        signal.removeEventListener("abort", abort);
        if (code === 0 && !signal.aborted) resolve();
        else
          reject(
            new Error(
              signal.aborted
                ? "Download cancelled"
                : tail || `Browser installer exited with code ${code}`,
            ),
          );
      });
      if (signal.aborted) abort();
    });
}
