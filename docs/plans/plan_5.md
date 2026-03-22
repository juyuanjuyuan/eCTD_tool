# Plan 5 — WP-05: eCTD XML 骨架文件、生命周期管理与验证引擎

## 目标

实现 eCTD 核心引擎: XML 骨架文件生成（index.xml / cn-regional.xml）、文件生命周期状态机、STF（研究标签文件）生成、完整 80+ 条验证规则实现、eCTD 提交包组装。**这是整个系统的技术核心和最大难点。**

## 前置依赖

- Plan 4 完成（文档已可导出为合规 PDF）

---

## 阶段 1: cn-regional.xml 生成（模块一骨架）✅ 已完成

### 1.1 XML 根元素
- [x] XML 声明: `<?xml version="1.0" encoding="UTF-8"?>`
- [x] 根元素 `<cn_ectd>` 属性:
  ```xml
  <cn_ectd schema-version="1.0"
           xmlns="cn_ectd"
           xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
           xsi:schemaLocation="cn_ectd ../../util/dtd/cn-regional-1-0.xsd"
           xmlns:xlink="http://www.w3.org/1999/xlink">
  ```
- [x] schemaLocation 必须使用相对路径指向 util/dtd/ 下的 Schema 文件

### 1.2 信封元素 (cn-envelope)
- [x] 从序列的申请/注册行为/序列数据自动填充:
  ```xml
  <cn-envelope>
    <application-id>x202612345</application-id>
    <application-type code="cnapt2" version="1.1"/>
    <product-type code="cnprt1" version="1.0"/>
    <product-number>2026123456</product-number>
    <related-sequence>0000</related-sequence>
    <regulatory-activity-type code="cnrat1" version="1.0"/>
    <sequence-number>0000</sequence-number>
    <sequence-type code="cnsqt1" version="1.0"/>
    <sequence-description>适应症为xx的新药上市申请</sequence-description>
    <sequence-contact>
      <name>张三</name>
      <phone>136xxxx8888</phone>
      <email>xxx@xxx.com</email>
    </sequence-contact>
  </cn-envelope>
  ```
- [x] 受控词汇属性使用 code + version 格式
- [x] 所有 12 个属性必填验证

### 1.3 目录元素 (cn-content)
- [x] 生成模块一的 cn-1-0 至 cn-1-12 目录结构
- [x] 每个叶元素格式:
  ```xml
  <cn-1-0>
    <leaf ID="N7ed2cf704a124700bf93827d8da214d1" operation="new"
          xlink:href="00/cover-letter.pdf"
          checksum="2c8b1043705bfce8c4781b7eaf50c0ee"
          checksum-type="MD5">
      <title>说明函</title>
    </leaf>
  </cn-1-0>
  ```
- [x] xlink:href 使用相对于 m1/cn/ 的路径
- [x] 支持扩展节点 (node-extension) 在允许的章节下

### 1.4 Schema 验证
- [x] 生成的 cn-regional.xml 必须通过 cn-regional-1-0.xsd Schema 验证
- [x] 自动化 Schema 验证流程

## 阶段 2: index.xml 生成（ICH 骨架，模块二至五）✅ 已完成

### 2.1 XML 结构
- [x] XML 声明 + DTD 引用 + 样式表引用:
  ```xml
  <?xml version="1.0" encoding="UTF-8"?>
  <!DOCTYPE ectd:ectd SYSTEM "util/dtd/ich-ectd-3-2.dtd">
  <?xml-stylesheet type="text/xsl" href="util/style/ectd-2-0.xsl"?>
  <ectd:ectd xmlns:ectd="http://www.ich.org/ectd"
             xmlns:xlink="http://www.w3.org/1999/xlink">
  ```

### 2.2 模块二至五的目录结构生成
- [x] 遍历序列的 sequence_node 树，生成对应 XML 元素
- [x] 每个叶元素属性:
  - `ID`: 不以数字开头的唯一标识（格式 Nxxxxxxxx，UUID 去连字符）
  - `operation`: new/replace/append/delete
  - `xlink:href`: 相对路径（从序列文件夹开始）
  - `checksum`: 文件的 MD5 哈希值
  - `checksum-type`: 固定 "MD5"
  - `xml:lang`: zh/en/空（可选）
- [x] **骨架属性生成**:
  - m2-3-s / m3-2-s: 必须生成 `substance` 和 `manufacturer` 属性
  - m2-3-p / m3-2-p: 可选 `product-name`, `dosageform`, `manufacturer` 属性
  - m2-7-3: 必须生成 `indication` 属性
- [x] 扩展节点 (node-extension) 生成:
  ```xml
  <m3-2-r-regional-information>
    <node-extension>
      <title>3.2.R.1工艺验证</title>
      <leaf ID="..." operation="new" xlink:href="..." checksum="..." checksum-type="MD5">
        <title>工艺验证</title>
      </leaf>
    </node-extension>
  </m3-2-r-regional-information>
  ```

### 2.3 DTD 有效性验证
- [x] 生成的 index.xml 必须通过 ich-ectd-3-2.dtd 验证
- [x] 自动化 DTD 验证流程

## 阶段 3: 文件生命周期状态机 ✅ 已完成

### 3.1 生命周期操作规则（技术规范 3.9 + 实施指南第 6 章）
- [x] 创建 `LifecycleService` 状态机:

**首次提交序列 (序列号 0000):**
- 所有叶元素 operation 必须为 `new`
- 不允许 replace/append/delete 操作

**后续序列的操作规则:**
| 前序状态 | 允许的操作 | 约束 |
|---------|-----------|------|
| new | replace, delete | 可替换或删除 |
| replace | replace, delete | 可再次替换或删除 |
| append | replace, delete, append(仅STF) | 非STF不建议append |
| delete | new | 可重新提交（new操作） |

- [x] `replace` 操作:
  - 必须有 `modified-file` 属性指向被替换文件
  - 新文件的 checksum 必须与旧文件不同（否则无意义）
  - 新旧文件 xml:lang 必须相同（中文只能替换中文、外文只能替换外文）
- [x] `append` 操作:
  - 必须有 `modified-file` 属性
  - **推荐仅对 STF 使用 append**，对非 STF 文件 append 会产生验证警告
  - 用户使用 append 时系统提示说明
- [x] `delete` 操作:
  - 必须有 `modified-file` 属性
  - 叶元素**不包含** xlink:href（已删除文件无引用地址）
  - 叶元素**不包含** checksum
- [x] 操作合法性前置验证: 用户选择操作类型前检查当前叶元素状态

### 3.2 撤回序列构建（实施指南 6.3，4 步流程）
- [x] 当序列类型为 `cnsqt3`（撤回）时，系统辅助生成撤回序列:
  1. **标记新建文件为删除**: 将被撤回序列中所有 operation=new 的叶元素标记为 delete
  2. **恢复被替换文件**: 将被撤回序列中 operation=replace 的叶元素，以 new 操作重新指向原始文件
  3. **重新创建被删除文件**: 将被撤回序列中 operation=delete 的叶元素，以 new 操作重新指向删除前的文件
  4. **模块四五的 STF 处理**: 如涉及模块四/五的操作，需同步生成对应的 STF

### 3.3 并行变更限制（实施指南 6.5）
- [x] 同一注册行为中存在未审批的并行序列时:
  - 不允许引用未审批序列中的内容
  - 检测并提示用户可能的并行冲突
- [x] 不同注册行为之间: 不允许跨注册行为引用内容

### 3.4 骨架属性更新规则（技术规范 3.6 + 实施指南 6.6）
- [x] 更新 2.3.S 和 3.2.S 的 substance/manufacturer 属性时:
  1. 必须删除旧的 2.3.S 和 3.2.S 章节全部内容
  2. 在新序列中以 new 操作创建新的 2.3.S 和 3.2.S 章节
  3. 新章节中添加全部相关资料
  4. **不允许仅修改属性而不更新内容**
- [x] 系统在用户修改骨架属性时弹窗确认，说明必须重建整个章节

## 阶段 4: STF（研究标签文件）生成 ✅ 已完成

### 4.1 STF 规范
- [x] 模块四的 4.2.X 章节和模块五的 5.3.1.X-5.3.5.X 章节**必须使用 STF**
- [x] STF 遵循 `ich-stf-v2-2.dtd` 格式
- [x] STF 结构:
  ```xml
  <?xml version="1.0" encoding="UTF-8"?>
  <!DOCTYPE ectd:study SYSTEM "../../util/dtd/ich-stf-v2-2.dtd">
  <?xml-stylesheet type="text/xsl" href="../../util/style/ich-stf-stylesheet-2-3.xsl"?>
  <ectd:study xmlns:ectd="http://www.ich.org/ectd"
              xmlns:xlink="http://www.w3.org/1999/xlink" dtd-version="2.2">
    <study-identifier>
      <title>研究标题</title>
      <study-id>研究编号</study-id>
      <category name="species" info-type="keyword">rat</category>
      <category name="route-of-admin" info-type="keyword">oral</category>
      <category name="duration" info-type="keyword">short</category>
      <category name="type-of-control" info-type="keyword">placebo</category>
    </study-identifier>
    <study-document>
      <doc-content xlink:href="study-report.pdf">
        <title>研究报告</title>
        <file-tag name="pre-clinical-study-report" info-type="keyword"/>
      </doc-content>
    </study-document>
  </ectd:study>
  ```

### 4.2 STF 管理
- [x] 创建 `STFService`
- [x] STF 编辑界面: 在模块四/五的叶节点属性面板中添加 STF 编辑功能
  - study-identifier: 标题、研究编号
  - category 属性: species/route-of-admin/duration/type-of-control（从 valid-values.xml 获取合法值）
  - file-tag: 从 valid-values.xml 的 145+ 合法标签值中选择
- [x] 模块四使用 `pre-clinical-study-report` 标签
- [x] 模块五使用 ICH E3 结构的 file-tag 或 `legacy-clinical-study-report` 标签
- [x] 模块五 5.2 临床研究列表、5.3.6 上市后报告、5.4 参考文献**不使用 STF**

### 4.3 STF 的生命周期
- [x] STF 支持 new/replace/delete/append 四种操作
- [x] **STF 是唯一推荐使用 append 操作的文件类型**
- [x] STF 的 append 不会触发验证警告

## 阶段 5: index-md5.txt 与文件校验 ✅ 已完成

### 5.1 MD5 计算
- [x] 计算 index.xml 文件的 MD5 值
- [x] 计算 cn-regional.xml 文件的 MD5 值
- [x] 生成 index-md5.txt:
  ```
  a1b2c3d4e5f6... index.xml
  f6e5d4c3b2a1... cn-regional.xml
  ```
- [x] 每个叶元素引用的文件必须计算 MD5 并填入 checksum 属性

### 5.2 校验一致性
- [x] index-md5.txt 中的值必须与 XML 骨架文件实际 MD5 一致
- [x] 骨架文件中每个叶元素的 checksum 必须与实际文件 MD5 一致
- [x] 验证所有 checksum-type 均为 "MD5" 或 "md5"

## 阶段 6: eCTD 验证引擎（80+ 条规则）✅ 已完成

### 6.1 基础识别 (规则组 1.x) — 信息级别
- [x] 1.1 统计当前序列包含的文件总数
- [x] 1.2 统计当前序列包含的文件总大小
- [x] 1.3 统计当前序列中空缺的章节数

### 6.2 文件/文件夹验证 (规则组 2.x)
- [x] 2.1 序列文件夹中不允许存在空文件夹（无文件和子文件夹的文件夹）— **错误**
- [x] 2.2 单个文件大小限制: 普通文件≤200MB, SAS XPT≤4GB — **错误**
- [x] 2.3 序列文件夹中的文件必须被骨架文件引用（不允许未引用的游离文件）— **警告**
- [x] 2.4 内容文件扩展名必须为 .pdf/.xml/.xpt/.txt/.xsl — **警告**
- [x] 2.5 文件和文件夹命名: 仅允许 a-z, 0-9, -, _ ; 路径≤180字符; 单名≤64字符 — **错误**
- [x] 2.6 m1 文件夹结构: m1/cn/ 下必须有正确的子文件夹 (00-12) — **错误**
- [x] 2.7 util 文件夹必须包含: dtd/(cn-regional-1-0.xsd, ich-ectd-3-2.dtd, ich-stf-v2-2.dtd, xlink.xsd, xml.xsd) + style/(cn-regional-1-1.xsl, ectd-2-0.xsl, ich-stf-stylesheet-2-3.xsl, ich-stf-stylesheet-2-2a.xsl, valid-values.xml) — **错误**
- [x] 2.8 序列根文件夹只允许包含: index.xml, index-md5.txt, m1/, m2/, m3/, m4/, m5/, util/ — **错误**
- [x] 2.9 序列文件夹名称必须为 4 位数字 — **错误**
- [x] 2.10 序列编号必须连续（0000, 0001, 0002...不允许跳号）— **警告**

### 6.3 ICH 骨架文件验证 (规则组 3.x)
- [x] 3.1 index.xml 必须存在于序列根目录 — **错误**
- [x] 3.2 index.xml 必须为有效的 XML 文件 — **错误**
- [x] 3.3 index.xml 必须通过 DTD 验证 — **错误**
- [x] 3.4 叶元素的 xlink:href 必须指向实际存在的文件 — **错误**
- [x] 3.5 叶元素的 operation 必须为 new/replace/append/delete — **错误**
- [x] 3.6 首次提交序列中所有叶元素 operation 必须为 new — **错误**
- [x] 3.7 非首次提交: replace/append/delete 必须有 modified-file 属性 — **错误**
- [x] 3.8 modified-file 指向的文件必须在前序序列中存在 — **错误**
- [x] 3.9 xlink:href 路径仅使用正斜杠 / — **错误**
- [x] 3.10 xlink:href 使用相对路径（不以 / 开头，不包含盘符）— **错误**
- [x] 3.11 叶元素 ID 不以数字开头 — **错误**
- [x] 3.12 叶元素 ID 在整个 index.xml 中唯一 — **错误**
- [x] 3.13 checksum 属性值必须与实际文件 MD5 一致 — **错误**
- [x] 3.14 checksum-type 必须为 MD5 或 md5 — **错误**
- [x] 3.15 index-md5.txt 中的 MD5 值必须与 index.xml 实际 MD5 一致 — **错误**
- [x] 3.16 delete 操作的叶元素不应有 xlink:href — **错误**
- [x] 3.17 delete 操作的叶元素不应有 checksum — **错误**
- [x] 3.18-3.20 扩展节点规则 — **警告/错误**
- [x] 3.21 同一目录元素下叶元素 ID 不重复 — **错误**
- [x] 3.22-3.36 叶标题、生命周期模式、属性一致性等 — **混合级别**

### 6.4 区域性管理信息验证 (规则组 4.x)
- [x] 4.1.1 cn-regional.xml 必须存在于 m1/cn/ 目录 — **错误**
- [x] 4.1.2 cn-regional.xml 必须为有效 XML — **错误**
- [x] 4.1.3 cn-regional.xml 必须通过 Schema 验证 — **错误**
- [x] 4.1.4-4.1.31 叶元素规则（同 3.x 但针对 cn-regional.xml）— **混合级别**
- [x] 4.2.1 信封元素必须存在 — **错误**
- [x] 4.2.2 application-id 格式: 字母前缀 + 年份 + 流水号 — **错误**
- [x] 4.2.3 application-type 必须在受控词汇中 — **错误**
- [x] 4.2.4 product-type 必须在受控词汇中 — **错误**
- [x] 4.2.5 product-number 格式: 10 位数字 — **错误**
- [x] 4.2.6 regulatory-activity-type 必须在受控词汇中 — **错误**
- [x] 4.2.7 regulatory-activity-type 必须与 application-type 关联合法 — **错误**
- [x] 4.2.8 sequence-type 必须在受控词汇中 — **错误**
- [x] 4.2.9 sequence-type 必须与 application-type + regulatory-activity-type 关联合法 — **错误**
- [x] 4.2.10 sequence-number 为 4 位数字 — **错误**
- [x] 4.2.11-4.2.14 其他信封验证 — **混合级别**
- [x] **4.3.1-4.3.11 内容完整性验证**（按申请类型+注册行为类型检查必填章节）— **混合级别**
  - 详见 Plan 2 阶段 1.6 的完整规则列表

### 6.5 STF 验证 (规则组 5.x)
- [x] 5.1 模块四 4.2.X 和模块五 5.3.1.X-5.3.5.X 的文件必须有 STF — **错误**
- [x] 5.2 STF 必须为有效 XML — **错误**
- [x] 5.3 STF 必须通过 DTD 验证 — **错误**
- [x] 5.4-5.8 STF 必须包含 study-identifier/title/study-id — **错误**
- [x] 5.9-5.12 category 的 name 属性必须为 valid-values.xml 中的合法值 — **警告**
- [x] 5.13-5.16 file-tag 的 name 必须为 valid-values.xml 中的合法值 — **警告**
- [x] 5.17-5.20 STF 文件引用一致性 — **混合级别**

### 6.6 PDF 分析 (规则组 6.x)
- [x] 6.1-6.26 全部 PDF 验证规则（详见 Plan 4 阶段 4）

### 6.7 验证报告
- [x] 创建 `ValidatorService` 统一执行全部验证规则
- [x] 生成验证报告:
  - validation_report 表 (sequence_id, total_errors, total_warnings, total_info, created_at)
  - validation_item 表 (report_id, rule_code, severity, message, resource_path, suggestion)
- [x] API: POST `/api/v1/sequences/:seqId/validate` — 运行完整验证
- [x] API: GET `/api/v1/sequences/:seqId/validate/report/:id` — 获取验证报告
- [x] **有错误级别的验证项时阻止 eCTD 包导出**

## 阶段 7: eCTD 提交包组装 ✅ 已完成

### 7.1 目录结构生成
- [x] 按 eCTD 规范创建文件夹结构:
  ```
  {申请编号}/
  └── {序列号(4位)}/
      ├── m1/
      │   └── cn/
      │       ├── 00/  (说明函)
      │       ├── 02/  (申请表)
      │       ├── 03/  (产品信息)
      │       ├── 04/ ~ 12/
      │       └── cn-regional.xml
      ├── m2/
      │   ├── 22-intro/
      │   ├── 23-qos/
      │   ├── 24-nonclin-over/
      │   ├── 25-clin-over/
      │   ├── 26-nonclin-sum/
      │   └── 27-clin-sum/
      ├── m3/
      │   ├── 32-body-data/
      │   └── 33-lit-ref/
      ├── m4/
      │   ├── 42-stud-rep/
      │   └── 43-lit-ref/
      ├── m5/
      │   ├── 52-tab-list/
      │   ├── 53-clin-stud-rep/
      │   └── 54-lit-ref/
      ├── util/
      │   ├── dtd/   (5个文件: cn-regional-1-0.xsd, ich-ectd-3-2.dtd, ich-stf-v2-2.dtd, xlink.xsd, xml.xsd)
      │   └── style/ (5个文件: cn-regional-1-1.xsl, ectd-2-0.xsl, ich-stf-stylesheet-2-3.xsl, ich-stf-stylesheet-2-2a.xsl, valid-values.xml)
      ├── index.xml
      └── index-md5.txt
  ```
- [x] 从 `reference/eCTD技术规范V1.1附件包/` 复制 util 文件夹内容
- [x] 将导出的 PDF 文件放入对应模块/章节目录
- [x] 生成 index.xml、cn-regional.xml、所有 STF 文件
- [x] 生成 index-md5.txt
- [x] **不允许存在空文件夹**（无内容的章节不创建文件夹）
- [x] **不允许存在未引用的文件**

### 7.2 打包下载
- [x] POST `/api/v1/sequences/:seqId/export/ectd-package` — 生成 eCTD 包
- [x] 打包前自动运行完整验证
- [x] 有错误级别则**阻止打包并返回错误列表**
- [x] 有警告级别允许打包但在报告中标注
- [x] 打包为 ZIP 文件下载

### 7.3 前端验证与导出页面
- [x] 验证结果页面:
  - 按规则分类展示（基础识别/文件夹/ICH骨架/区域信息/STF/PDF）
  - 错误/警告/提示信息筛选
  - 点击验证项跳转到对应节点/文件
  - 修复建议
- [x] eCTD 包预览: 展示即将生成的文件夹结构树
- [x] 导出按钮（仅验证通过时可用）

## 验收标准

- [x] cn-regional.xml 通过 cn-regional-1-0.xsd Schema 验证
- [x] index.xml 通过 ich-ectd-3-2.dtd DTD 验证
- [x] 信封元素所有 12 个属性正确填充
- [x] 受控词汇代码正确使用（版本号正确）
- [x] 叶元素生命周期操作规则正确执行（首次提交全 new、后续序列正确的 replace/append/delete）
- [x] modified-file 属性正确指向前序序列文件
- [x] 撤回序列可自动生成（4 步流程）
- [x] STF 正确生成并通过 DTD 验证
- [x] MD5 校验值全部正确
- [x] 80+ 条验证规则全部实现
- [x] 验证报告按严重程度分类
- [x] 有错误级别时阻止 eCTD 包导出
- [x] 生成的 eCTD 提交包文件夹结构完全符合规范
- [x] util 文件夹包含所有必需的 DTD/Schema/XSL/受控词汇文件
