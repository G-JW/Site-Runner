# GitHub 发布与应用内更新

源码与更新源：[G-JW/Site-Runner](https://github.com/G-JW/Site-Runner)。稳定版包及签名清单位于 GitHub Releases，用户不需要 GitHub Token。

## 使用

打开 **设置 → 软件更新 → 检查更新**。有新版本时点击 **更新并重启**，应用会下载对应系统和 CPU 的完整包，验证 Ed25519 发布签名、SHA-256 与大小，然后保存状态、退出、替换应用并重启。无需手动下载或拖动 DMG。当前是完整更新包，尚未做差分下载；界面显示实际大小和进度。

0.3.5 及更早版本没有更新代码，需要先安装一次 0.3.6 或更新的版本。之后可在应用内更新。Mac 的 `.app` 请放在当前用户可写的目录；Windows 使用固定路径的便携版 exe。任务、登录环境、通知配置和历史仍使用原来的 userData，不在更新包内。

运行中的任务、录制和打开的登录浏览器会阻止安装，完成或关闭后可重试。下载失败或校验失败时不替换应用。安装器在旧进程完全退出后切换应用，保留相邻的 `.backup-<随机 ID>` 旧版；替换失败，或新应用 60 秒内未完成界面启动确认，会尝试恢复旧版。确认新版可用后可手动删除旧版备份；每个备份约等于完整应用大小。

本项目采用个人使用的独立更新器，**不是 Apple Developer ID 签名或公证**。不关闭 Gatekeeper、不清除隔离属性，也不改变 Windows 执行策略或申请管理员权限。若系统策略拒绝运行未签名应用，更新器不会绕过它。参考 Electron 的[官方 macOS 自动更新签名要求](https://www.electronjs.org/docs/latest/api/auto-updater)；未来正式分发可另外接入 Apple 签名与公证。

当前发布目标为 macOS Apple Silicon、macOS Intel、Windows x64；Linux 包暂不提供应用内更新。Mac 完整替换、真实 GUI 重启和数据保留使用本地受控包验证；Windows 安装逻辑需要 Windows 环境验证，GitHub 构建成功不等同于实机更新验证。

## 发布新版本

1. 修改 `package.json` 的稳定版本，例如 `0.3.7`，提交变更。仅支持 `主版本.次版本.修订号`。
2. 执行 `pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`。
3. 推送代码和匹配版本标签：

   ```bash
   git push origin main
   git tag v0.3.7
   git push origin v0.3.7
   ```

4. `.github/workflows/release.yml` 先验证版本和代码，再分别构建三种平台包。所有构建成功后，由独立发布作业签署清单、上传到草稿 Release，最后公开完整 Release。

发布作业只在签名阶段读取 `SITE_RUNNER_UPDATE_PRIVATE_KEY` Secret，签名私钥不进入构建包或源码。失败后可重跑工作流，已有草稿会复用；已公开的版本不允许原地覆盖，请递增版本。手动运行工作流时需选中对应的版本标签。

## 签名密钥

公钥在 `src/shared/update-config.ts`，当前更新源固定为此项目。Secret `SITE_RUNNER_UPDATE_PRIVATE_KEY` 保存 Ed25519 PKCS#8 PEM 私钥；本机备份位于被 Git 忽略的 `.runtime/update-private-key.pem`，权限为 0600。维护者应另外备份私钥，GitHub Secret 的内容不能取回。

更新清单为 JSON 封装的 base64 `payload` 和 `signature`，签名覆盖版本、平台、架构、文件名、大小和哈希。客户端先校验签名，再按精确平台/CPU 选择包；不安装较旧或相同的版本。私钥丢失或更换公钥会影响已有客户端，不能直接换钥后发布而期待旧版本继续接受更新。

## 本地构建与验证

```bash
pnpm release:package
# 使用本地私钥文件生成清单，不输出私钥
SITE_RUNNER_UPDATE_KEY_FILE=.runtime/update-private-key.pem pnpm release:manifest
# macOS 完整替换与重启，使用隔离临时目录和本地传输
node tests/e2e/auto-update.mjs
```

`scripts/package-release.mjs` 生成 `Site-Runner-<version>-darwin-<arch>.zip` 或 `Site-Runner-<version>-win32-x64.exe`。`scripts/create-update-manifest.mjs` 为每个包流式计算 SHA-256 并生成 `site-runner-update.json`；它会核对本地/CI 私钥是否匹配嵌入的公钥，不匹配时拒绝签名。

更新缓存位于 userData 的 `updates/`，启动确认后自动清除包与暂存文件；`install-result.json` 记录安装结果。若无法访问 GitHub，软件更新会显示网络错误，可以在配置好电脑网络或代理后重试。
