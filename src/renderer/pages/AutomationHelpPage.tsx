import { useState } from "react";
import type { AppInfo, Site, SiteFolder } from "../../shared/types";
import {
  buildAutomationExample,
  type AutomationPlatform,
} from "../../shared/system-automation";
import { useI18n } from "../i18n";
import { PageHeader } from "../components/PageHeader";

const copy = {
  "zh-CN": {
    eyebrow: "配置指南",
    title: "本地电脑系统自动化",
    description: "让系统按时运行任务，执行结束后退出，无需常驻 Site Runner。",
    intro:
      "先在任务中配置网站、登录环境和操作，并试运行成功。应用内计划需要软件保持打开；系统自动化通过 CLI 启动一次任务，使用已保存的配置和登录状态。",
    executable: "程序完整路径",
    userData: "数据目录",
    scope: "运行范围",
    time: "每天执行时间（系统本地时间）",
    all: "全部已启用的任务",
    site: "指定任务",
    folder: "指定分组",
    target: "选择任务或分组",
    select: "请选择",
    pathNote:
      "当前平台已填入真实路径。查看其他平台时，请替换示例程序路径和数据目录；数据目录可在“数据与备份”中查看。",
    devNote:
      "当前运行的是开发版，命令包含 Electron 的项目路径。用于长期定时前，建议换成打包后的程序。",
    first: "1. 退出应用，先验证命令",
    firstNote:
      "复制后退出 Site Runner，再在终端或 PowerShell 中运行。CLI 默认无头执行；遇到登录或验证问题可将 --headless 改为 --headed 调试。",
    list: "查看任务 ID",
    run: "运行一次",
    install: "2. 配置每日系统任务",
    manage: "3. 检查、测试与停用",
    installMac: "macOS · 终端 · launchd",
    installWin: "Windows · PowerShell · 任务计划程序",
    macNote:
      "在已登录的同一用户下执行。以下命令创建每天运行的 LaunchAgent。修改时间或路径后，先用第 3 步的 bootout 停用旧计划，再重新执行第 2 步。",
    winNote:
      "在运行软件的同一用户下打开 PowerShell。计划仅在该用户登录时执行，重叠时忽略新实例，并允许错过时间后补跑。修改后先删除旧计划，再重新注册。",
    cron: "macOS：也可以使用 cron",
    cronNote:
      "launchd 与 cron 二选一。将下面的计划行加入 crontab 编辑器，保存退出；停用时在 crontab -e 中删除对应行。cron 不会补跑睡眠期间错过的任务。",
    limits: "运行条件与排查",
    limitsText:
      "计划依赖电脑开机、用户登录及网络可用，不会自动开机。GUI 与 CLI 共用数据目录时不能同时运行：执行前退出应用，否则返回退出码 3。不要同时启用多个系统计划运行同一批任务。",
    scopeNote:
      "CLI 不读取任务或分组的应用内定时时间：--run-all 运行所有启用任务，--run-folder 运行分组内启用任务，--run-site 即使任务停用也会执行。这里使用 ID，重命名不会影响计划。",
    results:
      "结果保存到“运行记录”，通知沿用批量通知配置。退出码：0 成功；1 任务、通知或启动失败；2 参数或目标错误；3 数据目录被另一实例占用。macOS 日志位于 ~/Library/Logs/SiteRunner；Windows 用 Get-ScheduledTaskInfo 查看 LastTaskResult，在“运行记录”和数据目录 logs 下查看详情。",
    windowsStatus:
      "Windows 示例依据官方文档生成，尚未在 Windows 系统实测。便携版请固定 exe 路径，避免更新后计划指向旧程序。Windows 默认计划设置可能在电池供电时跳过，可在任务计划程序的“条件”中调整。",
    testSchedule: "立即测试计划",
    inspectSchedule: "查看状态与日志",
    disableSchedule: "停用计划（修改前先执行）",
    removeSchedule: "删除计划（先停用）",
    cronOpen: "终端：打开 cron 编辑器",
    cronLine: "编辑器：添加这一行，保存后退出",
    cronInspect: "终端：查看计划",
    reference: "官方参考",
    copy: "复制",
    copied: "已复制",
    invalid: "请填写完整路径、有效时间，并选择要运行的任务或分组。",
  },
  en: {
    eyebrow: "SETUP GUIDE",
    title: "Local system automation",
    description: "Run saved tasks on a system schedule and exit when finished.",
    intro:
      "Configure the website, login session and actions first, then complete a trial run. In-app schedules require the app to stay open. System automation starts a single CLI run using your saved tasks and login sessions.",
    executable: "Full executable path",
    userData: "Data directory",
    scope: "Run scope",
    time: "Daily time (system local time)",
    all: "All enabled tasks",
    site: "One task",
    folder: "One group",
    target: "Choose a task or group",
    select: "Choose…",
    pathNote:
      "Real paths are filled in for this platform. For the other platform, replace the sample executable and data paths. Find the data directory under Data & backup.",
    devNote:
      "This is a development build. Commands include the Electron project path. Use a packaged executable for a lasting schedule.",
    first: "1. Quit the app and verify the command",
    firstNote:
      "Copy the command, quit Site Runner, then run it in Terminal or PowerShell. CLI runs headless by default; replace --headless with --headed to debug login or verification issues.",
    list: "List task IDs",
    run: "Run once",
    install: "2. Create a daily system task",
    manage: "3. Inspect, test and disable",
    installMac: "macOS · Terminal · launchd",
    installWin: "Windows · PowerShell · Task Scheduler",
    macNote:
      "Run as the same logged-in user. This creates a daily LaunchAgent. Before changing the time or paths, use bootout in step 3, then repeat step 2.",
    winNote:
      "Open PowerShell as the user who runs the app. The schedule runs only while this user is logged in, ignores overlapping instances and allows missed runs later. Delete the existing schedule before registering an updated one.",
    cron: "macOS: cron alternative",
    cronNote:
      "Choose either launchd or cron. Add the schedule line in the crontab editor, then save and exit. To disable it, remove that line with crontab -e. Cron skips runs missed during sleep.",
    limits: "Requirements and troubleshooting",
    limitsText:
      "The computer must be on, with the user logged in and network access available. This does not power on the computer. GUI and CLI cannot use the same data directory concurrently: quit the app first or CLI exits with code 3. Avoid multiple system schedules for the same tasks.",
    scopeNote:
      "CLI ignores in-app task and group schedule times. --run-all runs enabled tasks; --run-folder runs enabled tasks in a group; --run-site runs even a disabled task. These examples use IDs so renaming does not break the schedule.",
    results:
      "Results are saved in Run history; notifications use batch settings. Exit codes: 0 success; 1 task, notification or startup failure; 2 invalid argument or target; 3 another instance is using the data. macOS logs: ~/Library/Logs/SiteRunner. On Windows, inspect LastTaskResult with Get-ScheduledTaskInfo and check Run history and the data directory's logs folder.",
    windowsStatus:
      "Windows examples follow official documentation and have not been tested on Windows. Keep portable executables at a stable path after updates. Default task settings may skip runs on battery power; adjust Conditions in Task Scheduler if needed.",
    testSchedule: "Test the schedule now",
    inspectSchedule: "Inspect status and logs",
    disableSchedule: "Disable the schedule before editing",
    removeSchedule: "Remove the schedule after disabling",
    cronOpen: "Terminal: open the cron editor",
    cronLine: "Editor: add this line, then save and exit",
    cronInspect: "Terminal: inspect the schedule",
    reference: "Official reference",
    copy: "Copy",
    copied: "Copied",
    invalid:
      "Enter full paths, a valid time, and select a task or group when required.",
  },
};

function CommandBlock({
  title,
  command,
  labels,
  onError,
}: {
  title: string;
  command: string;
  labels: { copy: string; copied: string };
  onError(error: unknown): void;
}) {
  const [copied, setCopied] = useState<string | null>(null);
  return (
    <div className="guide-code">
      <div className="guide-code-head">
        <span>{title}</span>
        <button
          className="text-button"
          onClick={() => {
            void navigator.clipboard
              .writeText(command)
              .then(() => setCopied(command))
              .catch(onError);
          }}
          aria-label={`${labels.copy}: ${title}`}
        >
          {copied === command ? labels.copied : labels.copy}
        </button>
      </div>
      <pre>
        <code>{command}</code>
      </pre>
    </div>
  );
}

export function AutomationHelpPage({
  info,
  sites,
  folders,
  onError,
}: {
  info: AppInfo | null;
  sites: Site[];
  folders: SiteFolder[];
  onError(error: unknown): void;
}) {
  const { language } = useI18n();
  const labels = copy[language];
  const [platform, setPlatform] = useState<AutomationPlatform>(
    info?.platform === "win32" ? "windows" : "mac",
  );
  const [paths, setPaths] = useState<
    Record<AutomationPlatform, { executable: string; userData: string }>
  >({
    mac: {
      executable:
        info?.platform === "darwin"
          ? (info.executablePath ?? "")
          : "/Applications/Site Runner.app/Contents/MacOS/Site Runner",
      userData:
        info?.platform === "darwin"
          ? info.userDataPath
          : "/Users/YOUR_USER/Library/Application Support/site-runner",
    },
    windows: {
      executable:
        info?.platform === "win32"
          ? (info.executablePath ?? "")
          : "C:\\Apps\\Site Runner\\Site Runner.exe",
      userData:
        info?.platform === "win32"
          ? info.userDataPath
          : "C:\\Users\\YOUR_USER\\AppData\\Roaming\\site-runner",
    },
  });
  const [time, setTime] = useState("09:00");
  const [scope, setScope] = useState<"all" | "site" | "folder">("all");
  const [target, setTarget] = useState("");
  const current = paths[platform];
  const development =
    info?.cliAppPath &&
    current.executable === info.executablePath &&
    ((platform === "mac" && info.platform === "darwin") ||
      (platform === "windows" && info.platform === "win32"));
  let example: ReturnType<typeof buildAutomationExample> | undefined;
  try {
    example = buildAutomationExample({
      platform,
      ...current,
      appPath: development ? info?.cliAppPath : undefined,
      time,
      scope,
      target,
    });
  } catch {
    /* Invalid drafts render a helpful message instead of stale commands. */
  }
  const block = (title: string, command: string) => (
    <CommandBlock
      title={title}
      command={command}
      labels={labels}
      onError={onError}
    />
  );
  return (
    <>
      <PageHeader
        eyebrow={labels.eyebrow}
        title={labels.title}
        description={labels.description}
      />
      <div className="automation-guide" data-testid="automation-guide">
        <div className="automation-intro">
          <p className="section-description">{labels.intro}</p>
        </div>
        <div
          className="automation-platforms"
          role="tablist"
          aria-label={labels.title}
        >
          {(["mac", "windows"] as const).map((value) => (
            <button
              key={value}
              role="tab"
              id={`platform-${value}`}
              aria-controls="automation-platform-panel"
              aria-selected={platform === value}
              tabIndex={platform === value ? 0 : -1}
              onClick={() => setPlatform(value)}
              onKeyDown={(event) => {
                if (
                  !["ArrowLeft", "ArrowRight", "Home", "End"].includes(
                    event.key,
                  )
                )
                  return;
                event.preventDefault();
                const next =
                  event.key === "Home"
                    ? "mac"
                    : event.key === "End"
                      ? "windows"
                      : platform === "mac"
                        ? "windows"
                        : "mac";
                setPlatform(next);
                document.getElementById(`platform-${next}`)?.focus();
              }}
            >
              {value === "mac" ? "macOS" : "Windows"}
            </button>
          ))}
        </div>
        <div
          role="tabpanel"
          id="automation-platform-panel"
          aria-labelledby={`platform-${platform}`}
        >
          <div className="automation-fields">
            <label className="wide">
              {labels.executable}
              <input
                data-testid="automation-executable"
                value={current.executable}
                onChange={(event) =>
                  setPaths({
                    ...paths,
                    [platform]: { ...current, executable: event.target.value },
                  })
                }
              />
            </label>
            <label className="wide">
              {labels.userData}
              <input
                data-testid="automation-data"
                value={current.userData}
                onChange={(event) =>
                  setPaths({
                    ...paths,
                    [platform]: { ...current, userData: event.target.value },
                  })
                }
              />
            </label>
            <label>
              {labels.scope}
              <select
                data-testid="automation-scope"
                value={scope}
                onChange={(event) => {
                  setScope(event.target.value as typeof scope);
                  setTarget("");
                }}
              >
                <option value="all">{labels.all}</option>
                <option value="site">{labels.site}</option>
                <option value="folder">{labels.folder}</option>
              </select>
            </label>
            <label>
              {labels.time}
              <input
                type="time"
                data-testid="automation-time"
                value={time}
                onChange={(event) => setTime(event.target.value)}
              />
            </label>
            {scope !== "all" && (
              <label className="wide">
                {labels.target}
                <select
                  data-testid="automation-target"
                  value={target}
                  onChange={(event) => setTarget(event.target.value)}
                >
                  <option value="">{labels.select}</option>
                  {(scope === "site" ? sites : folders).map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          <p className="section-description">{labels.pathNote}</p>
          {development && (
            <p className="section-description">{labels.devNote}</p>
          )}
          {!example ? (
            <p role="status" className="guide-invalid">
              {labels.invalid}
            </p>
          ) : (
            <>
              <h2>{labels.first}</h2>
              <p className="section-description">{labels.firstNote}</p>
              {block(labels.list, example.list)}
              {block(labels.run, example.run)}
              <h2>{labels.install}</h2>
              <p className="section-description">
                {platform === "mac" ? labels.macNote : labels.winNote}
              </p>
              {block(
                platform === "mac" ? labels.installMac : labels.installWin,
                example.install,
              )}
              <h2>{labels.manage}</h2>
              {block(labels.testSchedule, example.test)}
              {block(labels.inspectSchedule, example.inspect)}
              <details>
                <summary>{labels.disableSchedule}</summary>
                {block(labels.disableSchedule, example.disable)}
                {block(labels.removeSchedule, example.remove)}
              </details>
              {platform === "mac" && (
                <details>
                  <summary>{labels.cron}</summary>
                  <p className="section-description">{labels.cronNote}</p>
                  {block(labels.cronOpen, example.cronSetup)}
                  {block(labels.cronLine, example.cron)}
                  {block(labels.cronInspect, example.cronInspect)}
                </details>
              )}
            </>
          )}
          <h2>{labels.limits}</h2>
          <p className="section-description">{labels.limitsText}</p>
          <p className="section-description">{labels.scopeNote}</p>
          <p className="section-description">{labels.results}</p>
          {platform === "windows" && (
            <p className="section-description">{labels.windowsStatus}</p>
          )}
          <p className="section-description">
            {labels.reference} ·{" "}
            <a
              className="guide-reference"
              href={
                platform === "mac"
                  ? "https://developer.apple.com/library/archive/documentation/MacOSX/Conceptual/BPSystemStartup/Chapters/ScheduledJobs.html"
                  : "https://learn.microsoft.com/en-us/powershell/module/scheduledtasks/"
              }
              target="_blank"
              rel="noreferrer"
            >
              {platform === "mac"
                ? "Apple launchd"
                : "Microsoft Task Scheduler"}
            </a>
          </p>
        </div>
      </div>
    </>
  );
}
