# Site Runner — PLAN.md

## 1. Goal

Site Runner 是一个用于网站自动登录和签到 / 打卡的浏览器自动化工具。

当前阶段不开发完整桌面软件，只实现一个**可直接运行的 Python 单文件原型**，验证核心方案是否可行。

最终只有一个主要程序文件：

```text
site_runner.py
```

它需要能够：

```text
启动
↓
读取网站配置
↓
使用持久化浏览器登录状态
↓
依次访问网站
↓
执行每个网站自己的签到逻辑
↓
输出成功 / 失败结果
↓
关闭浏览器
```

当前重点是验证 Playwright 作为 Site Runner 核心自动化引擎是否合适。

---

# 2. Current Scope

当前版本只做：

- Python 单文件
- Playwright
- Chromium
- 多网站配置
- 持久化登录状态
- 第一次手动登录
- 后续自动复用登录状态
- 网站自定义签到代码
- 单网站运行
- 全部网站批量运行
- 基础日志
- 基础异常处理
- 失败截图

不开发完整桌面应用。

---

# 3. Non-goals

当前明确不实现：

- Electron
- React
- Web UI
- GUI
- Monaco Editor
- SQLite
- 数据库
- 定时任务
- 后台服务
- NTFY
- AI
- Playwright MCP
- 操作录制
- 用户系统
- 云同步
- 插件系统
- 社区脚本
- Firefox / WebKit
- 复杂配置文件
- 完整脚本沙箱
- 自动输入账号密码
- CAPTCHA 自动处理

这些都等核心自动化方案验证成功后再决定是否加入。

---

# 4. Technology

使用：

```text
Python 3
Playwright for Python
Chromium
```

依赖尽量保持最少。

安装：

```bash
pip install playwright
playwright install chromium
```

不引入：

```text
Selenium
FastAPI
Flask
数据库 ORM
GUI Framework
```

---

# 5. Repository Structure

第一版保持最小结构：

```text
site-runner/
├── site_runner.py
├── requirements.txt
├── .gitignore
└── PLAN.md
```

运行过程中自动产生：

```text
.runtime/
├── browser-profile/
└── screenshots/
```

`.runtime/` 不进入 Git。

如果仓库已经存在，则 Coding Agent 应先检查现有结构，不机械重建。

---

# 6. Core Design

所有核心代码暂时写在：

```text
site_runner.py
```

不要为了所谓“架构规范”拆成多个 Python 模块。

单文件内部按以下顺序组织：

```text
imports

全局配置

数据结构

日志辅助函数

浏览器启动

网站公共辅助函数

各网站签到函数

单网站 Runner

批量 Runner

CLI

main()
```

使用函数划分职责即可，不需要建立复杂 class hierarchy。

---

# 7. Site Configuration

网站直接配置在 Python 文件中。

例如：

```python
SITES = {
    "example": {
        "name": "Example",
        "url": "https://example.com",
        "enabled": True,
        "handler": "example",
    },

    "forum": {
        "name": "Example Forum",
        "url": "https://forum.example.com",
        "enabled": True,
        "handler": "forum",
    },
}
```

当前阶段允许配置直接写在代码里。

不要为了“配置化”额外创建 YAML / JSON / TOML。

等原型验证成功后再决定配置如何外置。

---

# 8. Browser Profile

使用 Playwright Persistent Context 保存登录状态。

Profile：

```text
.runtime/browser-profile/
```

类似：

```python
context = playwright.chromium.launch_persistent_context(
    user_data_dir=".runtime/browser-profile",
    headless=False,
)
```

所有网站第一版共用一个 Browser Profile。

这样：

```text
第一次运行
↓
打开 Chromium
↓
用户手动登录各网站
↓
Cookie / LocalStorage 保存

之后运行
↓
直接使用已有登录状态
```

不在代码中保存：

- 用户名
- 密码
- Cookie 文本
- Session Token

---

# 9. Login Mode

提供：

```bash
python site_runner.py login
```

行为：

```text
启动持久化 Chromium
↓
保持浏览器开启
↓
用户自行登录需要使用的网站
↓
用户完成后退出
↓
Playwright 保存 Profile
```

程序打印明确提示：

```text
Browser opened.

Please log in to the required websites manually.

Close the browser when finished.
```

该模式不执行签到。

---

# 10. Site-specific Automation

不同网站使用不同 Python 函数。

例如：

```python
def checkin_example(page):
    page.goto("https://example.com")

    page.get_by_role(
        "button",
        name="签到"
    ).click()
```

另一个网站：

```python
def checkin_forum(page):
    page.goto("https://forum.example.com/checkin")

    button = page.get_by_text("每日签到")

    if button.is_visible():
        button.click()
```

简单网站：

```python
def visit_only(page):
    pass
```

因为 Runner 已经负责：

```python
page.goto(site["url"])
```

所以只需要访问 URL 的网站甚至无需编写额外操作。

---

# 11. Handler Mapping

使用简单映射：

```python
HANDLERS = {
    "example": checkin_example,
    "forum": checkin_forum,
}
```

运行：

```python
handler_name = site.get("handler")
handler = HANDLERS.get(handler_name)

if handler:
    handler(page)
```

不要使用：

```text
动态 import
eval
exec
插件加载
复杂反射
```

当前阶段直接 Python 函数最简单、最容易让 AI 修改。

---

# 12. Common Runner

实现：

```python
run_site(context, site_id, site)
```

基本流程：

```text
创建 Page
↓
访问 site.url
↓
执行对应 handler
↓
成功
    → 输出日志
失败
    → 捕获异常
    → 保存截图
    → 输出错误
finally
    → 关闭 Page
```

结果返回：

```python
{
    "site": "Example",
    "success": True,
    "message": "check-in completed",
}
```

失败：

```python
{
    "site": "Example",
    "success": False,
    "message": "...",
}
```

---

# 13. Batch Execution

默认：

```bash
python site_runner.py
```

等价于：

```bash
python site_runner.py run
```

执行所有：

```python
enabled == True
```

的网站。

第一版严格串行：

```text
Site A
↓
Site B
↓
Site C
```

不要并发。

原因：

- 实现简单
- 调试简单
- Profile 状态更可预测
- 多数签到任务对性能没有要求

---

# 14. Single-site Execution

支持：

```bash
python site_runner.py run example
```

只执行：

```text
example
```

方便调试某个网站。

如果 site ID 不存在：

```text
Unknown site: example
```

并正常退出。

---

# 15. Browser Mode

默认自动执行时：

```python
headless = False
```

当前阶段优先显示浏览器。

这样方便观察：

- 页面是否正确加载
- 是否已经登录
- Selector 是否正确
- 是否出现弹窗
- 为什么签到失败

等原型稳定后，再测试：

```python
headless=True
```

当前不优先追求无头运行。

---

# 16. Basic Logging

不引入日志库。

使用 Python 标准库：

```python
logging
```

日志至少包括：

```text
[INFO] Starting Site Runner
[INFO] Running Example
[INFO] Opening https://example.com
[INFO] Example completed
[ERROR] Forum failed: ...
```

最终输出汇总：

```text
================================
Site Runner Result
================================
✓ Example
✓ PT Site
✗ Forum
--------------------------------
Success: 2
Failed: 1
Total: 3
================================
```

---

# 17. Error Handling

任何一个网站失败都不能终止整个批量任务。

必须：

```python
try:
    ...
except Exception as e:
    ...
finally:
    ...
```

例如：

```text
A success
B failed
C success
```

程序必须继续执行 C。

---

# 18. Failure Screenshot

失败时保存：

```text
.runtime/screenshots/
```

文件名：

```text
<site-id>-<timestamp>.png
```

例如：

```text
forum-20261001-213522.png
```

只有失败时截图。

不需要每次成功都截图。

Screenshot 保存失败本身也不能导致程序崩溃。

---

# 19. Timeout

统一设置合理的 Playwright Timeout。

例如：

```python
DEFAULT_TIMEOUT = 30_000
```

通过：

```python
context.set_default_timeout(DEFAULT_TIMEOUT)
```

以及必要的 navigation timeout。

第一版使用统一值即可。

暂时不需要每个网站独立 timeout。

---

# 20. Example Site

项目必须包含至少一个明确的示例 Handler。

但示例不得依赖：

- 用户私人网站
- PT 账号
- 私人 Cookie

可以使用公开测试页面或者清楚标记为模板：

```python
def checkin_example(page):
    """
    Example handler.

    Replace selectors with those from the real site.
    """

    button = page.get_by_role(
        "button",
        name="签到",
    )

    button.click()
```

真实网站由用户之后逐个添加。

---

# 21. CLI

保持极简。

支持：

```bash
python site_runner.py
```

执行全部启用网站。

---

```bash
python site_runner.py run
```

执行全部启用网站。

---

```bash
python site_runner.py run <site_id>
```

运行指定网站。

---

```bash
python site_runner.py login
```

打开持久化浏览器用于手动登录。

---

```bash
python site_runner.py list
```

列出：

```text
ID          Enabled    Name
example     yes        Example
forum       yes        Example Forum
```

使用 Python：

```python
argparse
```

不要引入第三方 CLI 框架。

---

# 22. Desired Single-file Shape

`site_runner.py` 可以大致采用：

```python
# imports


# =========================================================
# Configuration
# =========================================================

SITES = {...}


# =========================================================
# Utilities
# =========================================================

def setup_logging():
    ...


def save_failure_screenshot(...):
    ...


# =========================================================
# Site Handlers
# =========================================================

def checkin_example(page):
    ...


def checkin_forum(page):
    ...


HANDLERS = {...}


# =========================================================
# Browser
# =========================================================

def open_context(...):
    ...


def login_mode(...):
    ...


# =========================================================
# Runner
# =========================================================

def run_site(...):
    ...


def run_all(...):
    ...


# =========================================================
# CLI
# =========================================================

def parse_args():
    ...


def main():
    ...


if __name__ == "__main__":
    main()
```

目标是：

> 文件虽然只有一个，但结构清晰，可以很方便地由人或 Coding Agent 修改。

---

# 23. Git & GitHub

项目名称：

```text
Site Runner
```

推荐 GitHub repository：

```text
site-runner
```

如果是新项目：

```text
git init
```

主分支：

```text
main
```

第一阶段不需要 feature branch。

建议提交：

### Commit 1

```text
chore: initialize site runner
```

内容：

- PLAN.md
- `.gitignore`
- requirements.txt
- 最基础 `site_runner.py`

---

### Commit 2

```text
feat: add persistent browser login
```

完成：

- Playwright
- persistent profile
- login command

---

### Commit 3

```text
feat: add site automation runner
```

完成：

- site config
- handler
- run
- run site
- run all
- error handling

---

### Commit 4

```text
feat: add run summary and failure screenshots
```

完成：

- logging
- screenshots
- result summary

不要等全部完成后只产生一个 commit。

---

# 24. `.gitignore`

至少：

```gitignore
__pycache__/
*.pyc

.venv/
venv/

.runtime/

.env

.DS_Store

.vscode/
.idea/
```

特别重要：

```text
.runtime/browser-profile/
```

绝不能提交。

其中可能存在：

- Cookies
- Session
- LocalStorage
- 登录信息

---

# 25. requirements.txt

保持最小：

```text
playwright
```

除非实现过程中存在明确需求，否则不要增加其他第三方依赖。

---

# 26. Implementation Plan

## Phase 1 — Minimal Playwright Runner

### Tasks

- [x] 创建项目基础文件。
- [x] 创建 `site_runner.py`。
- [x] 创建 `requirements.txt`。
- [x] 创建 `.gitignore`。
- [x] 接入 Playwright。
- [x] 启动 Chromium。
- [x] 访问一个测试网站。
- [x] 正确退出浏览器。

### Verification

执行：

```bash
python site_runner.py
```

能够正常启动 Chromium。

### Suggested Commit

```text
chore: initialize site runner
```

---

## Phase 2 — Persistent Login

### Tasks

- [x] 创建 `.runtime/browser-profile/`。
- [x] 使用 `launch_persistent_context()`。
- [x] 实现 `login` CLI。
- [x] 允许用户手动登录。
- [x] 浏览器关闭后保留登录状态。

### Verification

选择一个需要登录的普通测试网站：

```text
python site_runner.py login
↓
手动登录
↓
关闭
↓
重新运行 login
↓
仍保持登录
```

### Suggested Commit

```text
feat: add persistent browser login
```

---

## Phase 3 — Site Configuration & Handlers

### Tasks

- [x] 创建 `SITES`。
- [x] 创建网站 Handler。
- [x] 创建 `HANDLERS` mapping。
- [x] 实现无 handler 网站。
- [x] 实现 `run_site()`。
- [x] 实现指定 Site 运行。
- [x] 实现批量串行运行。

### Verification

至少建立：

```text
Site A
→ 仅访问

Site B
→ 访问 + 点击
```

两个示例流程。

### Suggested Commit

```text
feat: add configurable site automation
```

---

## Phase 4 — Reliability

### Tasks

- [x] 为每个网站捕获异常。
- [x] 单网站失败后继续执行。
- [x] 设置默认 Timeout。
- [x] 保存失败 Screenshot。
- [x] 输出运行日志。
- [x] 输出最终汇总。
- [x] 确保 Context 正确关闭。

### Verification

人为制造：

```text
Site A → success
Site B → invalid locator
Site C → success
```

最终必须：

```text
A success
B failed
C success
```

并生成 B 的 Screenshot。

### Suggested Commit

```text
feat: add error handling and run summary
```

---

# 27. Testing

当前原型不需要搭建完整测试框架。

优先使用实际 smoke test。

必须验证：

- [x] Playwright 可以启动。
- [x] Profile 可以保存登录状态。
- [x] 单网站可以执行。
- [x] 多网站可以串行执行。
- [x] 点击操作可以执行。
- [x] 无 Handler 网站可以执行。
- [x] 不存在的 selector 会进入失败处理。
- [x] 一个网站失败不会阻断其他网站。
- [x] Failure Screenshot 可以生成。
- [x] 浏览器资源最终正确释放。

当前不追求：

- coverage
- 大量 unit test
- CI browser test
- Mock Playwright

---

# 28. Acceptance Criteria

第一阶段 Site Runner 原型完成必须满足：

- [x] 项目名称为 `Site Runner`。
- [x] 核心程序只有一个 `site_runner.py`。
- [x] `site_runner.py` 可以直接运行。
- [x] 使用 Python Playwright。
- [x] 使用 Chromium。
- [x] 浏览器运行时默认可见。
- [x] 支持 persistent browser profile。
- [x] 支持第一次手动登录。
- [x] 后续运行可以复用登录状态。
- [x] 不在代码中保存账号密码。
- [x] 支持配置多个网站。
- [x] 每个网站可以拥有自己的 Python Handler。
- [x] 只需要访问 URL 的网站无需 Handler。
- [x] 支持运行单个网站。
- [x] 支持批量运行所有启用网站。
- [x] 批量执行默认串行。
- [x] 某个网站失败不会终止全部任务。
- [x] 有基础运行日志。
- [x] 最后输出成功 / 失败汇总。
- [x] 失败时尽可能保存 Screenshot。
- [x] Profile 和 Screenshot 不进入 Git。
- [x] `requirements.txt` 保持最小依赖。
- [x] 不引入 GUI、数据库或不必要框架。

---

# 29. Future Direction — Not Current Scope

只有当前 Python 原型验证成功之后，才考虑 Site Runner 下一阶段。

可能包括：

```text
Python 单文件原型
        ↓
验证真实网站签到
        ↓
验证多网站长期稳定性
        ↓
整理统一 Site Script API
        ↓
桌面 GUI
        ↓
可视化 Site 管理
        ↓
内置代码编辑器
        ↓
定时运行
        ↓
NTFY
        ↓
AI / Playwright MCP
```

目前不要提前实现这些功能。

核心原则：

> 先证明自动化本身好用，再开发完整软件。

---

# 30. Agent Rules

- 修改代码前完整阅读 `PLAN.md`。
- 首先检查仓库现状。
- 当前目标是原型，不是生产级平台。
- 核心代码只写在 `site_runner.py`。
- 不主动拆分 Python package。
- 不创建无必要目录。
- 不添加数据库。
- 不添加 GUI。
- 不添加 Web Server。
- 不添加 Electron。
- 不添加 AI。
- 不添加 Scheduler。
- 不添加 NTFY。
- 不添加 Plugin System。
- 不添加配置框架。
- 不为了未来需求提前抽象。
- 使用 Python 标准库解决能够简单解决的问题。
- 第三方核心依赖仅使用 Playwright，除非有明确且必要的理由。
- 网站差异直接通过普通 Python Handler 表达。
- 优先使用 Playwright 的 `get_by_role`、`get_by_text`、`get_by_label` 等稳定 Locator。
- 避免依赖脆弱的超长 CSS Selector。
- 默认使用可见浏览器方便调试。
- 使用 Persistent Context 保存登录状态。
- 不在代码中保存用户名或密码。
- 不提交任何 Browser Profile。
- 单网站失败不能导致批量流程退出。
- 普通实现细节自行判断，不因小问题停止开发。
- 不做与当前 Scope 无关的重构。
- 每个主要阶段完成后实际运行验证。
- 按阶段进行 Git commit。
- 完成后逐项检查 Acceptance Criteria。
- 最终总结实际完成情况、测试结果、Git 状态以及仍然存在的限制。

# 31. Implementation & Verification Record

Implemented on 2026-10-01 in four Git stages. Core implementation remains in
`site_runner.py`; the only third-party requirement is `playwright`.

Actual headed Chromium smoke tests passed:

- Default batch and explicit single-site execution; `list` and unknown-site CLI.
- Public Example URL visit without a handler and an offline check-in button demo.
- Persistent test Cookie and LocalStorage survive closing/reopening the profile.
- Login mode waits for the browser and exits when that browser is closed.
- A success / B missing-selector failure / C success, in serial order.
- Failure produces a valid PNG; screenshot directory failure does not stop C.
- Unknown handlers and HTTP 503 are reported as failures.
- Disabled sites are skipped in batch and can be run explicitly.
- Closed-context errors are isolated; page/context/browser cleanup is verified.
- Success/failure exit codes, empty batch, Python syntax and Git whitespace checks.

Tests use a separate ignored smoke profile and Playwright-routed HTML without a
web server or mock browser. No private accounts or credentials were used.
Real account login and real website check-in selectors still require the user's
sites; persistence was verified using synthetic session data, not a real account.
The bundled demo confirms an actual click and success indicator, not a real
website check-in. Update SITES, write site functions and register HANDLERS to add
real sites. A visit-only site reports navigation success, not login/check-in status.

Local setup and commands (from the repository directory):

```bash
source .venv/bin/activate
python site_runner.py list
python site_runner.py login
python site_runner.py
python site_runner.py run checkin_demo
```

For a fresh checkout:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
python -m playwright install chromium
```

Runtime data stays next to the script under `.runtime/` and is ignored by Git.
Close the login browser after finishing. Run one process at a time because all
sites share the same persistent profile. Exit codes: 0 success, 1 run/browser
failure or unknown site, 2 invalid CLI arguments, 130 interrupted.
