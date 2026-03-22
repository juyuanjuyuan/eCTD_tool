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
| `ectd` ✅ | eCTD 核心逻辑（XML 骨架生成、验证引擎、MD5 校验、生命周期状态机、STF 生成、提交包组装） | CnRegionalXmlService, IndexXmlService, ValidatorService, LifecycleService, StfService, Md5Service, PackageAssemblerService |
| `file` | 文件存储（MinIO 操作、命名规范化、PDF 分析） | FileService, FileNameNormalizer |

### 1.2 模块依赖关系

```
auth ← user
project ← application ← regulatory-activity ← sequence
controlled-vocabulary (被 application/regulatory-activity/sequence/ectd 引用)
ctd-template ← document ← export
                          ← ectd (xml-backbone, validator, lifecycle, stf)
file (独立，被 document/export/ectd 引用)
```

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

// 序列号: 4位数字，同一注册行为内从0000开始递增，不允许跳号
// 通过 Redis INCR 保证唯一
generateSequenceNumber(regulatoryActivityId: string): string
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

### 4.6 STF 服务

模块四的 4.2.X 和模块五的 5.3.1.X-5.3.5.X 的所有文件必须使用 STF:
- 遵循 `ich-stf-v2-2.dtd` 格式
- category 属性值从 `valid-values.xml` 获取（species/route-of-admin/duration/type-of-control）
- file-tag 值从 `valid-values.xml` 的 145+ 合法标签中选取
- STF 是唯一推荐使用 append 操作的文件类型

### 4.7 验证服务

实现 `eCTD验证标准V1.1.pdf` 中的全部验证规则（CDE 官方验证软件及最新标准见: https://www.cde.org.cn/ectd/index）:

| 类别 | 规则数 | 说明 |
|------|--------|------|
| 1-基础识别 | 3 | 文件数量/大小统计（信息级别） |
| 2-文件/文件夹 | 10 | 空文件夹、文件大小≤200MB、命名规范、util文件夹完整性 |
| 3-ICH 骨架文件 | 36 | index.xml DTD 验证、叶元素属性、生命周期、MD5 一致性 |
| 4-区域性管理信息 | 31 | cn-regional.xml Schema 验证、信封元素、**内容完整性 (4.3.x)** |
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
- 每个 PDF 自动运行 26 条合规检查

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
| 1014 | 文件路径超过 180 字符限制 |
| 1015 | 文件大小超过 200MB 限制 |
| 1016 | STF 缺失（模块四五必须有 STF） |
| 1017 | 跨申请引用不允许 |
| 1018 | 电子签章缺失（必签章章节） |
