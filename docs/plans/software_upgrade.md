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

#### 1.0.1 P0 未修阻塞项（下次发版前必须清零）

> 2026-04-24 首次冷安装测试（用户自测 Juyuans-Mac-mini / Apple Silicon）中发现，以下问题导致首包无法开箱即用，需在下次构建前逐一修复并在 §1.9 检查表中复验通过。

- [x] **P0-1 Redis `--requirepass` YAML 折叠解析 bug**（已在 `docker-compose.desktop.yml` 修复，用 `sh -c` 条件分支代替折叠字符串；2026-04-24 §1.9 B3 复验通过）
- [x] **P0-2 Prisma migration 未自动执行**：2026-04-24 修复 — 新增 `backend/docker-entrypoint.sh`，启动前 `npx prisma migrate deploy`；`backend/Dockerfile` 改 `ENTRYPOINT` 走包装脚本，CMD 仍是 `node dist/src/main.js`。B3 复验：日志看到 `[entrypoint] prisma migrate deploy` → `[entrypoint] launching nest app`
- [x] **P0-3 种子数据未自动执行**：2026-04-24 修复 — `entrypoint.sh` 在 migrate 后调用 `node dist/prisma/seed.js` + `node dist/prisma/seed-ctd.js`。这两个脚本本身就是幂等的（`seed.ts` 全 upsert，`seed-ctd.ts` 有 `existing > 0` 守卫），所以**每次启动都跑一遍是安全的，不需要标记文件**（"干净一点"方案）。B3 复验：首启日志看到 "Seed completed"、"229 nodes... Skipping" 表明幂等行为符合预期
- [x] **P0-4 `/reference` 目录未随包分发**：2026-04-24 修复 — `scripts/build-mac.sh` 把 `reference/eCTD技术规范V1.1附件包/` + `现行申报资料要求与eCTD目录元素、CTD目录层级对应表.xlsx` 打入 `$WORK_DIR/reference/`（仅 ~1MB，不含 PDF 规范）；`Start.command` 首启 `cp -R "$BASE_DIR/reference/"* "$DATA_DIR/reference/"`。B3 复验：CV 运行时种子日志 "已解析 cv-application-type.xml: 4 条记录" 等 5 个 XML 解析成功，证明 `/reference` 挂载链路完整
- [x] **P0-5 镜像仅 `linux/amd64`，Apple Silicon Mac 上依赖 Rosetta 模拟**：2026-04-24 部分修复 — `scripts/build-mac.sh` 默认 `--arch arm64`（Apple Silicon 原生），支持 `--arch amd64` 和 `--arch both`；包名加 `-arm64`/`-amd64` 后缀避免互相覆盖。**注意**：本机 docker 没有 buildx 子命令，真正双架构构建必须在装了 `docker buildx` 的构建机/CI 上做（先 `docker buildx build --platform linux/arm64 -t ectd-backend:latest --load` 把目标架构镜像 load 进本机 docker，再跑 `build-mac.sh --arch arm64`）。Windows 版暂不做，因此双架构需求大幅简化为"主推 arm64 + 兜底 amd64"
- [x] **P0-6 Backend 无法通过 REDIS_PASSWORD 鉴权（NOAUTH）**：2026-04-24 复现根因 — **不是 Start.command/env 传递问题，是 backend 代码 bug**。`backend/src/common/redis-cache.service.ts:10` 构造 `new Redis({...})` 时漏传 `password` 字段（`app.module.ts` 里的 BullModule 是传了的，单 cache service 漏了）。修复后冷启 stack（`REDIS_PASSWORD=test_redis_secret_xyz`）日志再无 `NOAUTH` 警告，cache 正常工作
- [x] **P0-7 Backend healthcheck 路径错误**（**B3 阶段新发现**）：`/api/health` 不存在（实际路径是 `/health`，因为 `main.ts` 注释说"No global prefix needed"），导致 backend 永远 unhealthy → frontend 永远启不来 → `dependency failed to start`。这是首次冷装的另一条隐藏根因。修复点：`backend/Dockerfile`、`docker-compose.desktop.yml`、`docker-compose.prod.yml`、`scripts/build-mac.sh` 全部把 `/api/health` 改 `/health`。B3 复验通过

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

### 1.9 发布前冷安装验证检查表（每次发版必跑）

> **定位**：此检查表是打包 → 分发前的 **Release Gate**。任一条 `[ ]` 未打勾，`build-mac.sh` 产出的包**不得**交付客户。检查表按「源码侧 → 打包侧 → 冷装测试侧 → 客户侧」四段串联，前一段全通过才进下一段。
>
> **"冷装测试"的严格定义**：在一台**从未跑过这个项目 Docker 的 Mac**（或把 Docker Desktop 的数据全部清掉 → 重建）上走完整流程。不能在构建机、开发机、或已经跑过某版的机器上测 —— 那些机器有缓存镜像、已建表的卷、本地 node_modules，会掩盖真实新客户首装问题。

#### A. 源码侧（打包前在 git 仓库上检查）

- [x] **A1** `docker-compose.desktop.yml` 里不留 `version: "3.8"` 顶层属性（compose v2 已废弃）— 2026-04-24 已删
- [x] **A2** `docker-compose.desktop.yml` 的 redis/postgres/minio 命令**不含折叠字符串 + 环境变量混用**（见 P0-1 bug 教训；要么全写成 YAML 数组形式，要么用 `sh -c` 条件分支）— redis 用 `sh -c` 条件分支，postgres/minio 无折叠字符串
- [x] **A3** `backend/Dockerfile` 的 `ENTRYPOINT`（或 `CMD` 包装脚本）**自动执行 `prisma migrate deploy`** 再 `exec node dist/src/main.js`；首次启动 seed 由 entrypoint 检测标记文件触发一次 — 2026-04-24 新增 `backend/docker-entrypoint.sh`；因 `seed.ts`(upsert) 和 `seed-ctd.ts`(`existing>0` 守卫) 本身幂等，entrypoint 每次启动都跑一遍 seed，不再需要标记文件
- [x] **A4** `backend/prisma/schema.prisma` 的 `binaryTargets` 至少包含 `["native", "debian-openssl-3.0.x"]`（对应 `node:20-slim` 基镜像；换基镜像需同步更新）
- [x] **A5** `scripts/build-mac.sh` 校验过 5 个必需镜像均已在本机存在（`docker image inspect` 逐一预检，缺一报错不往下走，避免 `reference does not exist` 打包残缺）— 2026-04-24 加入 `require_image` 预检
- [x] **A6** `scripts/build-mac.sh` 把 `reference/eCTD技术规范V1.1附件包/`（含 DTD/XSL/受控词汇 XML）打入产物包（`COPY reference` 到 `$WORK_DIR/reference/`）— 仅打附件包 + CTD 对应表 xlsx，不含 PDF 规范
- [x] **A7** `Start.command` 首次启动流程已覆盖：① `docker load images/*.tar.gz` ② `cp -R reference → DATA_DIR/reference` ③ 首次执行 seed 并写 `.seeded` 标记 ④ 端口占用自适应（`lsof -i :18080` 占用时递增）— seed 由 backend entrypoint 负责（幂等无标记），Start.command 覆盖 ①②④ 三项
- [x] **A8** `docs/update_log.md` 最新一条记录与实际代码变更对齐（无"口头改了但 log 没记"的情况）
- [x] **A9** **backend healthcheck 路径与 main.ts 实际暴露的健康端点一致**（防 P0-7 回归）：grep `api/health` 在 `backend/Dockerfile` / `docker-compose.*.yml` / `scripts/build-mac.sh` 应无残留，统一为 `/health`

#### B. 打包侧（在构建机上跑 `build-mac.sh` 前后）

- [~] **B1** 构建机能同时产出 `linux/amd64` + `linux/arm64` 双架构的 `ectd-backend` / `ectd-frontend` 镜像（`docker buildx build --platform linux/amd64,linux/arm64`）；第三方镜像分别 `docker pull --platform` 两次保存。或按客户 Mac 架构出两份独立包（`-mac-intel.tar.gz` / `-mac-arm64.tar.gz`）— **本机 docker 不带 buildx 子命令**，2026-04-24 仅产出 amd64 单包通过 B2/B3。`build-mac.sh --arch arm64` 已就位，待装了 buildx 的构建机或 Mac 本机重跑产 arm64 包
- [x] **B2** `docker save` 产物解压后能 `docker load` 成功（抽一个 tar.gz 在另一台机器 `docker load < xxx.tar.gz` 测试）— 2026-04-24 抽 `redis-7-alpine.tar.gz` 删 tag 后 `docker load` 回灌，image ID 与原始一致
- [x] **B3** 构建机上**本地起一次完整 stack**（`docker compose -f docker-compose.desktop.yml up -d`）跑通 redis healthcheck —— 防止 P0-1 类 YAML/shell bug 再次到客户那里才发现 — 2026-04-24 在 `/tmp/ectd-desktop-test/` 起完整 stack，5 个容器全 healthy，登录页可达 (curl `http://localhost:18080/` → `nginx/1.27.5 200`)，并连带发现 P0-7 healthcheck 路径错误
- [x] **B4** 包尺寸在预期区间（单包 `tar.gz` ≤ 1.5 GB；若超过说明某层镜像意外膨胀，需要追溯）— 2026-04-24 实测 `eCTDTool-mac-v0.2.0.tar.gz` = 592 MB（backend 镜像 399MB 占大头）
- [x] **B5** 包的 SHA256 写入 `eCTDTool-mac-v{VERSION}.tar.gz.sha256` 同目录产出（客户下载后可 `shasum -a 256 -c` 核对）— `build-mac.sh` 已加 `shasum -a 256` / `sha256sum` 兜底逻辑；v0.2.0 sha256: `a38e17e51c0e7d4aa121debebfd85bd733b90ab59df61571e098097cf4ca0aad`
- [x] **B6** 签发一张**测试激活码**（机器码用 `deadbeef00000000` 占位）并尝试用 `tools/runtime/verify-license.js` + `LICENSE_MACHINE_ID_OVERRIDE=deadbeef00000000` 校验通过，确认私钥/公钥对齐、签发链路完整 — 2026-04-24 通过 `[LICENSE] OK customer=冷装测试 expiresAt=2026-05-24`

#### C. 冷装测试侧（在一台"干净" Mac 上，**每次发版**必跑一次）

> 推荐维护 1 台 Apple Silicon + 1 台 Intel 共 2 台冷装机，每次把 Docker Desktop 的 "Settings → Troubleshoot → Clean / Purge data" 执行一次后开测。

**步骤 C1–C10 必须按顺序跑通，任一步骤失败则打回源码侧修复：**

- [ ] **C1 解压**：`tar -xzf eCTDTool-mac-v{VERSION}.tar.gz` 成功，目录结构符合预期（`images/` + `runtime/` + `Start.command` + `.env.template` + `docker-compose.desktop.yml` + `public.pem` + `reference/`）
- [ ] **C2 Gatekeeper 绕过**：执行 `xattr -dr com.apple.quarantine ./eCTDTool-mac-v{VERSION}/` 后，双击 `Start.command` 不再弹"无法验证开发者"（长期解应走 Developer ID 签名 + 公证，M5 任务）
- [ ] **C3 机器码采集**：`node runtime/get-machine-id.js` 输出 16 位 hex（Node 缺失时要 fail fast 并提示安装 Node.js LTS —— 如计划去 Node 依赖，则改为纯 shell 版后再来走此项）
- [ ] **C4 激活码校验**：把测试激活码写入 `~/Library/Application Support/eCTDTool/license/license.txt`，`Start.command` 的 license 校验通过
- [ ] **C5 镜像加载**：首次双击 `Start.command` 后 `docker images` 能看到全部 5 个镜像 tag；`.images_loaded` 标记文件已写入
- [ ] **C6 栈启动**：`docker compose ps` 5 个服务在 90 秒内全部 `(healthy)`，无 `Restarting` 状态
- [ ] **C7 Migration + Seed 幂等**：首次启动自动建表 + 种用户/CTD 模板/CV 成功；再次启动（`docker compose down && docker compose up -d`）不报唯一约束冲突、不覆盖用户自改数据
- [ ] **C8 登录页可达**：浏览器打开 `http://localhost:18080`，能看到登录页（不是白屏/502）；用 `admin@ectd.com` / `admin123` 登录成功
- [ ] **C9 业务主链路**：登录后能 ① 新建项目 ② 新建申请 + 序列 ③ 打开 CTD 目录左树至少看到模块 1-5 中 20+ 个叶节点 ④ 在某一叶节点上传一份 PDF ⑤ 触发验证不崩 ⑥ 导出 ZIP 包成功（`/sequences/:id/export/ectd-package`）
- [ ] **C10 重启幂等**：`docker compose down && bash Start.command` 再次启动，所有数据保留（用户、上传文件、项目）；启动时间 < 30 秒（首次除外）

#### D. 客户侧（分发前）

- [ ] **D1** 客户 Mac 基线确认：macOS 12+、8GB+ 内存、50GB+ 可用空间、已装 Docker Desktop 最新稳定版（且已启动过一次，接受完许可）
- [ ] **D2** 把"客户使用指南 PDF"（含解压 → 采集机器码 → 激活码安装 → 启动 → Gatekeeper 绕过 → 端口占用处理 → 日志位置 → 停止命令）**一并发给客户**，不要只发 `.tar.gz`
- [ ] **D3** 客户机器码收到后，签发的激活码在 `expiresAt` 字段前至少留 1 个月冗余（避免客户收到时已快过期）
- [ ] **D4** 建立激活码台账：`客户名 + 机器码 + 签发日期 + 到期日 + 私钥版本`（Excel 或 Airtable 皆可；丢失无法追溯换机续期）

#### E. 已知坑对照表（持续累加）

> 每次冷装测试或客户现场踩到的坑，记录到此表，并在源码侧加对应修复 / 检查项，避免同样的坑踩两次。

| # | 首次发现 | 现象 | 根因 | 修复所在项 |
|---|---|---|---|---|
| 1 | 2026-04-24 首次冷装 | `Error response from daemon: reference does not exist` | `ectd-backend:latest` / `ectd-frontend:latest` 从未被 build（prod compose 没有 image tag） | A5 / B1 |
| 2 | 2026-04-24 首次冷装 | redis 启动即 crash，`requirepass "--appendonly" "yes" wrong number of arguments` | 空 REDIS_PASSWORD + YAML 折叠字符串把下一个 flag 吞成密码值 | A2 / B3 |
| 3 | 2026-04-24 首次冷装 | `P2021: table public.controlled_vocabulary does not exist` backend 无限重启 | 首次启动未执行 `prisma migrate deploy`，DB 为空 | A3 / C7 |
| 4 | 2026-04-24 首次冷装 | 登录后无 CTD 目录 / CV 错误 | 未跑 `seed-ctd.js` 和 `seed.js` | A3 / C9 |
| 5 | 2026-04-24 首次冷装 | 双击 Start.command 弹 "apple could not verify...free of malware" 且只给 "Move to Trash / Done" 两选项 | macOS Sonoma+ Gatekeeper 收紧，未签名 `.command` 需要 `xattr -dr com.apple.quarantine` 或系统设置里"仍要打开" | C2（长期：M5 签名 + 公证） |
| 6 | 2026-04-24 首次冷装 | `The requested image's platform (linux/amd64) does not match... (linux/arm64/v8)` 警告持续 | 镜像只有 amd64，Apple Silicon 走 Rosetta 模拟 | B1（multi-arch build） |
| 7 | 2026-04-24 首次冷装 | backend log: `Redis connection error: NOAUTH Authentication required` | **(更新根因)** 不是 env 传递，是 `backend/src/common/redis-cache.service.ts` 的 `new Redis({...})` 漏传 `password` 字段（BullModule 传了，单 cache service 漏了） | P0-6（已修） |
| 8 | 2026-04-24 B3 复验 | `dependency failed to start: container ectd-desktop-backend is unhealthy`，frontend 永远启不来 | `backend/Dockerfile` 和 compose 的 healthcheck 打 `/api/health`，但 `main.ts` 注释明确"No global prefix"，实际路径是 `/health` → 永远 unhealthy | P0-7（已修；A 段加 A9 防回归） |
| 9 | 2026-04-24 客户冷装 v0.3.0 | `.env: line 8: Support/eCTDTool: No such file or directory` | `.env.template` 的 `DATA_DIR=/Users/.../Application Support/eCTDTool` 路径含空格但**没加引号**，bash `source` 把空格后半段当命令执行 | P0-8（已修：build-mac.sh 模板加双引号） |
| 10 | 2026-04-24 客户冷装 v0.3.0 | backend `ENOENT: no such file or directory, open '/reference/eCTD技术规范V1.1附件包/...'` | Start.command 用 `[[ ! -d "$DATA_ROOT/reference" ]]` 判断是否需要拷贝；但 docker bind mount 在 host 路径不存在时会自动创建空目录，导致首次失败重跑时判断"已存在 → 跳过拷贝"，挂载空目录给容器 → CV 文件找不到 | P0-9（已修：改用关键文件 sentinel `cv-application-type.xml` 是否存在判断） |
| 11 | 2026-04-24 客户冷装 v0.3.0 | 登录 500：`"expiresIn" should be a number of seconds or string representing a timespan` | `auth.module.ts` 和 `auth.service.ts` 读 `JWT_EXPIRES_IN` / `JWT_REFRESH_EXPIRES_IN`，但 `.env.template` 和 `docker-compose.desktop.yml.environment` 都**没声明这两个变量** → undefined → jsonwebtoken 拒签 | P0-10（已修：build-mac.sh `.env.template` + compose `environment` 都加上，默认 `7d` / `30d`） |
| 12 | 2026-04-25 客户冷装 v0.4.0 | `Error pull access denied for ectd-backend, repository does not exist` | Start.command 用 `[[ ! -f "$LOAD_MARK_FILE" ]]` 判断是否需要 docker load；用户清掉本地 docker images 但保留了 DATA_ROOT 下的 `.images_loaded` 标记文件 → 跳过 load → compose 找不到本地镜像试图从 hub 拉。和 P0-9 reference 同型 sentinel-vs-真实状态错位 | P0-11（已修：判断条件改为 `docker image inspect` 5 个镜像是否真的存在，不依赖标记文件） |

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
