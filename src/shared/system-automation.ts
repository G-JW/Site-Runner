export type AutomationPlatform = "mac" | "windows";
export interface AutomationExample {
  platform: AutomationPlatform;
  executable: string;
  appPath?: string;
  userData: string;
  time: string;
  scope: "all" | "site" | "folder";
  target: string;
}

const shellQuote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
const psQuote = (value: string) => `'${value.replaceAll("'", "''")}'`;
const xmlEscape = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
// Windows command-line arguments follow CommandLineToArgvW quoting rules.
const windowsQuote = (value: string) =>
  `"${value.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/g, "$1$1")}"`;

export function buildAutomationExample(input: AutomationExample) {
  if (!input.executable.trim() || !input.userData.trim())
    throw new Error("paths");
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(input.time)) throw new Error("time");
  if (input.scope !== "all" && !input.target) throw new Error("target");
  if (
    [input.executable, input.userData, input.appPath ?? "", input.target].some(
      (value) => /[\r\n\0]/.test(value),
    )
  )
    throw new Error("paths");
  const args = [
    ...(input.appPath ? [input.appPath] : []),
    input.scope === "all" ? "--run-all" : `--run-${input.scope}`,
    ...(input.scope === "all" ? [] : [input.target]),
    "--user-data",
    input.userData,
    "--headless",
  ];
  const listArgs = [
    ...(input.appPath ? [input.appPath] : []),
    "--list-sites",
    "--user-data",
    input.userData,
  ];
  if (input.platform === "windows") {
    const argument = args.map(windowsQuote).join(" ");
    return {
      list: `& ${psQuote(input.executable)} ${listArgs.map(psQuote).join(" ")}`,
      run: `& ${psQuote(input.executable)} ${args.map(psQuote).join(" ")}\n$LASTEXITCODE`,
      install: `$action = New-ScheduledTaskAction -Execute ${psQuote(input.executable)} -Argument ${psQuote(argument)}\n$trigger = New-ScheduledTaskTrigger -Daily -At ${psQuote(input.time)}\n$principal = New-ScheduledTaskPrincipal -UserId ([System.Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive\n$settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -StartWhenAvailable\nRegister-ScheduledTask -TaskName 'Site Runner Daily' -Action $action -Trigger $trigger -Principal $principal -Settings $settings`,
      test: "Start-ScheduledTask -TaskName 'Site Runner Daily'",
      inspect: "Get-ScheduledTaskInfo -TaskName 'Site Runner Daily'",
      disable: "Disable-ScheduledTask -TaskName 'Site Runner Daily'",
      remove:
        "Unregister-ScheduledTask -TaskName 'Site Runner Daily' -Confirm:$false",
      cronSetup: "",
      cron: "",
      cronInspect: "",
    };
  }
  const command = [input.executable, ...args].map(shellQuote).join(" ");
  const [hour, minute] = input.time.split(":").map(Number);
  const logDir = `\${HOME}/Library/Logs/SiteRunner`;
  const plist = `\${HOME}/Library/LaunchAgents/com.siterunner.daily.plist`;
  return {
    list: [input.executable, ...listArgs].map(shellQuote).join(" "),
    run: `${command}\necho "Exit code: $?"`,
    install: `mkdir -p "$HOME/Library/LaunchAgents" "${logDir}"\ncat > "${plist}" <<'PLIST'\n<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict>\n  <key>Label</key><string>com.siterunner.daily</string>\n  <key>ProgramArguments</key><array>\n${[input.executable, ...args].map((arg) => `    <string>${xmlEscape(arg)}</string>`).join("\n")}\n  </array>\n  <key>StartCalendarInterval</key>\n  <dict><key>Hour</key><integer>${hour}</integer><key>Minute</key><integer>${minute}</integer></dict>\n</dict></plist>\nPLIST\n/usr/libexec/PlistBuddy -c "Add :StandardOutPath string $HOME/Library/Logs/SiteRunner/daily.log" "${plist}"\n/usr/libexec/PlistBuddy -c "Add :StandardErrorPath string $HOME/Library/Logs/SiteRunner/daily-error.log" "${plist}"\nplutil -lint "${plist}"\nlaunchctl bootstrap "gui/$(id -u)" "${plist}"`,
    test: 'launchctl kickstart "gui/$(id -u)/com.siterunner.daily"',
    inspect: `launchctl print "gui/$(id -u)/com.siterunner.daily"\ntail -n 50 "${logDir}/daily.log" "${logDir}/daily-error.log"`,
    disable: `launchctl bootout "gui/$(id -u)" "${plist}"`,
    remove: `rm "${plist}"`,
    cronSetup: `mkdir -p "${logDir}"\ncrontab -e`,
    cron: `${minute} ${hour} * * * ${command.replaceAll("%", "\\%")} >> "$HOME/Library/Logs/SiteRunner/cron.log" 2>&1`,
    cronInspect: "crontab -l",
  };
}
