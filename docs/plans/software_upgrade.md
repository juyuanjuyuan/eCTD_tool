# Software Upgrade — 桌面单机版（Electron）打包与激活码交付方案

> 创建日期：2026-04-25
> 背景：客户要求**单机使用**，不能看到源代码，按激活码授权一年有效期，到期由我方重发激活码或软件。
> 目标：把现有 NestJS + React 代码打包成原生桌面软件（Mac `.dmg` / Windows `.exe`），用户双击即用，**零前置依赖**（不需要 Docker / Node / PostgreSQL / WSL2）。
> 本计划由 Agent 执行：每完成一个任务必须 ① 勾选对应 `[ ]` → `[x]` ② 同步在 `docs/update_log.md` 追加一条记录 ③ 修改后端模块同步更新 `backend_architecture.md` / `database_design.md` / `api_design.md`，修改前端的同步更新 `frontend_architecture.md`。

---

## 0. 总体方案

### 0.1 用户视角的最终形态

- **Mac**：`eCTDTool-v1.0.0.dmg` → 拖入 Applications → 双击图标 → 直接出现原生窗口（VS Code / Typora 体验）
- **Windows**：`eCTDTool-Setup-v1.0.0.exe` → 安装 → 开始菜单/桌面快捷方式 → 双击 → 直接出现原生窗口
- **零前置依赖**：双击即可运行
- **启动时间**：< 5 秒
- **包体积**：150-250 MB
- **数据目录**：Mac `~/Library/Application Support/eCTDTool/`、Windows `%APPDATA%\eCTDTool\`

### 0.2 内部架构（用户完全不可见）

```
eCTDTool.app / eCTDTool.exe   (单图标，单 Electron 进程包装)
├── Electron main process                ← 程序入口
│   ├── fork() Node 子进程跑 NestJS      ← 监听 127.0.0.1:<random-port>
│   ├── 创建 BrowserWindow               ← loadURL 加载前端 (与 backend 同源)
│   ├── 单实例锁、系统托盘、菜单栏
│   └── 机器指纹采集 + 通过环境变量注入 backend
├── Electron renderer (内嵌 Chromium)
│   └── React 前端（vite build 产物）
├── 嵌入式 Node.js (electron 自带)
│   └── NestJS 后端代码（业务模块 + License Guard + CTD 模板 + 验证引擎）
├── better-sqlite3                       ← PostgreSQL 替代（同进程，零延迟）
├── 本地文件系统                         ← MinIO 替代
│   └── <userData>/files/<yyyymm>/<uuid>.<ext>
└── 内存 lru-cache                       ← Redis cache 替代；BullMQ 队列改同步执行
```


### 0.4 Cloud 平台拉取分支基线（2026-04-25 执行）

为避免云端构建仍拉取旧分支，先完成以下平台侧配置（仓库内无法自动代改）：

- [x] 平台项目设置将 **Base Branch / Default Branch** 从 `master` 改为 `main`
- [x] 重触发一次部署并确认日志不再出现：`git fetch origin --depth=100 master`
- [x] 目标日志应为：`git fetch origin --depth=100 main`

> 说明：这是云平台控制台配置项，不是应用容器内脚本。

### 0.3 可复用的已落地模块

以下资产已在仓库存在，本次升级**完全保留**，无需重写：

| 模块 | 文件位置 | 处理 |
|---|---|---|
| 签发 CLI | `tools/issue-license/issue-license.js` | **不改** |
| 密钥对生成 | `tools/keygen.sh` | **不改** |
| RSA 公私钥 | `tools/keys/{public,private}.pem` | **不改**（公钥已硬编码到 backend `license/public-key.ts`） |
| 启动器层校验脚本（Docker 路线遗留） | `tools/runtime/verify-license.js` | **不改**，仅 Docker `Start.command` 用，桌面 Electron 路线弃用 |

下表是 **L 阶段（2026-04-25）新建** 的运行时部分（旧 plan 误把这些写进"已落地"，实际是 Docker 路线把校验放在 launcher 层、桌面路线必须搬到 backend 内部）：

| 模块 | 文件位置 | 处理 |
|---|---|---|
| License Module / Service / Controller / Guard | `backend/src/license/*` | **L 阶段新建** |
| `License` 表 | `backend/prisma/schema.prisma` + `schema.sqlite.prisma` + 两份 migration | **L 阶段新建** |
| 内嵌公钥常量 | `backend/src/license/public-key.ts` | **L 阶段新建** |
| 激活页 + Banner | `frontend/src/pages/license/ActivationPage.tsx`、`frontend/src/components/LicenseBanner.tsx` | **L 阶段新建** |
| 路由级 license 闸门 | `frontend/src/components/ProtectedRoute.tsx` | **L 阶段小改** |
| 机器指纹采集（跨平台） | `backend/src/license/license.service.ts` | **L 阶段写入**：优先 `process.env.MACHINE_ID`（Electron main 注入）→ `LICENSE_MACHINE_ID_OVERRIDE`（开发期）→ shell fallback (mac/linux/win)；E7 阶段会让 Electron main 优先采集并注入 |

`reference/eCTD技术规范V1.1附件包/` 与 `reference/现行申报资料要求与eCTD目录元素、CTD目录层级对应表.xlsx` 在打包时会被复制到 Electron resources，首启时释放到 `<userData>/reference/`。**不打包 PDF 规范文档**（用户不需要）。

---

## 1. 阶段拆解（Agent 执行计划）

> Agent 严格按 **E1 → E9** 顺序执行；阶段间有依赖关系，跳跃执行会导致下一阶段验收失败。

### 1.1 阶段总览

| 阶段 | 标题 | 工时 | 依赖 |
|---|---|---|---|
| **L** | License 模块新建（Plan 漏的，运行时校验侧） | 1d | — |
| **E1** | Prisma 双 provider：PostgreSQL ⇄ SQLite | 1d | — |
| **E2** | Redis 抽象 → in-memory + BullMQ 同步执行 | 2d | E1 |
| **E3** | MinIO → 本地文件系统抽象 | 1d | E1 |
| **E4** | NestJS 嵌入式启动改造（fork-friendly） | 1d | E1, E2, E3 |
| **E5** | Electron main + preload 实现 | 1.5d | E4 |
| **E6** | 前端 Electron 适配 | 0.5d | E5 |
| **E7** | 激活码指纹采集本地化 | 0.5d | E5 |
| **E8** | electron-builder 打包（Mac + Win） | 1d | E1-E7 |
| **E9** | 冷装测试 + 签名公证 | 1d | E8 |

合计：≈9 天单人工时。

### 1.2 E1：Prisma 双 provider 适配（PostgreSQL ⇄ SQLite）

**目标**：同一份业务代码通过环境变量 `DB_PROVIDER` 切换跑 PostgreSQL（开发期保留）或 SQLite（桌面版交付）。后续 1-2 个迭代后可收敛为只用 SQLite。

**前置盘点**：执行前先 grep 找出所有 Json/复杂字段：
```bash
grep -nE "@db\.(Json|Text|VarChar)|Json\\?|Json $" backend/prisma/schema.prisma
```

**任务清单**：

- [x] **E1-1** 在 `backend/prisma/` 新增 `schema.sqlite.prisma`（不改原 schema，并存）：
  - `datasource db { provider = "sqlite"; url = env("DATABASE_URL") }`
  - 所有 `Json` 字段改为 `String`（在 service 层 JSON.stringify/parse；用 `Prisma.JsonValue` 类型注解保持类型安全）
  - 移除 `@db.Text`、`@db.VarChar(n)`（SQLite 不区分长度）
  - `String[]`（Postgres 数组）改为 `String`（JSON 序列化的数组）
  - 复合索引 / 唯一约束保持不变（SQLite 都支持）
- [x] **E1-2** 创建 `backend/prisma/migrations.sqlite/` 目录并生成首版 init 迁移；后续业务变更**两份 schema 同步迁移**（CI 加守卫脚本检查两份 schema 字段一致）
- [x] **E1-3** 在 `backend/package.json` 新增 npm scripts：
  - `prisma:sqlite:migrate` → `prisma migrate deploy --schema=prisma/schema.sqlite.prisma`
  - `prisma:sqlite:generate` → `prisma generate --schema=prisma/schema.sqlite.prisma`
  - `prisma:check-parity` → 自定义 node 脚本，校验两份 schema 的 model/字段集合一致
- [x] **E1-4** 改造 `backend/src/prisma/prisma.service.ts`：根据 `process.env.DB_PROVIDER`（`postgres` | `sqlite`）加载不同 PrismaClient（SQLite client 输出到 `backend/src/generated/prisma-sqlite`）
- [x] **E1-5** Json 字段访问改造清单：
  - 在 `backend/src/common/json-field.helper.ts` 新增 `parseJsonField<T>(raw: string | object)` / `serializeJsonField(value)` helper（双 provider 兼容：postgres 直传对象，sqlite 序列化）
  - 改造涉及模块：`ctd-template`（`metadata`、`instanceKeyFields`、`defaultStfCategories`）、`validator`、`sequence`（信封元素）、`study`（StudyCategory 等）
- [x] **E1-6** 数据迁移工具（仅供开发自测，**不分发**）：`tools/db-migrate-pg-to-sqlite/index.js` — 用 PrismaClient(pg) 读、PrismaClient(sqlite) 写
- [x] **E1-7** 单元测试：核心 service spec 用 `DB_PROVIDER=sqlite` 跑一遍（jest 用 SQLite file DB）

**DoD（验收）**：
- `DB_PROVIDER=sqlite DATABASE_URL=file:./dev.db npm run start:dev` 启动成功
- 跑通核心业务流：登录 → 创建项目 → 创建申请+序列 → 上传 PDF → 触发验证 → 导出 ZIP → ZIP 结构与 PG 版一致
- `prisma:check-parity` 退出码 0
- 所有原有 spec 在 `DB_PROVIDER=sqlite` 下也跑通

---

### 1.3 E2：Redis 抽象 → in-memory + BullMQ 同步执行

**目标**：彻底移除桌面版对 Redis 的运行时依赖；缓存改 in-memory；BullMQ 队列改同步执行（用户接受验证/导出 < 10s 同步等待）。

**前置盘点**（执行前 grep）：
```bash
grep -rnE "ioredis|@nestjs/bull|BullModule|@InjectQueue|@Process" backend/src
```

**任务清单**：

- [x] **E2-1** 抽象 cache 接口 `backend/src/common/cache/cache.interface.ts`：`get/set/del/wrap`
- [x] **E2-2** 实现 `MemoryCacheService`（内存 TTL 缓存实现）：`backend/src/common/cache/memory-cache.service.ts`
- [x] **E2-3** 改造现有 `backend/src/common/redis-cache.service.ts` 实现同一接口；保留作为开发期可选实现
- [x] **E2-4** 改造缓存注入层：根据 `process.env.CACHE_PROVIDER`（`redis` | `memory`，默认 `memory`）在 `PrismaModule` 注入对应实现
- [x] **E2-5** BullMQ 队列盘点 + 改造（典型用途：验证、文档导出、可能的邮件通知）：
  - 创建 `backend/src/common/queue/sync-queue.runner.ts`：`add(jobName, data)` → 直接 `await consumer.process(data)`，并通过 EventEmitter 推进度
  - 改造涉及模块：`ValidationModule`、`ExportModule`、（如有）`NotificationModule`
  - Producer 改为注入 `IQueue`（接口），由 `QUEUE_PROVIDER` 环境变量切换 BullMQ / Sync
  - Consumer `@Process` 装饰器保留，但同步实现里用反射调用
- [x] **E2-6** 移除 `BullModule.forRoot` 在桌面版的强制注册（按 `QUEUE_PROVIDER=bull` 可选启用）
- [x] **E2-7** 前端长任务交互调整：
  - 同步等待 < 3s 的（验证）：直接 `await`，loading 旋钮
  - 可能 > 3s 的（导出大序列）：后端走 SSE 或简单轮询返回进度，前端进度条；目标是用户至少看到"正在生成第 N/M 个 XML"
  - ✅ 2026-04-25：`ExportModal` 已支持非叶子节点批量导出轮询（`/export/status/:taskId`），显示进度条和“正在生成第 N/M 个文件”；叶子节点继续保持同步直出体验
- [x] **E2-8** 性能验证：对 50 文件 / 5GB 大序列做一次完整导出，观察峰值内存与耗时（避免 in-process 同步处理 OOM）
  - ✅ 2026-04-25：新增 `backend/scripts/e2-export-benchmark.js` 与 npm script `perf:e2-export`，在同步 in-process 模式执行 50 文件 / 5GB 场景压测（分块流式模拟，不一次性分配 5GB）
  - 实测结果（UTC 2026-04-25）：`elapsedSec=18.93s`、`throughput=270.49 MB/s`、`peakRss=48.28 MB`

**DoD（验收）**：
- `CACHE_PROVIDER=memory QUEUE_PROVIDER=sync npm run start:dev` 在不连 Redis 时能启动
- 50 文件序列触发完整验证耗时 ≤ 10s 且前端不超时
- 导出大序列峰值内存 < 1.5GB（避免桌面版被系统杀进程）

---

### 1.4 E3：MinIO → 本地文件系统抽象

**目标**：文件存储抽象化；桌面版用本地 FS，路径基于 Electron 的 `app.getPath('userData')/files/`。

**任务清单**：

- [x] **E3-1** 抽取接口 `backend/src/file/storage.interface.ts`（落到 `file/` 目录而非 `files/`，与现有 module 同址）：8 方法签名沿用 caller 已知的 `MinioService` API（`uploadFile/uploadFileStream/getFile/getFileStream/fileExists/deleteFile/getPresignedDownloadUrl/getPresignedPreviewUrl`）以避免改 8 处注入点
- [x] **E3-2** 现有 MinIO 实现搬到 `backend/src/file/minio-storage.ts`（plain class `MinioStorage`，行为 1:1 保留）
- [x] **E3-3** 新增 `backend/src/file/local-storage.ts`（plain class `LocalStorage`）：
  - 文件落盘 `<DATA_DIR>/files/<key>`（key 由 caller `FileNameNormalizerService.buildStoragePath` 决定，已含 yyyymm 分层，无需 LocalStorage 再分）
  - `presignedUrl` 用 `jsonwebtoken` 签 `{key, mode}` payload + 默认 1h TTL（`STORAGE_PRESIGN_SECRET` → fallback `JWT_SECRET`）
  - 新增 `GET /api/v1/files/serve/:token` 路由（`backend/src/file/file-serve.controller.ts`，`@Public()` 跳过 license guard），verifyPresignToken → 流式返回，preview 模式走 inline / 否则 attachment
  - 流式上传：`fs.createWriteStream` + `PassThrough` 同时算 md5
  - **Path traversal 防护**：`resolveSafe()` 阻挡 `..` 越权
- [x] **E3-4** Module 注入：`MinioService` (@Injectable façade) 按 `process.env.STORAGE_PROVIDER`（默认 `local`）选 delegate；`onModuleInit` 仅 minio 模式跑 bucket 检查
- [x] **E3-5** 数据目录路径来源：`DATA_DIR` env，由 Electron main 启动 backend 时注入 `app.getPath('userData')`（E5 阶段实施）
- [ ] **E3-6** 备份/恢复工具（仅供开发支援，**不分发**）：`tools/local-files/backup.ts` ← **延后到 E5/E8 真实出包前**（沙箱里没有真实 DATA_DIR 数据可备份，留给真机验证时一起做）

**沙箱内验收结果**：
- `npx tsc --noEmit` 干净
- `npx jest src/file src/export src/study src/ectd src/license src/auth --forceExit`：30 suites / 575 测试通过、5 skipped、0 fail
- 新增 `src/file/local-storage.spec.ts` 8 用例：upload roundtrip / stream md5 / exists / delete idempotent / path traversal / presign download URL / tampered token / preview mode
- LocalStorage 在干净 tmpdir 上 round-trip 任意 buffer + 流式上传 + 可生成可校验的 JWT URL

**DoD（验收）**：
- `STORAGE_PROVIDER=local DATA_DIR=/tmp/ectd-test npm run start:dev` 启动后能正常上传/下载/删除
- 100MB PDF 上传 → 下载 → 删除全链路通过
- presigned URL 在 TTL 内可用，过期后返回 401

---

### 1.5 E4：NestJS 嵌入式启动改造（fork-friendly）

**目标**：让 NestJS 既能独立 listen 在固定端口（开发期），又能被 Electron `child_process.fork` 拉起 + 监听随机端口 + 把端口写到 stdout/IPC。

**任务清单**：

- [x] **E4-1** 改造 `backend/src/main.ts`：
  - 默认监听端口：dev 仍用 `PORT||3000`；`EMBEDDED=true` 时改为 `PORT||0`（OS 随机端口，避免桌面用户多版本端口冲突）
  - 启动后用 `app.getHttpServer().address().port` 取真实端口
  - 通过 `process.send?.({ type: 'ready', port })` 发回父进程 + `console.log('READY ' + port)` 兜底
  - SIGTERM / SIGINT → `app.close()` 优雅关闭后 `process.exit(0)`；外加 `app.enableShutdownHooks()` 让 Nest 自身的 onModuleDestroy 钩子也跑
  - `bootstrap().catch(...)` 在启动失败时发 `{type:'error',error}` IPC + `console.error('ERROR ' + msg)` 退出码 1
- [x] **E4-2** 新增 backend 嵌入式构建产物 `backend/dist-embed/`：
  - 用 `tsc → esbuild` 两步走（esbuild **不支持** `emitDecoratorMetadata`，NestJS DI 必须靠 reflect-metadata，所以先 tsc 再 bundle）
  - 排除原生模块 + ORM 健康指示器可选 peer：`better-sqlite3`、`bcrypt`、`@prisma/client`、`@prisma/engines`、`@nestjs/microservices`、`@nestjs/websockets`、`class-transformer`、`class-validator`、`minio`、`fast-xml-parser`、`puppeteer`、`puppeteer-core`、`@mikro-orm/core`、`@nestjs/mongoose`、`@nestjs/sequelize` 系列、`@nestjs/typeorm` 系列
  - 实测产物体积：bundle.js ≈ **9.5 MB**（不含 node_modules），含 sourcemap 16 MB
- [x] **E4-3** Prisma 资源打包：
  - `backend/prisma/migrations.sqlite/` → `dist-embed/prisma/migrations.sqlite/`（保持目录名，`migrate-runner` 直接读）
  - `backend/src/generated/prisma-sqlite/` → `dist-embed/generated/prisma-sqlite/`（`PrismaService` 增加候选路径解析：`PRISMA_SQLITE_CLIENT_PATH` env → `../generated/...`（dev）→ `./generated/...`（embedded））
  - `dist-embed/package.json` 列出所有 native externals 给 `electron-builder asarUnpack` 参考
- [x] **E4-4** 启动时自动 migrate：写了**自家** `backend/src/embedded/sqlite-migrator.ts`（基于 `better-sqlite3`，绕开 Prisma CLI 在 `migrations.sqlite/` vs `migrations/` 上的 P3019 错位问题）。`_app_migrations` 表追踪已应用、checksum 防止 SQL 文件被改后重跑；事务包裹；rollback 干净。同时新增 npm `sqlite:migrate` 脚本供 dev 用。`AUTO_MIGRATE=true`（embedded 模式默认 on）触发，`DB_PROVIDER=sqlite` 强制；migrate 后会把 `DATABASE_URL` 改成绝对路径（Prisma 对相对 `file:` URL 解析锚点是 schema 目录而非 cwd，bundle 后 schema 目录在 `dist-embed/generated/prisma-sqlite/`，不绝对化会导致 PrismaService 跟 migrator 操作不同的 db 文件）
- [x] **E4-5** 启动时自动 seed（幂等）：`backend/src/embedded/auto-seed.ts`：
  - `user` 空 → 创建默认 admin（`admin@ectd.com / admin123`）
  - `ctd_template_node` 空 → **默认仅 warn-skip**（XML 解析依赖 reference 文件包，不在 desktop 二进制里）；改由 `scripts/build-embed.js` 在 build 时跑一次 `seed-ctd.ts` 生成 `first-run.db` 快照，由 Electron main 在首启时复制到 `<userData>/data.db`（E5/E8 完成）
  - `ControlledVocabularyService.onModuleInit` 同样改为 `REFERENCE_DIR` 缺失时只 warn 跳过
- [x] **E4-6** `backend/package.json` 新增 `build:embed` → `node scripts/build-embed.js`（tsc + esbuild + 复制资源 + 写 dist-embed/package.json）

**DoD（沙箱内验收 — 已通过）**：
- `cd backend && npm run build:embed` 产出 `dist-embed/backend.bundle.js` (≈9.5 MB)
- 干净 tmpdir 启动 bundle：自动跑 2 条 migration、`auto-seed` 创建 admin、绑定 `127.0.0.1:<port>`、stdout 第一条打印 `READY <port>`
- `curl /health` → 200 (`database.status=up`)
- `curl /api/v1/license/status` → 200 (`activated=false`，跨过 license 闸门因为 LICENSE_ENFORCE=false 或 enforced=false 时可以读)
- `kill -SIGTERM <pid>` → 进程 < 1s 优雅退出，无 zombie
- `Redis connection error` 不再刷屏（`RedisCacheService.onModuleInit` 在 `CACHE_PROVIDER!=redis` 时直接跳过 Redis 客户端构造）

**已知延后（要 E5 / E8 真机才能完整验收）**：
- 无 reference 目录时 `controlled_vocabulary` + `ctd_template_node` 为空 — 必须靠 build-time `first-run.db` 快照（E8 实施）
- bundled 后的 native module 在 Mac arm64 / Mac x64 / Win x64 三个平台的预编译 `.node` 落位 — 留给 electron-builder 配置时验证

---

### 1.6 E5：Electron main + preload 实现

**目标**：搭起 Electron 壳，能 fork backend、显示主窗口、加载前端、托盘菜单、单实例锁。

**新建目录结构**：
```
desktop/
├── package.json                  ← 声明 electron + electron-builder + ts
├── tsconfig.json
├── electron-builder.yml
├── main/
│   ├── index.ts                  ← Electron main entry
│   ├── backend-process.ts        ← fork + 健康检测 + 优雅关闭
│   ├── window.ts                 ← BrowserWindow 创建与生命周期
│   ├── tray.ts                   ← 系统托盘
│   ├── menu.ts                   ← 应用菜单（macOS 顶部栏 / Win 窗口菜单）
│   ├── machine-id.ts             ← 指纹采集（详见 E7）
│   ├── single-instance.ts        ← 单实例锁
│   ├── data-dir.ts               ← 数据目录初始化、reference 解压
│   └── logger.ts                 ← 日志写到 <userData>/logs/
├── preload/
│   └── index.ts                  ← contextBridge 暴露最小 IPC
└── resources/
    ├── icon.icns                 ← Mac 图标
    ├── icon.ico                  ← Win 图标
    ├── reference/                ← 打包时由 build 脚本复制 reference/eCTD技术规范V1.1附件包/
    └── frontend/                 ← 打包时由 build 脚本复制 frontend/dist/
```

**任务清单**：

- [x] **E5-1** `desktop/package.json` (electron@^31 + electron-builder@^24 + electron-log@^5 + typescript@^5)，scripts `dev` / `build:mac` / `build:mac:arm64` / `build:mac:x64` / `build:win` / `build:all`；`tsconfig.json`（CommonJS, target ES2022）
- [x] **E5-2** `desktop/main/single-instance.ts`：`requestSingleInstanceLock` + `focusExistingOnSecondInstance`
- [x] **E5-3** `desktop/main/data-dir.ts`：`initDataDir()` 创建 `<userData>/{files,logs,reference}/`；首启时从 `<resourcesPath>/backend/first-run.db` 复制到 `<userData>/data.db`（**这是核心 — 没有 first-run.db 则 fallback 让 backend auto-migrate 出空表**）；reference 释放用 `cv-application-type.xml` 文件 sentinel（不是目录 sentinel，避免空目录骗过判断）
- [x] **E5-4** `desktop/main/backend-process.ts`：`fork(<resources>/backend/backend.bundle.js)`，env 字典覆盖**全部 23 个** backend 读的 `process.env.*`（来自 `grep -rohE "process\.env\.[A-Z_]+" backend/src | sort -u`）；监听 IPC `message`+`READY <port>` 双通道；30s 超时报错；`stop()` 先 SIGTERM 再 5s 后 SIGKILL；child stdout/stderr 转发到 electron-log
- [x] **E5-5** `desktop/main/window.ts`：1400×900 / minSize / contextIsolation/sandbox/nodeIntegration=false；`loadURL(http://127.0.0.1:<port>)`；`setWindowOpenHandler` + `will-navigate` 限制只跳同源（外链走 `shell.openExternal`）；`ready-to-show` 避免白屏
- [x] **E5-6** `desktop/main/menu.ts`：文件/编辑/视图/窗口/帮助 + macOS app menu；"打开数据目录"/"查看日志"/"联系厂商→/about" 入口
- [x] **E5-7** `desktop/main/tray.ts`：图标缺失时优雅降级（`nativeImage.createEmpty()`）；菜单含显示主窗口/数据目录/日志/退出；click 切换显隐
- [x] **E5-8** `desktop/main/logger.ts`：`electron-log` 写 `<userData>/logs/main.log`，10MB 滚动，prod info / dev debug；child process stdout/stderr 也走这条管道
- [x] **E5-9** `desktop/preload/index.ts`：`contextBridge.exposeInMainWorld('electronAPI', ...)` 暴露 `getMachineId / getAppVersion / getPlatform / openExternal / openDataDir / openLogFile`；后端注册对应 IPC handlers (`desktop/main/ipc.ts`)
- [x] **E5-10**（额外）`desktop/main/secrets.ts`：`<userData>/secrets.json` 持久化 JWT_SECRET / JWT_REFRESH_SECRET / STORAGE_PRESIGN_SECRET（chmod 600）；首次启动 `crypto.randomBytes(32).hex` 生成，后续读取 — 否则每次启动 JWT 全部失效，用户每次都要重新登录

**沙箱内验收（已通过）**：
- `cd desktop && npm install` 装好 electron + electron-builder + electron-log（≈300 packages）
- `cd desktop && npx tsc --noEmit` 干净（main + preload 全部类型对齐）

**真机验收清单（你 git pull 后在 Mac/Win 跑）**：
- `cd desktop && npm install`
- `cd desktop && npm run dev` — 出窗口、看到 React 前端登录页（如果不出窗口看 `<userData>/Library/Application Support/eCTDTool/logs/main.log` 第一行就能定位）
- 双开应用第二个实例不会重复启动 backend
- Cmd+Q（Mac）/ 关窗（Win）后 `pgrep -f backend.bundle` 应为空
- 把 `<userData>/data.db` 删掉 → 重启 → 应自动从 first-run.db 重建

---

### 1.7 E6：前端 Electron 适配

**任务清单**：

- [x] **E6-1** 前端探测 Electron：新增 `frontend/src/contexts/EnvironmentContext.tsx` (`useEnvironment()`) + `frontend/src/types/electron-api.d.ts`（`window.electronAPI` 类型契约）；`isDesktop = !!window.electronAPI`，IPC 字段（machineId / appVersion / platform）在 mount 时 await 拿
- [x] **E6-2** API base URL：`frontend/src/services/api.ts` 已经是相对路径 `'/api/v1'`，桌面同源即可；无需改代码，仅在文档中明确
- [x] **E6-3** 外链 helper：`openExternalUrl(url)` 桌面模式走 `electronAPI.openExternal`，Web 模式 `window.open` 兜底；当前业务页面无硬编码外链，留作未来调用入口
- [x] **E6-4** Web 版独有 UI 隐藏：`ProjectDetailPage` 成员管理 Tab 的「邮箱邀请」按钮在桌面模式下条件隐藏（保留代码，运行时 `!isDesktop && <Button .../>`）；协作 Tab 的进度/工作量统计在桌面模式仍保留（单人场景仍有用）
- [x] **E6-5** 关于页：新增 `/about` 路由 + `frontend/src/pages/about/AboutPage.tsx`，展示形态 / 软件版本 / 平台 / 机器指纹（带复制按钮）/ 授权状态（客户名 / 到期日 / 剩余天数）；桌面模式额外暴露 "打开数据目录" / "查看日志" 按钮（IPC → Electron main）；用户下拉菜单加 "关于 / 激活信息" 入口
- [x] **E6-6** 编辑器剪贴板/拖拽：当前 TipTap 配置已通过 `ImageExtension` 处理粘贴/拖拽图片；Electron 沙箱里默认透传 chromium 行为，**无代码改动**；E5 真机阶段确认大图（>50MB）上传链路即可

**沙箱验收**：
- `npx tsc --noEmit` 干净
- `npm run build` 通过（Vite production bundle）
- 关键改动：`App.tsx` 包入 `EnvironmentProvider` + 加 `/about` 路由；`BasicLayout` 用户菜单加 "关于" 项

**DoD（沙箱可达部分已通过）**：
- 桌面/Web 模式由 `useEnvironment().isDesktop` 单点判断
- "关于"页机器指纹源：桌面模式 `electronAPI.getMachineId()` 直接读 main 进程注入的 env；Web 模式回退显示后端 `/license/status` 中的 `machineId`（两边算法一致）
- E5 真机后再补：完整业务流在 BrowserWindow 内不跳出窗口

---

### 1.8 E7：激活码指纹采集本地化

**目标**：从 backend 调 shell 命令改为 Electron main 用 Node API 采集，更可靠且首启即得。

**任务清单**：

- [x] **E7-1** `desktop/main/machine-id.ts` 实现（跨平台）：
  - mac: `sysctl machdep.cpu.brand_string` + `ioreg IOPlatformSerialNumber` + `ifconfig en0 ether`（en0 拿不到时 fallback 到 `os.networkInterfaces()` 第一个非 internal 非全零 MAC）
  - win: `wmic cpu get ProcessorId` + `wmic baseboard get SerialNumber` + `os.networkInterfaces()` 第一个有效 MAC（不依赖 `getmac` CSV 格式 fragile）
  - linux（dev only）：`/proc/cpuinfo` + `/sys/class/dmi/id/board_serial` + `os.networkInterfaces()`
  - 全平台兜底：所有源都为空时 → `sha256(os.hostname()).slice(0,16)`
  - **算法与 backend `license.service.ts` 的 shell fallback + `tools/runtime/get-machine-id.js` 严格一致**（同一字符串拼接顺序、同一 hash、同一 16 hex 截取）
- [x] **E7-2** 缓存到 `<userData>/machine-id.txt`，首启写入后续读；存在但格式异常时重新采集；写入失败仅 warn 不阻塞
- [x] **E7-3** 启动 backend 时 `MACHINE_ID` env 注入；IPC `app:get-machine-id` handler 在 `desktop/main/ipc.ts` 注册；preload 暴露 `electronAPI.getMachineId()`；前端「关于」页 `useEnvironment().machineId` 读
- [x] **E7-4** backend `license.service.ts` 改造已在 L 阶段完成：优先 `process.env.MACHINE_ID` → `LICENSE_MACHINE_ID_OVERRIDE` → shell fallback（mac/win/linux）
- [x] **E7-5** `tools/issue-license/issue-license.js`、`tools/keygen.sh`、`tools/keys/*.pem` — **零改动**，沿用 L 阶段把 `tools/keys/public.pem` 编译进 `backend/src/license/public-key.ts`

**真机验收清单**：
- 同一台机器多次启动指纹一致（看 `<userData>/machine-id.txt`）
- 删除 `machine-id.txt` 后启动，新值应与原值相同
- 整盘拷到另一台机器后启动，机器指纹必变；旧激活码自动失效

---

### 1.9 E8：electron-builder 打包（Mac + Win）

**任务清单**：

- [x] **E8-1** `desktop/electron-builder.yml` — appId `com.juyuan.ectd-tool`、双 arch dmg、nsis、`extraResources` 复制 `backend/dist-embed → backend/`（含 `first-run.db`）+ `reference/ → reference/` + `tools/keys/public.pem`、`asarUnpack` 把所有 `.node` + `electron-log` 解压；`build/entitlements.mac.plist` 同步建好（含 `allow-jit` / `allow-unsigned-executable-memory` / `disable-library-validation` — 这三个对 NestJS fork + native 模块加载是硬需求）；macOS `notarize: false` 默认关，等用户拿到 Apple Developer ID 后改 `true` + 设环境变量
- [x] **E8-2** `scripts/build-electron.sh` 新增（chmod +x）— 6 步串联：① backend prisma:sqlite:generate + build:embed；② backend build:firstrun-db（产生 `first-run.db` 后移到 `dist-embed/`）；③ frontend vite build；④ desktop 暂存 reference 到 `desktop/resources/reference`；⑤ desktop tsc + electron-builder（target 由参数选）；⑥ release/SHA256SUMS.txt
- [x] **E8-3** Mac 签名 + 公证流水线：electron-builder 配置已到位，`scripts/build-electron.sh` 通过 `APPLE_ID` / `APPLE_APP_SPECIFIC_PASSWORD` / `APPLE_TEAM_ID` 环境变量自动驱动 `notarytool submit --wait`；**真机验收待 Apple Developer 账号到位**
- [x] **E8-4** Windows EV 代码签名：`win.signtoolOptions` 留给 electron-builder 自动 detect `WIN_CSC_LINK` + `WIN_CSC_KEY_PASSWORD`（PFX）或 EV USB token；**真机验收待证书到位**
- [ ] **E8-5** 自动更新（P1，可选）：未开启，首版手动分发；E10 后再做

**沙箱内验收（已通过）**：
- `cd desktop && npm install`（≈300 packages）
- `cd desktop && npx tsc --noEmit` 干净
- `cd backend && npm run build:firstrun-db` 产生 `prisma/first-run.db` (576 KB) — 包含 229 CTD 节点、196 完整性规则、19 受控词汇、1 admin user；端到端验证：把该 db 拷到 tmpdir、启动 backend bundle，`auto-seed` 看到 `ctd_template_node exists (229 rows)` + `users exist (1)`，跳过 seed，`READY <port>` 正常打印

**真机验收清单（不能在沙箱跑）**：
- 在 Mac 构建机：`bash scripts/build-electron.sh mac` 产出 `desktop/release/eCTDTool-1.0.0-arm64.dmg` 与 `-x64.dmg`，体积应在 150-250 MB
- 在 Win 构建机：`bash scripts/build-electron.sh win` 产出 `desktop/release/eCTDTool-Setup-1.0.0.exe`
- `desktop/release/SHA256SUMS.txt` 自动生成
- 干净 Mac 双击 dmg → 拖入 Applications → 双击 `.app`：未签名版本会弹 Gatekeeper（右键→打开放行）；签名+公证版本无任何系统警告

---

### 1.10 E9：冷装测试 + 签名公证

**目标**：在干净 Mac + 干净 Windows 上完整跑一遍 §2 Release Gate，输出测试报告，全通过才能交付客户。

**任务清单**：

- [ ] **E9-1** 准备冷装机：
  - Mac：从未跑过本项目 / 从未装过 Docker 的 macOS 12+ 机器，**Apple Silicon + Intel 各一**
  - Windows：从未装过 Docker 的 Win10 21H2+ / Win11 各一
- [ ] **E9-2** 严格按 §2 检查表执行；任一条 fail → 打回源码侧修复 → 重新出包
- [ ] **E9-3** 业务主链路验证：登录 → 新建项目 → 新建申请+序列 → 上传 PDF → 触发验证 → 导出 ZIP → 用 ERIS 或同类工具校验 ZIP 结构合规
- [ ] **E9-4** 重启幂等：关闭 → 再开 → 数据保留、不重复 seed、激活状态保留
- [ ] **E9-5** 激活码全链路：未激活弹激活页 → 复制指纹 → 拿真实激活码激活成功 → 模拟过期（重签短期激活码）→ 业务 API 拒绝 → 重激活恢复
- [ ] **E9-6** 卸载验证：
  - Mac：拖到废纸篓后再装能恢复（数据目录默认保留）
  - Windows：控制面板卸载，程序文件清干净 + `%APPDATA%\eCTDTool\` 默认保留
- [ ] **E9-7** 输出《冷装测试报告》：用 §2 检查表做 checklist，附截图，归档到 `docs/release-notes/v<ver>-cold-install.md`

**E9 冷装暴露的 P0 修复（2026-04-26）**：

- [x] **E9-H1** 修复 `dmg` 启动后立即崩溃 `Cannot find module '@prisma/client' / .prisma/client/default / @prisma/client/runtime/library.js`。**根因**：`scripts/build-embed.js` 把 `@prisma/client` 标 external 后**未把对应 npm 包复制到 `dist-embed/node_modules/`**，`electron-builder` 只搬 `dist-embed/`，所以装好的 `Resources/backend/node_modules/@prisma/...` 是空的；同时全仓 32 个文件 `import { Role/LeafOperation/Prisma } from '@prisma/client'`（运行时值），加 `prisma.service.ts:8 extends PrismaPostgresClient`，使得 bundle 必须能 `require('@prisma/client')`。**修复**：① `build-embed.js` 新增 `copyPrismaPackage()` + `shouldCopyPrismaFile()`，把 `node_modules/@prisma/client` 与 `node_modules/.prisma/client` 按白名单复制到 `dist-embed/node_modules/` 并过滤 `.map`/`.d.ts`/`.mjs`/`README` 等非运行时文件；② `prisma/schema.prisma` 与 `prisma/schema.sqlite.prisma` 把 `binaryTargets` 扩展为 `["native","debian-openssl-3.0.x","darwin","darwin-arm64","windows"]`，确保 Mac 构建机也能下载到 darwin-arm64 query engine `.node`，否则即便修了 `require` 也会在第一次 SQLite 查询时 dlopen 失败；③ `generated/prisma-sqlite/` 的复制也接入同一过滤器去掉无用文件。沙箱 smoke：`node dist-embed/backend.bundle.js` → 自动迁移 + Nest 全模块装配 + `READY <port>` 一气呵成，复现路径不再触发。

- [x] **E9-H2** H1 修完后真机仍崩，错误升级为 `Cannot find module '@prisma/client/runtime/library.js'`，路径前缀 `Resources/backend/node_modules/` 都在但单文件 `runtime/library.js` 没了。**根因**：H1 加的白名单 `shouldCopyPrismaFile` 删掉所有 `.mjs`，但 `@prisma/client` 的 `package.json#exports` map 里 `./runtime/library` 主键的 `default` 字段指向 `library.mjs`，CJS 解析时也会去 stat 该文件（即便最终 require 走 `.js`）；同时为了"补救" H1 在 `scripts/build-electron.sh [2.5/6]` 加 `npm install --omit=dev` + `cp -R ../node_modules/.prisma`，npm install 在 dist-embed 内重装 `@prisma/client` 时会**覆盖** H1 的成果，prebuild 的 runtime 文件部分丢失，最终客户机随机缺 `library.js`。**修复**（釜底抽薪）：① `backend/scripts/build-embed.js` 删 `shouldCopyPrismaFile` 白名单，改为**整包 cp `backend/node_modules/` → `dist-embed/node_modules/`，再按黑名单 prune dev-only**（`@types/`、`@typescript-eslint/`、`@eslint/` 整 scope 删；`eslint*`/`jest`/`ts-jest`/`prettier`/`prisma`(CLI)/`typescript`/`esbuild` 等单包删；`@nestjs/cli|schematics|testing` 单删）；末尾加 10 个 runtime 关键路径 sanity check，缺一个直接 throw。② `scripts/build-electron.sh` 删 [2.5/6] 整段 `npm install --omit=dev`。③ 新增 `scripts/postbuild-verify.sh`，在 [5.5/6] 校验 `Resources/backend/{backend.bundle.js, node_modules/@prisma/client/runtime/library.js, node_modules/.prisma/client/index.js, node_modules/.prisma/client/libquery_engine-darwin*.dylib.node, node_modules/better-sqlite3/build/Release/better_sqlite3.node, generated/prisma-sqlite/index.js, prisma/migrations.sqlite/migration_lock.toml, first-run.db}` 等 9 个文件存在，缺一退出码 1，构建期红即失败。④ `desktop/electron-builder.yml` 的 `mac.target` 简化为 `dmg`，CLI `--arm64` 才能真正限制只出 arm64（之前 YAML 写死 arm64+x64 两 arch，CLI 旗标被覆盖）。

- [x] **E9-H3** H2 修完后 backend fork 仍崩 `better-sqlite3 NODE_MODULE_VERSION 127 vs 125`。**根因**：electron-builder 不会自动 rebuild dist-embed 内 native 模块；`backend/node_modules/better-sqlite3` 在 host 上 npm install 时拉的是 Node 22 ABI 127 prebuild，但 Electron 31 child_process.fork 使用的是 Electron 内置 Node ABI 125，dlopen 直接拒绝。**修复**：① `desktop/package.json` devDependencies 加 `@electron/rebuild`；② `scripts/build-electron.sh` 新增 [2.5/6] 步骤，调用 `desktop/node_modules/.bin/electron-rebuild --module-dir backend/dist-embed --version <electron> --arch <target> --only better-sqlite3,bcrypt --force`，按构建目标 arch 重编译；③ `build-embed.js` 写 `dist-embed/package.json` 时**保留 `dependencies`** 字段（之前 H2 删掉了），否则 `@electron/rebuild` 走 `package.json` 依赖树发现"无 native 模块"直接跳过；④ 因 electron-rebuild 会污染 prebuild-install 缓存，进而把 `backend/node_modules/better-sqlite3` 也换成 Electron ABI（`build-firstrun-db.js` 走系统 Node 跑会崩），在 [1/6] 开头加防御性 `npm rebuild better-sqlite3 bcrypt`，每次构建强制把 backend/node_modules native 拉回 Node ABI 后再跑 firstrun-db。

- [x] **E9-H4** H3 修完后 backend 启动时 `winston.transports.File` 抛 `ENOENT: mkdir 'logs'`。**根因**：`backend/src/main.ts` 的 `createWinstonLogger()` 在 production 模式直接用相对路径 `'logs/error.log'` / `'logs/combined.log'`，相对路径锚点是 `process.cwd()`；Electron fork 出来的 backend child cwd 是 `.app/Contents/Resources/backend/`（只读），mkdir 必败。**修复**：`main.ts` 在 `DATA_DIR` 已注入时把日志目录改为 `${DATA_DIR}/backend-logs`（与 Electron main 的 electron-log 输出 `${DATA_DIR}/logs/main.log` 隔离避免 winston 滚动日志和 electron-log 抢同一文件夹），并 `fs.mkdirSync(logDir, {recursive: true})` 提前创建；`DATA_DIR` 未设时回退原 `'logs'` 兼容 web 模式。

**E9-H 修复后真机冒烟（2026-04-26 / 构建机 = mac arm64）**：`bash scripts/build-electron.sh mac:arm64` → postbuild-verify 全绿 → `eCTDTool-1.0.0-arm64.dmg` 装到 `/Applications/`（清 userData + xattr 卸 quarantine）→ `open` 启动 → main.log: `applied 20260425023000_init` + `applied 20260425053000_add_license` + `Nest application successfully started` + `READY 54745` + `backend ready on http://127.0.0.1:54745`；`curl /health` 200（含 `database.status=up`，证明 PrismaHealthIndicator `$queryRaw` 成功 dlopen prisma engine + better-sqlite3）；`curl /api/v1/license/status` 200（含 `activated:false, machineId:4a3228a7bd40b33e`，证明 `db.license.findFirst` query 流水线通）。两个端点都 200 算 SQLite + Prisma 双侧通过。

---

## 2. 冷装测试 Release Gate（每次发版必跑）

> 四段式：**A 源码侧 → B 打包侧 → C 冷装机测试 → D 客户侧**。任一条 `[ ]` 未打勾，**不得**交付客户。

### 2.1 A 段：源码侧（打包前 git 仓库自检）

- [ ] **A1** `backend/prisma/schema.sqlite.prisma` 与 `schema.prisma` 的 model/字段集合一致（`prisma:check-parity` 退出码 0）
- [ ] **A2** `desktop/main/backend-process.ts` 的 backend 健康端点轮询路径与 `backend/src/main.ts` 实际暴露的健康端点一致；**统一 `/health`** 不要带 `/api/` 前缀（健康检查路径不一致是导致 backend 永远 unhealthy → 主窗口拉不起的高频根因）
- [ ] **A3** `desktop/main/backend-process.ts` 的 fork env 必须显式传入 backend 所有 `process.env.X`：
  - 跑 `grep -rohE "process\.env\.[A-Z_]+" backend/src | sort -u`，比对 `backend-process.ts` env 字典必须全覆盖
  - 缺失任一变量（典型如 `JWT_EXPIRES_IN`）会导致运行时崩溃，且只有走到具体业务路径才暴露
- [ ] **A4** 路径含空格的处理：`app.getPath('userData')` 在 Mac 下含空格（`Application Support`），所有传给子进程的路径**只通过环境变量传**，绝不拼成 shell 字符串或写入 `.env` 文件不加引号
- [ ] **A5** 幂等判断不依赖标记文件 / 空目录，必须查关键文件本身：
  - reference 是否需要释放：判断 `<userData>/reference/cv-application-type.xml` 是否存在
  - SQLite 是否需要 migrate：交给 `prisma migrate deploy` 自己幂等判断
  - 是否需要 seed：查具体表是否有 row，不查标记文件
  - 标记文件法的失败模式：用户清掉数据但保留标记 / 子进程异常创建空目录骗过判断
- [ ] **A6** `better-sqlite3` 等原生模块预编译产物对齐目标平台/架构（Mac arm64 + x64 + Win x64 至少三套）
- [ ] **A7** `desktop/electron-builder.yml` 的 `asarUnpack` 包含全部 `.node` + 原生 npm 模块
- [ ] **A8** `docs/update_log.md` 最新一条与代码改动对齐
- [ ] **A9** 后端日志关闭明文输出敏感信息（数据库连接串、激活码、JWT secret）

### 2.2 B 段：打包侧（构建机上跑 build 前后）

- [ ] **B1** 构建机能产出 mac-arm64 / mac-x64 / win-x64 三套 `better-sqlite3` 预编译产物（用 `prebuild-install` 或 `electron-builder` 自动）
- [ ] **B2** 打包产物在干净路径下 `tar/dmg/exe` 解压/挂载/安装能成功；安装目录无残留临时文件
- [ ] **B3** 构建机本地起一次 backend bundle 跑业务 smoke：`node desktop/build/backend.bundle.js` 启动后 curl `/health` 200，登录 API 通
- [ ] **B4** 包大小：单平台 dmg/exe 在 150-250MB；超出则查哪一层意外膨胀（重点查 `node_modules` 重复打入）
- [ ] **B5** SHA256 同目录产出 `eCTDTool-v<ver>-<platform>.{dmg,exe}.sha256` 与 `SHA256SUMS.txt`
- [ ] **B6** 测试激活码签发链路：用 `tools/issue-license/issue-license.js` 签一张占位指纹激活码，启动 Electron 用 `MACHINE_ID_OVERRIDE=<占位指纹>` 校验通过

### 2.3 C 段：冷装机测试（每版必跑）

> "冷装机"严格定义：**从未跑过本项目的机器**。不能在构建机/开发机/已装过某版的机器上测——那些机器有缓存的 npm/原生模块/数据目录，会掩盖真实新客户首装问题。

- [ ] **C1** 双击 `.dmg` → 拖入 Applications → 双击 `eCTDTool.app`：未公证版本会弹 Gatekeeper（公证后无）
- [ ] **C2** 公证后双击直接出窗口，无任何系统警告
- [ ] **C3** 启动时间 < 5s 出窗口（首次首启可放宽到 10s）
- [ ] **C4** 首启自动建数据目录、复制 reference（sentinel 判断关键文件存在）、跑 migrate + seed
- [ ] **C5** 激活页显示机器指纹 → 复制 → 用真实激活码激活成功 → 跳转主界面
- [ ] **C6** 业务主链路：登录 → 项目 → 申请+序列 → 上传 PDF → 验证 → 导出 ZIP → 校验 ZIP 结构（含 `index.xml` + `cn-regional.xml` + `index-md5.txt` + 文件树）
- [ ] **C7** Cmd+Q / 关窗口后无残留进程：`pgrep -f backend.bundle` 应为空
- [ ] **C8** 重新双击启动，数据保留、激活状态保留、上传文件保留
- [ ] **C9** 端口冲突场景：先开一个占用 18080 的进程，再启 eCTDTool —— 因为 backend 监听随机端口，本项**自动免疫**
- [ ] **C10** 把整个 `<userData>` 复制到第二台机器，启动后激活码失效（指纹变更），符合预期；删除 `<userData>/machine-id.txt` 重启后指纹仍稳定

### 2.4 D 段：客户侧（分发前最终确认）

- [ ] **D1** 客户机器最低规格：Mac (macOS 12+, 8GB 内存, 20GB 可用) / Win (Win10 21H2+, 8GB 内存, 20GB 可用)
- [ ] **D2** 《客户使用指南.pdf》一同发出（含安装、首次激活、数据备份、卸载、Gatekeeper/SmartScreen 绕过截图）
- [ ] **D3** 激活码签发台账维护：`客户名 + 机器码 + 签发日 + 到期日 + 私钥版本`（Excel/Airtable）
- [ ] **D4** 到期前 30 天主动联系客户提示续期；激活码至少留 1 个月冗余

### 2.5 E 段：已知坑对照表（持续累加）

每次冷装测试或客户现场踩到的坑记录到此表，并在 A/B/C/D 段加对应检查项，避免同样的坑踩两次。

| # | 首次发现 | 现象 | 根因 | 修复所在项 |
|---|---|---|---|---|
| — | — | — | — | （首次冷装后开始累加） |

---

## 3. 风险与回退

### 3.1 已识别风险

| # | 风险 | 等级 | 缓解 |
|---|---|---|---|
| R1 | Prisma SQLite 在大表 Json 字段查询性能不佳 | 中 | 业务上 Json 主要存配置/元数据，单序列最多几百行；性能退化时启用 SQLite JSON1 扩展或抽字段 |
| R2 | BullMQ 改同步后，导出大序列 > 30s 用户感觉卡 | 中 | 用 SSE 推进度；极端场景退一步用 Node `worker_threads` 跑 CPU 密集任务 |
| R3 | `better-sqlite3` 在客户特殊 macOS / Windows 版本上加载失败 | 低 | electron-builder 默认走预编译 + `electron-rebuild` 兜底；预编译三平台都打 |
| R4 | 客户 IT 限制无法运行未签名 .exe / .app | **高** | E8-3 / E8-4 投资 Apple Developer ID + EV 代码证书是必经之路；未签前提供绕过文档（Mac `xattr -dr com.apple.quarantine`、Win 右键属性勾选解除阻止） |
| R5 | 双 schema 长期维护成本 | 中 | Web 版已确认废弃，过渡期保留双 provider 仅为不打乱开发；E1 完成后 1-2 个迭代收敛为只用 SQLite |
| R6 | 同步执行模式下 backend 单进程 OOM | 中 | E2-8 在大序列场景做内存峰值实测；流式处理大文件不要一次性 buffer |

### 3.2 回退方案

- E1 持久层迁移**最关键**，建议在动 Electron 之前先单独把 SQLite 跑通（保留 PG 不动，新增 SQLite 测通即可继续 E2）
- 如某阶段被卡超过 2 天，先把已完成阶段的产出合并到主分支，作为部分可用版本，避免长分支漂移
- License 签发 CLI（`tools/issue-license/`）+ 密钥对（`tools/keys/`）独立可用，回退不影响授权链路；运行时校验由 L 阶段在 backend 内部新建（详见 §1.x L 阶段说明）。

### 3.3 L 阶段：License 运行时模块新建（2026-04-25 落地）

**背景**：原 plan §0.3 把 License 模块列为"已落地，不改"，实际仓库里只有签发 CLI + 密钥对 + Docker 路线遗留的 launcher 脚本。Docker 路线把校验放在 `Start.command` 调 `verify-license.js` → 桌面 Electron 路线必须把校验搬进 backend 内部，否则用户拿到一个"已激活"的窗口里所有业务 API 都没人拦。L 阶段补这个洞。

**任务清单**（已完成）：

- [x] **L-1** Prisma `License` 表（`schema.prisma` + `schema.sqlite.prisma`）+ 两份 migration（`migrations/20260425053000_add_license/` + `migrations.sqlite/20260425053000_add_license/`）；`prisma:check-parity` 通过
- [x] **L-2** `backend/src/license/` — `license.module.ts` (`@Global()` + `APP_GUARD`)、`license.service.ts`（验签 / 指纹 / 入库）、`license.controller.ts`（`/api/v1/license/{status,activate}`）、`license.guard.ts`（默认拦所有业务 API，`@Public()` 放行 `/health`、`/api/v1/auth/*`、`/api/v1/license/*`）、`public-key.ts`（编译时内嵌公钥）、`public.decorator.ts`（白名单元数据）
- [x] **L-3** Backend 单测：`license.service.spec.ts`（15 用例：指纹、验签、过期、未生效、激活幂等、状态查询、enforce on/off）+ `license.guard.spec.ts`（5 用例：白名单、enforce 关、enforce 开 + allow / deny、@Public 在 class 上）
- [x] **L-4** Frontend：`useLicenseStore`、`services/license.ts`、`pages/license/ActivationPage.tsx`、`components/LicenseBanner.tsx`、`ProtectedRoute` 加 license 闸门、`App.tsx` 加 `/activation` 路由、`BasicLayout` 顶栏挂 banner
- [x] **L-5** 文档：`backend_architecture.md` §3.3、`database_design.md` §1.1、`api_design.md` §1b、`frontend_architecture.md` §1.1+§2.8.1、`update_log.md` 追加；本 plan 修正 §0.3 "已落地" 列表

**配置开关**：
- `LICENSE_ENFORCE` — `true` / `false`，默认 `NODE_ENV==='production'`。dev 期不强制激活才能跑测试
- `MACHINE_ID` — 16 位 hex，由 Electron main 注入；缺失时 backend 走 shell fallback

**跨阶段交接**：
- **E7** 阶段会改 Electron main：用 Node API 采集指纹（不再让 backend 起子进程跑 shell），通过 `process.env.MACHINE_ID` 注入；同时缓存到 `<userData>/machine-id.txt` 减少抖动
- **E4** 阶段嵌入式启动会自动跑 `migrations.sqlite/*` 里的 License 表迁移；再加 seed 时**不要**给 license 表插任何 row，留空就是"未激活"

---

## 4. 进度追踪

> Agent 完成阶段时勾选并同步 `docs/update_log.md`。

- [x] L  License 运行时模块新建完成（2026-04-25）
- [x] E1 持久层迁移完成
- [x] E2 Redis 抽象 + BullMQ 同步执行完成
- [x] E3 文件存储抽象完成（E3-6 备份脚本延后到真机阶段）
- [x] E4 嵌入式 NestJS 启动改造完成（CTD 快照 / first-run.db 在 E8 收口）
- [x] E5 Electron 壳完成（沙箱可达部分；窗口 + 业务流真机验收）
- [x] E6 前端 Electron 适配完成（沙箱可达部分；Electron 真机内观感留 E5 一并验收）
- [x] E7 指纹本地化完成（沙箱可达部分；同机一致性 / 跨机变化在真机验证）
- [x] E8 electron-builder 打包脚本完成（出 dmg/exe + SHA256SUMS 待真机；签名/公证留证书到位后切换）
- [ ] E7 指纹本地化完成
- [ ] E8 electron-builder 打包脚本完成
- [ ] E9 冷装测试通过 + 首版 dmg/exe 交付客户

---

## 5. E9 真机冒烟历次 hotfix

> 依次修复客户机/构建机崩溃。每条记录最小可复现 + 根因 + 落地修改。最新在底。

- **H1（commit 25cd69f0）** Prisma client 没随 bundle 出货 → 加 `copyPrismaPackage()` 白名单复制 + `binaryTargets` 五平台。
- **H2/H3/H4（commit 1c60b277, 2026-04-26）** dist-embed 打包策略釜底抽薪重写 + Electron ABI rebuild + winston 日志路径修复。详见 update_log.md。
- **H5（2026-04-26）** macOS dock 激活时 `TypeError: Object has been destroyed`。**根因**：`mainWindow` BrowserWindow 关闭后 JS 引用未置空，`activate` 处理器对已销毁对象调 `.show()/.focus()`。**修复**：`desktop/main/index.ts` 的 `activate` 改为先 `isDestroyed()` 守卫，新增 `attachWindowLifecycle(win)` 在 `closed` 时把 `mainWindow` 置 null；boot 路径里每次 `createMainWindow` 后立即挂 lifecycle。**冒烟**：测试机关窗 → dock 重开新窗口正常，main.log 无异常。
- **H6（2026-04-26）** 窗口打开后看到 `{"code":404,"message":"Cannot GET /","path":"/"}`。**根因**：electron 窗口加载 `http://127.0.0.1:<port>/`，但 NestJS 没装静态文件中间件，前端 `frontend/dist` 也没打进 `.app`，根路径走到 NestJS 内置 NotFoundException 被 `AllExceptionsFilter` 包成 JSON。**修复（4 处协同）**：①`backend/src/main.ts` 用 `NestExpressApplication` 类型 + `app.useStaticAssets(publicDir, {index:false})`；publicDir 解析按 `STATIC_DIR` env > `EMBEDDED==='true' ? __dirname/public : __dirname/../public` 区分 bundled/dev（esbuild 不重写 `__dirname`，单一 `../public` 会指向不同目录）；不存在则告警跳过避免 dev 报错。②新增 `backend/src/spa/{spa.module,spa.controller}.ts`：SpaController 用 `@Get('*')` 兜底，`@Public()` 跳过 LicenseGuard（激活页本身是 SPA 一部分），排除 `/api/`、`/health`、`/api/docs`、`/socket.io` 前缀返回结构与 `AllExceptionsFilter` 一致的 404 JSON。③`backend/src/app.module.ts` 把 `SpaModule` 放 `imports` 数组**最后一项**——NestJS 路由按模块拓扑序+模块内 controller 序注册，AppModule 自身 controllers 与子模块 controllers 的相对顺序是 implementation detail，仅靠"controller 数组最后位置"不稳；用末位 import 才能保证 `@Get('*')` 注册在所有真路由后。④`backend/scripts/build-embed.js` 加 `shipFrontendDist()`：`cpSync ../frontend/dist → dist-embed/public/`，缺 index.html 则 throw（强迫先跑 vite build）；`scripts/postbuild-verify.sh` 必需文件追加 `public/index.html`、`public/assets/` 目录、assets 内 `*.js >= 1`（防 vite build 出空目录或 cpSync 中断）。**沙箱冒烟**（`/tmp/ectd-smoke` 干净 datadir 跑 bundled backend）：`/` HTTP 200 1001B text/html、`/projects/123` deep-link 同 index.html、`/api/v1/nonexistent` 404 JSON（结构同 filter）、`/health` 200、`/api/v1/license/status` 200 `activated:false machineId:4a3228a7bd40b33e`、`/assets/*.js` 200。dmg 真机冒烟待构建机执行。
