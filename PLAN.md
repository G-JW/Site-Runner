# Site Runner — PLAN3.md

## 1. Goal

Site Runner 是一个跨平台桌面浏览器自动化工具，用于管理和执行网站签到、打卡及其他重复网页操作。

项目名称、仓库名称和产品定位继续沿用原 Site Runner：

```text
Product: Site Runner
Repository: site-runner
```

当前仓库已经通过 Python + Playwright 单文件原型验证了以下核心可行性：

- Playwright Chromium 可以正常启动和执行网页自动化。
- Persistent Browser Profile 可以保存 Cookie、LocalStorage 和登录状态。
- 用户可以首次手动登录，后续复用浏览器状态。
- 可以运行单个网站或批量串行运行多个网站。
- 单网站失败不会阻断后续网站。
- 可以记录日志并在失败时保存 Screenshot。
- 网站差异可以通过独立自动化逻辑表达。

Plan 3 不再停留在 Python 单文件原型阶段。

当前目标是在上述验证结果基础上，将 Site Runner 升级为一个**本地运行、可实际长期使用的跨平台桌面应用 MVP**。

核心设计：

- 使用 Electron + React + TypeScript 构建桌面应用。
- 使用 GUI 管理网站、Browser Profile、自动化脚本、定时任务、执行记录和通知配置。
- 使用 Playwright 执行真实 Chromium 浏览器自动化。
- 每个网站可以配置独立的 Playwright 自动化脚本。
- 使用持久化 Browser Profile，使用户首次手动登录后长期复用登录状态。
- 支持手动运行、批量运行和本地定时运行。
- 使用 SQLite 保存站点配置、Profile 元数据、运行记录和应用设置。
- GUI 内置 Monaco Editor 编辑网站自动化脚本。
- 运行失败时记录错误并尽可能保存 Screenshot。
- 批量任务结束后统一产生一次通知。
- 通知系统不得与 NTFY 写死绑定，而应支持多个 Notification Provider。

当前版本是本地桌面应用，不开发云端平台、SaaS、多用户系统或社区脚本生态。

---

## 2. Product Principles

### 2.1 核心原则

1. **自动化优先**

   Site Runner 的核心价值是稳定执行真实网站自动化，而不是构建复杂平台。

2. **本地优先**

   Browser Profile、Cookie、Session、数据库、截图和日志默认全部保存在本地。

3. **用户掌控账号登录**

   Site Runner 不要求保存网站用户名和密码。

   用户通过对应 Browser Profile 打开浏览器并手动完成登录。

4. **网站差异通过代码表达**

   不实现 Automa 风格的复杂拖拽流程编辑器。

   每个网站使用少量 Playwright 脚本表达特殊行为。

5. **简单网站保持简单**

   如果网站只需要访问 URL，不强制编写脚本。

6. **失败隔离**

   单个网站失败不得导致整个批量执行失败，也不得导致桌面应用崩溃。

7. **不过度设计**

   当前是个人使用为主的桌面 MVP，不构建分布式任务系统、复杂插件平台或企业级框架。

8. **通知可扩展但保持轻量**

   通知层使用统一 Provider 接口。

   不允许 Automation Runner、Batch Runner 或 Scheduler 直接依赖 NTFY、Telegram、Bark 等具体服务。

---

## 3. Scope & Requirements

### 3.1 网站管理

GUI 必须支持：

- 添加网站。
- 编辑网站。
- 删除网站。
- 启用 / 禁用网站。
- 查看网站最近一次运行状态。
- 手动运行网站。
- 配置 Browser Profile。
- 配置 Timeout。
- 配置 Schedule。
- 编辑自动化脚本。

Site 至少包含：

```ts
interface Site {
  id: string;
  name: string;
  url: string;
  enabled: boolean;

  script: string | null;

  browserProfileId: string;

  timeoutMs: number;

  schedule: {
    enabled: boolean;
    cron: string;
  };
}
```

约束：

- `id` 使用程序生成的稳定唯一 ID。
- 不使用网站名称作为主键。
- `script` 可以为空。
- Site 不保存用户名、密码、Cookie 或 Session。
- Site 不直接保存 Browser Profile 的绝对路径。

---

### 3.2 网站自动化脚本

网站可以配置自己的 Playwright 脚本。

Site Runner 负责：

- 创建浏览器。
- 加载 Browser Profile。
- 创建 BrowserContext。
- 创建 Page。
- 打开站点 URL。
- 生命周期管理。
- Timeout。
- 日志。
- 错误捕获。
- Screenshot。
- RunRecord。
- 资源释放。

用户脚本只负责网站自身特殊逻辑。

推荐统一形式：

```ts
export default async function run({
  page,
  log,
  config,
}: AutomationContext) {
  // site-specific automation
}
```

运行上下文：

```ts
interface AutomationContext {
  page: Page;
  log: AutomationLogger;
  config: Record<string, unknown>;
}
```

Logger：

```ts
interface AutomationLogger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}
```

第一版只暴露实际需要的 API。

不要提前设计大型 Plugin SDK。

---

### 3.3 无脚本站点

对于只需要访问 URL 即可完成操作的网站，允许 `script` 为空。

执行逻辑：

```text
Open Site URL
    ↓
Wait for basic page load
    ↓
No script
    ↓
Automation step completed
```

注意：

HTTP 200 或页面加载成功不能自动证明“签到成功”。

如果用户需要确认业务结果，应在 Site Script 中显式检查页面元素或页面状态。

---

### 3.4 Script Editor

GUI 内置 Monaco Editor。

至少支持：

- TypeScript / JavaScript 语法高亮。
- 基础编辑。
- 保存。
- 格式化。
- `AutomationContext` 类型提示。
- Playwright `Page` 常用 API 类型提示。

不实现完整 IDE。

不实现：

- Git 集成编辑器。
- Debugger IDE。
- 多文件脚本工程。
- 在线代码仓库。

---

### 3.5 Browser Profiles

支持多个持久化 Browser Profile。

示例：

```text
Default
PT
Forum
Work
```

规则：

- 一个 Site 必须关联一个 Browser Profile。
- 一个 Browser Profile 可以被多个 Site 复用。
- 每个 Browser Profile 使用独立持久化目录。
- Browser Profile 保存 Cookie、LocalStorage、Session 等浏览器状态。
- Profile 数据只保存在本地。
- Profile 数据不得进入 Git。
- Site 数据库只保存 Profile ID，不保存绝对目录。

GUI 提供：

```text
Browser Profiles
    ↓
Create Profile
    ↓
Open Browser
```

用户打开对应 Profile 后自行登录目标网站。

Site Runner 不要求用户把网站账号密码保存在程序数据库。

---

### 3.6 Browser Automation

浏览器自动化核心使用：

```text
Playwright
Chromium
```

MVP 只要求 Chromium。

架构上不要把 Site 业务逻辑与 Chromium 私有 API 过度绑定，但当前版本不提供 Firefox / WebKit UI。

单网站运行流程：

```text
Load Site
    ↓
Validate Site
    ↓
Check run lock
    ↓
Load Browser Profile
    ↓
Start Playwright
    ↓
Open persistent BrowserContext
    ↓
Create Page
    ↓
Open Site URL
    ↓
Execute Site Script if present
    ↓
Collect result
    ↓
Save RunRecord
    ↓
Close browser resources
    ↓
Release run lock
```

默认每次 Site Task 使用独立运行生命周期。

MVP 不要求多个 Site 同时共享一个活跃 BrowserContext。

---

### 3.7 Manual Run / Test

Site 编辑页面必须提供：

```text
Run / Test
```

执行时：

- 使用当前保存的 Site 配置。
- 使用指定 Browser Profile。
- 启动真实 Chromium。
- 执行 Site URL 和 Script。
- GUI 展示实时日志。
- GUI 展示运行状态。
- 最终显示执行结果。
- 保存 RunRecord。

失败时至少记录：

- Site。
- 开始时间。
- 结束时间。
- Error message。
- Stack trace（开发日志）。
- 最后页面 URL。
- Screenshot path（如果截图成功）。

---

### 3.8 Scheduling

每个 Site 可以：

- 启用 / 禁用 Schedule。
- 配置 cron 表达式。

本地 Scheduler 由 Site Runner 应用负责。

规则：

- 应用运行时才保证 Scheduler 工作。
- 应用完全退出后不保证执行定时任务。
- MVP 不实现系统级后台 daemon/service。
- 同一 Site 不允许并发运行。
- 如果该 Site 上一次任务仍在执行，新任务不并行启动。

调度实现优先：

```text
node-cron
```

无需 Redis、消息队列或复杂 Job Framework。

---

### 3.9 Batch Execution

支持：

```text
Run All Enabled
```

执行：

```text
Read enabled Sites
    ↓
Run Site A
    ↓
Run Site B
    ↓
Run Site C
    ↓
Collect results
    ↓
Build BatchResult
    ↓
Send one final notification
```

MVP 默认串行执行。

原因：

- Profile 行为更可预测。
- 日志更容易理解。
- 失败隔离更简单。
- 签到类任务没有明显并发性能需求。

任何 Site 失败：

```text
A success
B failed
C success
```

必须继续执行 C。

BatchResult：

```ts
interface BatchResult {
  startedAt: string;
  finishedAt: string;

  total: number;
  success: number;
  failed: number;

  results: SiteRunResult[];
}
```

---

### 3.10 Run History

每次运行至少保存：

```ts
interface RunRecord {
  id: string;
  siteId: string;

  startedAt: string;
  finishedAt: string;

  status: "success" | "failed";

  message: string | null;
  error: string | null;

  screenshotPath: string | null;

  trigger: "manual" | "schedule" | "batch";
}
```

GUI 必须支持：

- 查看最近运行。
- 按网站查看历史。
- 查看成功 / 失败状态。
- 查看失败原因。
- 查看时间。
- 打开失败 Screenshot。

MVP 不实现复杂日志检索平台。

---

## 4. Notification System

### 4.1 Design Goal

通知系统不得写死为 NTFY。

Automation Runner 和 Batch Runner 只产生结构化执行结果，不关心通知平台。

统一流程：

```text
Batch Runner
    ↓
BatchResult
    ↓
Notification Service
    ↓
Enabled Notification Providers
    ↓
Push Service
```

通知模块使用 Provider 模式，但保持最小实现，不建立复杂插件框架。

---

### 4.2 Notification Provider Interface

建议定义：

```ts
type NotificationLevel = "normal" | "alert";

interface NotificationMessage {
  title: string;
  body: string;
  level: NotificationLevel;
  timestamp: string;

  batch?: {
    total: number;
    success: number;
    failed: number;
    failedSites: string[];
  };
}

interface NotificationProvider {
  id: string;
  type: string;

  send(message: NotificationMessage): Promise<void>;
}
```

Provider 负责把统一 `NotificationMessage` 转换成目标平台请求。

---

### 4.3 MVP Provider Strategy

架构必须支持多个 Provider。

MVP 推荐至少实现：

```text
NTFY Provider
Generic Webhook Provider
```

原因：

- NTFY 满足当前个人使用需求。
- Generic Webhook 可以覆盖大量自建服务和第三方通知桥接。
- 两者实现成本低。
- 可以验证 Provider 抽象是否合理。

后续可按实际需求增加：

```text
Bark
Telegram Bot
Discord Webhook
Slack Webhook
Email / SMTP
PushPlus
ServerChan
Gotify
Custom HTTP Provider
```

这些不是当前 MVP 必须全部实现的功能。

不要一次性接入大量推送平台。

---

### 4.4 Notification Configuration

建议数据模型：

```ts
interface NotificationChannel {
  id: string;
  name: string;

  providerType: string;
  enabled: boolean;

  eventPolicy: "all" | "normal" | "alert";

  config: Record<string, unknown>;
}
```

示例：

```text
Daily Log
- provider: ntfy
- eventPolicy: normal

Alert
- provider: ntfy
- eventPolicy: alert

Home Webhook
- provider: webhook
- eventPolicy: all
```

允许：

- 0 个 Notification Channel。
- 1 个 Notification Channel。
- 多个 Notification Channel。

未配置通知时不影响自动化功能。

---

### 4.5 Notification Routing

默认批量运行策略：

#### 全部成功

生成：

```text
level = normal
```

发送给：

```text
eventPolicy = all
or
eventPolicy = normal
```

的已启用 Channel。

#### 至少一个失败

生成：

```text
level = alert
```

发送给：

```text
eventPolicy = all
or
eventPolicy = alert
```

的已启用 Channel。

这样可以复现原需求：

```text
全部正常
→ 普通日志频道

出现失败
→ 特殊告警频道
```

同时不依赖某一个具体通知平台。

---

### 4.6 Batch Notification

一次 Batch 默认只生成一次最终汇总通知。

通知至少包含：

- 执行时间。
- 总 Site 数。
- Success 数。
- Failed 数。
- 失败 Site 名称。
- 总体状态。

示例：

```text
Site Runner

Completed: 2026-10-01 22:30

Total: 8
Success: 7
Failed: 1

Failed:
- Example Forum
```

单 Site 的 `Run / Test` 默认不通知。

Schedule 触发的单 Site 是否通知作为设置项处理，不强制开启。

---

### 4.7 Notification Failure

任何 Notification Provider 发送失败：

- 记录日志。
- 记录 Provider 名称和错误。
- 不改变已经得到的 Automation / Batch Result。
- 不导致应用崩溃。
- 不阻止其他 Notification Provider 继续发送。

例如：

```text
NTFY failed
↓
Webhook still runs
↓
Batch remains completed
```

---

## 5. Error Handling

任何 Site Task 失败：

- 捕获异常。
- 保存失败 RunRecord。
- 尽可能保存 Screenshot。
- 正确释放 Browser / Context。
- 清理运行锁。
- 不导致 Site Runner 主应用退出。

Batch 中：

```text
Site A success
Site B failed
Site C success
```

必须：

```text
A executed
B executed
C executed
```

最终 BatchResult 为完整结果。

---

## 6. Screenshot

失败截图保存到 Electron `userData`。

建议：

```text
userData/
└── screenshots/
    └── YYYY-MM/
        └── <siteId>-<timestamp>.png
```

规则：

- 默认只有失败才截图。
- Screenshot 不存为 SQLite BLOB。
- 数据库保存相对或可解析路径。
- Screenshot 保存失败不得覆盖原始错误。
- Screenshot 不进入 Git。

---

## 7. Technology

### 7.1 Main Stack

桌面应用：

```text
Electron
React
TypeScript
Vite
```

浏览器自动化：

```text
Playwright
Chromium
```

代码编辑：

```text
Monaco Editor
```

本地数据库：

```text
SQLite
```

定时：

```text
node-cron
```

日志：

```text
pino
```

测试：

使用与现有工程适配的轻量 TypeScript 测试框架。

如果脚手架已经包含 Vitest，优先使用 Vitest。

不要为了 PLAN 强制更换现有合理测试框架。

---

### 7.2 Dependency Principle

依赖选择原则：

- 优先成熟。
- 优先维护活跃。
- 优先简单。
- 避免功能重叠。
- 不引入大型后端框架。
- 不引入 Redis。
- 不引入消息队列。
- 不引入微服务框架。
- 不为 Provider 系统引入第三方插件框架。

---

## 8. Application Architecture

整体：

```text
┌────────────────────────────────────┐
│          React Renderer            │
│                                    │
│ Sites                              │
│ Profiles                           │
│ Script Editor                      │
│ Run History                        │
│ Scheduler Settings                 │
│ Notification Settings              │
└─────────────────┬──────────────────┘
                  │
                  │ Electron IPC
                  ▼
┌────────────────────────────────────┐
│       Electron Main Process        │
│                                    │
│ Site Service                       │
│ Profile Service                    │
│ Automation Runner                  │
│ Script Runner                      │
│ Batch Runner                       │
│ Scheduler                          │
│ Run History Service                │
│ Notification Service               │
│ Database                           │
└─────────────────┬──────────────────┘
                  │
                  ▼
┌────────────────────────────────────┐
│             Playwright             │
└─────────────────┬──────────────────┘
                  │
                  ▼
┌────────────────────────────────────┐
│              Chromium              │
└────────────────────────────────────┘
```

---

## 9. Electron Security Boundary

Renderer 不得直接获得完整 Node.js、文件系统、SQLite 或 Playwright 权限。

必须：

```ts
contextIsolation: true
nodeIntegration: false
```

通过 Preload 暴露明确 API。

例如：

```ts
window.siteRunner.sites.list()
window.siteRunner.sites.save()
window.siteRunner.sites.remove()

window.siteRunner.profiles.list()
window.siteRunner.profiles.create()
window.siteRunner.profiles.open()

window.siteRunner.runs.runSite()
window.siteRunner.runs.runEnabledSites()
window.siteRunner.runs.list()

window.siteRunner.notifications.list()
window.siteRunner.notifications.save()
window.siteRunner.notifications.test()

window.siteRunner.settings.get()
window.siteRunner.settings.update()
```

不得直接向 Renderer 暴露：

```text
ipcRenderer
fs
child_process
require
process
database instance
playwright
```

---

## 10. Process Responsibilities

### 10.1 Renderer

负责：

- 页面展示。
- Site 管理 UI。
- Browser Profile 管理 UI。
- Monaco Editor。
- Schedule 配置 UI。
- Run History UI。
- Notification Channel UI。
- Settings UI。
- 实时运行日志展示。

不得：

- 直接执行 Playwright。
- 直接访问 SQLite。
- 直接访问文件系统。
- 直接执行用户 Site Script。

---

### 10.2 Main Process

负责：

- SQLite。
- Playwright。
- Browser Profile 生命周期。
- Automation Runner。
- Batch Runner。
- Scheduler。
- Notification Service。
- 文件路径。
- Screenshot。
- 运行记录。
- IPC 服务。

---

### 10.3 Preload

只暴露最小、明确、类型化的 IPC API。

不要提供通用：

```text
invoke(channel, args)
```

给 Renderer 任意调用 Main Process。

优先为业务能力定义明确方法。

---

## 11. Automation Runner

统一入口：

```ts
runSite(siteId, trigger)
```

主要流程：

```text
load Site
    ↓
validate
    ↓
check Site run lock
    ↓
load Profile
    ↓
start Playwright
    ↓
open persistent context
    ↓
create Page
    ↓
goto Site.url
    ↓
run Site.script
    ↓
record success
```

异常：

```text
catch error
    ↓
save screenshot
    ↓
record failed RunRecord
```

finally：

```text
close resources
    ↓
release Site run lock
```

Automation Runner 不包含任何特定网站业务逻辑。

---

## 12. Script Runner

用户 Site Script 不得直接在 Renderer 中运行。

MVP 的脚本是：

```text
用户自己本地编写
+
用户自己信任
```

脚本至少要与 Renderer 隔离。

优先使用独立 Node child process 或 worker 执行脚本逻辑。

通过明确数据通道传递：

```text
execution request
logs
success
error
```

不要声称 MVP 提供针对恶意 JavaScript 的真正安全沙箱。

如果未来引入：

- 社区脚本。
- 在线脚本。
- 自动下载脚本。
- 第三方未知代码。

必须重新设计不可信代码安全隔离。

---

## 13. Profile Storage

每个 Profile 使用独立目录。

概念：

```text
Electron userData/
└── profiles/
    ├── <profile-id>/
    ├── <profile-id>/
    └── <profile-id>/
```

数据库保存：

- Profile ID。
- Profile Name。
- 创建时间。
- 其他必要元数据。

不保存 Profile 的硬编码绝对路径。

真实目录由：

```text
app.getPath("userData")
```

动态计算。

---

## 14. SQLite Data

至少包含：

```text
sites
browser_profiles
run_records
settings
notification_channels
```

如果 Batch 本身需要独立持久化，再增加：

```text
batch_runs
```

否则可以通过 RunRecord 动态汇总。

Migration 必须简单、明确。

不要为了抽象引入复杂数据库架构。

如果确实需要 ORM：

```text
Drizzle
```

是可选方案，不是强制要求。

---

## 15. Scheduler

应用启动：

```text
load scheduled Sites
    ↓
register cron jobs
```

Site schedule 修改：

```text
remove old job
    ↓
register new job
```

应用退出：

```text
stop scheduler
```

运行锁建议：

```ts
Set<string>
```

键为：

```text
siteId
```

MVP 不需要分布式锁。

---

## 16. Notification Service

Notification Service 统一负责：

```text
receive event
    ↓
build NotificationMessage
    ↓
select enabled Channels
    ↓
resolve Provider
    ↓
send
    ↓
collect delivery errors
```

推荐结构：

```text
notifications/
├── service.ts
├── types.ts
└── providers/
    ├── ntfy.ts
    └── webhook.ts
```

只在代码实际需要时创建目录和文件，不为了目录结构预创建空文件。

Provider Registry 可以保持简单：

```ts
const providers = {
  ntfy: createNtfyProvider,
  webhook: createWebhookProvider,
};
```

不要为此建立：

- 动态 npm 插件加载。
- Plugin Marketplace。
- DI Container。
- 复杂 Factory 层。
- Runtime package discovery。

未来增加 Provider 时只需要新增实现并注册。

---

## 17. Configuration & Secrets

### 17.1 General Settings

至少支持：

| Setting | Type | Default |
|---|---|---:|
| Default Timeout | number | `30000` |
| Browser Headless | boolean | `false` |
| Notification Enabled | boolean | `true` |

MVP 默认浏览器可见，方便排查网站自动化。

后续可以增加 Headless 模式。

---

### 17.2 Notification Channel Config

Notification Provider 的配置不使用单一全局 NTFY 字段。

统一保存在 Channel：

```ts
interface NotificationChannel {
  id: string;
  name: string;
  providerType: string;
  enabled: boolean;
  eventPolicy: "all" | "normal" | "alert";
  config: Record<string, unknown>;
}
```

NTFY 示例配置：

```ts
{
  serverUrl: "https://ntfy.sh",
  topic: "...",
  token: "...",
}
```

Generic Webhook 示例：

```ts
{
  url: "...",
  method: "POST",
  headers: {},
}
```

Webhook MVP 不需要实现任意脚本转换器。

优先发送固定 JSON Payload。

---

### 17.3 Sensitive Data

以下数据不得进入 Git：

- Browser Profile。
- Cookie。
- Session。
- LocalStorage。
- Notification Token。
- Webhook Secret。
- Telegram / Discord / Bark 等未来 Provider 凭据。
- SQLite 运行数据库。
- Screenshot。
- 本地日志。
- `.env`。

敏感信息不得硬编码到源代码。

MVP 可以先存储在本地应用配置。

如果现有依赖已经支持操作系统安全凭据存储，可以合理使用。

不要为了 MVP 强行构建复杂密钥系统。

---

## 18. Repository Structure

如果仓库已经存在：

> Coding Agent 必须先检查真实仓库、现有 Python 原型、Git 历史、当前依赖和工程规范。优先保留已有合理实现和验证结论，不机械删除现有内容。

目标结构示例：

```text
site-runner/
├── src/
│   ├── main/
│   │   ├── index.ts
│   │   ├── ipc/
│   │   ├── automation/
│   │   │   ├── runner.ts
│   │   │   ├── script-runner.ts
│   │   │   └── types.ts
│   │   ├── scheduler/
│   │   ├── database/
│   │   ├── profiles/
│   │   ├── notifications/
│   │   │   ├── service.ts
│   │   │   ├── types.ts
│   │   │   └── providers/
│   │   └── services/
│   │
│   ├── preload/
│   │   └── index.ts
│   │
│   ├── renderer/
│   │   ├── App.tsx
│   │   ├── pages/
│   │   ├── components/
│   │   └── lib/
│   │
│   └── shared/
│       └── types.ts
│
├── tests/
├── legacy/
│   └── site_runner.py          # 仅在迁移期间确有保留价值时使用
│
├── package.json
├── tsconfig.json
├── .gitignore
├── .env.example
├── PLAN3.md
└── README.md
```

注意：

- `legacy/` 不是强制目录。
- 如果现有 Python 原型仍有测试参考价值，可以保留。
- 如果已无价值，可以在完成迁移验证后删除。
- 不为了目录对称创建空目录。
- 只有实际存在代码时才创建对应模块。

---

## 19. Migration from Python Prototype

当前 Python `site_runner.py` 是已验证原型，不应简单视为废弃代码。

迁移时优先提取其已验证行为：

- Persistent Profile 行为。
- Playwright Chromium 启动方式。
- Manual Login 思路。
- 单 Site 失败隔离。
- Batch 串行执行。
- Timeout。
- Screenshot。
- 日志。
- Run Result 结构。
- 清理资源的行为。

迁移原则：

```text
先复现行为
再重构 UI
最后删除不再需要的旧入口
```

不得因为从 Python 转 TypeScript 而丢失已经验证通过的核心行为。

---

## 20. `.gitignore`

至少覆盖：

```gitignore
node_modules/

dist/
out/
release/

.env
.env.local

*.log

coverage/

playwright-report/
test-results/

.DS_Store

.vscode/
.idea/
```

如果任何运行数据临时产生在仓库：

```gitignore
data/
profiles/
screenshots/

*.db
*.sqlite
*.sqlite3
```

如果迁移期间仍运行 Python 原型：

```gitignore
__pycache__/
*.pyc

.venv/
venv/

.runtime/
```

运行数据最终应尽量放到 Electron `userData`。

---

## 21. Git & GitHub

项目：

```text
Site Runner
```

Repository：

```text
site-runner
```

默认使用 Git + GitHub。

如果已有仓库：

- 保留现有 remote。
- 保留现有合理 commit history。
- 保留合理 branch strategy。
- 不重新初始化 Git。
- 不覆盖用户未提交修改。

如果全新仓库：

- 初始化 Git。
- 默认主分支 `main`。
- 尽早创建 GitHub Repository。
- 初始工程可运行后 push。
- 小型个人项目直接在 `main` 开发即可。
- 按有意义阶段 commit。
- 不在最后一次性提交全部代码。

推荐 Conventional Commits。

---

## 22. Implementation Plan

## Phase 0 — Inspect Existing Prototype

### Tasks

- [ ] 检查当前仓库结构。
- [ ] 检查 Git branch、remote 和 working tree。
- [ ] 阅读当前 `PLAN.md`、Python 原型和已有实现记录。
- [ ] 运行现有 Python smoke test。
- [ ] 确认 Persistent Profile、Batch、Failure Screenshot 等原型能力仍可复现。
- [ ] 记录哪些代码或 fixture 可以迁移复用。

### Verification

确认现有原型已验证能力没有被误解。

### Suggested Commit

如果本阶段没有代码修改，不需要 commit。

---

## Phase 1 — Desktop Foundation

### Tasks

- [ ] 初始化或接入 Electron + React + TypeScript + Vite。
- [ ] 建立 Main / Preload / Renderer 边界。
- [ ] 开启 `contextIsolation`。
- [ ] 关闭 Renderer `nodeIntegration`。
- [ ] 建立最小应用 Shell。
- [ ] 配置 Electron `userData` 路径工具。
- [ ] 配置 lint、formatter、typecheck。
- [ ] 配置基础 build。
- [ ] 更新 `.gitignore`。

### Verification

```bash
npm install
npm run dev
npm run typecheck
npm run build
```

必须可运行。

### Suggested Commit

```text
chore: initialize site runner desktop app
```

---

## Phase 2 — Local Data & Core Models

### Tasks

- [ ] 引入 SQLite。
- [ ] 建立轻量 migration。
- [ ] 创建 Site model。
- [ ] 创建 BrowserProfile model。
- [ ] 创建 RunRecord model。
- [ ] 创建 Settings model。
- [ ] 创建 NotificationChannel model。
- [ ] 建立 Main Process services。
- [ ] 建立类型化 Preload IPC API。

### Verification

```text
Create Site
→ Save
→ Restart App
→ Site persists
→ Edit
→ Delete
```

Notification Channel 和 Profile 元数据同样可持久化。

### Suggested Commit

```text
feat: add local data models and persistence
```

---

## Phase 3 — Site Management UI

### Tasks

- [ ] Site List。
- [ ] Add Site。
- [ ] Edit Site。
- [ ] Delete Site。
- [ ] Enable / Disable。
- [ ] URL。
- [ ] Profile。
- [ ] Timeout。
- [ ] Schedule。
- [ ] Monaco Editor。
- [ ] AutomationContext 类型提示。
- [ ] 允许无 Script 保存。

### Verification

用户无需 Terminal 即可创建完整 Site 配置。

### Suggested Commit

```text
feat: add site management and script editor
```

---

## Phase 4 — Browser Profiles

### Tasks

- [ ] 创建 Browser Profile。
- [ ] 删除未被引用 Profile。
- [ ] Site 选择 Profile。
- [ ] 使用 `userData/profiles/<id>`。
- [ ] 实现 `Open Browser`。
- [ ] 使用 Playwright Chromium Persistent Context。
- [ ] 验证手动登录。
- [ ] 验证重新打开后登录状态保留。

### Verification

```text
Create Profile
→ Open Browser
→ Login
→ Close
→ Reopen
→ Login state persists
```

### Suggested Commit

```text
feat: add persistent browser profiles
```

---

## Phase 5 — Automation Runner

### Tasks

- [ ] 实现 `runSite()`。
- [ ] 实现 Browser / Context 生命周期。
- [ ] 自动访问 Site URL。
- [ ] 支持无 Script Site。
- [ ] 实现 AutomationContext。
- [ ] 实现 Script Runner。
- [ ] Site Script 与 Renderer 隔离。
- [ ] 实现 Timeout。
- [ ] 实现 Site run lock。
- [ ] 捕获异常。
- [ ] 失败截图。
- [ ] 保存 RunRecord。
- [ ] 保证资源释放。

### Verification

至少：

```text
1. URL only → success
2. locator click → success
3. missing locator → failed + error + screenshot
```

失败不得导致 Electron 退出。

### Suggested Commit

```text
feat: add playwright automation runner
```

---

## Phase 6 — Manual Run & Run History

### Tasks

- [ ] Site 页面提供 Run / Test。
- [ ] 显示 Running 状态。
- [ ] 实时日志。
- [ ] 显示开始 / 结束时间。
- [ ] 显示 Success / Failed。
- [ ] Run History 页面。
- [ ] 按 Site 筛选。
- [ ] 展示 Error。
- [ ] 打开 Screenshot。

### Verification

```text
Site
→ Run
→ Browser Automation
→ Live Logs
→ Result
→ History
```

### Suggested Commit

```text
feat: add manual runs and execution history
```

---

## Phase 7 — Scheduling & Batch

### Tasks

- [ ] 接入 `node-cron`。
- [ ] 启动时注册 schedules。
- [ ] 修改 schedule 后刷新任务。
- [ ] 禁止同 Site 并发。
- [ ] 实现 `runEnabledSites()`。
- [ ] Batch 串行。
- [ ] 单 Site 失败后继续。
- [ ] 生成 BatchResult。
- [ ] GUI 提供 Run All Enabled。

### Verification

```text
A success
B failed intentionally
C success
```

要求：

```text
All executed
Batch = 2 success / 1 failed
B does not block C
Same Site cannot run twice concurrently
```

### Suggested Commit

```text
feat: add scheduling and batch execution
```

---

## Phase 8 — Notification Framework

### Tasks

- [ ] 实现 `NotificationMessage`。
- [ ] 实现 `NotificationChannel`。
- [ ] 实现 Notification Service。
- [ ] 实现 Provider Registry。
- [ ] 实现 NTFY Provider。
- [ ] 实现 Generic Webhook Provider。
- [ ] 支持 `normal / alert / all` Routing。
- [ ] Batch 完成后最多生成一次逻辑汇总通知。
- [ ] 一个逻辑通知可发送给多个已启用 Channel。
- [ ] 单 Provider 失败不影响其他 Provider。
- [ ] Notification failure 不改变 BatchResult。
- [ ] GUI 支持添加 / 编辑 / 删除 / 启用通知 Channel。
- [ ] GUI 支持 Test Notification。

### Verification

至少验证：

```text
All success
→ normal Channels

Partial failure
→ alert Channels

NTFY unavailable
→ Webhook still attempts
→ Batch result unchanged

No channels configured
→ Batch works normally
```

### Suggested Commit

```text
feat: add extensible notification providers
```

---

## Phase 9 — Reliability & Packaging

### Tasks

- [ ] 核心 Service 增加必要测试。
- [ ] Run lock 测试。
- [ ] Batch failure isolation 测试。
- [ ] SQLite CRUD 测试。
- [ ] Notification routing 测试。
- [ ] Provider payload 测试。
- [ ] Path generation 测试。
- [ ] lint。
- [ ] typecheck。
- [ ] test。
- [ ] build。
- [ ] packaging。
- [ ] 跨平台路径处理。
- [ ] 运行数据统一迁移到 `userData`。

### Verification

至少：

```bash
npm test
npm run lint
npm run typecheck
npm run build
```

开发平台生成的桌面包可以启动。

### Suggested Commits

```text
test: validate core site runner workflows
```

必要时另一个：

```text
chore: prepare desktop packaging
```

---

## Phase 10 — Documentation

### Tasks

根据实际代码编写 README。

至少说明：

- Site Runner 是什么。
- 当前支持功能。
- 安装。
- 开发运行。
- Build。
- 创建 Site。
- 创建 Browser Profile。
- 手动登录。
- 编写 Playwright Site Script。
- Schedule。
- Run All。
- Run History。
- Notification Channels。
- NTFY Provider。
- Generic Webhook Provider。
- 本地数据位置。
- 脚本安全说明。
- 已知限制。
- 测试命令。

README 必须与实际实现一致。

### Suggested Commit

```text
docs: add site runner usage guide
```

---

## 23. Testing

不追求无意义覆盖率。

### Unit Tests

优先：

- Site validation。
- Cron validation。
- Batch aggregation。
- Notification routing。
- Notification message generation。
- NTFY payload。
- Generic Webhook payload。
- Settings validation。
- Run lock。
- Path generation。

### Integration Tests

重点：

```text
SQLite
↓
Site Service
↓
Automation Runner
↓
RunRecord
```

以及：

```text
Batch Runner
↓
Site failure
↓
remaining Sites continue
↓
Notification Service
```

### Playwright Smoke Tests

使用可控测试页面，不依赖真实 PT / 论坛网站。

验证：

- `page.goto`。
- locator click。
- success。
- timeout。
- locator failure。
- screenshot。
- persistent state。

不得将真实 Cookie 或登录信息加入测试。

### Manual Validation

发布前至少验证：

- Browser Profile 登录状态持久化。
- Monaco 编辑 Script。
- Manual Run。
- Run All。
- Schedule。
- Run History。
- Screenshot。
- Notification normal routing。
- Notification alert routing。
- NTFY Provider。
- Generic Webhook Provider。
- Notification Provider failure isolation。

---

## 24. GitHub Actions

允许增加最小 CI。

CI：

```text
install
lint
typecheck
test
build
```

CI 不执行：

- 用户真实 Browser Profile。
- 真实网站签到。
- PT 网站自动化。
- 真实通知发送。
- 用户私有 Webhook。

如果 Playwright 测试需要 Chromium，只安装测试所需 Chromium。

不要把实际自动签到任务迁移到 GitHub Actions。

Site Runner 当前定位仍然是本地桌面软件。

---

## 25. Non-goals

当前版本明确不实现：

- Automa 风格拖拽 Workflow。
- 云端执行。
- 云端账号。
- SaaS。
- Web 版本。
- 手机端。
- 多设备同步。
- 社区脚本市场。
- 在线脚本仓库。
- 自动下载第三方脚本。
- 不可信脚本真正安全 Sandbox。
- AI 自动生成脚本。
- AI 自动修复脚本。
- Playwright MCP。
- 操作录制 GUI。
- 浏览器 Extension。
- 多用户。
- RBAC。
- 自动托管网站用户名 / 密码。
- CAPTCHA 自动绕过。
- 验证码破解。
- 分布式任务执行。
- 高并发浏览器调度。
- Firefox / WebKit 正式支持。
- 系统级后台 Service。
- 动态第三方 Notification Plugin 安装。

---

## 26. Acceptance Criteria

MVP 完成时必须满足：

- [ ] 产品名称为 `Site Runner`。
- [ ] GitHub Repository 使用或继续使用 `site-runner`。
- [ ] 能作为 Electron 桌面应用启动。
- [ ] 使用 React + TypeScript。
- [ ] 使用 Playwright。
- [ ] MVP 使用 Chromium。
- [ ] Renderer 与 Node.js / Playwright 保持安全边界。
- [ ] 可以创建、编辑、删除、启用和禁用 Site。
- [ ] Site 可以保存独立 Script。
- [ ] Monaco Editor 可编辑 Script。
- [ ] 无 Script 的 Site 可仅访问 URL。
- [ ] 可以创建多个 Browser Profile。
- [ ] Profile 可以手动打开。
- [ ] 手动登录状态能够持久保存。
- [ ] 多个 Site 可以引用同一 Profile。
- [ ] 不要求保存网站账号密码。
- [ ] 可以手动 Run 单个 Site。
- [ ] 可以执行真实 Playwright 操作。
- [ ] Site Script 支持 Timeout。
- [ ] 同一个 Site 不并发运行。
- [ ] Script 失败不导致应用崩溃。
- [ ] 单 Site 失败不阻断 Batch。
- [ ] 失败时记录 Error。
- [ ] 失败时尽可能保存 Screenshot。
- [ ] 每次执行产生 RunRecord。
- [ ] GUI 可以查看 Run History。
- [ ] 可以配置 cron Schedule。
- [ ] 可以 Run All Enabled。
- [ ] Batch 正确统计 Success / Failed。
- [ ] Batch 默认串行。
- [ ] 通知系统不与 NTFY 写死绑定。
- [ ] Notification Service 使用统一 Provider 接口。
- [ ] MVP 至少支持 NTFY Provider。
- [ ] MVP 至少支持 Generic Webhook Provider。
- [ ] 可以配置多个 Notification Channel。
- [ ] 可以按 normal / alert / all 路由通知。
- [ ] 全部成功时产生 normal 级别汇总。
- [ ] 任一失败时产生 alert 级别汇总。
- [ ] 一次 Batch 只产生一个逻辑汇总消息。
- [ ] 一个逻辑消息可以发送至多个 Channel。
- [ ] 单个 Provider 失败不阻断其他 Provider。
- [ ] 通知失败不修改 Automation / Batch 原始结果。
- [ ] 未配置 Notification Channel 时程序正常运行。
- [ ] Profile、Cookie、Token、数据库、Screenshot 不进入 Git。
- [ ] lint 通过。
- [ ] typecheck 通过。
- [ ] 核心 test 通过。
- [ ] production build 通过。
- [ ] 开发平台桌面包可启动。
- [ ] GitHub 与本地主要开发状态同步。
- [ ] README 与实际实现一致。

---

## 27. Known Limitations

MVP 接受：

- Site Runner 未运行时 Schedule 不保证执行。
- 默认只支持 Chromium。
- 不自动处理 CAPTCHA。
- 网站 DOM 更新后可能需要修改 Script。
- 某些网站反自动化策略可能导致失败。
- Site Script 被视为用户本地可信代码。
- 不提供恶意第三方脚本安全 Sandbox。
- 不提供 AI Script Generation。
- 不提供操作录制。
- 不提供社区脚本市场。
- Notification Provider 数量有限，但架构允许以后扩展。

---

## 28. Future Ideas — Not Current Scope

仅记录方向：

```text
Playwright Codegen / Operation Recorder
AI generated Site Script
AI failure diagnosis
Playwright MCP
Site templates
Community Script repository
Script versioning
Script update
Cloud sync
System background daemon
Firefox
WebKit
More Notification Providers
Notification templates
Plugin API
Untrusted Script Sandbox
```

不得因为未来可能需要而提前搭建复杂扩展框架。

只有明显低成本且不会增加当前复杂度的设计，才需要避免主动封死未来扩展。

---

## 29. Open Questions

当前不存在阻塞编码启动的产品级 Open Question。

Coding Agent 对普通低层实现细节自行选择：

- 简单。
- 稳定。
- 易维护。
- 易测试。
- 少依赖。

只有遇到以下情况才需要明确停下来记录：

- 当前仓库已经存在与 Plan 3 冲突的核心架构。
- Electron / Playwright 当前版本有明确兼容问题。
- 用户要求执行远程或不可信脚本。
- 用户要求 Site Runner 完全退出后仍执行 Schedule。
- 用户准备开放社区脚本安装。
- Notification Provider 需要执行任意用户代码。
- 数据格式变更会破坏现有重要用户数据。

---

## 30. Agent Rules

- 开始修改前完整阅读 `PLAN3.md`。
- 首先检查实际仓库、Git 状态、已有实现、依赖和工程规范。
- 明确当前仓库是从 Site Runner Python 原型演进，而不是完全无历史的新项目。
- 保留项目名称 `Site Runner`。
- 保留仓库名称 `site-runner`，除非实际仓库已经不同。
- 不使用 `SetRunner` 名称。
- 优先复用原型已经验证的 Playwright 行为。
- 不机械保留 Python 架构。
- 最终目标是 Electron + React + TypeScript 桌面应用。
- 浏览器自动化核心使用 Playwright。
- MVP 使用 Chromium。
- 不引入 Automa。
- 不实现拖拽 Workflow。
- 不实现云服务。
- 不实现 AI 功能。
- 不实现 Playwright MCP。
- 不实现 CAPTCHA 绕过。
- 不把用户名和密码写入代码或数据库。
- 不提交 Profile、Cookie、Session、Token、SQLite 运行数据和 Screenshot。
- Renderer 与 Node / Playwright 保持安全边界。
- 不使用 `nodeIntegration: true` 简化实现。
- 不直接在 Renderer `eval` 用户 Script。
- 不声称当前 Script Runner 是恶意代码安全沙箱。
- Automation Runner 不依赖任何具体 Notification Provider。
- Batch Runner 不直接调用 NTFY API。
- Scheduler 不直接调用 NTFY API。
- 所有通知经过 Notification Service。
- NTFY 只是 Provider，不是通知架构本身。
- Provider 接口保持最小。
- 不实现动态第三方 Provider Plugin System。
- 新 Provider 通过普通代码模块增加。
- 优先实现 NTFY + Generic Webhook 作为 MVP Provider。
- 普通实现细节自行合理判断，不因小问题频繁中断。
- 不为了架构形式增加无实际价值的 Repository / Factory / Manager / DI 层。
- 不引入无明确用途依赖。
- 不做当前任务无关重构。
- 不提前开发 Future Ideas。
- 新增核心行为时增加必要测试。
- 每完成一个主要 Phase 执行对应 Verification。
- 每完成有独立意义的阶段进行 Git commit。
- 不把项目全部压成最后一个 commit。
- Commit message 描述实际改动。
- 不为了测试通过删除有效测试或降低关键验证。
- 自动化测试使用可控页面或 fixture。
- 不依赖真实 PT / 论坛账户做自动化测试。
- README 在核心功能稳定后再按实际实现编写。
- 完成后逐项检查 Acceptance Criteria。

最终报告至少包含：

- 实际完成内容。
- 未完成内容。
- 测试结果。
- Build 结果。
- Packaging 结果。
- 当前 Git branch。
- Git working tree 状态。
- 主要 commits。
- 已知限制。
- 从 Python Prototype 迁移后的处理结果。
