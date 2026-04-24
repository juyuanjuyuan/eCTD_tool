# Software Upgrade — 桌面单机版打包与激活码交付方案

> 创建日期：2026-04-24
> 背景：客户希望在本地电脑单机运行 eCTD 工具，不能看到源代码，按激活码授权，一年有效期，到期由我方重发激活码或软件。
> 目标：把当前 Web 版（NestJS + React + PostgreSQL + Redis + MinIO）打包为 **Mac 版** 和 **Windows 版** 两个桌面发行版，功能与 Web 版完全一致，仅运行方式和授权方式不同。

---

## 0. 总体方案（Mac/Windows 通用部分）

### 0.1 技术选型

| 层 | 方案 |
|---|---|
| 运行底座 | Docker Desktop（Mac/Windows 均官方支持） |
| 分发形态 | 所有服务镜像 `docker save` 打包 + 启动器 + 安装脚本 |
| 源码保护 | 镜像内只含 `dist/*.js`（tsc/vite 编译产物），不含 `.ts` 源文件 |
| 激活码 | RSA-2048 签名 JSON，绑定机器指纹 + 到期日 |
| 启动入口 | 双击启动器 → 启动 docker compose → 打开浏览器到 `http://localhost` |

### 0.2 激活码机制（跨平台共用）

**机器指纹**
```
fingerprint = sha256(cpu_id + primary_mac + board_serial)[:16]
```
首次启动时采集并缓存到 `<dataDir>/machine-id.txt`。

**激活码 Payload**（你方私钥签发）
```json
{
  "customer": "<客户名称>",
  "machineId": "<16 位指纹>",
  "issuedAt": "2026-04-24",
  "expiresAt": "2027-04-24",
  "nonce": "<随机串>"
}
```
Base64(payload) + "." + Base64(RSA-SHA256 签名) → 激活码字符串（约 500 字符）。

**产品端校验**（内置公钥硬编码在后端镜像）
- RSA 验签 → 失败拒绝
- `machineId` 匹配 → 不匹配拒绝
- `now < expiresAt` → 过期拒绝
- 时间回拨检测：`last-seen-time` 存数据库，系统时间倒流 > 1 小时拒绝

**过期行为**
- 剩余 ≤ 30 天：前端顶部 banner 黄色提醒
- 已过期：所有业务 API 返回 `403 LICENSE_EXPIRED`，只留 `/license/*`、`/auth/*` 可访问
- 用户在激活页粘贴新激活码 → 重新激活

### 0.3 共用落地清单（两平台共享）

| # | 产物 | 说明 |
|---|---|---|
| C1 | `backend/src/license/license.module.ts` | License 模块 |
| C2 | `backend/src/license/license.service.ts` | 指纹采集、签名验证、到期检查 |
| C3 | `backend/src/license/license.guard.ts` | 全局 Guard，拦截所有业务 API |
| C4 | `backend/src/license/license.controller.ts` | `POST /license/activate`、`GET /license/status` |
| C5 | `backend/prisma/schema.prisma` 新增 `License` 表 | 字段：code、customer、machineId、issuedAt、expiresAt、lastSeenAt |
| C6 | `frontend/src/pages/license/ActivatePage.tsx` | 未激活强制跳转的激活页（显示机器指纹供复制） |
| C7 | `frontend/src/pages/license/LicenseStatus.tsx` | 顶部 banner + 设置页授权详情 |
| C8 | `tools/issue-license/` | **你方内部**签发 CLI（`node issue-license.js --customer=X --machineId=Y --days=365`），使用私钥；私钥不进产品镜像 |
| C9 | `tools/keygen.sh` | 一次性生成 RSA-2048 密钥对；公钥嵌入 `license.service.ts`，私钥保存在你方本地 |
| C10 | `scripts/build-release.sh` | 构建镜像 → `docker save` → 压缩 → 附启动器 |

**共用工时**：3 天（C1–C10）。

---

## 1. Mac 版执行计划（macOS 12+，Intel & Apple Silicon）

### 1.0 当前执行进度（2026-04-24）

- [x] M1 已启动并完成首版产物：新增仓库级 `docker-compose.desktop.yml`，用于桌面单机版（默认端口前端 `18080`、后端 `13000`，并关闭 MinIO 控制台公开访问）。
- [x] 云端分支策略已调整要求：将平台自动拉取目标从 `master` 统一切换为 `main`（对应平台 Base Branch / Default Branch 配置项）。
- [x] C8/C9 首版已落地：新增 `tools/keygen.sh` 与 `tools/issue-license/issue-license.js`，可生成 RSA 密钥对并签发激活码。
- [x] M4 首版已落地：新增 `scripts/build-mac.sh`，可生成可分发测试包（`tar.gz`）；本机安装 `create-dmg` 时可继续生成 `.dmg`。并补充 `runtime/get-machine-id.js` 与首次启动自动 `docker load images/*.tar.gz`。
- [ ] M2 启动器开发（Swift/Platypus）进行中（当前先用 `Start.command` 作为可用启动入口）。

### 1.1 目标产物

单个 `.dmg` 文件：`eCTDTool-Installer-v1.0.0.dmg`，挂载后包含：
- `eCTDTool.app`（启动器）
- `images/` 目录（5 个 Docker 镜像 .tar.gz，约 800 MB-1.2 GB）
- `安装说明.pdf`
- `Applications` 符号链接（拖拽安装）

### 1.2 启动器（eCTDTool.app）

用 **Swift + AppKit** 写一个极简原生壳（或用 Platypus 把 shell 脚本包成 .app，更快）。功能：

1. 首次启动：
   - 检查 Docker Desktop 是否已安装 → 否则弹窗引导下载安装
   - `docker load` 加载 `images/*.tar.gz`
   - 创建数据目录 `~/Library/Application Support/eCTDTool/{postgres,redis,minio,reference,logs}`
   - 释放 `docker-compose.desktop.yml` 和 `.env` 到上述目录
2. 每次启动：
   - `docker compose -f ~/Library/Application\ Support/eCTDTool/docker-compose.desktop.yml up -d`
   - 轮询 `http://localhost:<port>/api/health` 直到 ready
   - `open http://localhost:<port>` 打开默认浏览器
   - 菜单栏驻留一个图标（NSStatusItem）：状态/停止/查看日志/退出
3. 退出时：`docker compose down`（容器停止，数据保留）

### 1.3 机器指纹采集（macOS）

```bash
cpu_id=$(sysctl -n machdep.cpu.brand_string)
board_serial=$(ioreg -l | awk '/IOPlatformSerialNumber/ { print $4 }' | tr -d '"')
primary_mac=$(ifconfig en0 | awk '/ether/ {print $2}')
fingerprint=$(echo -n "${cpu_id}${board_serial}${primary_mac}" | shasum -a 256 | cut -c1-16)
```
后端 `license.service.ts` 启动时执行（用 `child_process.execSync`）；Apple Silicon 和 Intel 均适用。

### 1.4 端口冲突处理

- 默认端口：frontend `18080`、backend `13000`（避免与客户本机 80/3000 冲突）
- 启动前 `lsof -i :18080` 检测，占用则递增尝试 18081/18082...
- 最终端口写入 `~/Library/Application Support/eCTDTool/port.txt`，启动器据此打开浏览器

### 1.5 签名与公证

- **Apple Developer ID 代码签名**（Developer ID Application 证书）：`codesign --deep --force --sign "Developer ID Application: <公司名>" eCTDTool.app`
- **Notarization**：`xcrun notarytool submit eCTDTool-v1.0.0.dmg --wait`
- 未公证客户双击会报"无法验证开发者"，须右键→打开绕过；**建议尽早申请开发者账号**（99 USD/年）

### 1.6 Mac 版交付步骤

| # | 任务 | 工时 |
|---|---|---|
| M1 | 编写 `docker-compose.desktop.yml`（单机优化：关闭 MinIO 公开端口、精简 healthcheck、卷路径用 `~/Library/Application Support/eCTDTool`） | 0.5d |
| M2 | 用 Platypus 或 Swift 写 `eCTDTool.app` 启动器（含菜单栏图标、首次初始化流程、端口自适应） | 2d |
| M3 | 机器指纹脚本适配 macOS（C2 内的 platform switch） | 0.5d |
| M4 | 编写 `build-mac.sh`：`docker save` → gzip → `create-dmg` 生成 DMG | 0.5d |
| M5 | 申请 Apple Developer ID，配置签名 + 公证流水线 | 0.5d（申请后等 1-2 天审核） |
| M6 | 一台干净 Mac（Intel + Apple Silicon 各一台）走完整流程：安装 → 激活 → 使用 → 过期 → 重激活 | 1d |
| M7 | 编写 Mac 版《安装说明.pdf》（含截图） | 0.5d |

**Mac 版独立工时**：约 5.5 天（不含开发者账号审核等待）。

### 1.7 Cloud 平台分支设置修正（master → main）

若某云平台构建日志出现如下命令形态：

```bash
git fetch origin --depth=100 master
```

则说明该平台项目的默认分支仍配置为 `master`。需在平台项目设置中执行：

1. 打开仓库连接设置（Git Provider / Repository Settings）；
2. 将 **Base Branch** 或 **Default Branch** 从 `master` 改为 `main`；
3. 触发一次重新部署，确认拉取命令更新为 `git fetch origin --depth=100 main`。

### 1.8 可下载测试包（当前交付形态）

当前仓库已支持先产出可下载测试包（非最终签名版 `.dmg`）：

```bash
scripts/build-mac.sh --version 0.1.0 --out-dir /tmp/ectd-release --skip-docker
```

产物示例：
- `/tmp/ectd-release/eCTDTool-mac-v0.1.0.tar.gz`
- 包内包含 `Start.command`（启动入口）、`docker-compose.desktop.yml`、`.env.template`、`runtime/verify-license.js`

---

## 2. Windows 版执行计划（Windows 10/11 64-bit）

### 2.1 目标产物

单个 `.exe` 安装包：`eCTDTool-Setup-v1.0.0.exe`（Inno Setup 或 NSIS 打包），安装后：
- `C:\Program Files\eCTDTool\` ← 启动器和静态文件
- `%APPDATA%\eCTDTool\` ← 数据目录（postgres/redis/minio 卷、日志、license）
- 开始菜单快捷方式 + 桌面快捷方式

### 2.2 启动器

用 **C# WinForms / WPF**（或 Electron-builder 包一个极轻壳）。功能同 Mac 版：

1. 首次启动：
   - 检测 Docker Desktop（`where docker`）→ 无则打开 https://www.docker.com/products/docker-desktop/ 下载页引导
   - 检测 WSL2 是否就绪（Windows Docker Desktop 依赖 WSL2）
   - `docker load` 加载镜像
   - 释放 `docker-compose.desktop.yml` 到 `%APPDATA%\eCTDTool\`
2. 每次启动：
   - `docker compose up -d` → 健康检查 → 调用默认浏览器打开 `http://localhost:<port>`
   - 系统托盘图标（NotifyIcon）：状态/停止/日志/退出
3. 退出时：`docker compose down`

### 2.3 机器指纹采集（Windows）

```powershell
$cpu = (Get-CimInstance Win32_Processor).ProcessorId
$board = (Get-CimInstance Win32_BaseBoard).SerialNumber
$mac = (Get-NetAdapter | Where-Object Status -eq 'Up' | Select-Object -First 1).MacAddress
$fp = [BitConverter]::ToString(
  [System.Security.Cryptography.SHA256]::Create().ComputeHash(
    [Text.Encoding]::UTF8.GetBytes("$cpu$board$mac")
  )
) -replace '-','' | ForEach-Object { $_.Substring(0,16).ToLower() }
```
后端 `license.service.ts` 通过 `child_process.execSync('powershell ...')` 调用；失败时回退到 `wmic cpu get ProcessorId`（Win10 仍支持，Win11 部分版本已移除）。

### 2.4 端口冲突

同 Mac 版：默认 `18080/13000`，`netstat -ano | findstr :18080` 检测，递增尝试。

### 2.5 代码签名

- **EV Code Signing 证书** 或 **OV Code Signing 证书**（建议 EV，可直接白名单，避免 SmartScreen 警告；约 300-500 USD/年）
- `signtool sign /f <cert.pfx> /p <pwd> /tr http://timestamp.digicert.com /td sha256 /fd sha256 eCTDTool-Setup.exe`
- 未签名首次运行会触发 SmartScreen，需用户点"更多信息 → 仍要运行"

### 2.6 Windows 版交付步骤

| # | 任务 | 工时 |
|---|---|---|
| W1 | `docker-compose.desktop.yml`（Windows 路径：`%APPDATA%\eCTDTool\volumes\...`，注意卷路径在 WSL2 下转义） | 0.5d |
| W2 | C# WinForms 启动器（托盘图标、首次初始化、端口自适应、Docker 状态检测） | 2.5d |
| W3 | PowerShell 指纹采集脚本 + Node 侧 fallback 逻辑 | 0.5d |
| W4 | 编写 `build-win.ps1`：`docker save` → 7z 压缩 → Inno Setup 打包成 `.exe` | 0.5d |
| W5 | 采购 Code Signing 证书，配置签名流水线 | 0.5d（证书采购 1-3 天到账） |
| W6 | 在 Windows 10 + Windows 11 两台干净机器上完整走一遍：安装 → 激活 → 使用 → 过期 → 重激活 | 1d |
| W7 | 编写 Windows 版《安装说明.pdf》（含 WSL2 启用步骤截图） | 0.5d |

**Windows 版独立工时**：约 6 天（不含证书采购等待）。

---

## 3. 客户交付与升级流程

### 3.1 首次交付
1. 客户告知操作系统（Mac / Windows）
2. 发送对应 `.dmg` 或 `.exe` 安装包（网盘/邮件）+ 《安装说明.pdf》
3. 客户安装 Docker Desktop → 双击启动 → 激活页显示机器指纹
4. 客户把**机器指纹 + 客户名称**发你（微信截图/邮件）
5. 你方执行：`node tools/issue-license/issue-license.js --customer="某药企" --machineId="a1b2c3d4e5f6g7h8" --days=365`
6. 生成的激活码字符串发客户 → 客户粘贴 → 激活成功 → 开始使用

### 3.2 一年到期续期

**方式 A：仅发激活码（推荐）**
- 客户激活码到期前 30 天收到 banner 提示，联系你方
- 你方用同一机器指纹重签一份激活码（`--days=365`）
- 客户粘贴新激活码 → 继续使用，**无需重装**

**方式 B：重发软件包**
- 若产品有功能更新，发新版 `.dmg`/`.exe` + 新激活码
- 客户双击安装（同路径覆盖）；数据目录 `~/Library/Application Support/eCTDTool` 或 `%APPDATA%\eCTDTool\` 保留，不丢数据
- 启动 → 粘贴新激活码 → 继续使用

### 3.3 换机

- 客户换电脑 → 新机器双击启动 → 激活页显示**新机器指纹**
- 客户发新指纹给你 → 你方重签激活码
- 旧机器上的激活码自动失效（指纹不匹配）
- 数据迁移：客户自行复制 `~/Library/Application Support/eCTDTool`（Mac）或 `%APPDATA%\eCTDTool`（Windows）整个目录到新机器对应位置即可

---

## 4. 开发排期（建议顺序）

| 周 | Mac 线 | Windows 线 | 共用 |
|---|---|---|---|
| W1 | — | — | C1–C10 全部共用部分（License 模块、签发 CLI、镜像构建脚本） |
| W2 | M1–M3 | W1（可并行） | — |
| W3 | M4–M5 | W2–W3 | — |
| W4 | M6–M7 | W4–W5 | — |
| W5 | 客户 Mac 试用 | W6–W7 | — |
| W6 | — | 客户 Windows 试用 | 回归修复 |

**总工时估算**：单人约 3 周（共用 3 天 + Mac 5.5 天 + Windows 6 天，加上集成联调和文档 buffer）。
两人并行（一人 Mac 一人 Windows）可压缩到 2 周。

---

## 5. 待确认事项

- [ ] 客户用 Mac 还是 Windows？或两个都要？（决定是否两条线并行）
- [ ] 是否采购代码签名证书（Apple Developer + Windows EV）？不采购则客户需手动绕过系统安全提示
- [ ] 默认浏览器打开还是内嵌 WebView（Electron/WebView2）？**建议默认浏览器**，成本低且无需打包 Chromium，体积减少 150 MB+
- [ ] 数据备份策略：是否在启动器里加"一键导出数据"按钮（打包 `postgres` + `minio` 卷为 `.zip`）？

---

## 6. 产出里程碑（L 级别参照 CLAUDE.md §8）

- **L1**：共用 License 模块完成，Web 版已通过激活码控制
- **L2**：Mac 版 DMG 在干净机器上完成"安装 → 激活 → 使用 → 过期 → 重激活"全链路
- **L3**：Windows 版 EXE 同 L2；两个版本功能与 Web 版一致性回归通过
- **L4**：首个客户实际收到安装包并完成激活使用
