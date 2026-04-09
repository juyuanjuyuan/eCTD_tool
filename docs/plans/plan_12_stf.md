# Plan 12: Study Tagging Files (STF) 实施计划

> 基于 `/home/eCTD_tool/reference/实施规范指南/STFV2-6-1_0.pdf`（ICH STF Specification v2.6.1）和 `eCTD_Specification_v3_2_2_0.pdf` 第 5 章。
>
> 本计划于 2026-04-08 由 Plan 11 后续合规审计提出，因工作量较大（预计 1-2 天），从该轮"合规修复批次"中拆出，独立成 Plan 12 单独执行。

---

## 1. 背景与动机

### 现状

当前系统对 STF 的支持仅停留在标记位层面：
- `backend/prisma/schema.prisma` 的 `CtdTemplateNode` 表有 `requiresStf: Boolean` 字段
- `backend/src/ectd/services/validator.service.ts` 中存在对 `requiresStf` 字段的引用，但仅做布尔判断
- **没有任何 STF XML 文件的生成、解析、生命周期管理逻辑**
- **没有 study/category/file-tag 元素的取值校验**

### 规范要求

按 ICH STF v2.6.1：
- 模块 4 (`4.2.1.x`、`4.2.2.x`、`4.2.3.x`) 和模块 5 (`5.3.1.x` ~ `5.3.7.x`) 下的**每一份研究报告**都必须随附一个 STF
- STF 是独立的 XML 文件，跟随研究报告文件一起放在 eCTD 包内（与报告同目录或受控位置）
- STF 自身遵循 eCTD 生命周期（new → append → modified-file 链）
- STF 的 DTD 是 `ich-stf-v2-2.dtd`（version 属性 `"2.2"`），尽管规范文档版本号是 v2.6.1，DTD 名称里写的是 v2-2

### 严重度

**BLOCKER**。无 STF 的 eCTD 包在 ICH 区域和 NMPA V1.1 验证标准里都是 ERROR 级失败，无法用于真实申报。

---

## 2. STF 数据模型

### 2.1 XML 结构概览

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE ectd:study PUBLIC "-//ICH//DTD ICH STF v2.2//EN" "ich-stf-v2-2.dtd">
<ectd:study xmlns:ectd="http://www.ich.org/ectd"
            xmlns:xlink="http://www.w3c.org/1999/xlink"
            DTDVersion="2.2"
            ID="StudyXYZ-001">
  <category name="species" info-type="ich">rat</category>
  <category name="route-admin" info-type="ich">oral</category>
  <category name="duration" info-type="ich">subchronic</category>
  <category name="type-of-control" info-type="ich">vehicle-control</category>

  <document-group>
    <title>Study Report Body</title>
    <leaf ID="StudyXYZ-001-body"
          operation="new"
          xlink:href="study-report-body.pdf"
          xlink:type="simple"
          checksum="abc123..."
          checksum-type="md5">
      <title>Study Report Body</title>
      <file-tag info-type="ich">study-report-body</file-tag>
    </leaf>
    <leaf ID="StudyXYZ-001-protocol"
          operation="new"
          xlink:href="protocol.pdf"
          xlink:type="simple"
          checksum="def456..."
          checksum-type="md5">
      <title>Protocol</title>
      <file-tag info-type="ich">protocol</file-tag>
    </leaf>
  </document-group>
</ectd:study>
```

### 2.2 关键元素

| 元素 | 必填 | 取值约束 |
|------|------|---------|
| `study/@ID` | ✓ | 全局唯一，建议命名 `Study<研究编号>-<序列>` |
| `study/@DTDVersion` | ✓ | 固定 `"2.2"` |
| `category/@name` | ✓ | 受控词汇，模块 4 取自 `nonclinical-categories.xml`，模块 5 取自 `clinical-categories.xml` |
| `category/@info-type` | ✓ | `ich` 或区域代码 (`cn`/`us`/`jp`/`eu`/`ca`) |
| `category` 文本 | ✓ | 受控词汇，按 `valid-values.xml` v6 |
| `leaf/@ID` | ✓ | STF 内唯一 |
| `leaf/@operation` | ✓ | `new` / `replace` / `append` / `delete` |
| `leaf/checksum` | ✓ | 文件 MD5 |
| `leaf/checksum-type` | ✓ | 固定 `"md5"` |
| `file-tag/@info-type` | ✓ | `ich` 或区域代码 |
| `file-tag` 文本 | ✓ | 受控词汇，从 `valid-values.xml` 的 file-tags 部分取 |

### 2.3 模块 4 / 5 章节与 STF 的对应

| CTD 章节 | 是否要 STF | 典型 category 维度 |
|----------|-----------|-------------------|
| 4.2.1.x 药理学研究报告 | ✓ | species, route-admin, study-type |
| 4.2.2.x 药代动力学研究报告 | ✓ | species, route-admin, duration |
| 4.2.3.x 毒理学研究报告 | ✓ | species, route-admin, duration, type-of-control |
| 5.3.1.x 生物药剂学研究报告 | ✓ | study-type, formulation |
| 5.3.2.x 体外/体内代谢研究报告 | ✓ | study-type, matrix |
| 5.3.3.x PK 在健康人群研究 | ✓ | study-type, dose |
| 5.3.4.x PK / PD 研究 | ✓ | indication, dose, study-type |
| 5.3.5.x 临床有效性/安全性研究 | ✓ | indication, controlled, blinding, design |
| 5.3.6.x 上市后经验报告 | ✓ | indication |
| 5.3.7.x 病例报告表与个体患者数据 | ✓ | study-type |

---

## 3. 实施阶段

### 阶段 1：受控词汇导入

**目标**：把 ICH STF 受控词汇加载到数据库或代码常量

#### 1.1 数据来源
- 从 `reference/eCTD技术规范V1.1附件包/` 找 `valid-values.xml`（v6 或最新）
- 提取以下条目：
  - 模块 4 categories (species, route-admin, duration, type-of-control 等)
  - 模块 5 categories (study-type, indication, dose, design 等)
  - file-tags（study-report-body, protocol, sample-case-report-form, ...）

#### 1.2 存储方案（**已锁定：方案 A — CV 表**）

在 `ControlledVocabulary` 表里加 `vocabularyName` 维度，与项目现有 4 类 ICH 受控词汇（cnapt/cnprt/cnrat/cnsqt）保持一致：

| vocabularyName | 内容 |
|----------------|------|
| `stf-category-m4-species` | 物种值（rat / mouse / dog / monkey / ...） |
| `stf-category-m4-route-admin` | 给药途径（oral / iv / sc / ...） |
| `stf-category-m4-duration` | 持续时间（single-dose / subchronic / chronic / ...） |
| `stf-category-m4-type-of-control` | 对照类型（vehicle-control / positive-control / ...） |
| `stf-category-m5-study-type` | 研究类型 |
| `stf-category-m5-indication` | 适应症 |
| `stf-category-m5-dose` | 剂量 |
| `stf-category-m5-design` | 研究设计 |
| `stf-file-tag-m4` | 模块 4 的 file-tag 值 |
| `stf-file-tag-m5` | 模块 5 的 file-tag 值 |

**理由**：(1) 复用 CV 表的 `version + validFrom + validTo` 字段做版本管理，未来 ICH valid-values.xml v6→v7 升级可平滑切换；(2) 复用现有 `cv.service` / `cvApi` 接口，前后端零额外基础设施；(3) 与项目其他 4 类受控词汇架构一致。

#### 1.3 任务清单
- [x] 读取 valid-values.xml 提取条目
- [x] 设计 vocabularyName 命名规范（`stf-category-<name>` / `stf-file-tag-m4` / `stf-file-tag-m5`）
- [x] 写 seed 逻辑（集成进 `controlled-vocabulary.service.ts` 的 `seedStfVocabularies()` + `parseStfValidValuesFile()`，幂等，由 `onModuleInit` 调用）
- [x] 在 `cv.service.ts` 添加 `getStfCategories()` / `getStfCategoryValues(name)` / `getStfFileTags(module)` 接口（带 Redis 缓存），并暴露 `GET /api/v1/cv/stf/categories`、`/stf/categories/:name`、`/stf/file-tags?module=m4|m5`
- [x] 加单元测试（8 条 STF 相关用例，覆盖 seed 幂等 / 解析计数 / realm 编码 / 分组查询 / 单类查询 / file-tag 按模块查询）

---

### 阶段 2：数据模型扩展

**目标**：让一份研究报告能在数据库里挂上 STF 元数据

#### 2.0 v1 → v2 迁移（**重要：v1 已存在**）

**v1 现状**（2026-04-08 复核）：
- 项目里已经有 `StudyTaggingFile` 表 (`backend/prisma/schema.prisma:461`)，单表设计
- 字段：`id / sequenceNodeId(@unique) / studyTitle / studyId / categories(Json) / fileTags(Json) / stfXmlContent(Text) / operation`
- **致命限制**：`sequenceNodeId @unique` 强制每个 sequence_node 最多挂 1 个 STF。但按 ICH STF v2.6.1，一个 CTD 章节（如 4.2.3.2 重复给药毒性研究）完全可以挂多份研究 → v1 schema 直接禁止了这种合规场景
- 服务：`backend/src/ectd/services/stf.service.ts`（228 行），含 valid-values.xml 加载器 + CRUD upsert
- 引用面：10 个 backend 文件，详见 §3.5 任务清单

**采用方案 A — drop v1，按 §2.1 三表方案重建**（已锁定决策）：
- 加列救不活 1:1 unique 约束 → 必须 drop 重建
- 用户已确认开发环境数据全为测试数据，可直接 drop（与 2026-04-08 方案 C 序列号迁移同样的处理）
- **不写 INSERT data migration**：开发环境零价值数据，写 INSERT 反而是 bug 高发区（v1 categories 是 `{species, routeOfAdmin, duration, typeOfControl}` object 形态、v2 是 normalized rows，反向解析 stfXmlContent 也复杂）
- valid-values.xml 解析逻辑从 v1 `stf.service.loadValidValues()` 移植到阶段 1 的 CV seed 脚本，**不要重写**

**单 prisma migration 内的 SQL 顺序**：
```sql
-- 1. drop v1
DROP TABLE study_tagging_file CASCADE;

-- 2. create v2 三表（详见 §2.1）
CREATE TABLE study (...);
CREATE TABLE study_category (...);
CREATE TABLE study_document (...);

-- 3. CtdTemplateNode 加预设维度字段（决策 4 配套，详见 §2.2）
ALTER TABLE ctd_template_node ADD COLUMN default_stf_categories JSONB;

-- 4. 索引 + 外键 + 唯一约束（详见 §2.1 各表定义）
```

#### 2.1 新表 `Study`
```prisma
model Study {
  id             String   @id @default(cuid())
  sequenceId     String
  sequence       Sequence @relation(fields: [sequenceId], references: [id], onDelete: Cascade)
  ctdSectionNumber String   // 例 "4.2.3.2"
  studyId        String   // 用户填的研究编号，例 "TOX-2024-001"
  title          String

  // 元数据
  categories     StudyCategory[]
  documents      StudyDocument[]

  // 生命周期
  operation      LeafOperation @default(NEW)
  modifiedFromId String?
  modifiedFrom   Study?   @relation("StudyLifecycle", fields: [modifiedFromId], references: [id])
  modifiedTo     Study[]  @relation("StudyLifecycle")

  // 生成的 STF 文件
  stfFilePath    String?
  stfChecksum    String?

  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  @@unique([sequenceId, ctdSectionNumber, studyId])
}

model StudyCategory {
  id        String @id @default(cuid())
  studyId   String
  study     Study  @relation(fields: [studyId], references: [id], onDelete: Cascade)
  name      String   // species, route-admin, ...
  value     String   // rat, oral, ...
  infoType  String   @default("ich")

  @@unique([studyId, name])
}

model StudyDocument {
  id           String  @id @default(cuid())
  studyId      String
  study        Study   @relation(fields: [studyId], references: [id], onDelete: Cascade)
  fileId       String  // 指向 File 表
  file         File    @relation(fields: [fileId], references: [id])
  fileTag      String  // study-report-body, protocol, ...
  fileTagInfoType String @default("ich")
  sortOrder    Int     @default(0)
}
```

#### 2.2 `CtdTemplateNode` 扩展（支撑决策 4 — 章节预设维度）

```prisma
model CtdTemplateNode {
  // ... 现有字段
  defaultStfCategories Json?  // 该 CTD 章节预设的 STF category 维度清单
                              // 格式：[{ name: "species", required: true }, { name: "route-admin", required: true }, ...]
                              // 仅模块 4/5 的叶节点需要填写
}
```

种子数据示例（写入 `prisma/seed-ctd.ts` 或独立 seed）：

| ctdSectionNumber | defaultStfCategories |
|------------------|---------------------|
| 4.2.1.1 药效学 | `[{name:"species",required:true}, {name:"route-admin",required:true}]` |
| 4.2.3.2 重复给药毒性 | `[{name:"species",req:true}, {name:"route-admin",req:true}, {name:"duration",req:true}, {name:"type-of-control",req:true}]` |
| 5.3.1.x 生物药剂学 | `[{name:"study-type",req:true}]` |
| 5.3.5.1 控制性临床研究 | `[{name:"indication",req:true}, {name:"design",req:true}, {name:"dose",req:true}]` |
| 5.3.5.4 其他临床研究 | `[{name:"indication",req:true}]` |

**说明**：这份"章节→默认维度"映射表是 ICH STF v2.6.1 + ICH E3 的惯例，需要在阶段 1 受控词汇调研时一并整理。具体值由阶段 1 调研产出，本表仅为示例。

#### 2.3 任务清单
- [x] 写 Prisma migration `20260408120000_stf_v2_schema` （含 Study/StudyCategory/StudyDocument 三张新表 + DROP v1 `study_tagging_file`）
- [x] 在 `Sequence` 和 `FileAttachment` 模型加反向关系（`studies[]` / `studyDocuments[]`）
- [x] 给 `CtdTemplateNode` 加 `defaultStfCategories JSONB?` 字段并做迁移
- [x] 写 seed 脚本 `backend/prisma/seeds/stf-default-categories.ts` 的 `STF_DEFAULTS` 表填充模块 4/5 各叶节点的 `defaultStfCategories` 默认值（~30 个章节），由 `applyStfDefaultCategories()` 在 `seed-ctd.ts` 中幂等执行
- [x] `npx prisma generate`
- [x] 跑 migration（含跟进 migration `20260408120100_widen_cv_code_for_stf` 把 CV `code` 列放宽到 VARCHAR(80)）

---

### 阶段 3：后端 Service 层

#### 3.1 `study.service.ts`
- `createStudy(sequenceId, dto)` — 创建研究 + 关联 categories + documents
- `updateStudy(studyId, dto)`
- `listStudiesBySequence(sequenceId)`
- `getStudy(studyId)`
- `deleteStudy(studyId)`
- `validateStudyMetadata(study)` — categories 必须覆盖该模块所需维度，file-tags 必须取自受控词汇

#### 3.2 `study-tagging-file.service.ts`（**重写 v1 `stf.service.ts`**，不是新建并存）

**v1 处理**：把 `backend/src/ectd/services/stf.service.ts` 整个**废弃删除**，新建 `study-tagging-file.service.ts` 替代。**复用** v1 里的 `loadValidValues()` 方法（解析 reference 包里的 valid-values.xml v6.0），把它移植到阶段 1 的 CV seed 脚本，不要重写解析逻辑。

**新 service 接口**：
- `generateStfXml(study: Study): string` — 按 §2.1 的结构生成 XML
- `parseStfXml(xml: string): Study` — 反向解析（导入场景）
- `validateAgainstDtd(xml: string)` — 用 fast-xml-parser + 自定义校验（项目里已经在用 fast-xml-parser）
- `computeStudyChecksum(study)` — STF 文件本身的 MD5
- 生命周期辅助：
  - `buildStfWithModifiedFile(currentStudy, priorStudy)` — append 操作时塞 modified-file 引用

#### 3.3 与 `index-xml.service.ts` 的集成
- index.xml 里模块 4/5 的 leaf 不再是直接指向 PDF，而是**指向 STF**
- 修改 `index-xml.service.ts` 在生成模块 4.2.x.x 和 5.3.x.x 节点时：
  - 跳过原本对 PDF 文件的 leaf 生成
  - 改为对 Study 表生成 leaf，xlink:href 指向 STF 文件
  - PDF 文件的引用放到 STF 内部的 document-group 里
- 保留向后兼容：如果某 sequence 的模块 4/5 没创建 Study（例如老数据），仍按原逻辑生成 PDF leaf 并 emit WARNING 提示用户补 STF

#### 3.4 与 `package-assembler.service.ts` 的集成（**已锁定：STF 与 PDF 同目录**）

- 包导出时，每个 Study 渲染成 STF XML 文件，**与该 Study 的 PDF 文件落盘在同一目录**
- 命名规范：`<study-id-normalized>.xml`（study-id 走 `file-name-normalizer` 规范化，仅 a-z/0-9/-/_）
- 示例目录结构：
  ```
  m4/42-stud-rep/421-pharmacol-stud/
    study-tox-2024-001.xml      ← STF 文件
    study-tox-2024-001-body.pdf ← 研究报告正文
    study-tox-2024-001-prot.pdf ← 研究方案
    study-tox-2024-001-crf.pdf  ← CRF
  ```
- xlink:href 引用：STF 内部 leaf 元素的 `xlink:href` 用**同目录相对路径**（即 `body.pdf` 这种），最简洁，离 230 字符上限最远
- 把所有 STF XML 文件路径加入 `index-md5.txt`，按现有 MD5 流程算

**理由**：(1) ICH eCTD v3.2.2 + STF v2.6.1 的官方示例与参考实现都是同目录摆放；(2) CDE 验证软件预期就是同目录结构，独立 stf/ 子目录可能触发"路径不一致"告警；(3) 路径短，离 230 字符上限更安全；(4) 一份研究的所有文件物理聚在一起，便于 CDE 评审员按研究为单位审阅；(5) xlink:href 同目录相对路径最简洁，跨目录引用容易出错。

#### 3.5 任务清单

**v1 拆除（必做，drop 表后这些位置会编译失败）**：
- [x] **删除** `backend/src/ectd/services/stf.service.ts` — 228 行旧实现整体废弃，valid-values.xml 解析逻辑已在 P2 移植到 `controlled-vocabulary.service.seedStfVocabularies()`
- [x] **更新** `backend/src/ectd/services/package-assembler.service.ts` — 全部改为读 v2 的 `node.studies[]` 关系，v1 `getStfPath` 已删除，新版在 assemblePackage/assemblePackageStream/previewStructure 三条路径以 `study-<slug>.xml` 命名将 `study.stfXmlContent` 写入 ZIP 并使用 `study.stfChecksum` 加入 index-md5.txt
- [x] **更新** `backend/src/ectd/services/validator.service.ts` — 第 5 类 STF 规则重写为 v2 版，全部遍历 `node.studies[]`，保留 CDE V1.1 规则编号 5.1/5.4/5.5/5.6/5.8/5.10/5.11/5.12/5.13/5.14/5.16/5.18/5.20，规则 5.7 因一 leaf 多研究而废除
- [x] **更新** 6 个 spec 文件中对 `studyTaggingFile` 的 mock 与断言（含新建 `study-tagging-file.service.spec.ts` 替代原 `stf.service.spec.ts`、`package-assembler.service.spec.ts`、`validator.service.spec.ts`、`xml-backbone-validation.spec.ts`、`ectd-advanced-scenarios.spec.ts`、`ectd-compliance.spec.ts`、`integration-workflow.spec.ts`）
- [x] **更新** `backend/src/ectd/ectd.controller.spec.ts` 里 2026-04-08 测试清理 batch 改过的 `categories: { species: 'rat' }` mock — 改为 v2 的 Study 结构
- [x] **删除** `ectd.controller.ts` 的 v1 STF 端点（`GET/PUT /nodes/:nodeId/stf`）+ `SaveStfDto`，前端改用 `studyApi`

**v2 新增**：
- [x] `study.service.ts` + DTOs (`create-study.dto.ts` / `update-study.dto.ts` / `import-study.dto.ts`) + `study.controller.ts` (9 CRUD + import 端点) + `study.module.ts` 装配 + 在 `app.module.ts` 注册
- [x] `study-tagging-file.service.ts` 全套（**生成方向**，纯 XML in/out，含 `generateStfXml` / `parseStfXml` / `computeStfChecksum` / `validateStructure`）
- [x] `index-xml.service.ts` 集成（新增 `buildStfLeaves` + `deriveStfPath`，STF 必需章节 leaf 指向 `study-<slug>.xml` 而非 PDF）
- [x] `package-assembler.service.ts` 集成（替换 v1 拆除中的 7 处）
- [x] `validator.service.ts` 新增规则：模块 4/5 的每个研究报告必须有对应 Study 记录且 STF 元数据完整（替换 v1 拆除中的 4 处）
- [x] 单元测试 ≥15 个，覆盖：XML 生成、解析、生命周期、受控词汇校验、跨序列 modified-file（在 `study-tagging-file.service.spec.ts` 共 34 用例）

#### 3.6 STF 导入服务（**已锁定：本计划一并实现，作为独立子模块**）— **后端已完成 2026-04-09**

- [x] 新建 `study-tagging-file-import.service.ts`：
  - [x] `importStfXml(sequenceNodeId, xmlString, { onConflict })` — 解析单个 STF XML 文件并写入 Study 表
  - [x] `importStfBundle(sequenceNodeId, { xmlString, attachedFiles, onConflict })` — 批量导入一整组 STF + 关联 PDF（用于从 ERIS 等竞品迁移）
- 解析流程：
  1. fast-xml-parser 解析 STF XML，提取 ectd:study/category/document-group/leaf 元素
  2. 反向映射：file-tag/category 受控词汇 → 项目 CV 表的 code（拒绝 valid-values.xml 之外的值）
  3. 检测 leaf 元素的 modified-file 引用 → 在当前 application 内查找前序 Study 建立 lifecycle 链
  4. 上传 STF 内引用的 PDF 文件到 MinIO（如果不在系统里），写入 File 表
  5. 创建 Study + StudyCategory + StudyDocument 记录
- 冲突处理：
  - 同 sequenceId + ctdSectionNumber + studyId 已存在 → 报 ConflictException，让用户选"覆盖 / 合并 / 取消"
  - 引用了 valid-values.xml 之外的 category 值 → 报 BadRequest 并列出非法值
  - modified-file 找不到前序 Study → 降级为 WARNING，导入成功但 lifecycle 链断裂
- 暴露 REST 接口：
  - `POST /sequences/:seqId/studies/import-xml` — body: STF XML 字符串
  - `POST /sequences/:seqId/studies/import-bundle` — multipart：STF XML 文件 + 关联 PDF 文件
- 单元测试 ≥10 个：
  - 合法 STF 导入成功
  - 含未知 category 报错
  - modified-file 跨序列正确建立 lifecycle 链
  - 同 studyId 冲突时正确抛 ConflictException
  - 批量导入 + 部分失败的事务回滚

**说明**：导入功能不是 MVP 核心（核心是导出能让 CDE 接收的包），但纳入 Plan 12 是为了：(1) 支持从 ERIS 等竞品迁移项目；(2) 跨团队协作场景下接收外部产出的 STF；(3) 同一份解析逻辑也可以用作 STF 校验工具的底座。导入做完后 `study-tagging-file.service.ts` 的 `parseStfXml` 也复用了相同代码路径。

---

### 阶段 4：前端 UI

#### 4.1 在编辑器右侧 PropertiesPanel 增加 "Study Metadata" Tab（**已锁定：预设维度 + 高级扩展**）

- 当用户选中模块 4.2.x.x 或 5.3.x.x 节点时显示
- 表单分两区：
  - **基础区（默认展开）** — 根据当前节点的 `defaultStfCategories` 字段渲染若干个 Select：
    - 研究编号 / 标题 / Documents（与文件 + file-tag）
    - Categories 部分自动展示该章节"惯例必填"的维度（如 4.2.3.2 默认显示 species/route-admin/duration/type-of-control 4 个 Select），用户**只需选值**，不需要选维度
    - 标记为 `required: true` 的维度，前端做必填校验
    - 每个 Select 的 options 调用 `cvApi.getStfCategoryValues('species' | 'route-admin' | ...)` 拉取
  - **高级区（默认折叠）** — 一个 "添加更多 category" 按钮，点开后显示完整 categories 维度列表，供高级用户给特殊研究补充非默认维度
- 保存后调用 `POST /sequences/:seqId/studies`，DTO 区分 `presetCategories` 与 `extraCategories`，但后端落盘时合并

**理由**：纯固定太死板（特殊研究填不进去），纯自由用户负担重（不知道该填哪些维度，数据质量难保证）。折中方案让 90% 的常规研究"开箱即填"，10% 的特殊研究通过高级区扩展。`defaultStfCategories` 的种子数据由阶段 1 调研产出。

#### 4.2 在 ValidationPanel / EctdPackagePanel 显示 STF 校验结果
- 显示哪些章节缺 STF
- 显示哪些 Study 元数据不完整

#### 4.3 STF 导入入口（配套 §3.6）
- 在 PropertiesPanel "Study Metadata" Tab 顶部加一个 "从 STF XML 导入" 按钮
- 点击弹出 Modal，支持两种模式：
  - **粘贴 XML 模式** — 文本框粘贴 STF XML 内容 → 调 `import-xml` 接口
  - **上传文件模式** — Upload.Dragger 上传 STF XML + 关联 PDF → 调 `import-bundle` 接口
- 导入成功后 toast 提示 + 自动刷新当前节点的 Study 列表
- 冲突时弹出二次确认 Modal（覆盖 / 合并 / 取消）

#### 4.4 任务清单
- [x] 新增 `frontend/src/components/StudyMetadataPanel.tsx`（含基础区 + 高级区折叠）
- [x] 新增 `frontend/src/components/StudyImportModal.tsx`
- [x] `frontend/src/services/study.ts` API client（含 CRUD + import 三接口：`importXml/importBundle/importBundleMultipart`）
- [x] `frontend/src/services/cv.ts` 新增 STF 方法 `getStfCategories/getStfCategoryValues/getStfFileTags`；`services/ectd.ts` 删除 v1 STF 端点
- [x] `PropertiesPanel.tsx` 集成「研究 (STF)」Tab（仅在 `isStfSection(ctdSectionNumber)` 真时显示）
- [x] ValidationPanel 显示 STF 错误（第 5 类规则由 validator.service 产出，前端直接渲染）

---

### 阶段 5：测试与回归

- [x] `study.service.spec.ts` ≥10 用例（CRUD + 校验 + 生命周期解析 + 缓存 XML 重算）
- [x] `study-tagging-file.service.spec.ts` ≥15 用例（生成方向，实际 34 用例）
- [x] `study-tagging-file-import.service.spec.ts` ≥10 用例（导入方向，含冲突 / 非法 category / 跨序列 modified-file 重建）— 实际 14 个用例
- [x] 集成测试：`backend/src/ectd/services/stf-pipeline-integration.spec.ts`（P5 并行 agent 产出）— 完整生成包含模块 4/5 的 sequence，验证 STF 文件存在 + 与 PDF 同目录 + DTD 合规 + 跨序列 modified-file 链正确
- [x] **导入回环测试**：用本系统生成 STF → 导出包 → 解压 → 重新导入到新 sequence → 校验数据一致（生成与解析的对称性，纳入 stf-pipeline-integration.spec.ts）
- [x] 用 CDE 验证标准 V1.1 全部 STF 相关规则覆盖（validator.service 第 5 类规则重写，保留规则编号 5.1/5.4/5.5/5.6/5.8/5.10/5.11/5.12/5.13/5.14/5.16/5.18/5.20；规则 5.7 因一 leaf 多研究而废除）
- [x] E2E：StudyMetadataPanel + StudyImportModal + PropertiesPanel 集成，通过编辑器创建非临床/临床研究并导出包
- [x] **P5 文档同步**（本轮并行任务）：update_log.md / database_design.md / backend_architecture.md / api_design.md / frontend_architecture.md / plan_12_stf.md 六份文档全部同步

---

## 4. 工作量估算

| 阶段 | 估算 | 说明 |
|------|------|------|
| 阶段 1 受控词汇导入 | 0.5 天 | CV 表 seed + cv.service 接口 + 章节→默认维度调研 |
| 阶段 2 数据模型扩展 | 0.5 天 | Study/StudyCategory/StudyDocument 三表 + CtdTemplateNode.defaultStfCategories + seed |
| 阶段 3.1-3.5 后端 Service（生成方向） | 1.5 天 | study.service / study-tagging-file.service / index-xml + package-assembler 集成 / validator 规则 |
| 阶段 3.6 后端 Service（导入方向） | 1 天 | study-tagging-file-import.service + 冲突处理 + REST 接口 |
| 阶段 4 前端 UI | 1.5 天 | StudyMetadataPanel（基础区+高级区） + StudyImportModal + ValidationPanel 集成 |
| 阶段 5 测试 | 1 天 | 生成 + 导入 + 导入回环对称性 + CDE 规则覆盖 + E2E |
| **合计** | **~6 天** | |

> 说明：相比初稿的 ~4 天，本次基于 4 项已锁定决策修订后增加了 ~2 天，主要来自：(1) 决策 3 加入导入功能 (+1 天后端 + 0.5 天前端 + 0.5 天测试) ；(2) 决策 4 折中方案需要章节→默认维度调研和 seed (+0 天，已包含在阶段 1)。用户已确认不限制工作量，由 agent 完成。

---

## 5. 前置依赖

- ✅ Plan 5（eCTD XML 骨架文件、生命周期管理与验证引擎）已完成
- ✅ **方案 C（sequenceNumber 全局编号化）已于 2026-04-08 合并**，`index-xml.service.ts` / `cn-regional-xml.service.ts` / `lifecycle.service.ts` / `validator.service.ts` 都已升级为 application-scoped 查询，Plan 12 可以放心扩展这些文件
- ✅ **Plan 11 合规修复批次（路径上限 230 / 模块 5 完整性 / 申请编号格式 / 3.2.R 扩展 / PDF 字体校验）已于 2026-04-08 合并**，Plan 12 可以叠加在干净的合规基线上

---

## 6. 风险点

1. **受控词汇版本漂移**：valid-values.xml 有 v6、v7 多个版本，ICH 和 NMPA 可能不一致。需要先确认 NMPA V1.1 对 STF 受控词汇的指定版本。CV 表方案的版本字段可以缓解这个风险。
2. **DTD 文件路径**：`ich-stf-v2-2.dtd` 是否需要打包进导出 zip 内？还是只在 XML 头部声明？需要看 `reference/eCTD技术规范V1.1附件包/` 的 DTD 摆放规范。
3. **生命周期复杂度**：STF 的 append + modified-file 链跨序列。方案 C 已让 sequenceNumber 全局唯一，简化了跨序列引用，但仍需在阶段 5 集成测试覆盖 ≥3 序列的完整生命周期。
4. **历史数据兼容**：如果有用户在 Plan 12 上线前已经创建了模块 4/5 的内容（直接上传 PDF），这些数据需要一次性向用户提示"补充 Study 元数据"或提供 ad-hoc 迁移脚本。
5. **NMPA vs ICH STF 差异**：NMPA V1.1 对 STF 是否完全沿用 ICH 还是有区域增补，需要核对中文规范文件。
6. **导入对称性 (新增)**：决策 3 加入了导入功能，"生成 → 解析回原数据"的对称性是隐性 bug 高发区。例如 categories 顺序、空 document-group、modified-file 链断裂的边界场景。阶段 5 必须有"导入回环"测试覆盖。
7. **章节默认维度调研覆盖度 (新增)**：决策 4 折中方案依赖 `defaultStfCategories` 种子数据。模块 4 / 模块 5 共有 ~30 个叶节点需要逐一定义其默认维度，调研工作量被放在阶段 1 的 0.5 天里可能略紧。实际执行时如果发现 ICH 没有明确指定某些章节的"惯例维度"，需要按"宁缺勿滥"原则（让用户走高级区添加），不要强行预设错的维度。

---

## 7. 完成标准

- L1：能在编辑器里给模块 4/5 节点录入研究元数据 + 上传文件
- L2：导出的 eCTD 包内含合法的 STF XML 文件，DTD 校验通过
- L3：CDE 验证标准 V1.1 中所有 STF 相关规则全部 PASS
- L4：通过 ICH STF v2.6.1 + 本项目内置验证引擎 + CDE 第三方验证软件三方验证

---

## 8. 已锁定决策（2026-04-08）

| # | 决策项 | 选择 | 一句话理由 |
|---|--------|------|-----------|
| 1 | STF 受控词汇存储 | **CV 表（方案 A）** | 与项目现有 4 类 ICH 受控词汇架构一致；CV 表自带 version 字段支持 ICH valid-values.xml v6→v7 平滑升级；前后端零额外基础设施 |
| 2 | STF 文件落盘位置 | **与 PDF 同目录** | 符合 ICH eCTD v3.2.2 + STF v2.6.1 通行实现；CDE 验证软件预期同目录；路径短离 230 字符上限远；xlink:href 同目录相对路径最简洁 |
| 3 | 是否包含 STF 导入功能 | **包含**，作为阶段 3.6 独立子模块 | 支持从 ERIS 等竞品迁移；跨团队协作场景；解析逻辑可复用为 STF 校验工具底座；用户已确认不限制工作量 |
| 4 | 前端 categories 展示策略 | **预设维度 + 高级区扩展**（折中方案） | 90% 常规研究"开箱即填"；10% 特殊研究通过高级区扩展；保证数据质量同时不丢灵活性；依赖 `CtdTemplateNode.defaultStfCategories` 种子数据 |

详见各决策对应的实施段落：
- 决策 1 → §1.2 存储方案 + §3.1 study.service
- 决策 2 → §3.4 package-assembler 集成
- 决策 3 → §3.6 STF 导入服务 + §4.3 前端导入入口 + §5 导入回环测试
- 决策 4 → §2.2 CtdTemplateNode 扩展 + §4.1 PropertiesPanel 表单
