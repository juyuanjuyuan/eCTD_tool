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

### 0.3 可复用的已落地模块

以下模块已在仓库存在，本次升级**完全保留**，无需重写：

| 模块 | 文件位置 | 处理 |
|---|---|---|
| License Guard / Service / Controller | `backend/src/license/*` | **不改** |
| 激活页 + 状态 banner | `frontend/src/pages/license/*` | **不改** |
| 签发 CLI | `tools/issue-license/issue-license.js` | **不改** |
| 密钥对生成 | `tools/keygen.sh` | **不改** |
| RSA 公私钥 | `tools/issue-license/{public,private}.pem` | **不改**（公钥仍硬编码到后端） |
| `License` 表 | `backend/prisma/schema.prisma` | 跟随 E1 双 provider 同步迁到 SQLite |
| 机器指纹采集 | `backend/src/license/license.service.ts` | **小改**：来源切换为 Electron 注入的 `process.env.MACHINE_ID`，原 shell fallback 保留 |

`reference/eCTD技术规范V1.1附件包/` 与 `reference/现行申报资料要求与eCTD目录元素、CTD目录层级对应表.xlsx` 在打包时会被复制到 Electron resources，首启时释放到 `<userData>/reference/`。**不打包 PDF 规范文档**（用户不需要）。

---

## 1. 阶段拆解（Agent 执行计划）

> Agent 严格按 **E1 → E9** 顺序执行；阶段间有依赖关系，跳跃执行会导致下一阶段验收失败。

### 1.1 阶段总览

| 阶段 | 标题 | 工时 | 依赖 |
|---|---|---|---|
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

- [ ] **E1-1** 在 `backend/prisma/` 新增 `schema.sqlite.prisma`（不改原 schema，并存）：
  - `datasource db { provider = "sqlite"; url = env("DATABASE_URL") }`
  - 所有 `Json` 字段改为 `String`（在 service 层 JSON.stringify/parse；用 `Prisma.JsonValue` 类型注解保持类型安全）
  - 移除 `@db.Text`、`@db.VarChar(n)`（SQLite 不区分长度）
  - `String[]`（Postgres 数组）改为 `String`（JSON 序列化的数组）
  - 复合索引 / 唯一约束保持不变（SQLite 都支持）
- [ ] **E1-2** 创建 `backend/prisma/migrations.sqlite/` 目录，运行 `npx prisma migrate dev --schema=prisma/schema.sqlite.prisma --name init` 生成首版迁移；后续业务变更**两份 schema 同步迁移**（CI 加守卫脚本检查两份 schema 字段一致）
- [ ] **E1-3** 在 `backend/package.json` 新增 npm scripts：
  - `prisma:sqlite:migrate` → `prisma migrate deploy --schema=prisma/schema.sqlite.prisma`
  - `prisma:sqlite:generate` → `prisma generate --schema=prisma/schema.sqlite.prisma`
  - `prisma:check-parity` → 自定义 node 脚本，校验两份 schema 的 model/字段集合一致
- [ ] **E1-4** 改造 `backend/src/prisma/prisma.service.ts`：根据 `process.env.DB_PROVIDER`（`postgres` | `sqlite`）import 不同的 PrismaClient（两份 generate 输出到不同目录，如 `node_modules/.prisma/client-pg` 和 `client-sqlite`）
- [ ] **E1-5** Json 字段访问改造清单：
  - 在 `backend/src/common/json-field.helper.ts` 新增 `parseJsonField<T>(raw: string | object)` / `serializeJsonField(value)` helper（双 provider 兼容：postgres 直传对象，sqlite 序列化）
  - 改造涉及模块：`ctd-template`（`metadata`、`instanceKeyFields`、`defaultStfCategories`）、`validator`、`sequence`（信封元素）、`study`（StudyCategory 等）
- [ ] **E1-6** 数据迁移工具（仅供开发自测，**不分发**）：`tools/db-migrate-pg-to-sqlite/index.ts` — 用 PrismaClient(pg) 读、PrismaClient(sqlite) 写
- [ ] **E1-7** 单元测试：核心 service spec 用 `DB_PROVIDER=sqlite` 跑一遍（jest 用 `:memory:` SQLite）

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

- [ ] **E2-1** 抽象 cache 接口 `backend/src/common/cache/cache.interface.ts`：`get/set/del/wrap`
- [ ] **E2-2** 实现 `MemoryCacheService`（基于 `lru-cache`）：`backend/src/common/cache/memory-cache.service.ts`
- [ ] **E2-3** 改造现有 `backend/src/common/redis-cache.service.ts` 实现同一接口；保留作为开发期可选实现
- [ ] **E2-4** 改造 `backend/src/app.module.ts`：根据 `process.env.CACHE_PROVIDER`（`redis` | `memory`，默认 `memory`）注入对应实现
- [ ] **E2-5** BullMQ 队列盘点 + 改造（典型用途：验证、文档导出、可能的邮件通知）：
  - 创建 `backend/src/common/queue/sync-queue.runner.ts`：`add(jobName, data)` → 直接 `await consumer.process(data)`，并通过 EventEmitter 推进度
  - 改造涉及模块：`ValidationModule`、`ExportModule`、（如有）`NotificationModule`
  - Producer 改为注入 `IQueue`（接口），由 `QUEUE_PROVIDER` 环境变量切换 BullMQ / Sync
  - Consumer `@Process` 装饰器保留，但同步实现里用反射调用
- [ ] **E2-6** 移除 `BullModule.forRoot` 在桌面版的注册（保留为可选注册）
- [ ] **E2-7** 前端长任务交互调整：
  - 同步等待 < 3s 的（验证）：直接 `await`，loading 旋钮
  - 可能 > 3s 的（导出大序列）：后端走 SSE 或简单轮询返回进度，前端进度条；目标是用户至少看到"正在生成第 N/M 个 XML"
- [ ] **E2-8** 性能验证：对 50 文件 / 5GB 大序列做一次完整导出，观察峰值内存与耗时（避免 in-process 同步处理 OOM）

**DoD（验收）**：
- `CACHE_PROVIDER=memory QUEUE_PROVIDER=sync npm run start:dev` 在不连 Redis 时能启动
- 50 文件序列触发完整验证耗时 ≤ 10s 且前端不超时
- 导出大序列峰值内存 < 1.5GB（避免桌面版被系统杀进程）

---

### 1.4 E3：MinIO → 本地文件系统抽象

**目标**：文件存储抽象化；桌面版用本地 FS，路径基于 Electron 的 `app.getPath('userData')/files/`。

**任务清单**：

- [ ] **E3-1** 抽取接口 `backend/src/files/storage.interface.ts`：
  ```ts
  interface IFileStorage {
    upload(buffer: Buffer | Readable, key: string, mime: string): Promise<{ key: string; size: number }>;
    download(key: string): Promise<Readable>;
    delete(key: string): Promise<void>;
    presignedUrl(key: string, ttlSec: number): Promise<string>;
    exists(key: string): Promise<boolean>;
  }
  ```
- [ ] **E3-2** 现有 MinIO 实现搬到 `backend/src/files/minio-storage.service.ts`（保留可用）
- [ ] **E3-3** 新增 `backend/src/files/local-storage.service.ts`：
  - 文件落盘：`<DATA_DIR>/files/<yyyymm>/<uuid>.<ext>`（按月分子目录避免单目录过多文件）
  - `presignedUrl` 实现：生成短期 JWT (10 分钟) + 后端新增 `/files/serve/:token` 路由根据 token 鉴权后流式返回
  - 流式上传：用 `fs.createWriteStream` 避免一次性 Buffer 占内存
- [ ] **E3-4** Module 注入：根据 `STORAGE_PROVIDER`（`minio` | `local`）选择实现，默认 `local`
- [ ] **E3-5** 数据目录路径来源：通过 `DATA_DIR` 环境变量传入，由 Electron main 启动 backend 时注入 `app.getPath('userData')`
- [ ] **E3-6** 备份/恢复工具（仅供开发支援，**不分发**）：`tools/local-files/backup.ts`，把 `<DATA_DIR>/files/` + SQLite 文件打成 zip

**DoD（验收）**：
- `STORAGE_PROVIDER=local DATA_DIR=/tmp/ectd-test npm run start:dev` 启动后能正常上传/下载/删除
- 100MB PDF 上传 → 下载 → 删除全链路通过
- presigned URL 在 TTL 内可用，过期后返回 401

---

### 1.5 E4：NestJS 嵌入式启动改造（fork-friendly）

**目标**：让 NestJS 既能独立 listen 在固定端口（开发期），又能被 Electron `child_process.fork` 拉起 + 监听随机端口 + 把端口写到 stdout/IPC。

**任务清单**：

- [ ] **E4-1** 改造 `backend/src/main.ts`：
  - 默认监听端口从 `process.env.PORT || 3000` 改为 `process.env.PORT || 0`（0 表示系统分配随机端口）
  - 启动后从 `app.getHttpServer().address().port` 取真实端口
  - 通过 `process.send?.({ type: 'ready', port })` 发回父进程；同时 `console.log('READY ' + port)` 兜底（万一 fork 没建 IPC channel）
  - 加 `SIGTERM` / `SIGINT` 处理：调用 `app.close()` 优雅关闭后退出
  - 主流程加 try/catch：启动失败时 `process.send?.({ type: 'error', error: msg })` + `console.error('ERROR ' + msg)` 后退出码 1
- [ ] **E4-2** 新增 backend 嵌入式构建产物 `backend/dist-embed/`：
  - 用 `esbuild` 把 `dist/src/**` + 必要的 node_modules 打成 `backend.bundle.js`（单文件）
  - 排除原生模块（`better-sqlite3`、`bcrypt` 等）：保留为 external，由 Electron 在运行时解析（要打入 Electron 应用包的 `node_modules` 副本）
  - 排除 `@prisma/client`：放在 external，运行时从 unpacked 目录加载
  - 预期产物体积 50-80 MB（不含 node_modules）
- [ ] **E4-3** Prisma 资源打包：
  - `backend/prisma/migrations.sqlite/` 整个目录复制到 `dist-embed/prisma/migrations/`
  - `prisma generate --schema=prisma/schema.sqlite.prisma` 输出 client 也打入
- [ ] **E4-4** 启动时自动 migrate：在 `bootstrap()` 最开头调用 `await runMigrations()`（用 `@prisma/migrate` 的 programmatic API 或 spawn `prisma migrate deploy` 子进程）
- [ ] **E4-5** 启动时自动 seed（幂等）：检测到关键表为空时跑 `seed.ts` + `seed-ctd.ts`（沿用既有的 upsert / `existing > 0` 守卫保证幂等）
- [ ] **E4-6** `backend/package.json` 新增 script：`build:embed` → tsc + esbuild 打 bundle + 复制 prisma 资源

**DoD（验收）**：
- `node backend/dist-embed/backend.bundle.js` 直接能起，stdout 第一行打印 `READY <port>`
- 在空数据目录下首启自动建表 + 种子数据
- `kill -SIGTERM <pid>` 后进程在 5s 内优雅退出，无僵尸子进程

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

- [ ] **E5-1** `desktop/package.json`：声明 `electron@^31`、`electron-builder@^24`、`typescript@^5`、`@types/node`；scripts: `dev`、`build:mac`、`build:win`、`build:all`
- [ ] **E5-2** `main/single-instance.ts`：`app.requestSingleInstanceLock()` 失败时退出；命中第二实例时 focus 已有窗口
- [ ] **E5-3** `main/data-dir.ts`：
  - 初始化 `<userData>/{files,logs,license,reference}/`
  - reference 释放：从 `process.resourcesPath/reference/` 复制到 `<userData>/reference/`，**判断条件用关键文件 sentinel `cv-application-type.xml` 是否存在**（不要用目录是否存在判断；docker bind mount 或子进程异常会创建空目录骗过判断）
- [ ] **E5-4** `main/backend-process.ts`：
  - `fork(path.join(process.resourcesPath, 'backend.bundle.js'), [], { env: { DB_PROVIDER:'sqlite', DATABASE_URL:'file:'+path.join(userData,'data.db'), CACHE_PROVIDER:'memory', QUEUE_PROVIDER:'sync', STORAGE_PROVIDER:'local', DATA_DIR:userData, MACHINE_ID, JWT_SECRET, JWT_EXPIRES_IN:'7d', JWT_REFRESH_EXPIRES_IN:'30d', NODE_ENV:'production', PORT:'0' } })`
  - **完整列出所有 backend 读的环境变量**（参考 §2 A3，从 backend src grep `process.env.` 反推），缺失任一会导致运行时崩溃
  - 监听 `message` 拿 `READY port`；超时 30s 报错弹窗给用户复制日志
  - 监听 `exit` 异常退出时弹错误窗口 + 自动打开日志文件
  - `gracefulShutdown(timeoutMs)`：先 IPC 通知，再 SIGTERM，3s 后还没退出 SIGKILL
- [ ] **E5-5** `main/window.ts`：
  - `new BrowserWindow({ width:1400, height:900, minWidth:1024, minHeight:700, webPreferences:{ preload, contextIsolation:true, nodeIntegration:false, sandbox:true } })`
  - `win.loadURL('http://127.0.0.1:' + port)`
  - macOS 关闭最后一个窗口不退出（`activate` 重建）
  - 默认禁用 webview 创建外部 window，外链一律走 `shell.openExternal`
- [ ] **E5-6** `main/menu.ts`：基础菜单（文件 / 编辑 / 视图 / 窗口 / 帮助）；macOS 自动加 app 菜单；隐藏开发者工具（生产 build）
- [ ] **E5-7** `main/tray.ts`：托盘菜单（显示主窗口 / 打开数据目录 / 查看日志 / 关于 / 退出）
- [ ] **E5-8** `main/logger.ts`：用 `electron-log` 把 main + backend stdout/stderr 统一写到 `<userData>/logs/main.log`，按日期切分；最近 7 天滚动保留
- [ ] **E5-9** `preload/index.ts`：通过 `contextBridge.exposeInMainWorld('electronAPI', {...})` 暴露：
  - `getMachineId()` → 当前指纹
  - `getAppVersion()`、`getPlatform()`
  - `openExternal(url)`、`showItemInFolder(path)`
  - `openLogFile()` → 打开日志文件
  - `openDataDir()` → 在 Finder/Explorer 打开数据目录

**DoD（验收）**：
- `cd desktop && npm run dev` 能开窗口、看到 React 前端登录页
- 双开应用第二个实例不会重复启动 backend
- Cmd+Q（Mac）/ 关窗（Win）后无残留 node 子进程（`pgrep -f backend.bundle` 应为空）
- 日志文件可读，发生 backend 崩溃时弹窗指向日志路径

---

### 1.7 E6：前端 Electron 适配

**任务清单**：

- [ ] **E6-1** 前端探测 Electron：`window.electronAPI` 存在 → 桌面模式标志位放在 React Context
- [ ] **E6-2** API base URL：原本写死的 `http://localhost:3000` 改为相对路径 `''`（前端走 backend 同源），由 Vite proxy / Nginx 配置剔除
- [ ] **E6-3** 文件下载：保持 `<a href download>` 由 Chromium 处理；外链一律 `window.electronAPI.openExternal`
- [ ] **E6-4** Web 版独有 UI 入口隐藏：「邀请协作者」、「分享链接」等按钮在桌面模式下隐藏（仅做条件渲染，不删代码）
- [ ] **E6-5** 应用信息展示：「关于」页面显示 `getAppVersion()` 和 `getMachineId()`（机器指纹用于客户问询激活码时复制）
- [ ] **E6-6** 编辑器（TipTap）的剪贴板/拖拽：在 Electron 中确认外部图片拖入能正常上传

**DoD（验收）**：
- 在 Electron 窗口内完成完整业务流，无外链跳出当前窗口
- 「关于」页面机器指纹与 backend `/license/status` 返回一致

---

### 1.8 E7：激活码指纹采集本地化

**目标**：从 backend 调 shell 命令改为 Electron main 用 Node API 采集，更可靠且首启即得。

**任务清单**：

- [ ] **E7-1** `desktop/main/machine-id.ts` 实现（跨平台）：
  ```ts
  // mac
  const cpu = execSync('sysctl -n machdep.cpu.brand_string').toString().trim();
  const board = execSync(`ioreg -l | awk '/IOPlatformSerialNumber/ {print $4}' | tr -d '"'`).toString().trim();
  // win
  const cpu = execSync('wmic cpu get ProcessorId /value').toString().match(/ProcessorId=(.+)/)?.[1]?.trim();
  const board = execSync('wmic baseboard get SerialNumber /value').toString().match(/SerialNumber=(.+)/)?.[1]?.trim();
  // 共用
  const mac = Object.values(os.networkInterfaces()).flat()
    .find((i: any) => i && !i.internal && i.mac && i.mac !== '00:00:00:00:00:00')?.mac ?? '';
  const fp = sha256(cpu + board + mac).slice(0, 16);
  ```
- [ ] **E7-2** 缓存到 `<userData>/machine-id.txt`（首启写入后续读，避免硬件偶发抖动导致指纹漂移）
- [ ] **E7-3** 启动 backend 时通过 `MACHINE_ID` 环境变量注入；同时通过 IPC 暴露 `electronAPI.getMachineId()` 供前端「关于」页显示
- [ ] **E7-4** backend `license.service.ts` 改造：优先读 `process.env.MACHINE_ID`，缺失时再走原 fallback（保留向后兼容）
- [ ] **E7-5** 复用既有 `tools/issue-license/issue-license.js`、`tools/keygen.sh`、已生成的密钥对 — **零改动**

**DoD（验收）**：
- 同一台机器多次启动指纹一致
- `<userData>/machine-id.txt` 删除后下次启动重新采集，结果与之前相同
- 复制 `<userData>/` 整体到另一台机器后启动，机器指纹会变（防迁移作弊）；激活码自动失效

---

### 1.9 E8：electron-builder 打包（Mac + Win）

**任务清单**：

- [ ] **E8-1** `desktop/electron-builder.yml`：
  ```yaml
  appId: com.<company>.ectd-tool
  productName: eCTDTool
  directories:
    output: release
  mac:
    target: { target: dmg, arch: [arm64, x64] }
    category: public.app-category.business
    hardenedRuntime: true
    gatekeeperAssess: false
    entitlements: build/entitlements.mac.plist
    notarize: { teamId: <TEAM_ID> }
  win:
    target: { target: nsis, arch: [x64] }
    icon: resources/icon.ico
    publisherName: <Company Legal Name>
  nsis:
    oneClick: false
    perMachine: false
    allowToChangeInstallationDirectory: true
  extraResources:
    - from: ../backend/dist-embed
      to: backend
    - from: resources/reference
      to: reference
    - from: ../tools/issue-license/public.pem
      to: public.pem
  asarUnpack:
    - "**/*.node"
    - "node_modules/better-sqlite3/**"
    - "node_modules/@prisma/**"
  ```
- [ ] **E8-2** `scripts/build-electron.sh`（新增）：
  ```bash
  # 1) 后端嵌入式构建
  cd backend && npm run build:embed
  # 2) 前端构建
  cd ../frontend && npm run build
  # 3) 复制资源
  cp -R ../frontend/dist ../desktop/resources/frontend
  cp -R ../reference/eCTD技术规范V1.1附件包 ../desktop/resources/reference/
  cp ../reference/现行申报资料要求与eCTD目录元素、CTD目录层级对应表.xlsx ../desktop/resources/reference/
  # 4) Electron 打包
  cd ../desktop && npm run build:$1   # mac | win | all
  # 5) SHA256
  shasum -a 256 release/*.dmg release/*.exe > release/SHA256SUMS.txt
  ```
- [ ] **E8-3** Mac 签名 + 公证流水线：
  - Apple Developer ID Application 证书导入 keychain
  - `electron-builder` 自动调用 `notarytool submit --wait`
  - 失败时下载 notarization log 排查
- [ ] **E8-4** Windows EV 代码签名：
  - 接入 EV 代码签名证书（USB token 或 Azure Key Vault）
  - `electron-builder.yml` 配置 `win.signtoolOptions`
- [ ] **E8-5** 自动更新（P1，可选）：配置 `electron-updater` + 静态 `latest.yml` 托管位置；首版可不开启，留口子

**DoD（验收）**：
- 一行命令产出 `eCTDTool-v<ver>-mac-arm64.dmg` / `-mac-x64.dmg` / `-Setup-<ver>.exe`，体积都在 150-250MB 区间
- SHA256SUMS.txt 同目录产出
- 在另一台干净机器上能正常安装运行（不依赖构建机环境）

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
- License 模块、密钥对、签发 CLI 已经存在且独立可用，回退不影响授权链路

---

## 4. 进度追踪

> Agent 完成阶段时勾选并同步 `docs/update_log.md`。

- [ ] E1 持久层迁移完成
- [ ] E2 Redis 抽象 + BullMQ 同步执行完成
- [ ] E3 文件存储抽象完成
- [ ] E4 嵌入式 NestJS 启动改造完成
- [ ] E5 Electron 壳完成
- [ ] E6 前端 Electron 适配完成
- [ ] E7 指纹本地化完成
- [ ] E8 electron-builder 打包脚本完成
- [ ] E9 冷装测试通过 + 首版 dmg/exe 交付客户
