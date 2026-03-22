# Plan 3 — WP-03: 富文本编辑器与 eCTD 文档编辑

## 目标

实现基于 TipTap 的富文本编辑器，用户可在 CTD 目录树各章节下撰写文档内容。编辑器需支持 eCTD 对中文申报资料的格式要求（字体、字号、行距），支持自动保存和版本管理。

## 前置依赖

- Plan 2 完成（CTD 目录树可用）

## 阶段 1: TipTap 编辑器集成

### 1.1 基础编辑器
- [x] 安装 TipTap 核心包 (@tiptap/react, @tiptap/starter-kit)
- [x] 创建 `RichEditor` 组件
- [x] 工具栏: 标题(H1-H6)、加粗、斜体、下划线、删除线
- [x] 段落、有序列表、无序列表
- [x] 引用块 (blockquote)
- [x] 撤销/重做

### 1.2 eCTD 中文申报资料格式要求（技术规范 3.4）
编辑器默认样式必须符合 eCTD 对中文申报资料的要求:
- [x] **字体**: 默认宋体（正文）、黑体（标题）、Times New Roman（英文/数字）
- [x] **字号规则**:
  - 正文: 不小于小四号字 (12pt)
  - 表格: 不小于五号字 (10.5pt)
  - 目录: 小四号字 (12pt)
  - 脚注: 五号字 (10.5pt)
- [x] **字体颜色**: 叙述性文字黑色；超文本链接建议蓝色文字或黑色文字带蓝色框
- [x] **行距**: 1.5 倍行距（默认）
- [x] **页面设置**: A4 纸张，页边距上下左右 2cm
- [x] 编辑器工具栏提供字号选择（仅允许符合规范的字号）

### 1.3 表格支持
- [x] 安装 @tiptap/extension-table
- [x] 表格插入、编辑行列
- [x] 单元格合并/拆分
- [x] 表格文字字号最小五号字
- [x] 表格样式（边框、对齐）

### 1.4 图片支持
- [x] 安装 @tiptap/extension-image
- [ ] 图片上传至 MinIO（待 WP-06 文件管理完成后集成）
- [x] 图片拖拽/粘贴插入（当前使用 ObjectURL，MinIO 后续集成）
- [ ] 图片大小调整（待后续增强）
- [ ] 图片说明文字 (figure caption)（待后续增强）

### 1.5 eCTD 专用编辑功能
- [ ] **CTD 章节标题节点**: 自动编号与 CTD 目录树联动（如 2.3.S.1、3.2.P.4.1）
- [ ] **交叉引用**: 支持引用其他章节内容（eCTD 要求的跨模块超文本链接）:
  - 模块一的上市后变更/研究等项目 → 模块二至五的具体内容
  - 模块二的概述和总结文件 → 模块三至五的详细信息
  - 临床研究报告 → 对应附件（如图表）
- [x] **语言标记**: 支持中文申报资料和外文参考资料的区分标记
  - 中文申报资料标题用中文、叶标题用中文
  - 外文参考资料附在中文资料同级目录下，使用外文叶标题
  - 对应 xml:lang 属性（zh/en/空=""）

## 阶段 2: 文档内容管理后端

### 2.1 数据库
- [x] 创建 `document` 表:
  - id, node_id, content_json (TipTap JSON), content_html, content_text
  - word_count, version, xml_lang (zh/en/空)
  - created_by, updated_by, created_at, updated_at
- [x] 创建 `document_version` 表 (历史版本快照)
- [x] 执行迁移

### 2.2 文档 CRUD API
- [x] DocumentModule
- [x] GET `/api/v1/nodes/:nodeId/document` — 获取文档内容
- [x] PUT `/api/v1/nodes/:nodeId/document` — 保存文档内容
  - 同时保存 content_json / content_html / content_text
  - 更新字数统计
  - 记录 xml:lang 属性
- [x] 自动版本号递增

### 2.3 版本管理 API
- [x] GET `/api/v1/nodes/:nodeId/document/versions` — 版本列表
- [x] GET `/api/v1/nodes/:nodeId/document/versions/:v` — 获取指定版本
- [x] POST `/api/v1/nodes/:nodeId/document/versions` — 手动创建版本快照
- [x] POST `/api/v1/nodes/:nodeId/document/restore/:v` — 恢复到指定版本

## 阶段 3: 编辑器页面整合

### 3.1 三栏布局
- [x] `EditorPage` — 编辑器专用全屏布局（不使用 BasicLayout）
- [x] 左栏: CTD 目录树 (`CTDTree`)
- [x] 中栏: TipTap 编辑器 (`RichEditor`)
- [x] 右栏: 属性面板 (`PropertiesPanel`)
- [x] 栏宽可折叠切换（左右面板可收起/展开）

### 3.2 CTD 树与编辑器联动
- [x] 点击 CTD 树节点 → 加载对应文档内容到编辑器
- [x] 节点切换时自动保存当前内容
- [x] 编辑器标题与节点 CTD 章节号同步（如 "2.3.S.1 基本信息"）
- [x] 叶节点显示当前 operation 状态（new/replace/append/delete）

### 3.3 属性面板（eCTD 元数据编辑）
- [x] **基本信息**: CTD 编号、标题、所属模块
- [x] **文档状态**: 字数、版本号、最后编辑时间/人
- [x] **操作类型**:
  - 首次提交序列（0000）: 固定为 `new`，不可修改
  - 后续序列: 下拉选择 new/replace/append/delete
  - 选择 replace/append/delete 时必须关联 modified-file（指向前序序列的对应文件）
- [x] **语言属性**: zh（中文申报资料）/ en（外文参考资料）/ 空
- [x] **骨架属性**（仅特定章节显示）:
  - 2.3.S/3.2.S: substance（活性成分）、manufacturer（生产商）— 必填
  - 2.3.P/3.2.P: product-name、dosageform、manufacturer — 选填
  - m2-7-3: indication（适应症）— 必填
- [ ] **文件引用列表**: 该节点关联的 PDF 文件（待 WP-06 文件管理完成后集成）
- [x] **版本历史**: 快捷查看

### 3.4 自动保存
- [x] 编辑器 onChange 事件 → 3 秒防抖保存
- [x] 保存状态指示器（已保存/保存中/未保存）
- [x] 页面关闭前未保存警告 (beforeunload)

### 3.5 编辑器顶栏
- [x] 面包屑导航: 项目 > 申请 > 序列 > 当前章节
- [x] 保存按钮（手动保存）
- [ ] 导出 Word / 导出 PDF 快捷按钮（待 WP-04 导出功能完成后集成）
- [ ] 运行验证按钮（待 WP-05 验证引擎完成后集成）
- [ ] 内容完整性状态: "必填 X/Y 章节已完成"（待集成）

## 验收标准

- [x] 编辑器默认字体/字号/行距符合 eCTD 中文申报资料要求
- [x] 用户可撰写富文本内容（标题、段落、表格、图片、列表）
- [x] 点击 CTD 目录树节点可切换编辑不同章节
- [x] 自动保存工作正常（3 秒防抖）
- [x] 可查看和恢复文档历史版本
- [x] 属性面板可编辑 operation 类型和骨架属性（substance/manufacturer/indication）
- [x] 语言属性可设置（zh/en）
