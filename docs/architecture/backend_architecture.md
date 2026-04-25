# 后端架构设计

## 1. 模块划分

### 1.1 核心模块

| 模块 | 职责 | 关键服务 |
|------|------|---------|
| `auth` | JWT 认证、登录注册 | AuthService, JwtStrategy |
| `user` | 用户管理、角色权限 | UserService |
| `project` | 项目管理（一个项目 = 一个药品的全部申请） | ProjectService |
| `application` | 申请管理（信封申请级别属性，创建后不可变） | ApplicationService |
| `regulatory-activity` | 注册行为管理（信封注册行为级别属性） | RegulatoryActivityService |
| `sequence` | 序列管理（序列号、序列类型、联系人） | SequenceService |
| `controlled-vocabulary` | 受控词汇解析与查询（4种申请类型×9种注册行为×4种序列类型关联） | ControlledVocabularyService |
| `ctd-template` ✅ | CTD 五模块目录模板管理、序列目录初始化、内容完整性检查、骨架属性、扩展节点 | CtdTemplateService |
| `document` ✅ | 文档内容管理（富文本内容、版本历史、字数统计、语言属性） | DocumentService |
| `export` ✅ | 文档导出（Word/PDF）+ eCTD PDF 合规检查 + Bull Queue 异步任务 | ExportService, WordExportService, PDFExportService, PDFComplianceService, ExportProcessor |
| `ectd` ✅ | eCTD 核心逻辑（XML 骨架生成、验证引擎、MD5 校验、生命周期状态机、STF XML 纯生成/解析、提交包组装） | CnRegionalXmlService, IndexXmlService, ValidatorService, LifecycleService, **StudyTaggingFileService (v2 — 纯 XML in/out)**, Md5Service, PackageAssemblerService |
| `study` ✅ | **(Plan 12, 2026-04-09)** 多研究 STF 模型 CRUD + 生命周期 + XML 导入 | StudyService, StudyTaggingFileImportService |
| `file` ✅ | 文件存储（MinIO 操作、命名规范化、PDF 分析、文件复用） | FileService, MinioService, FileNameNormalizerService |
| `edit-lock` ✅ | Redis 编辑锁（SETNX 30min TTL、5min 心跳续期、强制解锁） | EditLockService |
| `approval` ✅ | 文档审批流程（提交/通过/驳回/解锁、序列审批总览、导出门控） | ApprovalService |
| `comment` ✅ | 节点评论（嵌套回复、作者/MANAGER 删除） | CommentService |
| `activity-log` ✅ | 操作审计日志（不可删除、按序列查询、分页） | ActivityLogService |
| `assignment` ✅ | 章节级权限指派（指派/取消/权限继承/编辑拦截） | AssignmentService |
| `notification` ✅ | 站内通知（创建/已读/未读数/WebSocket 实时推送） | NotificationService |
| `collaboration` ✅ | WebSocket 协同感知（Socket.IO Gateway、在线状态、房间、事件广播） | CollaborationGateway, CollaborationService |
| `dashboard` ✅ | 工作台聚合查询（待办任务、最近编辑、项目进度、工作量分布） | DashboardService |

### 1.2 模块依赖关系

```
auth ← user
project ← application ← regulatory-activity ← sequence
controlled-vocabulary (被 application/regulatory-activity/sequence/ectd/study 引用, 含 STF category/file-tag 查询)
ctd-template ← document ← export
                          ← ectd (xml-backbone, validator, lifecycle, study-tagging-file — 纯 XML in/out)
study (Plan 12 v2) ← 依赖 ectd.StudyTaggingFileService + controlled-vocabulary + file, 被 index-xml/package-assembler/validator 引用读取 node.studies[]
file (独立，被 document/export/ectd/study 引用)
edit-lock (Redis-based, 独立)
approval ← export (审批门控)
comment (独立)
activity-log (独立, 被其他模块调用记录日志)
assignment (依赖 sequence-node/user, 被 edit-lock/document/approval 引用做权限拦截)
notification (独立, 被 assignment/approval/comment/invitation 调用创建通知)
collaboration (WebSocket Gateway, 依赖 auth/Redis, 被 edit-lock/document/approval 调用广播事件)
dashboard (聚合查询, 依赖 assignment/approval/activity-log/project)
invitation (在 project 模块内, InvitationController, 邮箱邀请+接受+取消)
```


### 1.3 嵌入式启动 / Electron 桌面集成（software_upgrade / E4 阶段）

`backend/src/embedded/` 收口桌面单机版的运行时基础：

- `sqlite-migrator.ts`：基于 `better-sqlite3` 的迁移 runner，读 `prisma/migrations.sqlite/<sortedName>/migration.sql`，用 `_app_migrations(name, checksum, applied_at)` 跟踪。绕开了 Prisma CLI 默认 migrations 路径与 SQLite 路径错位的 P3019 问题，桌面运行时不依赖 Prisma CLI。事务包裹 + checksum 校验（防止 SQL 文件被改后再 apply）。
- `auto-seed.ts`：用户空 → 创建默认 admin；CTD 模板表空 → 默认 warn-skip（CTD 模板 seed 依赖 `reference/eCTD技术规范V1.1附件包/` XML 文件，桌面 binary 不携带；E8 build 时跑一次 seed 后冻结成 `first-run.db` 快照，Electron main 首启复制到 `<userData>/data.db`）
- `embedded-paths.ts`：解析 `MIGRATIONS_DIR`、`DATABASE_URL`（绝对化 file: URL 以避免 Prisma 相对路径锚点漂移）
- `main.ts`：`EMBEDDED=true` 时端口默认 `0`（OS 随机），`AUTO_MIGRATE` / `AUTO_SEED` 默认 on；启动后 `process.send({type:'ready', port})` + `console.log('READY ' + port)` 双通道；SIGTERM/SIGINT → `app.close()` → exit；启动失败 IPC + console.error 报错并 exit 1
- `RedisCacheService.onModuleInit` 在 `CACHE_PROVIDER!=redis` 时跳过 Redis 客户端构造（避免 desktop / sqlite 模式刷屏 ECONNREFUSED）
- `ControlledVocabularyService` 在 `REFERENCE_DIR` 缺失或 reference 路径不存在时仅 warn 跳过

新构建产物：`backend/dist-embed/`
- `backend.bundle.js` — esbuild 单文件 CJS bundle（≈9.5 MB），native deps + ORM 健康指示器可选 peer 全部 external
- `prisma/migrations.sqlite/*` — 迁移 SQL 文件
- `generated/prisma-sqlite/*` — 生成的 SQLite Prisma client（含平台 `.node` 引擎）
- `package.json` — 列出所有 external 依赖供 `electron-builder asarUnpack` 解压

环境变量（embedded 模式新增）：
- `EMBEDDED` — `true` 时启用嵌入式行为（随机端口 + AUTO_MIGRATE/AUTO_SEED 默认 on + IPC ready）
- `AUTO_MIGRATE` / `AUTO_SEED` — `true|false`，覆盖 EMBEDDED 默认
- `MIGRATIONS_DIR` — Electron main 注入的迁移目录绝对路径
- `PRISMA_SQLITE_CLIENT_PATH` — Electron main 注入的 generated client 绝对路径
- `REFERENCE_DIR` — Electron main 注入 `<userData>/reference/`（首启释放后的 reference 目录）

### 1.4 文件存储抽象（software_upgrade / E3 阶段）

`backend/src/file/` 在保留 `MinioService` 这个对外注入名（8 处 caller）的前提下，引入抽象层：

- `storage.interface.ts` 定义 `IFileStorage`（uploadFile / uploadFileStream / getFile / getFileStream / fileExists / deleteFile / getPresignedDownloadUrl / getPresignedPreviewUrl）
- `minio-storage.ts` 提供 `MinioStorage`（原 minio.service.ts 内部逻辑迁出，行为 1:1 保留）
- `local-storage.ts` 提供 `LocalStorage`（落到 `<DATA_DIR>/files/<key>`，按月路径由 caller 自己决定；`presignedUrl` 用 JWT 签 10min 短期 token）
- `MinioService`（@Injectable 名字保留为 façade）按 `process.env.STORAGE_PROVIDER`（默认 `local`）选择 delegate；`onModuleInit` 仅在 `minio` 模式跑 bucket 检查
- 新增 `file-serve.controller.ts` 暴露 `GET /api/v1/files/serve/:token`（`@Public()` 跳过 license guard，因为 token 自身就是凭证），仅 local 模式生效

环境变量：
- `STORAGE_PROVIDER` = `local` | `minio`，默认 `local`
- `DATA_DIR` — 桌面版数据根目录，由 Electron main 注入（E5 阶段写入）
- `STORAGE_PRESIGN_SECRET` — 可选；缺省时 fallback 到 `JWT_SECRET`，再缺省直接报错
- `PUBLIC_BASE_URL` — 可选；前后端同源时留空（生成相对路径）

### 1.4 持久层双 provider（software_upgrade / E1 进行中）

- Prisma 进入过渡态：
  - PostgreSQL schema：`backend/prisma/schema.prisma`
  - SQLite schema：`backend/prisma/schema.sqlite.prisma`
- 新增脚本：
  - `npm run prisma:sqlite:migrate`
  - `npm run prisma:sqlite:generate`
  - `npm run prisma:check-parity`
- SQLite 首版迁移目录：`backend/prisma/migrations.sqlite/`（含 init SQL）。
- 新增 JSON 双 provider helper：`backend/src/common/json-field.helper.ts`，已在 `ctd-template` / `study` 接入读取 JSON 字段。
- `PrismaService` 已按 `DB_PROVIDER` 支持 Postgres/SQLite 双客户端切换（SQLite 走 `src/generated/prisma-sqlite`，通过代理转发 delegate 调用）。
- 新增开发迁移脚本：`node tools/db-migrate-pg-to-sqlite/index.js`（PG→SQLite 数据搬运，支持 `--dry-run`）。
- E2 进行中：新增 `ICacheService` 抽象与 `MemoryCacheService`（TTL 内存缓存），`RedisCacheService` 已实现统一 `wrap` 接口。
- E2 继续：`PrismaModule` 按 `CACHE_PROVIDER` 选择注入 `RedisCacheService` 或 `MemoryCacheService`（默认 memory，无 Redis 也可运行缓存调用链）。
- E2 队列抽象：新增 `IQueue` / `SyncQueueRunner` / `BullQueueAdapter`，`ExportModule` 按 `QUEUE_PROVIDER` 在同步执行与 Bull 队列之间切换。
- E2 队列基础设施：`AppModule` 与 `ExportModule` 对 Bull 注册改为可选（仅 `QUEUE_PROVIDER=bull` 启用），默认 `sync` 不依赖 Redis。
- 目标：在不打断现有 PG 开发流的前提下，为 Electron 桌面版提供 SQLite 运行基座。

## 2. API 规范

### 2.1 URL 约定

```
/api/v1/{resource}          # RESTful 资源
/api/v1/{resource}/:id      # 单个资源
/api/v1/{resource}/:id/{sub-resource}  # 子资源
```

### 2.2 响应格式

```typescript
// 成功响应
{
  "code": 200,
  "data": { ... },
  "message": "success"
}

// 分页响应
{
  "code": 200,
  "data": {
    "items": [...],
    "total": 100,
    "page": 1,
    "pageSize": 20
  }
}

// 错误响应
{
  "code": 400,
  "message": "参数校验失败",
  "errors": [
    { "field": "name", "message": "名称不能为空" }
  ]
}
```

### 2.3 认证方案

- JWT Bearer Token
- Access Token（有效期 2h）+ Refresh Token（有效期 7d）
- 请求头: `Authorization: Bearer <token>`

## 3. 认证与权限

### 3.1 角色定义

| 角色 | 权限 |
|------|------|
| `ADMIN` | 全部权限，用户管理，系统设置 |
| `MANAGER` | 项目管理，审批文档，导出 eCTD 包，强制解锁 |
| `EDITOR` | 创建/编辑文档，上传文件 |
| `VIEWER` | 只读查看 |

### 3.2 权限守卫

```typescript
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.MANAGER)
```

### 3.3 桌面版激活码守卫（software_upgrade / L 阶段）

桌面 Electron 路线下增加全局 `LicenseGuard` (`backend/src/license/license.guard.ts`)，通过 `APP_GUARD` 注册：

- 默认行为：production 环境强制启用 (`LICENSE_ENFORCE` 控制，默认 `NODE_ENV==='production'`)
- 白名单：`@Public()` (`backend/src/license/public.decorator.ts`) 放行的路由，包含：
  - `GET /health`
  - 全部 `/api/v1/auth/*`（登录、注册、刷新、me）
  - 全部 `/api/v1/license/*`（状态查询、激活）
- 拒绝时返回 `403 Forbidden` 提示前往激活页

`LicenseService` 负责：
- 内嵌公钥验签（`backend/src/license/public-key.ts`，build-time 编译进二进制，运行时不读文件）
- 机器指纹采集：优先 `process.env.MACHINE_ID`（Electron main 注入）→ `LICENSE_MACHINE_ID_OVERRIDE`（开发期）→ shell fallback (mac/linux/win 各一套)
- 激活流程：解析 `base64url(payload).base64url(signature)` → RSA-SHA256 验签 → 比对指纹 → 校验 `expiresAt > today` → upsert 到 `license` 表，旧 active 行置 false
- 校验报错分类：`malformed` / `bad-signature` / `fingerprint-mismatch` / `expired` / `not-yet-valid`，前端按类型给出对应提示
- 启动时不阻塞 boot；guard 在第一个业务请求时同步校验 DB 现状

## 4. eCTD 核心业务逻辑

### 4.1 受控词汇服务

从 `reference/eCTD技术规范V1.1附件包/附件1-2：受控词汇文件包/` 解析:
- `cv-application-type.xml` → 4 种申请类型 (cnapt1-4)
- `cv-product-type.xml` → 2 种产品类型 (cnprt1-2)
- `cv-regulatory-activity-type.xml` → 9 种注册行为类型 (cnrat1-9)
- `cv-sequence-type.xml` → 4 种序列类型 (cnsqt1-4)
- `depend-apt-rat-sqt.xml` → 三级关联矩阵

每个代码带有 version、valid-from、valid-to 属性，系统需按日期选用有效版本。

### 4.2 编号管理

```typescript
// 原始编号: 年份(4位) + 流水号(6位)
// 例: 2026123456
generateOriginalNumber(): string

// 申请编号: 字母前缀 + 年份(4位) + 流水号(5位)
// 前缀规则: x=化学药品(临床/新药/仿制药), y=生物制品, l=进口药品, s=原料药
// 例: x202612345
// 注意: 创建后不可修改
generateApplicationNumber(appType: string, productType: string): string

// 序列号: 4 位数字，**在 application 维度全局唯一连续递增**（方案 C, 2026-04-08）
// 不再是 RA 内部递增；ICH eCTD v3.2.2 + NMPA V1.1 要求同一申请下序列号全局唯一
// DB 唯一约束: UNIQUE(application_id, sequence_number)
// 实现: SELECT MAX(sequence_number) FROM sequence WHERE application_id = ? + 1
generateSequenceNumber(applicationId: string): string
```

### 4.3 信封元素管理

cn-regional.xml 的 cn-envelope 包含 3 个层级共 12 个必填属性:

| 层级 | 属性 | 是否受控词汇 | 不可变性 |
|------|------|-----------|---------|
| 申请级别 | application-id | 否 | 创建后不可变 |
| 申请级别 | application-type (code+version) | 是 | 创建后不可变 |
| 申请级别 | product-type (code+version) | 是 | 创建后不可变 |
| 申请级别 | product-number | 否 | 创建后不可变 |
| 注册行为级别 | related-sequence | 否 | 同一活动内不可变 |
| 注册行为级别 | regulatory-activity-type (code+version) | 是 | 同一活动内不可变 |
| 序列级别 | sequence-number | 否 | 自动生成 |
| 序列级别 | sequence-type (code+version) | 是 | 可设置 |
| 序列级别 | sequence-description | 否 | 可修改 |
| 序列级别 | sequence-contact (name/phone/email) | 否 | 可修改 |

### 4.4 XML 骨架文件生成

**cn-regional.xml** — 区域骨架文件（模块一）:
- 根元素 `<cn_ectd>` + Schema 引用（cn-regional-1-0.xsd）
- 信封元素 `<cn-envelope>` — 从申请/注册行为/序列数据填充
- 目录元素 `<cn-content>` — cn-1-0 至 cn-1-12 的叶元素
- 通过 Schema 验证

**index.xml** — ICH 骨架文件（模块二至五）:
- XML 声明 + DTD 引用（ich-ectd-3-2.dtd）+ XSL 样式表引用
- 模块二至五的目录元素和叶元素
- 骨架属性: substance/manufacturer (2.3.S/3.2.S 必填), product-name/dosageform (2.3.P/3.2.P 选填), indication (m2-7-3 必填)
- 通过 DTD 验证

**index-md5.txt** — MD5 校验文件:
- index.xml 的 MD5 值
- cn-regional.xml 的 MD5 值

### 4.5 文件生命周期状态机

| 操作 | operation 属性 | modified-file | xlink:href | checksum | 约束 |
|------|-------------|---------------|------------|----------|------|
| 新建 | `new` | 无 | 有 | 有 | 首次提交序列(0000)必须全 new |
| 替换 | `replace` | 指向原文件 | 有（新文件） | 有（新MD5） | 新旧 xml:lang 必须一致; checksum 必须不同 |
| 增补 | `append` | 指向原文件 | 有 | 有 | 仅建议对 STF 使用 |
| 删除 | `delete` | 指向原文件 | **无** | **无** | 删除后可在后续序列 new 重建 |

**撤回序列构建 (cnsqt3):**
1. 原 new 文件 → 标记为 delete
2. 原 replace 文件 → 以 new 恢复原始文件
3. 原 delete 文件 → 以 new 重新创建
4. 涉及模块四五时同步生成 STF

**骨架属性更新规则:**
更新 2.3.S/3.2.S 的 substance/manufacturer 时，必须删除旧章节全部内容并以 new 操作重建新章节。

**多实例节点 (Plan 13 — 2026-04-23)**:

对照 ICH DTD `ich-ectd-3-2.dtd` 中标注 `*`（可重复）的 5 个 element，支持同一序列下承载多个原料药 / 多个制剂 / 多个适应症等场景。模板节点通过 `is_repeatable=true` 标记，`instance_key_fields` 声明区分实例所需的骨架属性字段。SequenceNode 通过 `instance_index` 区分同一模板节点下的多个实例（root 实例及其整个后代子树共享同一 `instance_index`）。

| Template elementName | ctd_section | instance_key_fields (DTD 必需属性) |
|---|---|---|
| `m2-3-s-drug-substance` | 2.3.S | `substance` + `manufacturer` (REQUIRED) |
| `m2-3-p-drug-product` | 2.3.P | `productName` / `dosageForm` / `manufacturer` (IMPLIED) |
| `m2-7-3-summary-of-clinical-efficacy` | 2.7.3 | `indication` (REQUIRED) |
| `m3-2-s-drug-substance` | 3.2.S | `substance` + `manufacturer` (REQUIRED) |
| `m3-2-p-drug-product` | 3.2.P | `productName` / `dosageForm` / `manufacturer` (IMPLIED) |

**API**:
- `GET /sequences/:seqId/template-nodes/:templateNodeId/instances` — 列出某可重复节点的全部实例
- `POST /sequences/:seqId/template-nodes/:templateNodeId/instances` — 添加新实例（深拷贝整个模板子树为新 SequenceNode，共享 `instance_index`）
- `DELETE /sequences/:seqId/instances/:instanceRootNodeId` — 删除实例（首次序列物理删除；非首次级联给叶子标记 operation=DELETE）

**文件路径隔离**：`FileNameNormalizer.buildEctdRelativePath(ctdSectionNumber, normalizedFileName, instanceIndex)` 对 `instance_index > 0` 的实例在 folder 最后一段追加 `-N` 后缀（如 `m3/32-body-of-data/32s-drug-sub-1/spec.pdf`），`instance_index = 0` 保持历史路径不变以向后兼容。

**XML 输出**：由于同一父节点下现在可以有多个同 elementName 的子 SequenceNode，`IndexXmlService.buildElement` 自然按 children 迭代输出多个 element，每个携带各自的 substance/manufacturer/product-name/dosageform/indication 属性。

### 4.6 STF 服务（Plan 12 v2 — 2026-04-09）

> **v1 → v2 重构说明**：2026-04-09 废弃 v1 的 `backend/src/ectd/services/stf.service.ts`（228 行单表 1:1 upsert 设计）与 `schema.prisma` 的 `StudyTaggingFile` model，重建为 v2 多研究模型：`study` / `study_category` / `study_document` 三张新表 + 纯 XML service + CRUD service + import service 三层分离。

**适用范围**：模块四的 4.2.X 和模块五的 5.3.1.X-5.3.5.X 下的每一份研究报告都必须有独立的 STF XML 文件。

**规范基线**：ICH STF v2.6.1（DTD 名称仍为 `ich-stf-v2-2.dtd`，version 属性 `"2.2"`）+ ICH valid-values.xml v6.0 (November 2023)。

#### 4.6.1 层次划分

```
┌─────────────────────────────────────────────────────────────────┐
│ StudyController (REST API 9 个端点)                             │
├─────────────────────────────────────────────────────────────────┤
│ StudyService (CRUD + 生命周期解析 + cache xml 重算)             │
│ StudyTaggingFileImportService (XML 导入 + 冲突处理)             │
├─────────────────────────────────────────────────────────────────┤
│ StudyTaggingFileService (纯 XML in/out，零 DB / 零 FS 访问)     │
│ ControlledVocabularyService (STF category/file-tag 查询与校验)  │
├─────────────────────────────────────────────────────────────────┤
│ IndexXmlService (STF leaf 生成)                                 │
│ PackageAssemblerService (STF XML 落盘 + index-md5.txt)          │
│ ValidatorService (第 5 类 STF 规则)                             │
└─────────────────────────────────────────────────────────────────┘
```

#### 4.6.2 `StudyTaggingFileService`（纯 XML）

位置：`backend/src/ectd/services/study-tagging-file.service.ts`（挂在 EctdModule 下，避免循环依赖）

**职责**：只做 STF XML 的生成、解析、校验、checksum 计算，**不访问 Prisma / MinIO / 文件系统**，便于单测与其他 service 复用。

- `generateStfXml(input)` — 按 STF v2.2 DTD 生成 `<!DOCTYPE ectd:study>` 完整 XML 字符串，含 `<category>` / `<document-group>` / `<leaf>` 三层结构
- `parseStfXml(xmlString)` — fast-xml-parser 反向解析，返回 `{ studyId, title, DTDVersion, categories[], documents[] }` 结构化对象
- `computeStfChecksum(xmlString)` — STF XML 自身的 MD5（用于 `index-md5.txt`）
- `validateStructure(xmlString)` — 基础结构校验（根元素、必填属性、DTD 版本等），不做受控词汇语义校验（那在 StudyService/ImportService 层做）
- DTD 引用相对路径：`../../../util/dtd/ich-stf-v2-2.dtd`（STF 文件位于章节子目录，相对 `util/` 需要回退三级）

#### 4.6.3 `StudyService`（CRUD + 生命周期）

位置：`backend/src/study/study.service.ts`

**职责**：Study/StudyCategory/StudyDocument 级联 CRUD + 生命周期解析 + 缓存 XML 重算。

关键方法：

- `listBySequence(seqId)` / `listByNode(nodeId)` / `getById(id)` — 查询接口
- `create(nodeId, dto)` — 创建 Study，校验 category/file-tag 合法性，事务内重算 `stfXmlContent` + `stfChecksum`
- `update(id, dto)` — 更新 Study + categories + documents（删旧插新），事务内重算
- `delete(id)` — 级联删除 categories/documents
- `regenerateXml(id)` — 手动重生成 XML（前端 "重新生成" 按钮）
- `resolveModifiedFrom(application, templateNodeId, studyId)` — 对 REPLACE/APPEND/DELETE 操作，按 applicationId 降序扫描前序 sequence 下的 Study，找到第一个同 `templateNodeId + studyId` 的记录作为 `modifiedFromId`；找不到抛 `BadRequestException`

**校验规则**：
- `StudyCategory.name` 必须存在于 `cvService.getStfCategories()` 返回集合中
- `StudyCategory.value` 必须存在于 `cvService.getStfCategoryValues(name)` 返回集合中
- `StudyDocument.fileTag` 必须存在于 `cvService.getStfFileTags(module)` 返回集合中（module 由 `ctdSectionNumber` 前缀自动判断）

#### 4.6.4 `StudyTaggingFileImportService`（XML 导入）

位置：`backend/src/study/study-tagging-file-import.service.ts`

**职责**：从外部 STF XML 反向写入数据库，用于 ERIS 等竞品迁移 / 跨团队协作 / 校验底座。

- `importStfXml(nodeId, xmlString, { onConflict })` — 粘贴模式。解析 XML，按 basename 匹配当前 node 下的 FileAttachment；找不到 → 软降级 warning 并丢弃该文档条目
- `importStfBundle(nodeId, { xmlString, attachedFiles, onConflict })` — 上传模式。额外接受 `{ originalName, buffer, md5? }` 数组，命中则计算 buffer MD5 与 XML 声明比对（不一致 → warning + 使用实际 MD5），写 MinIO 并创建新 FileAttachment 行
- 冲突策略：
  - `reject`（默认）— 同 `(sequenceNodeId, studyId)` 已存在则抛 `ConflictException`
  - `overwrite` — 删旧 Study（级联 children）+ 新建新 id
  - `merge` — 保留旧 Study.id + createdAt，deleteMany children 后重插 categories/documents
- 生命周期解析：任何 parsed doc 带 `modified-file` 属性 → `resolveModifiedFromStudy()` 按 applicationId + templateNodeId + sequenceNumber `lt` 倒序查前序 Study；找不到 → warning + `modifiedFromId=null`（lifecycle 链断裂但导入成功）
- 整个流程包裹在 `$transaction`，任何一步失败整体回滚
- 返回 `{ studyId, created, warnings[] }`，REST 层把 warnings 原样回传前端做列表渲染

#### 4.6.5 `ControlledVocabularyService` STF 方法

位置：`backend/src/controlled-vocabulary/controlled-vocabulary.service.ts`

`onModuleInit` 在现有 CV seed 之后调用 `seedStfVocabularies()` 读 `reference/eCTD技术规范V1.1附件包/附件2-6：STF标签值文件/valid-values.xml` v6.0 (Nov 2023)，幂等写入 CV 表。

- `getStfCategories()` — 返回 `{ name, values: [{ value, realm }] }[]`，按 `stf-category-*` 分组
- `getStfCategoryValues(name)` — 返回单个 category 的合法值列表（如 `species` → `[{value:'rat',realm:'ich'}, ...]`）
- `getStfFileTags(module: 'm4' | 'm5')` — 返回该模块的合法 file-tag 列表（m4/m5 共享同一底层 file-tag 块，CV 表各写一份便于按模块查询）
- 所有方法均走 Redis cache 24h

CV 表行约定：`vocabularyName ∈ {stf-category-species, stf-category-route-of-admin, stf-category-duration, stf-category-type-of-control, stf-file-tag-m4, stf-file-tag-m5}`，`descriptionEn = "[<realm>] <value>"` 编码 realm 前缀。

#### 4.6.6 与 `IndexXmlService` 的集成

`backend/src/ectd/services/index-xml.service.ts` 新增 `buildStfLeaves` + `deriveStfPath` 私有方法：

- 对 STF 必需节点（M4 4.2.x + M5 5.3.1-5.3.5），`leaf` 的 `xlink:href` **指向 STF XML 文件**（`m{N}/.../study-<slug>.xml`），**不再直接指向 PDF**
- PDF 由 STF XML 内部的 `<doc-content>` leaf 元素引用（同目录相对路径，如 `study-report-body.pdf`）
- 非 STF 节点仍按原逻辑生成 PDF leaf
- 跨序列 `modifiedFromId` 通过已有 `buildPriorLeafIdMap` 机制建立 prior ID 映射

#### 4.6.7 与 `PackageAssemblerService` 的集成（决策 2：STF 与 PDF 同目录）

`backend/src/ectd/services/package-assembler.service.ts`：

- 每份 Study 在包导出时被渲染成一个 `study-<slug>.xml` 文件，**与该 Study 引用的 PDF 文件落盘在同一目录**（不在独立 `stf/` 子目录）
- `study.stfXmlContent` 直接 `archive.append()` 写入 ZIP 条目
- `study.stfChecksum` 添加到 `index-md5.txt`
- `assemblePackage` / `assemblePackageStream` / `previewStructure` 三条代码路径均已更新
- v1 的 `getStfPath()`（生成 `<basePath>/<subFolder>/stf-<section>.xml`）已删除

示例目录结构：
```
m4/42-stud-rep/421-pharmacol-stud/
  study-tox-2024-001.xml       ← STF 文件
  study-tox-2024-001-body.pdf  ← 研究报告正文
  study-tox-2024-001-prot.pdf  ← 研究方案
  study-tox-2024-001-crf.pdf   ← CRF
```

#### 4.6.8 与 `ValidatorService` 的集成

`backend/src/ectd/services/validator.service.ts` 第 5 类 STF 规则重写为 v2 版，全部遍历 `node.studies[]` 数组支持多研究。规则编号保留 CDE V1.1 原编号：

| 规则 | 说明 |
|------|------|
| 5.1 | STF 必需节点必须有至少一个 Study |
| 5.4 | STF XML DTD 版本必须为 2.2 |
| 5.5 | Study ID 必填且非空 |
| 5.6 | 每个 Study 至少有一个 category |
| 5.8 | category name 必须在 CV 表（`stf-category-*`） |
| 5.10 | category value 必须在对应 CV 集合 |
| 5.11 | 每个 Study 至少有一个 document |
| 5.12 | file-tag 必须在 CV 表（按模块） |
| 5.13 | STF 文件路径必须符合命名规范 |
| 5.14 | STF checksum 必须与 XML 内容一致 |
| 5.16 | REPLACE/APPEND/DELETE 操作必须有 `modifiedFromId` |
| 5.18 | 非 STF 章节不能挂 Study |
| 5.20 | Study 内 document 的 FileAttachment 必须存在 |

**废除规则**：原 v1 规则 5.7「Study title 必须匹配 leaf title」在 v2 已废除，因为一个 CTD leaf 可承载多份研究，标题 1:1 约束不再成立。

### 4.7 验证服务

实现 `eCTD验证标准V1.1.pdf` 中的全部验证规则（CDE 官方验证软件及最新标准见: https://www.cde.org.cn/ectd/index）:

| 类别 | 规则数 | 说明 |
|------|--------|------|
| 1-基础识别 | 3 | 文件数量/大小统计（信息级别） |
| 2-文件/文件夹 | 10 | 空文件夹、文件大小≤500MB（XPT≤4GB，ICH eCTD Submission Formats v1.2 §2.3）、命名规范、util文件夹完整性 |
| 3-ICH 骨架文件 | 36 | index.xml DTD 验证、叶元素属性、生命周期、MD5 一致性 |
| 4-区域性管理信息 | 31 | cn-regional.xml Schema 验证、信封元素、**内容完整性 (4.3.x)**（2026-04-24 增补 4.3.12–4.3.21 共 9 条规则覆盖补充申请 cnrat2 / 备案 cnrat3 / 报告 cnrat4 / 再注册 cnrat8 场景，来源 `reference/现行申报资料要求与eCTD目录元素、CTD目录层级对应表.xlsx`） |
| 5-研究标签文件(STF) | 20 | STF DTD 验证、category/file-tag 合法性 |
| 6-PDF 分析 | 26 | PDF 版本、书签(>5页)、无加密/JS/外部链接（**V1.1 八项升级为错误**） |

每条规则有严重程度: **错误**（阻止导出）、**警告**（建议修复）、**提示信息**（仅展示）

## 5. 文档导出流程

### 5.1 Word 导出

```
文档内容 (TipTap JSON) → docx 节点映射 → .docx 文件
```

- 使用 `docx` 库生成 Word 文档
- 字体: 宋体(正文)、黑体(标题)、Times New Roman(英文)
- 字号: 正文≥小四号字(12pt)、表格≥五号字(10.5pt)
- 行距: 1.5 倍行距

### 5.2 PDF 导出

```
文档内容 (TipTap JSON) → HTML + 合规CSS → Puppeteer 渲染 → 合规性检查 → .pdf 文件
```

- 使用 Puppeteer 无头浏览器渲染
- 生成 PDF 1.4-1.7 或 PDF/A
- 自动添加书签（>5 页）、设置 Inherit Zoom
- 自动剥除外部链接
- 嵌入中文字体（宋体/黑体）
- 每个 PDF 自动运行合规检查（v1.2 规范）：
  - 6.0-6.24 已有规则（PDF 版本/加密/JS/附件/书签/外链/页面尺寸等）
  - **6.25 ERROR 字体嵌入校验**（2026-04-08 新增）：遍历 Page→Resources→Font→DescendantFonts→FontDescriptor，要求每个字体必须有 FontFile/FontFile2/FontFile3 嵌入流；处理 Type0 复合字体、subset 前缀（`ABCDEF+Name`）、Standard 14 例外
  - **6.26 WARNING 字体子类型异常**（2026-04-08 新增）：非 TrueType/OpenType/Type1 的字体子类型告警
  - 通过 `safeCheck` 包装：解析失败时降级为 `6.25-SKIP` WARNING，不阻塞整体验证流程

## 6. 错误处理

### 6.1 业务异常码

| 码 | 说明 |
|------|------|
| 1001 | 申请编号格式不正确 |
| 1002 | 序列号不连续（跳号） |
| 1003 | 文件命名不符合 eCTD 规范（仅允许 a-z 0-9 - _） |
| 1004 | 叶元素生命周期操作无效 |
| 1005 | 必填章节缺失（内容完整性规则 4.3.x） |
| 1006 | PDF 文件不符合 eCTD 要求（V1.1 错误级别） |
| 1007 | XML 骨架文件 DTD/Schema 验证失败 |
| 1008 | MD5 校验值不匹配 |
| 1009 | 信封属性不可变性违反（尝试修改创建后不可变的属性） |
| 1010 | 受控词汇代码无效或已过期 |
| 1011 | 申请类型与注册行为类型关联不合法 |
| 1012 | replace 操作的 xml:lang 与原文件不一致 |
| 1013 | 扩展节点仅允许在生物制品的 3.2.R 章节使用 |
| 1014 | 文件路径超过 230 字符限制（ICH eCTD v3.2.2 §2.4，原 180 已修正） |
| 1015 | 文件大小超过 500MB 限制（XPT 4GB；ICH eCTD Submission Formats v1.2 §2.3） |
| 1016 | STF 缺失（模块四五必须有 STF） |
| 1017 | 跨申请引用不允许 |
| 1018 | 电子签章缺失（必签章章节） |
| 1019 | 节点编辑权限不足（无 EDIT 指派权限） |
| 1020 | 邀请已过期或已使用 |
| 1021 | 不能移除有进行中编辑锁的成员 |
| 1022 | 不能移除有待审批提交的成员 |

## 7. 协作模块详细设计（WP-09）

### 7.1 InvitationController（项目邀请，挂载在 ProjectModule 内）

挂载路径: `/api/v1/projects/:id/invitations`

- **createInvitation** — 创建邀请（OWNER/MANAGER）
  - 输入: email, role (MEMBER/VIEWER)
  - 若目标用户已注册 → 直接添加为项目成员 + 发站内通知
  - 若目标用户未注册 → 生成邀请令牌（64字符，7天有效期），返回邀请链接
  - 校验: 不能邀请已有成员、不能重复邀请 PENDING 状态的同一邮箱
- **listInvitations** — 获取项目邀请列表（OWNER/MANAGER）
- **cancelInvitation** — 取消邀请
- **acceptInvitation** — 接受邀请（路径: `/api/v1/invitations/:token/accept`）
  - 校验令牌有效性和过期时间
  - 未注册用户跳转注册页，注册后自动加入项目

角色变更与所有权转移:
- **changeMemberRole** — PATCH `/:id/members/:userId/role`（仅 OWNER）
- **transferOwnership** — POST `/:id/transfer-ownership`（仅 OWNER，原 OWNER 降级为 MEMBER）
- 成员移除增强: 移除前检查编辑锁和待审批提交

### 7.2 AssignmentModule（章节指派）

关键服务方法:

- **assignNode(nodeId, userId, permission)** — 指派成员到节点
  - permission: EDIT / REVIEW / VIEW
  - unique 约束: 同一节点+同一用户仅一条记录
  - 触发 ASSIGNMENT 通知 + activity_log 记录
- **getNodeAssignments(nodeId)** — 获取节点指派列表
- **removeAssignment(nodeId, userId)** — 取消指派
- **checkNodePermission(nodeId, userId, requiredPermission)** — 检查用户对节点的权限
  - 权限继承规则:
    1. OWNER 对所有节点拥有完全权限（直接放行）
    2. VIEWER 项目角色对所有节点仅 VIEW 权限（不受指派影响）
    3. 显式指派优先: 若节点有该用户的 assignment 记录，使用该记录的 permission
    4. 父节点继承: 向上遍历祖先节点，使用首个匹配的 assignment 权限
    5. 默认权限: MEMBER 项目角色对未指派节点拥有 EDIT 权限
- **getSequenceAssignmentOverview(seqId)** — 序列全局指派总览

权限拦截集成:
- 编辑锁获取前调用 checkNodePermission(nodeId, userId, 'EDIT')
- 文档保存前调用 checkNodePermission
- 审批提交: REVIEW 权限的成员可审批（不再强制要求系统级 MANAGER 角色）

### 7.3 NotificationModule（站内通知）

关键服务方法:

- **create(userId, type, title, content, options?)** — 创建通知
  - options: { projectId?, resourceType?, resourceId? }
  - 创建后通过 CollaborationGateway 实时推送 `notification:new` 事件
- **findAll(userId, query)** — 我的通知列表（分页）
  - 查询参数: is_read, type, project_id
- **markAsRead(id, userId)** — 标记单条已读
- **markAllAsRead(userId)** — 全部标记已读
- **getUnreadCount(userId)** — 获取未读数量（轻量接口，顶栏轮询 / WebSocket 推送）

通知类型枚举 (NotificationType):
- INVITATION — 收到项目邀请
- ASSIGNMENT — 被指派章节编辑任务
- MENTION — 被 @提及（评论中）
- APPROVAL_SUBMITTED — 有人提交审批（通知审阅者）
- APPROVAL_APPROVED — 提交被审批通过
- APPROVAL_REJECTED — 提交被驳回
- COMMENT — 负责章节收到新评论
- LOCK_FORCE_RELEASED — 编辑锁被强制释放
- MEMBER_ROLE_CHANGED — 项目角色被变更
- OWNERSHIP_TRANSFERRED — 项目所有权变更

通知触发点（各模块 Service 层调用 NotificationService.create）:
- InvitationService → INVITATION
- AssignmentService → ASSIGNMENT
- CommentService → MENTION / COMMENT
- ApprovalService → APPROVAL_SUBMITTED / APPROVED / REJECTED
- EditLockService → LOCK_FORCE_RELEASED
- ProjectService → MEMBER_ROLE_CHANGED / OWNERSHIP_TRANSFERRED

### 7.4 CollaborationModule（WebSocket 协同）

**CollaborationGateway** — Socket.IO WebSocket Gateway

路径: `/ws/collaboration`

认证:
- 连接时携带 `access_token` query 参数
- 使用 JwtService 验证身份，提取 userId
- 鉴权失败断开连接

房间管理:
- 用户连接后自动加入 `project:{projectId}` 房间
- 进入序列编辑器时加入 `sequence:{sequenceId}` 房间
- 断开时自动清理房间和在线状态

在线状态（Redis 存储）:
- Key: `presence:{projectId}:{userId}`
- Value: `{ name, currentPage, currentNodeId, lastSeen }`
- TTL: 2 分钟，前端每 60 秒心跳续期

WebSocket 事件:
| 事件 | 方向 | 说明 |
|------|------|------|
| `user:online` | Server→Client | 成员上线，广播给项目房间 |
| `user:offline` | Server→Client | 成员下线，广播给项目房间 |
| `user:location` | Client→Server→Client | 位置变更，广播给序列房间 |
| `node:locked` | Server→Client | 编辑锁获取，广播给序列房间 |
| `node:unlocked` | Server→Client | 编辑锁释放，广播给序列房间 |
| `node:updated` | Server→Client | 节点内容保存，广播给序列房间 |
| `node:approval` | Server→Client | 审批状态变更，广播给序列房间 |
| `notification:new` | Server→Client | 新通知推送给目标用户 |
| `notification:count` | Server→Client | 未读数变更推送给目标用户 |

**CollaborationService:**
- **getProjectPresence(projectId)** — HTTP 接口查询在线成员列表（WebSocket 不可用时的 fallback）
- 提供 broadcastToRoom / sendToUser 方法供其他模块调用

### 7.5 DashboardModule（工作台）

关键服务方法:

- **getMyTasks(userId)** — 我的待办
  - 返回: 待编辑节点列表（assignment.permission=EDIT + node.status!=COMPLETED）、待审阅节点列表（assignment.permission=REVIEW + node.approval_status=SUBMITTED）、待处理邀请数
- **getRecentEdits(userId, limit=5)** — 我的最近编辑
  - 基于 activity_log 查询用户最近编辑的节点
  - 返回: 节点信息 + 项目名 + 序列号 + 编辑时间
- **getProjectProgress(projectId)** — 项目进度总览
  - 按模块（M1-M5）统计: 总节点数、已完成（APPROVED）数、进度百分比
- **getProjectWorkload(projectId)** — 成员工作量分布
  - 每个成员: 指派章节数、已完成数、编辑中（有编辑锁）数、待审阅数
