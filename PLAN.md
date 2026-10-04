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

- [x] 检查当前仓库结构。
- [x] 检查 Git branch、remote 和 working tree。
- [x] 阅读当前 `PLAN.md`、Python 原型和已有实现记录。
- [x] 运行现有 Python smoke test。
- [x] 确认 Persistent Profile、Batch、Failure Screenshot 等原型能力仍可复现。
- [x] 记录哪些代码或 fixture 可以迁移复用。

### Verification

确认现有原型已验证能力没有被误解。

### Suggested Commit

如果本阶段没有代码修改，不需要 commit。

---

## Phase 1 — Desktop Foundation

### Tasks

- [x] 初始化或接入 Electron + React + TypeScript + Vite。
- [x] 建立 Main / Preload / Renderer 边界。
- [x] 开启 `contextIsolation`。
- [x] 关闭 Renderer `nodeIntegration`。
- [x] 建立最小应用 Shell。
- [x] 配置 Electron `userData` 路径工具。
- [x] 配置 lint、formatter、typecheck。
- [x] 配置基础 build。
- [x] 更新 `.gitignore`。

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

- [x] 引入 SQLite。
- [x] 建立轻量 migration。
- [x] 创建 Site model。
- [x] 创建 BrowserProfile model。
- [x] 创建 RunRecord model。
- [x] 创建 Settings model。
- [x] 创建 NotificationChannel model。
- [x] 建立 Main Process services。
- [x] 建立类型化 Preload IPC API。

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

- [x] Site List。
- [x] Add Site。
- [x] Edit Site。
- [x] Delete Site。
- [x] Enable / Disable。
- [x] URL。
- [x] Profile。
- [x] Timeout。
- [x] Schedule。
- [x] Monaco Editor。
- [x] AutomationContext 类型提示。
- [x] 允许无 Script 保存。

### Verification

用户无需 Terminal 即可创建完整 Site 配置。

### Suggested Commit

```text
feat: add site management and script editor
```

---

## Phase 4 — Browser Profiles

### Tasks

- [x] 创建 Browser Profile。
- [x] 删除未被引用 Profile。
- [x] Site 选择 Profile。
- [x] 使用 `userData/profiles/<id>`。
- [x] 实现 `Open Browser`。
- [x] 使用 Playwright Chromium Persistent Context。
- [x] 验证手动登录。
- [x] 验证重新打开后登录状态保留。

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

- [x] 实现 `runSite()`。
- [x] 实现 Browser / Context 生命周期。
- [x] 自动访问 Site URL。
- [x] 支持无 Script Site。
- [x] 实现 AutomationContext。
- [x] 实现 Script Runner。
- [x] Site Script 与 Renderer 隔离。
- [x] 实现 Timeout。
- [x] 实现 Site run lock。
- [x] 捕获异常。
- [x] 失败截图。
- [x] 保存 RunRecord。
- [x] 保证资源释放。

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

- [x] Site 页面提供 Run / Test。
- [x] 显示 Running 状态。
- [x] 实时日志。
- [x] 显示开始 / 结束时间。
- [x] 显示 Success / Failed。
- [x] Run History 页面。
- [x] 按 Site 筛选。
- [x] 展示 Error。
- [x] 打开 Screenshot。

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

- [x] 接入 `node-cron`。
- [x] 启动时注册 schedules。
- [x] 修改 schedule 后刷新任务。
- [x] 禁止同 Site 并发。
- [x] 实现 `runEnabledSites()`。
- [x] Batch 串行。
- [x] 单 Site 失败后继续。
- [x] 生成 BatchResult。
- [x] GUI 提供 Run All Enabled。

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

- [x] 实现 `NotificationMessage`。
- [x] 实现 `NotificationChannel`。
- [x] 实现 Notification Service。
- [x] 实现 Provider Registry。
- [x] 实现 NTFY Provider。
- [x] 实现 Generic Webhook Provider。
- [x] 支持 `normal / alert / all` Routing。
- [x] Batch 完成后最多生成一次逻辑汇总通知。
- [x] 一个逻辑通知可发送给多个已启用 Channel。
- [x] 单 Provider 失败不影响其他 Provider。
- [x] Notification failure 不改变 BatchResult。
- [x] GUI 支持添加 / 编辑 / 删除 / 启用通知 Channel。
- [x] GUI 支持 Test Notification。

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

- [x] 核心 Service 增加必要测试。
- [x] Run lock 测试。
- [x] Batch failure isolation 测试。
- [x] SQLite CRUD 测试。
- [x] Notification routing 测试。
- [x] Provider payload 测试。
- [x] Path generation 测试。
- [x] lint。
- [x] typecheck。
- [x] test。
- [x] build。
- [x] packaging。
- [x] 跨平台路径处理。
- [x] 运行数据统一迁移到 `userData`。

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

状态：已完成。

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

## Phase 11 — Built-in Script Templates（用户追加需求）

状态：已完成。

- [x] 将“脚本模板”加入独立侧栏导航，支持英文和简体中文。
- [x] 提供只打开网页、点击签到、签到结果检查、多步点击与确认、已签到跳过、表单提交六种模板。
- [x] 展示模板说明和代码，支持从模板创建站点。
- [x] 站点编辑器可选择模板，替换已有脚本前显示确认。
- [x] 模板复制为站点独立脚本，保留原有 Profile、Timeout 和 Schedule 配置方式。
- [x] 通过受控 Playwright 页面验证所有可执行模板，并验证缺少成功提示时失败。
- [x] 通过 lint、typecheck、17 项测试、build 和 macOS arm64 打包。
- [x] 打包应用界面验证：模板预览、创建站点并保存脚本、替换确认、切换为无脚本模板，以及原有站点/Profile 弹窗和中英文切换；Renderer 无错误。

---

## Phase 12 — One-shot CLI & System Scheduling（用户追加需求）

状态：已完成。

- [x] 提供 `--run-all`、`--run-site <id-or-name>`、`--list-sites`、`--help`。
- [x] 复用 GUI 数据和 Profile，支持 `--user-data`，默认无头执行，不修改 GUI 浏览器设置。
- [x] CLI 不启动桌面窗口和应用内 cron，任务结束后保存历史、发送汇总并退出。
- [x] 单站点和批量命令均遵守现有通知开关和渠道事件策略，空批次不通知，通知请求超时为 15 秒。
- [x] 输出 JSON 结果和明确退出码；同一数据目录单实例保护，避免重叠运行。
- [x] 文档提供 macOS LaunchAgent 和 Windows 任务计划程序示例；不自动注册用户系统任务。
- [x] lint、typecheck、22 项测试、build、macOS arm64 打包通过。
- [x] 打包 CLI 实测：帮助/列表自动退出、成功/失败任务、禁用站点显式运行、本地 Webhook 汇总与失败、退出码 0/1/2/3、重复启动保护、历史持久化和 GUI 设置不变。
- [x] GUI 回归验证通过，Renderer 无错误；launchd 示例通过 `plutil -lint`。

限制：Windows/Linux CLI 和 Windows 定时示例尚未在对应系统实测；系统关机时不执行任务。CLI 执行期间仍使用 Electron 和 Chromium，任务间不常驻。

---

## Phase 13 — Editable Template Library（用户追加需求）

状态：已完成。

- [x] 支持自定义模板新增、编辑、删除；默认六个模板也可以编辑或删除。
- [x] 模板名称、简介、使用说明和脚本通过类型化 IPC 保存在本地 SQLite 中，无需修改现有数据库结构。
- [x] 首次使用初始化默认六个；修改、删除及空模板库在重启后保留。
- [x] “恢复出厂模板”经确认后清除自定义及模板修改，仅恢复原始六个；不修改站点脚本和其他应用数据。
- [x] 站点编辑器同步使用当前模板库；空库时禁用模板选择，页面仍可新增和恢复。
- [x] 新增、编辑、删除、恢复及确认提示支持英文和简体中文。
- [x] 25 项测试、lint、typecheck、build 和 macOS arm64 打包通过。
- [x] 打包界面实测自定义模板 CRUD、默认模板删除、取消删除/恢复、恢复为六个、清空后操作、站点选择同步及已复制脚本不变；Renderer 无错误。
- [x] 原有站点/Profile 弹窗、模板应用和中英文切换回归通过；持久化重启和恢复不影响站点、配置、Profile、通知渠道的测试通过。

---

## Phase 14 — Portable Rules & Embedded Recorder（用户追加需求）

状态：已完成。

- [x] 明确配置为本地 SQLite；修正默认目录名称为 `site-runner`，设置页显示实际路径并支持打开目录。
- [x] 站点页可选择部分规则导出版本化 JSON；排除登录状态、Profile ID、运行记录和通知配置。
- [x] 导入先预览脚本和选择 Profile，只新增，重名自动加后缀；初始禁用、暂停定时，失败整体回滚。
- [x] “恢复出厂模板”更名为“恢复默认模板”，英文为 Restore default templates。
- [x] 脚本模板页可启动内置 Playwright Inspector；复用 Profile，结束后转换代码并预览、保存为模板。
- [x] 保留录制操作和结果断言，运行器提供 `expect`；无需系统 Node 或外部录制命令。
- [x] 录制占用 Profile，阻止同一 Profile 同时打开、删除或运行；支持取消、连续重录及应用退出清理。
- [x] 32 项测试、lint、typecheck、build 与 macOS arm64 打包验证通过。
- [x] 打包实测：录制真实按钮点击、读取并保存模板、创建站点回放成功；导出实际 JSON 并导入新增站点（文件选择使用受控路径）。
- [x] 连续两次取消真实录制后 Profile 释放且任务可运行；原有 GUI 回归通过，Renderer 无错误。

限制：Windows/Linux 录制集成尚未实测；录制会执行真实操作，代码中的输入内容需要用户检查。导出不会自动清除脚本或 URL 中手动写入的敏感文本。

---

## Phase 15 — Notification Reasons & Compact Site Editor（用户追加需求）

状态：已完成。

- [x] 批量通知列出失败站点及简短原因；每项原因最多 180 字符，去掉错误类型前缀、堆栈和冗长诊断，完整错误仍保存在运行记录。
- [x] 保持批量汇总、渠道策略及 Webhook 数据结构兼容；补充断言错误、超时、过长原因及空原因测试。
- [x] 新建／编辑站点表单压缩间距，定时开关与 Cron 同行；编辑器高度随窗口调整。
- [x] 内容区独立滚动，底部取消、保存并运行、保存站点按钮固定可见。
- [x] 33 项测试、lint、两端 typecheck、build 和 macOS arm64 打包通过。
- [x] 打包界面在 1320×840、1040×680、1040×560 下按钮无需滚动可见；展开模板选择也保持可见，Cron 保存通过，无 Renderer 错误。

---

## Phase 16 — Site Folders & Template Transfer（用户追加需求）

状态：已完成。

- [x] 数据库升级到 v2，新增文件夹及站点归属；v1 迁移保留站点、脚本、定时、运行记录、模板和 Profile。
- [x] 单层文件夹支持创建、重命名、删除；删除只移回未分类，批量移动支持失败回滚。
- [x] 全部／未分类／文件夹计数、名称与网址搜索、勾选批量移动、新建编辑归属及按当前列表运行启用站点。
- [x] 模板选择导出版本化 JSON，双语与脚本保留、本地 ID 排除；导入预览后新增、重名加后缀、不执行脚本。
- [x] 37 项测试、lint、两端 typecheck、build 和 macOS arm64 打包通过。
- [x] 打包实测文件夹增删改、批量移动、搜索、仅运行启用站点、模板 JSON 导出导入及取消文件选择；Renderer 无错误。

限制：当前提供单层文件夹；分类不改变 Cron。站点规则传输不包含文件夹，导入后可批量分类。跨平台打包尚未在 Windows/Linux 实测。

---

## Phases 17–21 — Scheduling, Results, History & Backup（用户追加需求）

状态：已完成核心实现和本地验证。

- [x] Phase 17：禁用站点停止自身 Cron；共用 Profile 的任务排队，手动浏览器与录制检查占用；定时通知开关接入结果发送。
- [x] Phase 18：文件夹统一 Cron，串行运行启用站点，防止同一文件夹重叠；按定时通知设置发送一次汇总。
- [x] Phase 19：空脚本站点可设置停留和常见验证页检查、指定元素／文字确认；旧站点保留行为，规则传输兼容；支持脚本返回成功说明。
- [x] Phase 20：保存单次日志、历史分页／筛选／详情，记录通知服务发送结果；记录存储失败不改变通知发送结果。
- [x] Phase 21：便携配置备份及原子新增导入，保留分类和双语模板、排除登录和通知密钥；数据库升级前自动生成私有 SQLite 快照。
- [x] CLI 支持按文件夹名称或 ID 运行启用站点，并可列出文件夹，供系统任务调度器调用。
- [x] 46 项测试、lint、两端 typecheck、build、macOS arm64 打包通过；打包 CLI 文件夹运行及界面回归通过，Renderer 无错误。
- [x] 打包实测真实定时文件夹：两个启用站点、一个禁用站点，产生一次本地通知；运行日志及自定义结果保存，验证页失败，配置导入与紧凑弹窗按钮可见。

限制：单站点与文件夹 Cron 独立，用户需避免重叠配置。常见拦截识别不是登录或业务成功保证。历史、截图和备份清理见 Phase 22。Windows/Linux、签名发布及 GitHub 同步仍需相应环境或仓库信息。

---

## Phase 22 — Storage Retention（用户追加完善）

状态：已完成。

- [x] 设置页提供保留天数（历史/截图默认 90 天、升级备份默认 30 天）、默认关闭的自动清理选项。
- [x] 手动清理先预览数量与文件大小，再确认；预览过期、新文件、已变化文件、保留期限变化均重新检查。
- [x] 过期运行记录及关联日志、通知记录、应用生成的截图和升级备份可清理；保留最新升级备份、近期记录引用的截图、配置和登录状态，不跟随符号链接。
- [x] 自动清理在 GUI 启动/每 24 小时、CLI 运行任务前执行；列出站点或文件夹不清理。导入配置不自动启用清理。
- [x] 最近清理时间、实际数量和文件错误可查看；数据库空闲页复用，不做阻塞式自动压缩。
- [x] 54 项测试、lint、两端 typecheck 和 build 通过；覆盖文件删除失败重试与数据库拒绝删除时的回滚。
- [x] macOS arm64 打包通过；实测双语设置、保存保留天数、预览/取消/确认、结果记录、数据保护、自动启动清理及 CLI 只在运行命令中清理，Renderer 无错误。

限制：运行服务日志使用 Phase 23 的独立轮换规则；删除不可撤销；跨平台验证和签名发布仍需对应环境。

## Phase 23 — Service Log Rotation（用户追加完善）

状态：已完成。

- [x] 服务日志按 10 MiB 在写入期间轮换，保留三份归档，退出前完成写入；无需新依赖。
- [x] 限制单条异常巨大日志，私有文件权限；不可写路径回退到标准错误，避免日志故障中断运行结果保存。
- [x] 测试轮换、归档数量、权限、JSON 完整性、已有超大日志和异常路径。
- [x] 57 项测试、lint、主进程类型检查与构建通过。

## Phase 24 — Graceful Shutdown（用户追加完善）

状态：已完成。

- [x] 正常退出显示双语收尾提示并禁止界面继续操作；反复退出不会越过收尾流程。
- [x] 停止新任务及定时触发；等待执行中任务保存结果，排队任务保存取消原因及日志；批量任务不再启动剩余站点。
- [x] 等待批量/定时汇总和测试通知的发送记录，等待正在打开的浏览器并关闭，之后才关闭数据库及日志。
- [x] Worker 未返回结果即退出（包括退出码 0）立即记录失败；硬超时等待 Worker 终止后释放 Profile。
- [x] 64 项测试、lint、两端 typecheck 和 build 通过。
- [x] macOS arm64 打包通过；实测批量/文件夹定时运行中退出、同 Profile 排队取消、测试通知中退出、通知发送中重复退出，结果及发送记录完整，Renderer 无错误。
- [x] 打包 CLI 实测 Worker 退出码 0 无结果和挂起脚本硬超时，正确保存失败记录及错误日志；服务日志轮换实测通过。

限制：收尾需等待当前任务及通知的既有超时；系统强制结束或断电不保证完成收尾。跨平台验证和签名发布仍需对应环境。

## Phase 25 — Shared Task State & Run Protection（用户追加完善）

状态：已完成。

- [x] 主进程统一提供运行状态及递增版本，区分等待/执行；各页面显示批量进度、当前站点、成功/失败及通知处理阶段，重新加载界面可恢复当前状态。
- [x] 执行中及批量等待站点禁止编辑、删除、切换启用、重复手动执行，保护其浏览器配置；界面与 IPC 双重检查，退出状态优先。
- [x] 定时触发跳过被占用站点，文件夹继续执行其余空闲站点，按实际数量通知；任务结束自动刷新站点结果及历史。
- [x] 实时日志跨页面保留 200 条，按站点筛选；每条限制 4000 字符，保存日志与展示一致。
- [x] 70 项测试、lint、两端 typecheck、build、macOS arm64 打包通过。
- [x] 打包实测跨页进度/日志、历史自动刷新、站点及 Profile 保护、页面重载后的排队状态、重复 Cron 避免重叠、文件夹部分站点可用、中英文；Renderer 无错误。
- [x] 既有界面及自动化 smoke 验证通过；最终安装包回归手动批量、文件夹定时、浏览器排队退出流程及日志轮转，通知完成后退出，Renderer 无错误。

限制：当前状态仅属于当前应用进程；界面重载会清空实时日志缓存，已保存日志可查看运行详情。不同时间的 Cron 仍独立执行，跨平台和签名发布仍需对应环境。

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
- 操作录制 GUI。（已按用户追加需求在 Phase 14 实现）
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

- [x] 产品名称为 `Site Runner`。
- [ ] GitHub Repository 使用或继续使用 `site-runner`。
- [x] 能作为 Electron 桌面应用启动。
- [x] 使用 React + TypeScript。
- [x] 使用 Playwright。
- [x] MVP 使用 Chromium。
- [x] Renderer 与 Node.js / Playwright 保持安全边界。
- [x] 可以创建、编辑、删除、启用和禁用 Site。
- [x] Site 可以保存独立 Script。
- [x] Monaco Editor 可编辑 Script。
- [x] 无 Script 的 Site 可仅访问 URL。
- [x] 可以创建多个 Browser Profile。
- [x] Profile 可以手动打开。
- [x] 手动登录状态能够持久保存。
- [x] 多个 Site 可以引用同一 Profile。
- [x] 不要求保存网站账号密码。
- [x] 可以手动 Run 单个 Site。
- [x] 可以执行真实 Playwright 操作。
- [x] Site Script 支持 Timeout。
- [x] 同一个 Site 不并发运行。
- [x] Script 失败不导致应用崩溃。
- [x] 单 Site 失败不阻断 Batch。
- [x] 失败时记录 Error。
- [x] 失败时尽可能保存 Screenshot。
- [x] 每次执行产生 RunRecord。
- [x] GUI 可以查看 Run History。
- [x] 可以配置 cron Schedule。
- [x] 可以 Run All Enabled。
- [x] Batch 正确统计 Success / Failed。
- [x] Batch 默认串行。
- [x] 通知系统不与 NTFY 写死绑定。
- [x] Notification Service 使用统一 Provider 接口。
- [x] MVP 至少支持 NTFY Provider。
- [x] MVP 至少支持 Generic Webhook Provider。
- [x] 可以配置多个 Notification Channel。
- [x] 可以按 normal / alert / all 路由通知。
- [x] 全部成功时产生 normal 级别汇总。
- [x] 任一失败时产生 alert 级别汇总。
- [x] 一次 Batch 只产生一个逻辑汇总消息。
- [x] 一个逻辑消息可以发送至多个 Channel。
- [x] 单个 Provider 失败不阻断其他 Provider。
- [x] 通知失败不修改 Automation / Batch 原始结果。
- [x] 未配置 Notification Channel 时程序正常运行。
- [x] Profile、Cookie、Token、数据库、Screenshot 不进入 Git。
- [x] lint 通过。
- [x] typecheck 通过。
- [x] 核心 test 通过。
- [x] production build 通过。
- [x] 开发平台桌面包可启动。
- [ ] GitHub 与本地主要开发状态同步。
- [x] README 与实际实现一致。

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
- 原 MVP 不提供操作录制；用户追加需求已在 Phase 14 实现内置录制。
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
Shared site templates (local editable library implemented in Phases 11 and 13)
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
