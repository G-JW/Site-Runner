# Site Runner

Site Runner 是一个本地优先的桌面浏览器自动化工具，用于管理网站签到、打卡和其他重复网页操作。应用使用 Electron、React、TypeScript、SQLite、Playwright 和 Chromium；网站配置、浏览器登录状态、运行记录、截图和日志都保存在当前设备上。

## 当前功能

- 创建、编辑、删除、启用和禁用网站。
- 为每个网站选择独立或共享的持久化 Browser Profile。
- 通过 Monaco Editor 编辑可信的本地 TypeScript 自动化脚本。
- 支持只访问 URL、不运行脚本的简单网站。
- 独立的脚本模板页面内置六种常见流程，支持自定义新增、编辑、删除、恢复默认，并可在站点编辑器中选择模板。
- 手动运行单个网站，或串行运行所有已启用网站。
- 使用 cron 表达式在应用运行期间执行本地定时任务。
- 支持命令行一次性运行，由系统任务调度器唤起，完成后退出，无需常驻应用。
- 实时显示运行日志，保存运行记录和单次日志；历史页支持分页及站点、状态、日期筛选。
- 失败时记录错误、最后页面 URL，并尽可能保存 PNG 截图。
- 批量任务完成后，按 `normal`、`alert` 或 `all` 规则发送一条汇总通知。
- 支持 NTFY 和通用 JSON Webhook；一个 Provider 失败不会中断其他 Provider。
- 支持 English 和简体中文界面，并在本地保存语言选择。

## 环境要求

- Node.js 22 或更高版本。
- pnpm 11.19。
- macOS、Windows 或 Linux 桌面环境。

安装依赖和 Playwright Chromium：

```bash
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
```

## 开发运行

```bash
pnpm dev
```

开发命令会同时启动 Vite、Main Process TypeScript 编译器和 Electron。Renderer 启用了 `contextIsolation`，关闭了 `nodeIntegration`，只通过类型化 Preload API 访问本地能力。

## 基本使用

### 1. 创建 Browser Profile 并登录

1. 打开 **Profiles**。
2. 选择 **New profile** 并输入名称。
3. 选择 **Open browser**。
4. 在打开的 Chromium 窗口中自行登录目标网站，然后关闭窗口。
5. 再次打开同一个 Profile 时，Cookie、LocalStorage 和登录状态会继续使用。

Site Runner 不要求保存网站用户名或密码。Profile 正被网站引用时不能删除。

### 2. 创建网站

打开 **Sites**，选择 **Add site**，然后配置：

- 名称和 URL。
- Browser Profile。
- 1,000–300,000 毫秒的 Timeout。
- 是否启用。
- 可选的 cron Schedule。
- 可选的自动化脚本。

脚本为空时，Site Runner 会打开 URL、等待基本页面加载并记录完成。页面能加载并不等于业务操作成功；需要确认签到结果时，应在脚本中显式检查页面状态。

站点页支持 **导出规则** 和 **导入规则**。导出时可选择部分站点，生成带版本号的 JSON，包含名称、URL、脚本、Timeout 和 Schedule；不包含数据库 ID、浏览器登录状态、运行记录或通知配置。脚本及 URL 中手动填写的敏感内容不会自动移除，分享前请检查。

导入时先预览脚本、选择站点并指定已有的 Browser Profile。导入只新增，不覆盖；重名自动加数字后缀。导入后的站点默认禁用、定时暂停，cron 表达式保留。完成登录并检查脚本后再启用；导入失败会整体回滚。

### 在应用中录制操作

在 **脚本模板 → 录制网页操作** 中填写 URL、选择已经登录的 Browser Profile，并点击 **开始录制**。应用使用自带的 Playwright 和 Chromium 打开网页及 Inspector，无需安装系统 Node 或运行终端命令。

在录制浏览器中按实际流程操作，也可以用 Inspector 录制可见性、文字等断言。完成后点击应用里的 **结束录制并创建模板**，或先关闭录制浏览器再读取。应用会去掉测试框架外壳，将操作及断言转换为 Site Runner 的 `run` 函数；检查代码、填写名称后保存，再用模板创建站点。

录制会执行真实点击和表单提交。建议先通过 Profiles 登录，避免将密码录入录制代码；生成的代码需要检查，也可能需要添加“已签到时跳过”或结果验证。**放弃录制** 会关闭录制器并删除临时录制文件。录制期间该 Profile 不能同时打开、删除或运行任务；其他 Profile 不受此限制。退出应用会关闭录制辅助进程。

录制原始代码临时保存在本地数据目录的 `recordings/session-*/` 下，读取成功或放弃时清理；保存后的模板存入 SQLite。当前录制和回放已在 macOS arm64 打包环境实测，Windows/Linux 仍需对应平台验证。定位与录制方法可参考 [Playwright 官方录制器文档](https://playwright.dev/docs/codegen)。

### 3. 编写网站脚本

可以打开侧栏的 **脚本模板 / Script templates**，查看说明和代码，再点击 **使用此模板创建站点**。也可以在站点编辑器中点击 **选择模板**。内置模板包括：

- 只打开网页（保持脚本为空）。
- 点击签到按钮。
- 签到并检查成功提示。
- 多步点击与弹窗确认。
- 已签到时跳过。
- 填写表单并提交。

模板库支持 **新增模板**、**编辑** 和 **删除**，默认模板也可以修改或删除。新增时填写名称、简介、使用说明和 TypeScript 脚本；脚本留空表示只打开网页。名称和说明按当前界面语言编辑，新模板初始在两种语言下使用相同文本。所有改动保存在本地数据库，重启后保留；可以将模板全部删除，空模板库也会保留。

点击 **恢复默认模板** 并确认，会删除自定义模板和已有模板修改，恢复原始的 6 个模板。此操作只重置模板库，不清空站点、浏览器配置、登录状态、运行记录、通知或设置。

除只打开网页外，模板中的按钮名称、提示文字和输入内容都需要按目标网站调整。模板会复制到该站点的脚本中，之后可以独立编辑；修改、删除或恢复模板不会改变已有站点脚本，替换站点脚本前需要确认。站点编辑器的模板列表同步使用当前模板库。所有模板共用站点的 Timeout 设置和 Browser Profile，不会自动识别网站操作或代替手动登录。

脚本必须默认导出一个异步函数：

```ts
export default async function run({ page, log, config }: AutomationContext) {
  log.info('Checking current state');

  const button = page.getByRole('button', { name: '签到' });
  await button.click();

  if (!(await page.getByText('签到成功').isVisible())) {
    throw new Error('Success message was not shown');
  }
}
```

Site Runner 负责创建和关闭 Browser Context、打开网站 URL、应用 Timeout、记录日志、捕获错误、保存截图和 RunRecord。脚本获得 `page`、`log` 和当前预留为空对象的 `config`。Monaco Editor 提供常用 `Page`、`Locator` 和 `AutomationContext` 类型提示及文档格式化。

脚本会作为本机可信代码执行。不要粘贴来源不明的脚本；当前版本不提供针对恶意第三方脚本的安全沙箱。

### 4. 运行和查看结果

- 在 Site 行选择 **Run** 可运行单个网站。
- 编辑 Site 时选择 **Save & run** 可保存并立即测试。
- 在 Overview 选择 **Run all enabled** 可串行运行全部已启用网站。
- 在 **Run History** 中按网站筛选记录、查看错误，并打开失败截图。

同一个 Site 不能并发运行。批量运行中一个 Site 失败后，后续 Site 仍会继续。

### 5. Schedule

编辑 Site，开启 **Schedule** 并填写标准五段 cron 表达式，例如每天 09:00：

```text
0 9 * * *
```

保存后任务会立即重新注册。Schedule 只在 Site Runner 正在运行时生效；当前版本不是系统后台服务，也不会补跑应用关闭期间错过的任务。

### 使用系统调度器，无需常驻应用

命令行模式不创建桌面窗口，不加载 Monaco/React，也不启动应用内 Schedule。默认使用无头 Chromium；执行结束、保存运行记录并完成通知后，进程退出。仍需使用 Electron 和 Chromium 执行任务，但任务间无需保留进程。

macOS 一行运行所有已启用站点（将应用路径替换为实际安装路径）：

```bash
"/Applications/Site Runner.app/Contents/MacOS/Site Runner" --run-all
```

可用参数：

```bash
"/Applications/Site Runner.app/Contents/MacOS/Site Runner" --list-sites
"/Applications/Site Runner.app/Contents/MacOS/Site Runner" --run-site "站点名称或 ID"
"/Applications/Site Runner.app/Contents/MacOS/Site Runner" --run-all --headed
"/Applications/Site Runner.app/Contents/MacOS/Site Runner" --run-all --user-data "/absolute/path/to/data"
"/Applications/Site Runner.app/Contents/MacOS/Site Runner" --help
```

默认复用 GUI 的数据目录、站点、脚本、登录 Profile 和通知配置；也支持 `SITE_RUNNER_USER_DATA` 环境变量，`--user-data` 优先级更高。`--run-site` 接受精确名称或 ID，重名时必须用 ID，显式指定的禁用站点也会执行。`--run-all` 串行执行全部启用站点，与各站点是否配置 cron 无关。

CLI 会在结束时按 Batch Notifications 和渠道事件策略发送一次汇总，单站点命令也适用；空批次不发送通知。通知请求最多等待 15 秒。标准输出为 JSON 结果；失败信息也可在运行记录和本地日志中查看。退出码：`0` 成功，`1` 任务/通知/启动失败，`2` 参数或站点无效，`3` 同一数据目录已有运行实例。CLI 的 `--headed`/`--headless` 不会修改 GUI 的设置。

同一个数据目录只能运行一个 Site Runner 实例，防止任务重叠和 Profile 冲突。使用系统定时时退出 GUI，并由登录该 Profile 的同一系统用户运行命令。

**macOS launchd 示例（每天本地时间 09:00）**

参考 [`examples/com.siterunner.daily.plist`](examples/com.siterunner.daily.plist)，先修改其中的绝对应用路径，再复制并加载：

```bash
mkdir -p ~/Library/LaunchAgents
cp examples/com.siterunner.daily.plist ~/Library/LaunchAgents/com.siterunner.daily.plist
launchctl bootstrap "gui/$(id -u)" ~/Library/LaunchAgents/com.siterunner.daily.plist
# 立即手动触发一次
launchctl kickstart "gui/$(id -u)/com.siterunner.daily"
# 停用
launchctl bootout "gui/$(id -u)" ~/Library/LaunchAgents/com.siterunner.daily.plist
```

plist 参数是独立字符串，含空格的路径无需额外引号；不要用 `open -a` 或启用 `KeepAlive`。日志位置在 plist 中配置。此示例为用户 LaunchAgent，需登录该用户；系统关机时不执行。定时机制参见 [Apple launchd 文档](https://developer.apple.com/library/archive/documentation/MacOSX/Conceptual/BPSystemStartup/Chapters/ScheduledJobs.html)。

**Windows 任务计划程序**

在任务计划程序创建每日任务，选择运行 GUI 时使用的用户；操作为“启动程序”，程序路径填实际的 `Site Runner.exe`，参数填 `--run-all`。将重复任务策略设为“不启动新实例”。先通过 GUI 完成登录并保存配置。

也可在 PowerShell 注册一个每天 09:00、用户登录后执行的任务（替换安装路径）：

```powershell
$action = New-ScheduledTaskAction -Execute 'C:\Apps\Site Runner\Site Runner.exe' -Argument '--run-all'
$trigger = New-ScheduledTaskTrigger -Daily -At '09:00'
$principal = New-ScheduledTaskPrincipal -UserId ([System.Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive
Register-ScheduledTask -TaskName 'Site Runner Daily' -Action $action -Trigger $trigger -Principal $principal
```

系统调度能力参见 [Microsoft Task Scheduler 文档](https://learn.microsoft.com/en-us/windows/win32/taskschd/task-scheduler-start-page)。当前已实测 macOS arm64 命令行执行；Windows 示例尚未在 Windows 环境实测。

### 站点文件夹与批量管理

编辑文件夹可启用统一 Cron，按系统本地时间串行运行其中的启用站点，完成后发送一次汇总（需开启 Scheduled Run Notifications 和全局通知）。同一文件夹运行未结束时不会重复启动。文件夹 Cron 与单站点 Cron 独立，请避免开启重叠的计划，以免一天重复执行。共用 Profile 的不同任务排队执行；手动打开的 Profile 需先关闭后运行。

CLI 同样支持 `--list-folders` 和 `--run-folder <ID或名称>`，可交给 launchd／任务计划程序定时运行某个文件夹，不依赖 GUI 常驻或文件夹 Cron 开关；只运行文件夹中的启用站点，完成后按批量渠道策略通知并退出。

站点页左侧提供 **全部站点**、**未分类** 和自定义文件夹，可新建、重命名、删除文件夹。当前使用单层文件夹，每个站点属于一个文件夹；已有站点自动保留在未分类。删除文件夹只解除分类，不删除站点、脚本、定时设置、登录状态或运行记录。

勾选一个或多个站点，通过 **移动到** 批量分类；新建／编辑站点也可选择文件夹，在文件夹内新建会默认归入该文件夹。搜索框按名称或网址过滤当前文件夹。**运行当前列表中的启用站点** 只运行当前文件夹和搜索结果中启用的站点，完成后发送一次批量汇总通知；分类本身不改变各站点的 Cron。站点规则导入／导出仍只包含自动化规则，导入后位于未分类，可再批量移动。

### 模板导入与导出

脚本模板页支持 **导出模板**，勾选部分或全部模板后保存版本化 JSON，包含中英文名称、描述、使用说明和脚本，不包含本地 ID。**导入模板** 先预览、勾选所需模板再确认；导入只新增，生成新 ID，重名加后缀，不覆盖现有或默认模板，也不会执行脚本。取消文件选择不改变模板库；无效文件不产生部分导入。分享前检查脚本中的密码、Token 等敏感文本；只导入可信脚本。导入文件上限 10 MB、每次 1–500 个模板。

### 空脚本访问检查与成功说明

新建站点的脚本为空时，默认停留 5 秒并识别常见安全验证页。访问检查区可调整停留时间（0–60000 毫秒），或直接填写选择器／精确文字，等待其可见，无需编写脚本。旧站点升级后保留原来的基本加载行为，可自行编辑开启这些检查。站点规则导入导出保留访问检查配置，旧规则文件仍可导入。站点总超时须为导航、停留和检查留出时间。

拦截识别使用主响应的 `cf-mitigated: challenge`、常见验证标题和标记；它是辅助检查，可能漏判或误判，可按网站关闭。基本访问不证明登录、签到或奖励成功；需要业务确认时使用指定内容检查或自定义脚本。

脚本可以 `return '今日已签到'` 或 `return { message: '签到成功' }`，说明会写入运行记录（最多 1000 字符）。正常结束仍为成功；失败必须抛出异常，`return false` 和仅写错误日志不会改变状态。

### 运行详情、通知记录与配置备份

运行记录每页 50 条，支持按站点、状态和本地日期筛选；查看详情可读取错误、最终 URL、新任务日志及打开失败截图。每次保留最后 1000 条日志，每条最多 4000 字符；旧记录没有补录日志。通知页显示最近 100 次服务发送记录，包含渠道测试；服务接受请求不代表手机已展示通知。

设置页可 **导出配置／导入配置**，包含站点、文件夹、模板、Profile 名称和偏好设置；不包含登录数据、通知渠道密钥及历史。导入先预览脚本，只新增，重名加后缀，所有导入站点和计划默认禁用；新建 Profile 需要重新登录。默认保留全局偏好，也可勾选替换。导入文件上限 10 MB，各类列表最多 500 项；任何一项失败整体回滚。

现有数据库升级前会在数据目录的 `backups/` 自动生成一致的 SQLite 快照，文件权限为仅当前用户可读写。SQLite 快照包含本地数据库里的通知凭据，应作为私有备份保管；便携 JSON 不会自动移除脚本或 URL 中手动写入的敏感文本。设置页提供可选的存储清理功能，自动清理默认关闭。

### 存储清理

在设置 → 存储清理中配置历史与截图的保留天数（默认 90 天）和升级备份保留天数（默认 30 天），范围为 1–3650 天。保存后点击「预览清理」，查看记录数量和可释放的文件大小，再确认删除。清理会删除过期运行记录及其日志、通知发送记录、过期的应用截图和升级备份；至少保留最新一份升级备份。站点、脚本、模板、通知渠道、登录配置与手动导出的 JSON 不会清理。

自动清理默认关闭，启用后在应用启动时、保持运行的每 24 小时以及命令运行任务前执行；列出站点或文件夹的命令不触发清理。启用后修改保留设置会在下一次清理时生效。设置页展示最近一次清理结果及文件删除错误；删除的记录和文件不能撤销。配置导入可以恢复保留天数，但不会自动启用清理。

文件清理仅识别应用生成的截图和升级备份名称，不跟随符号链接；近期记录引用的截图、预览后变化的文件和新增数据会被保留。预览有效期为 10 分钟，执行前会再次检查。数据库删除后的空间留给后续记录复用，不自动执行可能阻塞任务的压缩操作，因此数据库文件大小不一定立即缩小。

### 服务日志轮换

服务日志 `logs/site-runner.log` 写到 10 MiB 时轮换，最多保留 `.1`–`.3` 三份归档；运行过程中即可轮换，退出时完成日志写入。已有超大日志会在下一次写入时归档，之后随轮换淘汰。单条超过上限的服务日志会用大小提示替代，文件使用仅当前用户可读写的权限。无法写入日志时会回退到标准错误输出，不阻断自动化结果的保存。数据库中的单次运行日志仍按设置页的保留天数清理。

### 退出应用

正常退出时会显示收尾提示，停止新的自动化任务和定时触发，等待已开始的任务完成并保存结果，再等待汇总通知及正在发送的测试通知、关闭浏览器、完成服务日志写入，最后关闭数据库。批量任务不再开始后续站点，汇总只统计本次实际尝试的任务；已进入浏览器配置排队的任务会保存为失败记录，原因是应用退出导致取消。

退出可能需要等待当前站点设置的超时时间及通知请求超时；重复点击退出不会提前关闭数据库。在 macOS 上关闭主窗口仍保持后台运行，使用菜单「退出」或 ⌘Q 才会触发完整退出。系统强制结束、断电等无法保证完成收尾。

### 6. Notification Channels

打开 **Notifications**，可以创建多个 Channel，并选择事件策略：

- `normal`：仅接收全部成功的批量汇总。
- `alert`：仅接收至少一个 Site 失败的批量汇总。
- `all`：接收两种汇总。

NTFY 配置包含 Server URL、Topic 和可选 Access Token。默认 Server URL 是 `https://ntfy.sh`。

批量通知包含总数、成功数、失败数，以及每个失败站点的简短错误原因（最多 180 字符，省略堆栈和冗长的 Playwright 诊断）。完整错误和失败截图仍在运行记录中查看。错误文本来自脚本或浏览器，不会自动脱敏。

Generic Webhook 支持 `POST`、`PUT` 或 `PATCH`，以及 JSON 格式的自定义 Headers。请求体是完整的 `NotificationMessage` JSON。

选择 **Test** 可测试单个 Channel。未配置 Channel 或关闭全局通知时，自动化和批量结果仍会正常保存。

## 设置

**Settings** 页面可以在 English 和简体中文之间切换，并提供默认 Timeout、Headless Browser、Batch Notifications 和 Scheduled Run Notifications 配置。语言选择会立即生效并保存在本地。默认 Timeout 用于新建网站；Headless 设置用于后续自动化运行。Scheduled Run Notifications 控制定时任务的结果通知，仍需启用全局通知及匹配渠道。禁用站点不会执行其 Cron；共用 Profile 的任务排队执行，运行或排队期间不能手动打开或录制该 Profile。

## 本地数据

应用使用 Electron 的 `userData` 目录，实际路径见 **设置 → 本地数据**，可点击 **打开数据目录**。配置保存在 `site-runner.sqlite3`，不是单独的文本配置文件。默认目录如下（指定 `--user-data` 或环境变量时以覆盖路径为准）：

- macOS：`~/Library/Application Support/site-runner`
- Windows：`%APPDATA%/site-runner`
- Linux：`~/.config/site-runner`

其中包含：

```text
site-runner.sqlite3
profiles/<profile-id>/
screenshots/YYYY-MM/
logs/site-runner.log
```

Notification Token 和 Webhook Header 保存在本地 SQLite 配置中，当前版本不额外加密。请保护操作系统账号和本地数据目录，不要将数据库、Profile、截图或日志提交到 Git。

## 检查、构建和打包

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm package
```

`pnpm package` 会准备随应用分发的 Chromium，并在 `release/` 生成当前平台的未安装应用包。`pnpm package:dist` 使用 electron-builder 生成当前平台配置的分发目标。当前仓库已在 Apple Silicon macOS 上验证应用包启动和真实打包态 Playwright 自动化；Windows 与 Linux 配置需要分别在对应系统上验证。

完整测试包含 SQLite CRUD、运行锁、批量失败隔离、通知路由和 Payload、路径生成、真实 Chromium 操作、失败截图、Profile 状态持久化、脚本模板和 CLI 参数及执行行为。测试页面均为本地可控内容，不包含真实账号、Cookie 或 Token。

## 已知限制

- MVP 只支持 Chromium。
- 应用内 Schedule 需要应用保持运行；无需常驻时可使用 CLI 配合系统任务调度器。
- 不自动处理 CAPTCHA 或网站反自动化策略。
- 网站 DOM 更新后可能需要修改脚本。
- 支持 Playwright 操作录制；不提供 AI 脚本生成、社区脚本市场或云端同步。
- macOS 包当前未签名并使用默认应用图标。
- Monaco 和 Chromium 会使桌面包体积较大。

仓库根目录中的 `site_runner.py` 和 `requirements.txt` 是早期 Python 可行性原型，桌面 MVP 的入口和后续开发均位于 Electron 应用中。
