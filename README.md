# Site Runner

Site Runner 是一个本地优先的桌面浏览器自动化工具，用于管理网站签到、打卡和其他重复网页操作。应用使用 Electron、React、TypeScript、SQLite、Playwright 和 Chromium；网站配置、浏览器登录状态、运行记录、截图和日志都保存在当前设备上。

## 当前功能

- 创建、编辑、删除、启用和禁用网站。
- 为每个网站选择独立或共享的持久化 Browser Profile。
- 通过 Monaco Editor 编辑可信的本地 TypeScript 自动化脚本。
- 支持只访问 URL、不运行脚本的简单网站。
- 手动运行单个网站，或串行运行所有已启用网站。
- 使用 cron 表达式在应用运行期间执行本地定时任务。
- 实时显示运行日志，并保存最近 500 条运行记录。
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

### 3. 编写网站脚本

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

### 6. Notification Channels

打开 **Notifications**，可以创建多个 Channel，并选择事件策略：

- `normal`：仅接收全部成功的批量汇总。
- `alert`：仅接收至少一个 Site 失败的批量汇总。
- `all`：接收两种汇总。

NTFY 配置包含 Server URL、Topic 和可选 Access Token。默认 Server URL 是 `https://ntfy.sh`。

Generic Webhook 支持 `POST`、`PUT` 或 `PATCH`，以及 JSON 格式的自定义 Headers。请求体是完整的 `NotificationMessage` JSON。

选择 **Test** 可测试单个 Channel。未配置 Channel 或关闭全局通知时，自动化和批量结果仍会正常保存。

## 设置

**Settings** 页面可以在 English 和简体中文之间切换，并提供默认 Timeout、Headless Browser、Batch Notifications 和 Scheduled Run Notifications 配置。语言选择会立即生效并保存在本地。默认 Timeout 用于新建网站；Headless 设置用于后续自动化运行。Scheduled Run Notifications 开关目前是预留设置，单个定时任务尚不发送通知。

## 本地数据

应用使用 Electron 的 `userData` 目录：

- macOS：`~/Library/Application Support/Site Runner`
- Windows：`%APPDATA%/Site Runner`
- Linux：`~/.config/Site Runner`

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

完整测试包含 SQLite CRUD、运行锁、批量失败隔离、通知路由和 Payload、路径生成、真实 Chromium 操作、失败截图和 Profile 状态持久化。测试页面均为本地可控内容，不包含真实账号、Cookie 或 Token。

## 已知限制

- MVP 只支持 Chromium。
- Schedule 需要应用保持运行。
- 不自动处理 CAPTCHA 或网站反自动化策略。
- 网站 DOM 更新后可能需要修改脚本。
- 不提供操作录制、AI 脚本生成、社区脚本市场或云端同步。
- macOS 包当前未签名并使用默认应用图标。
- Monaco 和 Chromium 会使桌面包体积较大。

仓库根目录中的 `site_runner.py` 和 `requirements.txt` 是早期 Python 可行性原型，桌面 MVP 的入口和后续开发均位于 Electron 应用中。
