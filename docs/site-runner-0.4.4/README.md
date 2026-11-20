# 0.4.4：浏览器外置与本地浏览器配置

## 浏览器配置

设置 → 执行 → 浏览器，或首次任务页的“配置浏览器”入口：

- 默认“应用管理的 Chromium”：点击“一键下载 Chromium”，应用通过 Playwright 官方安装器下载锁定版本及配套组件。下载后留在 userData/browsers，更新 App 时复用；Playwright 所需浏览器版本变更时可能需重新下载。
- 可选已安装的 Chrome / Edge。自动检测系统常见安装位置；未安装的选项不可选。不安装本机浏览器、不接管其默认用户数据目录。
- 支持下载进度、错误提示、取消和重试。下载未完成时不将部分解压文件视为可用。
- 默认 Chromium 沿用 profiles/<id>；本机 Chrome / Edge 分别使用 profiles/<id>-chrome 和 profiles/<id>-msedge。各来源的登录环境隔离保留，切换品牌可能需要重新登录。
- 关闭任务、登录浏览器和录制后才能切换来源；浏览器下载中不允许安装 App 更新。缺少浏览器时，CLI 执行会明确报错，定时批次不消耗当天执行标记。

普通 Chrome 默认用户目录的自动化使用不受支持，不能承诺直接复用日常 Chrome 的登录状态。参考 [Playwright](https://playwright.dev/docs/api/class-browsertype#browser-type-launch-persistent-context)、[Chrome 远程调试说明](https://developer.chrome.com/blog/remote-debugging-port)。

## 体积与首次使用

轻量 App 本身仍包含 Electron 桌面运行时。删除独立 Chromium 主要减少 App 下载/更新体积；选择管理的 Chromium 后，浏览器仍占本地存储，但可跨 App 更新复用。使用本机浏览器可避免再下载一份独立浏览器。

下载和安装体积以 GitHub 成品与实际安装测量为准。开发环境的本地构建不含浏览器，约 375 MiB；已安装 0.4.3 的去浏览器压缩估算约 138 MiB。正式发布后再记录实际数值。

## 历史版本与本地整理

10 个此前未发布的历史二进制分别归档为 history/v* 预发布 Release，每个安装包的远端 SHA-256 和本地一致。保留此前正式版本页面；稳定更新源不受历史归档影响。入口见 [历史版本索引](../releases/HISTORY.md)。

经用户明确确认，清理旧 release 输出、重复测试 App / 浏览器与归档临时 ZIP，清理前清单合计约 23.3 GiB。保留更新签名私钥、升级前数据库快照、源代码、Git、设计资料、验证记录和开发依赖；不清理 /Applications 或真实用户数据。执行清单及校验记录位于本地 .runtime/maintenance/。

整理后的本地目录：

- release/：当前构建输出；不长期存放历史安装包。
- .runtime/maintenance/：维护脚本、归档清单及清理记录。
- .runtime/archive/：保留的旧日志、工具与验证资料。
- .runtime/update-private-key.pem：维持原路径及私密权限，不提交。
- .runtime/installed-043-update/：保持原位置的升级前数据库快照。

## 验证

- 124 项单元/回归测试通过，包含浏览器来源、路径隔离、下载取消/重试、完整性标记和调度就绪保护。
- ESLint、主进程/前端类型检查、生产构建通过。
- 无窗口 Electron 实测官方安装器下载 Chromium 与配套组件成功。
- 实际轻量 macOS arm64 App 使用外部缓存完成本地执行 smoke：2 成功、1 预期失败。
- 实际轻量 App 调用本机 Edge，并使用独立临时登录目录，完成本地脚本任务：1 成功。没有读取日常浏览器的用户目录。
- 实际生产前端使用模拟 IPC 检查首次设置、下载进度及切换到本机 Edge 的状态更新。Windows/Intel 构建状态见 CI，不代表原生实机运行验证。
