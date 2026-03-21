# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

**eCTD 在线文档撰写工具** — 面向药企注册申报团队的 Web 端 eCTD 文档在线编辑、组装与导出平台。用户可在浏览器中按照 CTD 五模块结构撰写/编辑申报资料，系统自动生成符合 NMPA《eCTD 技术规范 V1.1》要求的目录结构、XML 骨架文件（index.xml / cn-regional.xml），并支持导出为 Word (.docx) 或 PDF 格式。

**竞品参考**: ERIS 易瑞思 eCTD 出版软件（桌面端）— 我们做的是 Web 版，支持在线协作编辑。
- 官网产品页: https://www.eris-bj.com/?page_id=28576

**法规依据**:
- `reference/eCTD技术规范V1.1.pdf` — 文件结构、命名规则、骨架文件 XML 规范
- `reference/eCTD实施指南V1.1.pdf` — 编号管理、模块说明、生命周期操作
- `reference/eCTD验证标准V1.1.pdf` — 验证规则（错误/警告/提示）
- `reference/现行申报资料要求与eCTD目录元素、CTD目录层级对应表.xlsx` — CTD 目录映射
- `reference/eCTD技术规范V1.1附件包/` — DTD、Schema、XSL、受控词汇文件
- CDE 官方 eCTD 专区（最新公告、验证软件下载、常见问题）: https://www.cde.org.cn/ectd/index

## 技术栈

| 层级 | 技术 |
|------|------|
| 后端 | NestJS + TypeScript + Prisma ORM |
| 数据库 | PostgreSQL + Redis |
| 前端 | React + TypeScript + Ant Design Pro |
| 富文本编辑器 | TipTap (ProseMirror) |
| 文档生成 | docx (Word)、Puppeteer (PDF) |
| XML 处理 | fast-xml-parser (eCTD 骨架文件生成/解析) |
| 文件存储 | MinIO (S3 兼容) |
| 容器化 | Docker + Docker Compose |

## 项目结构

```
├── docs/                    # 项目文档（所有 agent 必读）
│   ├── update_log.md        # 进度表（每次代码修改必须更新）
│   ├── architecture/        # 架构文档
│   │   ├── tech_stack.md    # 技术栈选型与项目目录结构
│   │   ├── backend_architecture.md   # 后端模块、API 规范、认证权限
│   │   ├── frontend_architecture.md  # 前端页面模块、组件、编辑器方案
│   │   ├── database_design.md        # 数据库表设计、字段约定
│   │   └── api_design.md             # 全部 API 接口清单
│   ├── skills/              # 技术 Skills 参考文档（agent 开发时按需查阅）
│   │   ├── nestjs.md        # NestJS 后端开发规范与模板
│   │   ├── prisma.md        # Prisma ORM 数据库操作规范
│   │   ├── react_antd_pro.md # React + Ant Design Pro 前端开发规范
│   │   ├── tiptap_editor.md  # TipTap 富文本编辑器集成
│   │   ├── document_export.md # Word/PDF 文档导出
│   │   ├── ectd_xml.md       # eCTD XML 骨架文件生成
│   │   ├── file_storage.md   # MinIO 文件存储
│   │   └── docker.md         # Docker 容器化部署
│   └── plans/               # 项目执行计划（按工作包拆分）
│       ├── plan_1.md         # WP-01: 基础平台搭建与 eCTD 规范数据冻结
│       ├── plan_2.md         # WP-02: CTD 五模块目录结构与内容完整性规则
│       ├── plan_3.md         # WP-03: 富文本编辑器与 eCTD 文档编辑
│       ├── plan_4.md         # WP-04: eCTD 合规文档导出（Word/PDF）
│       ├── plan_5.md         # WP-05: eCTD XML 骨架文件、生命周期管理与验证引擎
│       ├── plan_6.md         # WP-06: eCTD 文件管理、命名规范与版本控制
│       ├── plan_7.md         # WP-07: 协作、审批流程与电子签章
│       └── plan_8.md         # WP-08: eCTD 合规测试、CDE 验证对齐与部署
├── reference/               # 法规参考文件（只读）
├── backend/                 # NestJS 后端（待创建）
├── frontend/                # React 前端（待创建）
└── docker-compose.yml       # 开发环境（待创建）
```

## 需求来源文件

- `reference/eCTD技术规范V1.1.pdf` — eCTD 文件结构规范（目录结构、命名规则、XML 骨架）
- `reference/eCTD实施指南V1.1.pdf` — 实施指导（编号管理、提交要求、生命周期操作）
- `reference/eCTD验证标准V1.1.pdf` — 验证标准（6 大类约 80+ 条验证规则）
- `reference/eCTD技术规范V1.1附件包/` — DTD/Schema/XSL/受控词汇等配套文件

## 开发命令

```bash
# 启动开发环境
docker-compose up -d                    # PostgreSQL + Redis + MinIO
cd backend && npm run start:dev         # 后端
cd frontend && npm run dev              # 前端

# 数据库
cd backend && npx prisma migrate dev    # 迁移
cd backend && npx prisma generate       # 生成客户端
cd backend && npx prisma studio         # 数据库可视化

# 测试
cd backend && npm run test
cd frontend && npm run test
```

## Agent 必须遵守的规则

### 1. 文档同步更新（强制）

**任何代码修改都必须同步更新以下文件:**

- **`docs/update_log.md`** — 记录修改日期、内容、影响模块、关联计划
- **对应的架构文档** — 如修改了后端模块更新 `backend_architecture.md`，修改了数据库表更新 `database_design.md`，修改了 API 更新 `api_design.md`，修改了前端页面更新 `frontend_architecture.md`
- **对应的计划文件** — 完成某个 plan 中的任务时，将其标记为 `[x]`

### 2. 开发顺序

按 plan 编号顺序执行: plan_1 → plan_2 → plan_3 → plan_4 → plan_5 → plan_6 → plan_7 → plan_8。每个 plan 内部按阶段顺序推进。

**每项任务的开发协议（Agent 执行协议）:**
```
Prisma Schema → Migration → DTO/Entity → Service → Controller → 前端页面
```
- 先完成后端再开始前端
- 每个模块先写 Schema 并跑通迁移，再逐层实现
- plan_1 的阶段 0 必须最先完成：冻结 CTD 目录结构定义、eCTD 编号规则

### 3. 核心业务逻辑

- **CTD 五模块结构**: 模块一（行政文件和药品信息）、模块二（通用技术文档总结）、模块三（质量）、模块四（非临床试验报告）、模块五（临床研究报告）
- **eCTD 编号体系**: 原始编号（10 位: 年份 4 位 + 流水号 6 位）、申请编号（字母前缀 x/y/l/s + 年份 4 位 + 流水号 5 位）、序列号（4 位数字从 0000 递增）
- **受控词汇体系**: 4 种申请类型 (cnapt1-4)、2 种产品类型 (cnprt1-2)、9 种注册行为类型 (cnrat1-9)、4 种序列类型 (cnsqt1-4)，三级关联关系由 depend-apt-rat-sqt.xml 定义
- **信封元素不可变性**: 申请级别信封属性(application-id/type/product-type/product-number)创建后不可改；注册行为级别(related-sequence/regulatory-activity-type)同一活动内不可改
- **文件生命周期操作**: new（新建）、replace（替换）、append（增补，仅建议对 STF 使用）、delete（删除）— 每个叶元素必须有明确的 operation 属性
- **生命周期约束**: 首次提交(0000)必须全 new；replace/append/delete 必须有 modified-file 属性；delete 不含 xlink:href 和 checksum；replace 时新旧文件 xml:lang 必须一致
- **撤回序列构建**: 4 步流程 — 原 new→delete, 原 replace→恢复原文件(new), 原 delete→重建(new), 模块四五 STF 同步
- **骨架属性更新**: 更新 2.3.S/3.2.S 的 substance/manufacturer 时必须删除旧章节并以 new 操作重建，不允许仅改属性不改内容
- **XML 骨架文件**: `index.xml`（ICH 骨架，模块二至五，DTD: ich-ectd-3-2.dtd）+ `cn-regional.xml`（区域骨架，模块一，Schema: cn-regional-1-0.xsd）+ `index-md5.txt`
- **STF 要求**: 模块四 4.2.X 和模块五 5.3.1.X-5.3.5.X 的所有文件必须使用 STF (ich-stf-v2-2.dtd)，category 和 file-tag 值从 valid-values.xml 获取
- **扩展节点**: 仅对生物制品(cnprt2)的 3.2.R 章节允许，包含 3.2.R.1-3.2.R.6 六种类型
- **文件命名规则**: 仅允许小写字母 a-z、数字 0-9、连字符 -、下划线 _；路径≤180字符、单名≤64字符；路径仅使用正斜杠 /
- **PDF 要求**: 版本 1.4-1.7 或 PDF/A；>5页必须有书签（V1.1 升级为错误）；书签放大率 Inherit Zoom；不允许加密、JavaScript、外部链接、附件、音视频（V1.1 均升级为错误）；中文字体宋体/黑体，正文≥小四号字
- **电子签章**: 6 类章节必须签章: cn-1-0 说明函, cn-1-2 申请表, cn-1-3-8, cn-1-10, cn-1-11, cn-1-12
- **内容完整性规则**: 验证标准 4.3.x 定义了每种申请类型+注册行为类型组合下的必填章节清单
- **验证规则**: 系统必须实现 `reference/eCTD验证标准V1.1.pdf` 中的全部 80+ 条验证规则（6 大类），错误级别的必须阻止导出
- **文件复用**: 允许同一申请内跨序列引用，不允许跨申请引用；空章节不创建文件夹和目录元素

### 4. eCTD 业务术语

| 术语 | 说明 |
|------|------|
| 申请 (Application) | 为特定监管目的整理和提交的申报资料集合，含申请编号和原始编号 |
| 注册行为 (Regulatory Activity) | 从首次提交到获批的所有序列集合，含注册行为类型 |
| 序列 (Sequence) | 单次提交的申报资料，序列号从 0000 开始，含序列类型 |
| 叶元素 (Leaf) | 骨架文件中引用的最小文件单元，含 operation/checksum/xlink:href |
| 信封元素 (Envelope) | cn-regional.xml 中描述申请/注册行为/序列的元数据，12 个必填属性 |
| STF (Study Tagging File) | 研究标签文件，模块四五必须使用，遵循 ich-stf-v2-2.dtd |
| 骨架文件 (Backbone) | index.xml 和 cn-regional.xml，定义文档目录结构 |
| 受控词汇 (Controlled Vocabulary) | XML 格式代码定义文件，含版本号和有效期，定义合法的属性值 |
| 扩展节点 (Node Extension) | 仅生物制品 3.2.R 章节可用的自定义目录元素 |
| 骨架属性 (Backbone Attributes) | substance/manufacturer/product-name/dosageform/indication 等 ICH 定义的元数据 |
| modified-file | replace/append/delete 操作时指向被修改原文件的属性 |

### 5. 已配置的 Settings 与 Hooks

项目级配置文件: `.claude/settings.json`

**已授权的命令权限 (permissions.allow):**
- `npm`, `npx`, `node` — 包管理与运行
- `docker`, `docker-compose`, `docker compose` — 容器化环境
- `git` — 版本控制
- `tsc`, `eslint`, `prettier` — 编译、代码检查、格式化
- `mkdir`, `ls`, `cat`, `cp`, `mv`, `which`, `echo`, `find`, `wc` — 基础文件操作

**已配置的 Hooks:**
- `PostToolUse (Write|Edit)` — 当修改 `backend/`, `frontend/` 下的代码文件后，自动提醒 agent 更新 `docs/update_log.md` 和对应架构文档

### 6. 可用 Slash Skills

- `/simplify` — 代码完成后检查质量和可复用性
- `/update-config` — 修改 Claude Code 设置、权限、hooks
- `/claude-api` — 如需调用 Claude API 构建 AI 功能
- `/commit` — 提交代码变更

### 7. 技术 Skills 参考文档

开发过程中按需查阅 `docs/skills/` 下的文档:

| 文件 | 使用场景 |
|------|---------|
| `nestjs.md` | 创建后端模块、Controller/Service/DTO 模板、守卫、拦截器 |
| `prisma.md` | 编写 Schema、迁移、事务、聚合查询、种子数据 |
| `react_antd_pro.md` | 创建前端页面、ProTable CRUD 模板、表单弹窗、API 请求 |
| `tiptap_editor.md` | TipTap 编辑器集成、自定义节点/扩展、协同编辑 |
| `document_export.md` | Word/PDF 导出、模板引擎、格式转换 |
| `ectd_xml.md` | eCTD XML 骨架文件生成、DTD 验证、MD5 计算 |
| `file_storage.md` | MinIO 文件上传下载、presigned URL |
| `docker.md` | docker-compose 开发环境、Dockerfile |

### 8. 完成标准

- **L1**: 功能开发完成，可内部测试
- **L2**: 主链路跑通 — 用户可在线编辑文档并导出符合 eCTD 规范的 Word/PDF
- **L3**: 通过 eCTD 验证标准全部"错误"级别规则验证
- **L4**: 上线稳定运行，可实际用于向 CDE 提交申报资料
