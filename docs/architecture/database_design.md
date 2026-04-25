# 数据库设计

## 1. ER 关系概览

```
User (1) ──< (N) ProjectMember >── (1) Project
Project (1) ──< (N) Application
Application (1) ──< (N) RegulatoryActivity
RegulatoryActivity (1) ──< (N) Sequence
Sequence (1) ──< (N) SequenceNode (CTD 目录树节点)
SequenceNode (1) ──< (1) Document (文档内容)
SequenceNode (1) ──< (N) FileAttachment (上传的 PDF 等文件)
Document (1) ──< (N) DocumentVersion (历史版本)
Sequence (1) ──< (N) ValidationReport
ValidationReport (1) ──< (N) ValidationItem
SequenceNode (1) ──< (N) Comment
SequenceNode (1) ──< (N) NodeAssignment >── (1) User
Project (1) ──< (N) ProjectInvitation
User (1) ──< (N) Notification
```


## 1.1 桌面版激活码表 `license` (software_upgrade / L 阶段)

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| code | TEXT (unique) | 完整激活码 `base64url(payload).base64url(signature)` |
| customer | varchar(200) | payload.customer |
| machine_id | varchar(64) | payload.machineId（16 位 hex） |
| issued_at | DATE | payload.issuedAt |
| expires_at | DATE | payload.expiresAt |
| nonce | varchar(64) | payload.nonce |
| activated_at | timestamp | 写入时间 |
| activated_by | UUID? | 激活操作的 user.id |
| is_active | bool | 当前是否生效（同一时刻最多一行 true，由 service 在 `$transaction` 中维护） |
| created_at | timestamp | |
| updated_at | timestamp | |

索引：`is_active`、`expires_at`。

设计要点：
- 一行 = 一次激活记录，便于审计
- 旧激活码不删除，仅置 `is_active=false`，便于追溯客户历次续期
- `code` 唯一约束 → 重复 activate 同一码走 upsert，幂等
- 启动每次重读最新 `is_active=true` 行 → 重新跑签名/指纹/到期校验，DB 改写无效（仍要私钥才能伪造）

## 1.2 桌面版 SQLite 双 schema 过渡（software_upgrade / E1）

- 主 schema 保持 `backend/prisma/schema.prisma`（PostgreSQL，开发期兼容）。
- 新增 `backend/prisma/schema.sqlite.prisma`（SQLite，桌面版运行时）。
- 字段映射约定：
  - `Json/Json?` → `String/String?`（由 service 层负责 JSON serialize/parse）；
  - `String[]` → `String`（保存 JSON 字符串，如 `[]`、`["cnsqt1"]`）；
  - 去除 `@db.VarChar/@db.Text/@db.Char/@db.SmallInt` 等 provider-specific 注解。
- 通过 `npm run prisma:check-parity` 校验两份 schema 的 model/field 集合一致性。
- SQLite 迁移独立存放在 `backend/prisma/migrations.sqlite/`，用于桌面版初始化。

## 2. 表设计

### 2.1 用户相关

#### `user` — 用户表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| email | VARCHAR(255) | 邮箱（唯一） |
| password_hash | VARCHAR(255) | 密码哈希 |
| name | VARCHAR(100) | 姓名 |
| phone | VARCHAR(20) | 电话 |
| role | ENUM | ADMIN/MANAGER/EDITOR/VIEWER |
| status | ENUM | ACTIVE/DISABLED |
| created_at | TIMESTAMP | 创建时间 |
| updated_at | TIMESTAMP | 更新时间 |

### 2.2 项目与申请

#### `project` — 项目表（一个项目对应一个药品）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| name | VARCHAR(200) | 项目名称（药品名称） |
| description | TEXT | 项目描述 |
| status | ENUM | DRAFT/ACTIVE/ARCHIVED |
| created_by | UUID | 创建人 FK→user |
| created_at | TIMESTAMP | 创建时间 |
| updated_at | TIMESTAMP | 更新时间 |

#### `project_member` — 项目成员表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| project_id | UUID | FK→project |
| user_id | UUID | FK→user |
| role | ENUM | OWNER/MEMBER/VIEWER |

#### `application` — 申请表（信封申请级别属性，创建后不可变）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| project_id | UUID | FK→project |
| application_number | VARCHAR(15) | 申请编号（如 x202612345），唯一，创建后不可变 |
| application_type_code | VARCHAR(10) | 申请类型受控词汇代码（cnapt1/cnapt2/cnapt3/cnapt4），创建后不可变 |
| application_type_version | VARCHAR(10) | 受控词汇版本号（如 1.1） |
| product_type_code | VARCHAR(10) | 产品类型受控词汇代码（cnprt1/cnprt2），创建后不可变 |
| product_type_version | VARCHAR(10) | 受控词汇版本号（如 1.0） |
| product_number | VARCHAR(10) | 原始编号（10位数字: 年份4位+流水号6位），创建后不可变 |
| created_at | TIMESTAMP | 创建时间 |
| updated_at | TIMESTAMP | 更新时间 |

#### `regulatory_activity` — 注册行为表（信封注册行为级别属性，同一活动内不可变）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| application_id | UUID | FK→application |
| regulatory_activity_type_code | VARCHAR(10) | 注册行为类型代码（cnrat1-cnrat9），同一活动内不可变 |
| regulatory_activity_type_version | VARCHAR(10) | 受控词汇版本号 |
| related_sequence | CHAR(4) | 相关序列号 = 该 RA 的起始序列号（申请维度，首个 RA 为 0000，后续 RA 为前一 RA 最后序列号+1），同一活动内不可变 |
| created_at | TIMESTAMP | 创建时间 |

#### `sequence` — 序列表（信封序列级别属性）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| application_id | UUID | FK→application（**冗余字段，方案 C 引入**，用于支持申请维度的序列号唯一约束） |
| regulatory_activity_id | UUID | FK→regulatory_activity |
| sequence_number | CHAR(4) | 序列号（0000-9999），**在 application_id 维度全局唯一连续递增**（不再是 RA 内部递增；ICH eCTD v3.2.2 + NMPA V1.1 要求） |
| sequence_type_code | VARCHAR(10) | 序列类型代码（cnsqt1/cnsqt2/cnsqt3/cnsqt4） |
| sequence_type_version | VARCHAR(10) | 受控词汇版本号 |
| description | VARCHAR(500) | 序列描述 |
| contact_name | VARCHAR(100) | 联系人姓名 |
| contact_phone | VARCHAR(20) | 联系人电话 |
| contact_email | VARCHAR(255) | 联系人邮箱 |
| status | ENUM | DRAFT/EDITING/VALIDATING/EXPORTED/SUBMITTED |
| created_at | TIMESTAMP | 创建时间 |
| updated_at | TIMESTAMP | 更新时间 |

### 2.3 受控词汇

#### `controlled_vocabulary` — 受控词汇表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| vocabulary_name | VARCHAR(50) | 词汇类别名（application-type/product-type/regulatory-activity-type/sequence-type） |
| code | VARCHAR(10) | 代码名称（如 cnapt1, cnprt1, cnrat1, cnsqt1） |
| version | VARCHAR(10) | 版本号 |
| valid_from | DATE | 生效日期 |
| valid_to | DATE | 失效日期（可空，空表示永久有效） |
| description_zh | VARCHAR(200) | 中文描述 |
| description_en | VARCHAR(200) | 英文描述 |

#### `cv_dependency` — 受控词汇关联表（申请类型→注册行为→序列类型三级关联）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| application_type_code | VARCHAR(10) | 申请类型代码 |
| regulatory_activity_type_code | VARCHAR(10) | 注册行为类型代码 |
| sequence_type_code | VARCHAR(10) | 序列类型代码（可空，表示所有序列类型都允许） |
| version | VARCHAR(10) | 关联关系版本号 |

### 2.4 CTD 目录结构

#### `ctd_template_node` — CTD 目录模板（系统预置，229 节点）✅ 已实现

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| parent_id | UUID | 父节点 FK→self（自引用树结构） |
| module | SMALLINT | 模块号（1-5） |
| element_name | VARCHAR(120) | XML 元素名（唯一，如 cn-1-0, m2-3-s-drug-substance） |
| ctd_section_number | VARCHAR(20) | CTD 章节号（如 1.0, 2.3.S, 3.2.P.4.1） |
| title_zh | VARCHAR(500) | 中文标题 |
| title_en | VARCHAR(500) | 英文标题 |
| node_type | ENUM | MODULE(5)/SECTION(43)/LEAF(180)/EXTENSION_POINT(1) |
| is_leaf | BOOLEAN | 是否为叶节点（可放置文件） |
| requires_stf | BOOLEAN | 是否需要 STF（48个: 模块四 4.2.X 和模块五 5.3.1-5.3.5 叶节点） |
| requires_e_seal | BOOLEAN | 是否需要电子签章（6个: cn-1-0, cn-1-2, cn-1-3-8, cn-1-10, cn-1-11, cn-1-12） |
| allows_extension | BOOLEAN | 是否允许扩展子节点（仅 3.2.R） |
| is_repeatable | BOOLEAN | **Plan 13 (2026-04-23)**: 是否支持多实例（对应 DTD `*` 可重复元素 5 个: m2-3-s-drug-substance / m2-3-p-drug-product / m2-7-3-summary-of-clinical-efficacy / m3-2-s-drug-substance / m3-2-p-drug-product） |
| instance_key_fields | JSONB? | **Plan 13**: 多实例区分键字段清单，仅 `is_repeatable=true` 节点有值。如 `["substance","manufacturer"]` / `["productName","dosageForm","manufacturer"]` / `["indication"]` |
| sort_order | INT | 排序序号 |

数据来源: `element-property_CN.xml`（模块一71节点）+ `element-property_ICH.xml`（模块二至五158节点）

#### `ctd_completeness_rule` — 内容完整性规则表（验证标准 4.3.x）✅ 已实现

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| application_type_code | VARCHAR(10) | 申请类型代码 |
| regulatory_activity_type_code | VARCHAR(10) | 注册行为类型代码 |
| sequence_type_codes | TEXT[] | **Plan 13 (2026-04-23)**: 规则适用的序列类型清单，默认 `{cnsqt1}`（仅首次提交触发），避免对 cnsqt2 回复/cnsqt3 撤回序列误报 |
| product_type_codes | TEXT[] | **Plan 13**: 规则适用的产品类型清单，默认 `{}`（适用所有）；IVD/MAH 变更等子场景可细化 |
| template_node_id | UUID | FK→ctd_template_node |
| rule_type | ENUM | REQUIRED/FORBIDDEN |
| severity | ENUM | ERROR/WARNING |

已导入 4.3.1-4.3.11 + 4.3.12-4.3.21 共 20 条规则模板（展开后覆盖 NDA/ANDA/IND/原料药 × 首次申请/补充申请/备案/报告/再注册 五大场景）

#### `sequence_node` — 序列目录节点（实例化的 CTD 树）✅ 已实现

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| sequence_id | UUID | FK→sequence |
| template_node_id | UUID | FK→ctd_template_node |
| parent_id | UUID | 父节点 FK→self（自引用树结构） |
| element_name | VARCHAR(120) | XML 元素名 |
| ctd_section_number | VARCHAR(20) | CTD 章节号 |
| title | VARCHAR(500) | 标题（默认取模板中文标题） |
| operation | ENUM | NEW/REPLACE/APPEND/DELETE（叶节点的生命周期操作，非叶节点为空） |
| status | ENUM | EMPTY/EDITING/COMPLETED |
| is_required | BOOLEAN | 是否必填（根据内容完整性规则计算） |
| is_leaf | BOOLEAN | 是否为叶节点 |
| sort_order | INT | 排序序号 |
| substance | VARCHAR(200) | 骨架属性: 活性成分（2.3.S/3.2.S 节点） |
| manufacturer | VARCHAR(200) | 骨架属性: 生产商（2.3.S/3.2.S/2.3.P/3.2.P 节点） |
| product_name | VARCHAR(200) | 骨架属性: 产品名称（2.3.P/3.2.P 节点） |
| dosage_form | VARCHAR(200) | 骨架属性: 剂型（2.3.P/3.2.P 节点） |
| indication | VARCHAR(500) | 骨架属性: 适应症（2.7.3 节点） |
| instance_index | INT | **Plan 13 (2026-04-23)**: 多实例序号，非可重复节点恒为 0；可重复节点（3.2.S 原料药等）及其整个后代子树共享同一值，用于区分同一申请下多个原料药/制剂/适应症 |
| instance_label | VARCHAR(200)? | **Plan 13**: UI 展示用的实例标签，服务端按 `instance_key_fields` 拼接（如 "阿莫西林 - 石药集团"） |
| approval_status | ApprovalStatus | 审批状态（默认 DRAFT） |
| submitted_by | UUID? | 提交审批的用户 ID |
| submitted_at | TIMESTAMP? | 提交审批时间 |
| approved_by | UUID? | 审批人用户 ID |
| approved_at | TIMESTAMP? | 审批时间 |
| rejection_reason | TEXT? | 驳回理由 |

### 2.5 文档内容 ✅ (WP-03 已实现)

#### `document` — 文档表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| node_id | UUID | FK→sequence_node (唯一，一个叶节点一个文档) |
| content_json | JSONB | TipTap 编辑器 JSON 内容 |
| content_html | TEXT | 渲染后的 HTML（用于导出） |
| content_text | TEXT | 纯文本（用于搜索/字数统计） |
| word_count | INT | 字数统计（中文字符+英文词） |
| version | INT | 版本号（每次保存自增） |
| xml_lang | VARCHAR(10) | 语言属性: zh/en/空 |
| created_by | UUID | 创建人 |
| updated_by | UUID | 最后编辑人 |
| created_at | TIMESTAMP | 创建时间 |
| updated_at | TIMESTAMP | 更新时间 |

#### `document_version` — 文档版本历史表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| document_id | UUID | FK→document |
| version | INT | 快照时的版本号 |
| content_json | JSONB | 该版本的内容快照 |
| content_html | TEXT | 该版本的 HTML |
| word_count | INT | 该版本字数 |
| xml_lang | VARCHAR(10) | 该版本语言属性 |
| created_by | UUID | 创建人 |
| created_at | TIMESTAMP | 创建时间 |

### 2.6 文件管理 ✅ (WP-05 已实现)

#### `file_attachment` — 文件附件表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| sequence_node_id | UUID | FK→sequence_node |
| original_name | VARCHAR(255) | 原始文件名 |
| stored_name | VARCHAR(255) | 存储文件名（eCTD 规范命名，上传时由 `normalizeFileName()` 生成） |
| export_name | VARCHAR(64) | 用户自定义的 eCTD 导出 basename（不含扩展名与目录）。非空时覆盖 stored_name 用于 ectd_relative_path / xlink:href；为 null 回落到 stored_name。引用文件（is_reference=true）禁止设置。 |
| storage_path | VARCHAR(500) | MinIO 存储路径（自定义导出名不影响 storage_path，保持存储稳定） |
| ectd_relative_path | VARCHAR(180) | eCTD 包中的相对路径（用于 xlink:href）。当 export_name 非空时以 `export_name + file_type` 重算；ZIP 打包时也按此路径命名 |
| file_type | VARCHAR(10) | 文件类型（pdf/xml/xpt/txt/xsl） |
| file_size | BIGINT | 文件大小（字节） |
| md5_checksum | CHAR(32) | MD5 校验值 |
| xml_lang | VARCHAR(10) | 语言属性（zh/en/空） |
| is_reference | BOOLEAN | 是否为引用（引用其他序列的文件，非实体文件） |
| reference_file_id | UUID | 引用的原始文件 FK→file_attachment（文件复用时） |
| uploaded_by | UUID | FK→user |
| created_at | TIMESTAMP | 创建时间 |

#### `file_pdf_analysis` — PDF 合规分析结果表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| file_attachment_id | UUID | FK→file_attachment (唯一) |
| pdf_version | VARCHAR(10) | PDF 版本（如 1.4, 1.7, PDF/A-1） |
| page_count | INT | 页数 |
| has_bookmarks | BOOLEAN | 是否有书签 |
| bookmark_zoom_inherit | BOOLEAN | 书签放大率是否为 Inherit Zoom |
| is_encrypted | BOOLEAN | 是否加密 |
| has_javascript | BOOLEAN | 是否包含 JavaScript |
| has_external_links | BOOLEAN | 是否包含外部链接（URL/mailto） |
| has_attachments | BOOLEAN | 是否包含附件/嵌入式文件 |
| has_multimedia | BOOLEAN | 是否包含音频/视频/3D 对象 |
| is_text_searchable | BOOLEAN | 文本是否可搜索 |
| fonts_embedded | BOOLEAN | 字体是否嵌入 |
| has_e_seal | BOOLEAN | 是否有电子签章 |
| compliance_status | ENUM | PASS/WARNING/ERROR |
| compliance_details | JSONB | 详细合规检查结果 |
| analyzed_at | TIMESTAMP | 分析时间 |

### 2.7 STF（研究标签文件）✅ (Plan 12 v2 — 2026-04-09)

> **v2 设计变更说明**：2026-04-09 Plan 12 执行时废弃了 v1 的 `study_tagging_file` 单表设计（`sequenceNodeId @unique` 的 1:1 约束直接禁止"一个 CTD 章节挂多份研究"的合规场景），重建为 `study` / `study_category` / `study_document` 三张新表，一个 `sequence_node` 可挂 N 份 `study`，每份 study 可挂 N 个 category 维度与 N 份 PDF 文档。迁移脚本 `backend/prisma/migrations/20260408120000_stf_v2_schema` 以 `DROP TABLE study_tagging_file CASCADE` 丢弃 v1 数据（已与用户确认开发环境零生产数据），不写 INSERT 数据迁移。

**~~`study_tagging_file`~~** — ~~v1 STF 表，已于 2026-04-09 Plan 12 P1 随同 v1 `StfService` 一并删除~~

#### `study` — 研究表（每个 sequence_node 可承载多份研究）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| sequence_id | UUID | FK→sequence（冗余字段，便于按 sequence 聚合查询，Cascade Delete） |
| sequence_node_id | UUID | FK→sequence_node（Cascade Delete） |
| ctd_section_number | VARCHAR(20) | CTD 章节号（冗余缓存，避免每次 join template，如 `4.2.3.2`） |
| study_id | VARCHAR(100) | 用户录入的研究编号（如 `TOX-2024-001`） |
| title | VARCHAR(500) | 研究标题 |
| operation | ENUM(LeafOperation) | 生命周期操作: NEW/REPLACE/APPEND/DELETE（STF 是唯一推荐使用 append 的文件类型） |
| modified_from_id | UUID? | 前序 Study FK→study（REPLACE/APPEND/DELETE 必填，application-scoped 向前查找同 `templateNodeId+studyId` 的前序 Study；SetNull on delete） |
| stf_file_path | VARCHAR(500)? | STF XML 文件在 eCTD 包中的相对路径（供 index.xml 的 STF leaf 引用，如 `m4/42-stud-rep/421-pharmacol-stud/study-tox-2024-001.xml`） |
| stf_checksum | CHAR(32)? | STF XML 文件 MD5（`index-md5.txt` 写入此值） |
| stf_xml_content | TEXT? | 缓存的 STF XML 内容（每次 save 由 `StudyService` 在事务内调用 `StudyTaggingFileService.generateStfXml()` 重新生成，包导出时直接读取落盘） |
| created_at | TIMESTAMP | 创建时间 |
| updated_at | TIMESTAMP | 更新时间 |

- `@@unique([sequence_node_id, study_id])` — 同一叶节点下 `studyId` 唯一
- `@@index([sequence_id])` / `@@index([sequence_node_id])` / `@@index([modified_from_id])`
- `modifiedFrom` 自引用关系命名为 `StudyLifecycle`

#### `study_category` — 研究的 ICH STF 分类维度（多对一）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| study_id | UUID | FK→study（Cascade Delete） |
| name | VARCHAR(60) | ICH STF 维度名，取自 CV 表 `stf-category-*`（如 `species` / `route-of-admin` / `duration` / `type-of-control`） |
| value | VARCHAR(100) | 维度取值，取自 CV 表对应 category 的合法值（如 `rat` / `oral` / `chronic` / `placebo-control`） |
| info_type | VARCHAR(10) | realm 标识（`ich`/`us`/`jp`/`eu`/`ca`/`cn`），默认 `ich` |
| sort_order | INT | 展示排序（默认 0） |

- `@@unique([study_id, name])` — 一个 study 的同一维度只能有一个值
- `@@index([study_id])`

#### `study_document` — 研究关联的 PDF 文档（多对一）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| study_id | UUID | FK→study（Cascade Delete） |
| file_attachment_id | UUID | FK→file_attachment（Cascade Delete，实际 PDF 文件） |
| file_tag | VARCHAR(60) | 文件标签，取自 CV 表 `stf-file-tag-m4` / `stf-file-tag-m5`（如 `study-report-body` / `protocol` / `sample-case-report-form`） |
| file_tag_info_type | VARCHAR(10) | realm 标识，默认 `ich` |
| sort_order | INT | 在 STF `<document-group>` 中的排序 |

- `@@index([study_id])` / `@@index([file_attachment_id])`

#### `ctd_template_node.default_stf_categories` — 章节预设维度（Plan 12 决策 4）

2026-04-09 为 `ctd_template_node` 表新增字段 `default_stf_categories JSONB?`，存储该 CTD 章节的 ICH STF 默认维度清单，前端 `StudyMetadataPanel` 基础区根据此字段渲染"默认维度 Select 列表"。示例值：

```json
[
  { "name": "species", "required": true },
  { "name": "route-of-admin", "required": true },
  { "name": "duration", "required": true },
  { "name": "type-of-control", "required": true }
]
```

种子数据由 `backend/prisma/seeds/stf-default-categories.ts` 的 `STF_DEFAULTS` 表定义 ~30 个 M4/M5 叶章节的预设值（4.2.1.x→species+route-of-admin；4.2.2.x→+duration；4.2.3.x→全 4 维；M5 5.3.1/3/4/5→route-of-admin/type-of-control 等），`applyStfDefaultCategories()` 幂等注入 seed-ctd 流程。按"宁缺勿滥"原则，无明确 ICH 维度的章节留 `null`，由用户通过"高级区"自行添加。

#### `controlled_vocabulary.code` 列宽调整（Plan 12 P1 跟进 migration）

原 `code` 列为 `VARCHAR(10)`，足以容纳 NMPA 代码 `cnapt1..cnsqt4`，但 ICH STF v6.0 的 file-tag 值如 `inter-laboratory-standardisation-methods-quality-assurance` 可达 58 字符。`20260408120100_widen_cv_code_for_stf` 将列宽放宽至 `VARCHAR(80)` 带 22 字符头部空间。

STF 相关 CV 行约定 `descriptionEn = "[<realm>] <value>"` 编码 realm（如 `[ich] mouse`、`[us] short`），`descriptionZh` 存裸值作展示回退，`ControlledVocabularyService.getStfCategoryValues()` 等查询方法用正则 `^\[(\w+)\] (.*)$` 反解 realm。

### 2.8 验证 ✅ (WP-05 已实现)

#### `validation_report` — 验证报告表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| sequence_id | UUID | FK→sequence |
| total_errors | INT | 错误数 |
| total_warnings | INT | 警告数 |
| total_infos | INT | 提示信息数 |
| is_passed | BOOLEAN | 是否通过（无错误） |
| created_at | TIMESTAMP | 验证时间 |

#### `validation_item` — 验证明细表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| report_id | UUID | FK→validation_report |
| rule_code | VARCHAR(10) | 规则编号（如 2.1, 3.14, 4.3.1, 6.19） |
| rule_category | VARCHAR(50) | 规则类别（基础识别/文件夹/ICH骨架/区域信息/STF/PDF） |
| severity | ENUM | ERROR/WARNING/INFO |
| description | TEXT | 规则描述 |
| detail | TEXT | 具体问题详情 |
| file_path | VARCHAR(500) | 涉及的文件路径 |
| suggestion | TEXT | 修复建议 |

### 2.9 协作

#### `comment` — 评论表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| sequence_node_id | UUID | FK→sequence_node |
| user_id | UUID | FK→user |
| content | TEXT | 评论内容 |
| parent_id | UUID | 父评论 FK→self（回复） |
| created_at | TIMESTAMP | 创建时间 |

#### `activity_log` — 操作日志表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| user_id | UUID | FK→user |
| action | VARCHAR(50) | 操作类型（CREATE/EDIT/DELETE/UPLOAD/APPROVE/REJECT/EXPORT/SIGN） |
| resource | VARCHAR(50) | 资源类型（document/file/sequence/node） |
| resource_id | UUID | 资源 ID |
| detail | JSONB | 操作详情 |
| created_at | TIMESTAMP | 操作时间 |

### 2.10 协作增强（WP-09）

#### `project_invitation` — 项目邀请表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| project_id | UUID | FK→project |
| email | VARCHAR(255) | 被邀请人邮箱 |
| role | ENUM(InvitationRole) | 邀请角色: MEMBER/VIEWER |
| invited_by | UUID | FK→user，邀请人 |
| token | VARCHAR(64) | 邀请令牌（唯一） |
| status | ENUM(InvitationStatus) | PENDING/ACCEPTED/EXPIRED/CANCELLED |
| expires_at | TIMESTAMP | 过期时间（创建后 7 天） |
| created_at | TIMESTAMP | 创建时间 |

#### `node_assignment` — 章节指派表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| node_id | UUID | FK→sequence_node |
| user_id | UUID | FK→user |
| permission | ENUM(NodePermission) | EDIT/REVIEW/VIEW |
| assigned_by | UUID | FK→user，指派人 |
| created_at | TIMESTAMP | 创建时间 |

@@unique([node_id, user_id]) — 同一节点同一用户仅一条指派记录

#### `notification` — 通知表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| user_id | UUID | FK→user，接收人 |
| type | ENUM(NotificationType) | 通知类型 |
| title | VARCHAR(200) | 通知标题 |
| content | TEXT | 通知内容 |
| project_id | UUID | 关联项目（可选） |
| resource_type | VARCHAR(50) | 关联资源类型（node/comment/invitation 等） |
| resource_id | UUID | 关联资源 ID |
| is_read | BOOLEAN | 是否已读，默认 false |
| created_at | TIMESTAMP | 创建时间 |

## 3. 索引设计

```sql
-- 高频查询索引
CREATE INDEX idx_application_project ON application(project_id);
CREATE INDEX idx_reg_activity_application ON regulatory_activity(application_id);
CREATE INDEX idx_sequence_reg_activity ON sequence(regulatory_activity_id);
CREATE INDEX idx_sequence_application ON sequence(application_id);  -- 方案 C 引入
CREATE INDEX idx_sequence_node_sequence ON sequence_node(sequence_id);
CREATE INDEX idx_document_node ON document(sequence_node_id);
CREATE INDEX idx_file_node ON file_attachment(sequence_node_id);
CREATE INDEX idx_project_member ON project_member(project_id, user_id);
CREATE INDEX idx_cv_vocabulary ON controlled_vocabulary(vocabulary_name, code);
CREATE INDEX idx_cv_dep ON cv_dependency(application_type_code, regulatory_activity_type_code);
CREATE INDEX idx_completeness_rule ON ctd_completeness_rule(application_type_code, regulatory_activity_type_code);
-- Plan 12 v2: study / study_category / study_document 三表索引
CREATE INDEX idx_study_sequence ON study(sequence_id);
CREATE INDEX idx_study_node ON study(sequence_node_id);
CREATE INDEX idx_study_modified_from ON study(modified_from_id);
CREATE UNIQUE INDEX idx_study_node_study ON study(sequence_node_id, study_id);
CREATE INDEX idx_study_category ON study_category(study_id);
CREATE UNIQUE INDEX idx_study_category_name ON study_category(study_id, name);
CREATE INDEX idx_study_document ON study_document(study_id);
CREATE INDEX idx_study_document_file ON study_document(file_attachment_id);
CREATE INDEX idx_comment_node ON comment(sequence_node_id);
CREATE INDEX idx_activity_log ON activity_log(resource, resource_id);
CREATE INDEX idx_invitation_project ON project_invitation(project_id);
CREATE INDEX idx_invitation_email ON project_invitation(email);
CREATE INDEX idx_assignment_node ON node_assignment(node_id);
CREATE INDEX idx_assignment_user ON node_assignment(user_id);
CREATE INDEX idx_notification_user ON notification(user_id, is_read);
CREATE INDEX idx_notification_project ON notification(project_id);

-- 唯一约束
CREATE UNIQUE INDEX idx_user_email ON "user"(email);
CREATE UNIQUE INDEX idx_seq_number ON sequence(application_id, sequence_number);  -- 方案 C: 序列号在 application 维度全局唯一（原为 regulatory_activity_id 维度）
CREATE UNIQUE INDEX idx_app_number ON application(application_number);
CREATE UNIQUE INDEX idx_document_node_unique ON document(sequence_node_id);
CREATE UNIQUE INDEX idx_pdf_analysis_unique ON file_pdf_analysis(file_attachment_id);
CREATE UNIQUE INDEX idx_invitation_token ON project_invitation(token);
CREATE UNIQUE INDEX idx_assignment_node_user ON node_assignment(node_id, user_id);
```

## 4. 枚举定义

```typescript
// 系统角色
enum Role { ADMIN, MANAGER, EDITOR, VIEWER }
enum ProjectStatus { DRAFT, ACTIVE, ARCHIVED }
enum ProjectMemberRole { OWNER, MEMBER, VIEWER }

// 受控词汇代码（使用 NMPA 官方代码，不使用自定义枚举）
// 申请类型: cnapt1(临床试验), cnapt2(新药), cnapt3(仿制药), cnapt4(原料药)
// 产品类型: cnprt1(化学药品), cnprt2(生物制品)
// 注册行为类型: cnrat1-cnrat9
// 序列类型: cnsqt1(首次提交), cnsqt2(回复), cnsqt3(撤回), cnsqt4(格式转换)

// 序列状态
enum SequenceStatus { DRAFT, EDITING, VALIDATING, EXPORTED, SUBMITTED }

// CTD 节点
enum NodeType { MODULE, SECTION, LEAF, EXTENSION_POINT }
enum NodeOperation { NEW, REPLACE, APPEND, DELETE }
enum NodeStatus { EMPTY, EDITING, COMPLETED }
enum ApprovalStatus { DRAFT, SUBMITTED, APPROVED, REJECTED }

// 验证
enum Severity { ERROR, WARNING, INFO }
enum ComplianceStatus { PASS, WARNING, ERROR }

// 日志
enum ActionType { CREATE, EDIT, DELETE, UPLOAD, APPROVE, REJECT, EXPORT, SIGN, INVITE, INVITE_ACCEPT, ROLE_CHANGE, OWNERSHIP_TRANSFER, ASSIGN, UNASSIGN }

// 邀请 (WP-09)
enum InvitationStatus { PENDING, ACCEPTED, EXPIRED, CANCELLED }

// 章节指派权限 (WP-09)
enum NodePermission { EDIT, REVIEW, VIEW }

// 通知类型 (WP-09)
enum NotificationType {
  INVITATION,              // 收到项目邀请
  ASSIGNMENT,              // 被指派章节编辑任务
  MENTION,                 // 被 @提及
  APPROVAL_SUBMITTED,      // 有人提交审批
  APPROVAL_APPROVED,       // 提交被审批通过
  APPROVAL_REJECTED,       // 提交被驳回
  COMMENT,                 // 负责章节收到新评论
  LOCK_FORCE_RELEASED,     // 编辑锁被强制释放
  MEMBER_ROLE_CHANGED,     // 项目角色被变更
  OWNERSHIP_TRANSFERRED    // 项目所有权变更
}
```

## 5. 关键设计说明

### 5.1 受控词汇使用代码而非枚举
申请类型等属性使用 VARCHAR 存储 NMPA 官方代码（如 cnapt2），而非自定义枚举值。原因:
- 受控词汇文件带版本号和有效期，版本更新时仅需更新 controlled_vocabulary 表
- 三级关联关系通过 cv_dependency 表管理，支持动态查询
- 前端级联选择直接使用代码查询

### 5.2 信封属性不可变性
- application 表的 application_number, application_type_code, product_type_code, product_number 创建后不可 UPDATE
- regulatory_activity 表的 regulatory_activity_type_code, related_sequence 创建后不可 UPDATE
- 通过 Service 层逻辑和数据库触发器双重保障

### 5.3 文件复用（跨序列引用）
- file_attachment.is_reference = true 表示引用其他序列的文件
- reference_file_id 指向原始文件记录
- 骨架文件中 xlink:href 使用相对路径指向原文件位置
- 不允许跨 application 引用
