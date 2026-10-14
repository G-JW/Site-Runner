import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  buildAutomationExample,
  type AutomationExample,
} from "../src/shared/system-automation";

const base: AutomationExample = {
  platform: "mac",
  executable: "/Applications/Site Runner.app/Contents/MacOS/Site Runner",
  userData: "/Users/test/Library/Application Support/site-runner",
  scope: "all",
  target: "",
  time: "09:05",
};

describe("system automation examples", () => {
  it.skipIf(process.platform !== "darwin")(
    "creates a valid LaunchAgent file without registering a system task",
    () => {
      const directory = mkdtempSync(
        path.join(os.tmpdir(), "site-runner-guide-"),
      );
      try {
        const example = buildAutomationExample({
          ...base,
          userData: "/tmp/O'Brien & data",
        });
        // Redirect the generated files into a fixture and omit the registration command.
        const script = example.install
          .split("launchctl bootstrap")[0]!
          .replaceAll("${HOME}", directory)
          .replaceAll("$HOME", directory);
        const result = spawnSync("/bin/sh", ["-e", "-c", script], {
          encoding: "utf8",
        });
        expect(result.status, result.stderr).toBe(0);
        const plistPath = path.join(
          directory,
          "Library/LaunchAgents/com.siterunner.daily.plist",
        );
        const parsed = spawnSync(
          "/usr/bin/plutil",
          ["-convert", "json", "-o", "-", plistPath],
          { encoding: "utf8" },
        );
        expect(parsed.status).toBe(0);
        const plist = JSON.parse(parsed.stdout);
        expect(plist.ProgramArguments).toEqual([
          base.executable,
          "--run-all",
          "--user-data",
          "/tmp/O'Brien & data",
          "--headless",
        ]);
        expect(plist.StartCalendarInterval).toEqual({ Hour: 9, Minute: 5 });
        expect(plist.StandardOutPath).toBe(
          path.join(directory, "Library/Logs/SiteRunner/daily.log"),
        );
        expect(readFileSync(plistPath, "utf8")).not.toContain("KeepAlive");
      } finally {
        rmSync(directory, { recursive: true, force: true });
      }
    },
  );
  it("keeps command arguments intact through POSIX shell parsing", () => {
    const input = {
      ...base,
      executable: "/tmp/Runner's & <app>",
      userData: "/tmp/100% 'data' $(ignored)",
      scope: "folder" as const,
      target: "folder-id",
      appPath: "/tmp/project with spaces",
    };
    const example = buildAutomationExample(input);
    // Replace only the executable with printf to inspect arguments without running tasks.
    const command = example.run.split("\n")[0]!;
    const argsStart = command.indexOf(" '/tmp/project");
    const parsed = spawnSync(
      "/bin/sh",
      ["-c", `printf '%s\\n'${command.slice(argsStart)}`],
      { encoding: "utf8" },
    );
    expect(parsed.status).toBe(0);
    expect(parsed.stdout.trim().split("\n")).toEqual([
      input.appPath,
      "--run-folder",
      "folder-id",
      "--user-data",
      input.userData,
      "--headless",
    ]);
    expect(example.install).toContain("Runner&apos;s &amp; &lt;app&gt;");
    expect(example.cron).toContain("100\\%");
    expect(
      spawnSync("/bin/sh", ["-n"], { input: example.install }).status,
    ).toBe(0);
  });

  it("generates a one-shot daily LaunchAgent without enabling the internal scheduler", () => {
    const example = buildAutomationExample(base);
    expect(example.install).toContain("<key>Hour</key><integer>9</integer>");
    expect(example.install).toContain("<key>Minute</key><integer>5</integer>");
    expect(example.install).toContain("--run-all");
    expect(example.install).not.toContain("KeepAlive");
    expect(example.disable).toContain("launchctl bootout");
    expect(example.cron).toContain("5 9 * * *");
    expect(example.cron).not.toContain("\n");
    expect(example.inspect).not.toContain("bootout");
    expect(example.test).not.toContain("bootout");
  });

  it("quotes PowerShell literals and Windows arguments separately", () => {
    const example = buildAutomationExample({
      ...base,
      platform: "windows",
      executable: "C:\\Runner's App\\Runner.exe",
      userData: "C:\\data dir\\",
      scope: "site",
      target: "task-id",
    });
    expect(example.run).toContain("& 'C:\\Runner''s App\\Runner.exe'");
    expect(example.install).toContain(
      '-Argument \'"--run-site" "task-id" "--user-data" "C:\\data dir\\\\" "--headless"\'',
    );
    expect(example.install).toContain("-LogonType Interactive");
    expect(example.install).toContain("-MultipleInstances IgnoreNew");
    expect(example.inspect).toContain("Get-ScheduledTaskInfo");
    expect(example.remove).toContain("Unregister-ScheduledTask");
  });

  it("rejects invalid drafts instead of providing incomplete commands", () => {
    for (const patch of [
      { time: "24:00" },
      { time: "9:00" },
      { executable: "" },
      { userData: "x\nPLIST" },
      { scope: "folder" as const, target: "" },
    ]) {
      expect(() => buildAutomationExample({ ...base, ...patch })).toThrow();
    }
  });
});
