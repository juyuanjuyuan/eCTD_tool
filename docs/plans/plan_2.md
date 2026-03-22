# Plan 2 — WP-02: CTD 五模块目录结构与内容完整性规则

## 目标

将 eCTD 法规定义的 CTD 五模块完整目录结构（约 200+ 节点）内建到系统中，实现根据申请类型自动初始化序列目录树，并内嵌内容完整性验证规则（验证标准 4.3.x）。

## 前置依赖

- Plan 1 完成（项目、申请、序列管理可用，受控词汇已入库）

## 阶段 1: 法规数据解析与建模

### 1.1 模块一目录结构（cn-regional，13 个一级章节）
来源: `element-property_CN.xml` + `cn-regional-1-0.xsd` + 技术规范第 4 章

- [x] cn-1-0 说明函 (Cover Letter)
- [x] cn-1-1 目录 (Table of Contents)
- [x] cn-1-2 申请表 (Application Form)
- [x] cn-1-3 产品信息相关材料 — 9 个子章节:
  - cn-1-3-1 说明书 (含 cn-1-3-1-1 研究药物说明书, cn-1-3-1-2 上市药品说明书)
  - cn-1-3-2 起草说明
  - cn-1-3-3 标签样稿
  - cn-1-3-4 核准的上市药品说明书与标签
  - cn-1-3-5 包装设计
  - cn-1-3-6 产品专利情况说明
  - cn-1-3-7 药品定价资料
  - cn-1-3-8 SME 减免费用申请 (含电子签章)
  - cn-1-3-9 参比制剂与参比信息
- [x] cn-1-4 申请状态 — 7 个子章节:
  - cn-1-4-1 申请历史, cn-1-4-2 已有知识产权, cn-1-4-3 授权书
  - cn-1-4-4 同品种信息, cn-1-4-5 撤回信息, cn-1-4-6 审评审批信息, cn-1-4-7 补充信息
- [x] cn-1-5 加快上市注册程序申请 — 3 个子章节
- [x] cn-1-6 沟通交流会议 — 3 个子章节
- [x] cn-1-7 临床试验过程管理信息 — 3 个子章节
- [x] cn-1-8 药物警戒与风险管理 — 3 主 + 子章节:
  - cn-1-8-1 药物警戒体系概述
  - cn-1-8-2 风险管理计划 (含 cn-1-8-2-1 安全参考信息)
  - cn-1-8-3 药品安全事项
- [x] cn-1-9 上市后研究
- [x] cn-1-10 上市后变更 (含电子签章)
- [x] cn-1-11 申请人/生产企业证明性文件 (含电子签章)
- [x] cn-1-12 小微企业证明文件 (含电子签章)

### 1.2 模块二目录结构（ICH，通用技术文档总结）
来源: `element-property_ICH.xml` + `ich-ectd-3-2.dtd`

- [x] m2-2 引言 (Introduction)
- [x] m2-3 质量总结 (Quality Overall Summary):
  - m2-3-s 原料药 (Drug Substance) — **含 substance 和 manufacturer 必填属性**
  - m2-3-p 制剂 (Drug Product) — **含 product-name, dosageform, manufacturer 选填属性**
  - m2-3-a 附录 (Appendices)
  - m2-3-r 区域信息 (Regional Information)
- [x] m2-4 非临床概述 (Nonclinical Overview)
- [x] m2-5 临床概述 (Clinical Overview)
- [x] m2-6 非临床综述 (Nonclinical Written and Tabulated Summaries) — 7 个子章节
- [x] m2-7 临床综述 (Clinical Summary) — 含 **indication 必填属性** (m2-7-3)

### 1.3 模块三目录结构（质量，最复杂）
- [x] m3-2 主体数据 (Body of Data):
  - m3-2-s 原料药 (Drug Substance) — **substance 和 manufacturer 必填属性**:
    - m3-2-s-1 基本信息 → m3-2-s-1-1 命名, m3-2-s-1-2 结构, m3-2-s-1-3 基本性质
    - m3-2-s-2 生产 → m3-2-s-2-1 生产商, m3-2-s-2-2 工艺描述, m3-2-s-2-3 物料控制, ...
    - m3-2-s-3 特征鉴定 → m3-2-s-3-1 结构解析, m3-2-s-3-2 杂质
    - m3-2-s-4 原料药控制 → m3-2-s-4-1 质量标准, m3-2-s-4-2 分析方法, ...
    - m3-2-s-5 参考标准品
    - m3-2-s-6 容器密封系统
    - m3-2-s-7 稳定性 → m3-2-s-7-1 汇总, m3-2-s-7-2 上市后承诺, m3-2-s-7-3 数据
  - m3-2-p 制剂 (Drug Product) — **product-name, dosageform, manufacturer 属性**:
    - m3-2-p-1 至 m3-2-p-8 完整结构
  - m3-2-a 附录 — 设施和设备、冒险性评估等
  - m3-2-r **中国区域扩展节点**:
    - 3.2.R.1 工艺验证, 3.2.R.2 批记录, 3.2.R.3 分析方法验证报告
    - 3.2.R.4 稳定性图谱, 3.2.R.5 可比性方案, 3.2.R.6 其他
  - m3-3 参考文献

### 1.4 模块四目录结构（非临床试验报告）
- [x] m4-2 研究报告:
  - m4-2-1 药理学 (含子章节: 主要药效学、次要药效学、安全药理学、PD 药物相互作用)
  - m4-2-2 药代动力学
  - m4-2-3 毒理学 (含 8 个子章节: 单次给药毒性、重复给药毒性、遗传毒性、致癌性等)
- [x] m4-3 参考文献
- [x] **模块四的 4.2.X 章节所有文件必须使用 STF（研究标签文件）**

### 1.5 模块五目录结构（临床研究报告）
- [x] m5-2 列表
- [x] m5-3 临床研究报告:
  - m5-3-1 BA/BE 及分析方法报告
  - m5-3-2 人体药代动力学报告
  - m5-3-3 人体 PK/PD 报告
  - m5-3-4 人体药效学报告
  - m5-3-5 有效性和安全性报告 (含 m5-3-5-1 至 m5-3-5-4)
  - m5-3-6 上市后报告
  - m5-3-7 病例报告表及患者数据
- [x] m5-4 参考文献
- [x] **模块五的 5.3.1.X 至 5.3.5.X 章节所有文件必须使用 STF**

### 1.6 解析内容完整性规则（验证标准 4.3.x）
- [x] 4.3.1 临床试验申请(cnapt1) + 首次申请(cnrat1) 必须包含的章节列表
- [x] 4.3.2 临床试验申请 + 补充申请(cnrat2) 必须包含的章节
- [x] 4.3.3 新药申请(cnapt2) + 首次申请 必须包含的章节
- [x] 4.3.4 新药申请 + 补充申请 必须包含的章节
- [x] 4.3.5 仿制药申请(cnapt3) + 首次申请 必须包含的章节
- [x] 4.3.6 仿制药申请 + 补充申请 必须包含的章节
- [x] 4.3.7 仿制药申请 + 再注册(cnrat8) 必须包含的章节
- [x] 4.3.8 原料药申请(cnapt4) + 首次申请 必须包含的章节
- [x] 4.3.9 原料药申请 + 补充申请 必须包含的章节
- [x] 4.3.10 原料药申请 + 再注册 必须包含的章节
- [x] 4.3.11 所有类型 + 回复(cnsqt2) 必须包含说明函 (cn-1-0)
- [x] 每条规则明确: 哪些章节是**错误级别**必填、哪些是**警告级别**建议填

## 阶段 2: 数据库 Schema 与种子数据

### 2.1 CTD 模板节点表
- [x] `ctd_template_node` 表设计:
  - id, parent_id, module (1-5)
  - element_name (XML 元素名，如 cn-1-3-1, m3-2-s-4-1) — **唯一约束**
  - ctd_section_number (CTD 章节号，如 1.3.1, 3.2.S.4.1)
  - title_zh, title_en
  - node_type (MODULE/SECTION/LEAF/EXTENSION_POINT)
  - is_leaf (是否可放置文件的叶节点)
  - requires_stf (是否需要 STF，模块四 4.2.X 和模块五 5.3.1-5.3.5)
  - requires_e_seal (是否需要电子签章: cn-1-0, cn-1-2, cn-1-3-8, cn-1-10, cn-1-11, cn-1-12)
  - allows_extension (是否允许扩展子节点，仅 3.2.R 章节对生物制品)
  - sort_order
- [x] `ctd_completeness_rule` 表:
  - application_type_code, regulatory_activity_type_code
  - template_node_id (FK → ctd_template_node)
  - rule_type (REQUIRED/FORBIDDEN)
  - severity (ERROR/WARNING)
- [x] 执行迁移

### 2.2 种子数据
- [x] 编写种子脚本 (`seed-ctd.ts`): 从 `element-property_CN.xml` (71节点) 和 `element-property_ICH.xml` (158节点) 自动解析并导入模板树，共 229 节点
- [ ] 对照 `现行申报资料要求与eCTD目录元素、CTD目录层级对应表.xlsx` 的 166 条映射关系验证完整性
- [x] 导入所有 4.3.x 内容完整性规则到 `ctd_completeness_rule` 表（130 条: 90 REQUIRED + 40 FORBIDDEN）

## 阶段 3: 后端 CTD 结构服务

### 3.1 CTD 模板服务
- [x] CTDTemplateModule（Controller + Service + 3 个 DTO）
- [x] GET `/api/v1/ctd-templates/tree` — 获取完整模板树（6 级嵌套）
- [x] GET `/api/v1/ctd-templates/tree?appType=cnapt2&ratType=cnrat1` — 按申请类型+注册行为类型过滤并标记必填章节
- [x] 模板树缓存 (Redis)（RedisCacheService，24h TTL）

### 3.2 序列目录初始化
- [x] `sequence_node` 表 Schema + 迁移（含骨架属性字段 substance/manufacturer/productName/dosageForm/indication）
- [x] POST `/api/v1/sequences/:seqId/initialize` — 根据申请类型 + 注册行为类型初始化目录树:
  1. 从 ctd_template_node 复制为 sequence_node ✅
  2. 根据 ctd_completeness_rule 标记 is_required ✅
  3. 首次提交（序列号 0000）: 所有叶节点 operation = `new` ✅
  4. 后续序列: 继承前序序列的目录状态（含扩展节点）✅

### 3.3 序列目录管理
- [x] GET `/api/v1/sequences/:seqId/nodes/tree` — 获取序列 CTD 目录树
- [x] PATCH `/api/v1/sequences/:seqId/nodes/:nodeId` — 更新节点信息（status/operation/title）
- [x] 扩展节点管理（仅 3.2.R 章节，且仅对生物制品申请类型）:
  - POST 创建扩展节点（标题按 3.2.R.1~3.2.R.6 规则命名）✅
  - DELETE 删除扩展节点 ✅
  - 扩展节点仅允许在产品类型为生物制品(cnprt2)的提交序列中使用 ✅
- [x] 内容完整性实时检查:
  - GET `/api/v1/sequences/:seqId/completeness` — 返回必填章节完成情况、模块统计、禁止违规

### 3.4 骨架属性管理（模块二三的元数据）
- [x] 2.3.S / 3.2.S 节点的 **substance** (活性成分) 和 **manufacturer** (生产商) 属性 — **必填**
- [x] 2.3.P / 3.2.P 节点的 **product-name**, **dosageform**, **manufacturer** 属性 — **选填**
- [x] m2-7-3 的 **indication** (适应症) 属性 — **必填**
- [x] 属性更新规则（技术规范 3.6）: 更新 2.3.S 和 3.2.S 的活性成分/生产商元数据时，自动标记子章节叶节点为 NEW 操作（重建）
- [x] PATCH `/api/v1/sequences/:seqId/nodes/:nodeId/attributes` — 更新骨架属性（含章节类型校验）

## 阶段 4: 前端 CTD 目录树

### 4.1 CTD 树组件
- [x] `CTDTree` 组件 — 基于 Ant Design Tree
- [x] 树节点渲染: 图标区分（模块文件夹黄色/章节文件夹/叶节点文件/扩展节点紫色）
- [x] 节点状态指示:
  - 空（灰色）— 未开始编辑 ✅
  - 编辑中（蓝色）— 有草稿内容 ✅
  - 已完成（绿色）— 内容已完成 ✅
  - 必填未完成（红色 Tag）— 内容完整性规则要求但未填写 ✅
- [x] 搜索过滤节点（按标题/章节号/元素名匹配，自动展开祖先节点）
- [x] 必填章节醒目标识（根据当前申请类型+注册行为类型的 4.3.x 规则）

### 4.2 目录初始化
- [x] 序列首次打开时显示初始化提示（PlayCircleOutlined + 说明文字 + 初始化按钮）
- [x] 初始化完成后自动加载目录树和完整性数据
- [x] 显示当前申请类型下的必填章节清单（初始化前预览，GET /preview-required API + 前端展示）

### 4.3 扩展节点管理
- [x] 右键菜单: 创建扩展子节点（仅 3.2.R 章节，且产品类型为生物制品时可用）
- [x] 扩展节点标题选择: 3.2.R.1 工艺验证 / 3.2.R.2 批记录 / ... / 3.2.R.6 其他（通过 Modal + Select）
- [x] GET `/api/v1/ctd-templates/extension-options` 返回扩展节点类型选项

### 4.4 内容完整性看板
- [x] 序列概览页显示: 总章节数 / 必填章节数 / 已完成章节数 / 完成度环形进度条
- [x] 按模块分组统计完成度（每模块显示 completed/required/total）
- [x] 未完成的必填章节高亮提示（带 ERROR/WARNING 级别 Tag）
- [x] 禁止使用的章节违规列表

## 验收标准

- [x] 种子数据成功导入完整 CTD 五模块目录结构（229 节点，与 element-property XML 一致）
- [x] 创建序列后可根据申请类型+注册行为类型自动初始化 CTD 目录树
- [x] 必填章节标识正确（符合验证标准 4.3.x 规则，全链路测试验证 4.3.1 的 12 必填章节）
- [x] 前端 CTD 目录树展示完整，状态指示正确
- [x] 扩展节点仅对生物制品的 3.2.R 章节可用
- [x] 骨架属性（substance/manufacturer/indication 等）可编辑且规则正确
- [x] 内容完整性检查可运行并返回正确结果（含模块统计、缺失必填、禁止违规）
- [ ] 对照 Excel 对应表验证节点完整性（待手动核对）
- [x] 模板树缓存 (Redis)（RedisCacheService，24h TTL）
- [x] 后续序列继承前序序列目录状态
