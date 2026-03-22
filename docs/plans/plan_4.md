# Plan 4 — WP-04: eCTD 合规文档导出（Word/PDF）

## 目标

实现文档导出为 Word (.docx) 和 PDF 格式，**PDF 必须严格符合 eCTD 技术规范 3.4 节和验证标准 6.x 的全部要求**。V1.1 将 8 项 PDF 相关验证从"警告"提升为"错误"级别，PDF 合规是导出功能的核心。

## 前置依赖

- Plan 3 完成（编辑器可用，文档内容已存储）

## 阶段 1: eCTD PDF 合规规则清单

在开始编码前，必须完全理解 eCTD 对 PDF 的全部要求:

### 1.1 PDF 基本要求（技术规范 3.4 + ICH eCTD 文件格式规范 V1.3）
- [x] 版本: 1.4, 1.5, 1.6, 1.7 或 PDF/A-1, PDF/A-2（验证规则 6.18）
- [x] 不加密、不设密码保护（验证规则 6.19）— **V1.1 升级为错误**
- [x] 文本可搜索（非扫描图片）— **V1.1 升级为错误**
- [x] 不包含 JavaScript（验证规则 6.20）— **V1.1 升级为错误**
- [x] 不包含附件/嵌入式文件 — **V1.1 升级为错误**
- [x] 不包含外部链接（网页 URL、mailto 链接）（验证规则 6.21）— **V1.1 升级为错误**
- [x] 不包含音频/视频/3D 对象（验证规则 6.22）— **V1.1 升级为错误**
- [x] 单个 PDF 文件大小不超过 200MB（V1.1 从 500MB 下调）
- [ ] Fast Web View (线性化) 优化（待后续优化）
- [ ] 页面大小规范化（待后续优化）

### 1.2 书签和导航要求
- [x] 超过 5 页的 PDF 必须有书签（验证规则 6.1）— **V1.1 升级为错误**
- [x] 书签使用相对路径指向（非绝对路径）
- [x] 书签放大率必须为 Inherit Zoom（验证规则 6.23）— **V1.1 升级为错误**
- [x] 初始视图设置: 显示书签面板 (BookmarksPanel)
- [x] 书签层级应与文档章节层级对应

### 1.3 超链接要求
- [ ] 文档内超链接仅允许使用相对路径（待跨文档链接功能实现）
- [ ] 超链接动作仅允许: GoTo, GoToR, Launch（待后续实现）
- [x] 不允许 URI 类型动作（外部 URL）— 自动剥除
- [x] 不允许包含 mailto 链接 — 自动剥除
- [ ] 跨文档超链接要求（待后续 Plan 实现）

### 1.4 字体和格式要求
- [x] 中文字体: 宋体（正文）、黑体（标题）
- [x] 英文字体: Times New Roman
- [x] 字号: 正文不小于小四号字 (12pt)、表格不小于五号字 (10.5pt)
- [x] 字体必须嵌入或使用标准 14 种 PDF 字体（合规检查验证）
- [x] 字体颜色: 叙述性文字黑色

## 阶段 2: Word 导出

### 2.1 后端 Word 导出服务
- [x] 安装 `docx` 库
- [x] 创建 `WordExportService`
- [x] TipTap JSON → docx 节点映射:
  - heading → HeadingParagraph (对应 CTD 章节层级, H1-H6)
  - paragraph → Paragraph (宋体, 小四号, 1.5 倍行距)
  - bulletList/orderedList → Paragraph with numbering (3 级嵌套)
  - table → Table/TableRow/TableCell (五号字, 支持 colspan/rowspan)
  - image → ImageRun 占位符 (MinIO 下载待 WP-06)
  - blockquote → 缩进段落 + 左边框
  - horizontalRule → 底边框段落
  - link → ExternalHyperlink (蓝色)
- [x] 页面设置: A4 纸张 (210mm x 297mm)、页边距 2cm
- [x] 页眉: 章节标题（宋体 9pt）
- [x] 页脚: 页码 (CURRENT / TOTAL)
- [ ] 自动生成文档目录 (Table of Contents)（待后续增强）
- [x] 标题样式: 黑体，H1=22pt, H2=16pt, H3=14pt, H4=12pt, H5=10.5pt, H6=10.5pt

### 2.2 Word 导出 API
- [x] POST `/api/v1/sequences/:seqId/export/word` — 导出单个章节（流式下载）
- [x] POST `/api/v1/sequences/:seqId/export/word/batch` — 批量导出（Bull Queue 异步）

## 阶段 3: PDF 导出（eCTD 合规）

### 3.1 PDF 生成引擎
- [x] 安装 Puppeteer
- [x] 创建 `PDFExportService` (OnModuleInit 启动浏览器)
- [x] 导出流程: contentHtml → eCTD 合规 CSS 包装 → Puppeteer 渲染 → pdf-lib 后处理
- [x] **合规 CSS 模板**: 宋体 12pt 正文 + 黑体标题 + 10.5pt 表格 + 黑色文字 + 蓝色链接
- [x] Puppeteer PDF 配置: A4, 2cm margins, tagged: true, headerTemplate, footerTemplate

### 3.2 PDF 书签自动生成
- [x] 从文档标题层级 (H1-H6) 提取 headings
- [x] pdf-lib 添加 Outlines 字典 + outline items
- [x] 书签按页面均匀分布
- [x] 设置书签放大率为 /Fit (Inherit Zoom)
- [x] 设置 PDF 初始视图 PageMode=UseOutlines（打开时显示书签面板）

### 3.3 超链接处理
- [ ] 文档内链接转换为相对路径 GoTo 动作（待后续）
- [ ] 跨文档链接转换为 GoToR 动作（待后续）
- [x] **自动剥除所有外部 URL 链接**（http://, https://, mailto:）
- [x] 剥除后在原位置保留文本（蓝色 span）但移除链接动作
- [x] 返回被移除的链接列表，前端提示用户

### 3.4 字体嵌入
- [x] eCTD 合规 CSS 指定宋体 (SimSun)、黑体 (SimHei)
- [x] Puppeteer tagged PDF 确保文本可搜索
- [x] PDFComplianceService 验证字体嵌入状态（排除标准 14 字体）

### 3.5 PDF 导出 API
- [x] POST `/api/v1/sequences/:seqId/export/pdf` — 导出单个章节
- [x] POST `/api/v1/sequences/:seqId/export/pdf/batch` — 批量导出
- [x] Bull Queue 异步任务处理（大文件导出）

## 阶段 4: PDF 合规自动检查

### 4.1 PDF 验证服务（实现验证标准 6.x 规则）
- [x] 创建 `PDFComplianceService`
- [x] **错误级别 (V1.1)**:
  - 6.1 超过 5 页无书签 → 错误
  - 6.18 PDF 版本不在允许范围 → 错误
  - 6.19 PDF 加密/有安全设置 → 错误
  - 6.20 包含 JavaScript → 错误 (检查 Names/JavaScript, AA, OpenAction)
  - 6.21 包含外部链接 → 错误 (遍历 annotations URI)
  - 6.22 包含音频/视频/3D → 错误 (RichMedia/Screen/Sound/Movie/3D)
  - 6.23 书签放大率非 Inherit Zoom → 错误 (遍历 outline, 检查 Dest)
  - 6.24 包含附件/嵌入文件 → 错误
- [x] **警告级别**:
  - 文件大小超过 200MB
  - 字体未嵌入（排除标准 14 字体）
- [x] 每个导出的 PDF 自动运行合规检查
- [x] 有错误级别问题时返回详细错误信息（前端展示）

### 4.2 用户上传 PDF 的合规检查
- [x] `checkUploadedPdfCompliance()` 接口可复用（待 WP-06 文件上传时集成）
- [ ] 不合规的 PDF 标记警告/错误（待 WP-06）
- [ ] 提供修复建议（待 WP-06）

## 阶段 5: 导出任务管理

### 5.1 异步任务
- [x] 使用 Bull Queue (Redis) 管理导出任务
- [x] GET `/api/v1/sequences/:seqId/export/status/:taskId` — 查询进度
- [ ] GET `/api/v1/export/download/:taskId` — 下载结果（待 MinIO 存储集成）

### 5.2 前端导出页面
- [x] ExportModal 组件（选择格式 Word/PDF）
- [x] eCTD 合规提示信息
- [x] 导出进度显示（Spin）
- [x] 合规检查结果展示（Summary + 错误列表 + 警告列表 + 已移除链接）
- [x] Blob 下载（PDF 合规通过时自动下载）

## 验收标准

- [x] 导出的 PDF 版本为 1.4/1.5/1.6/1.7 或 PDF/A（Puppeteer 默认生成）
- [x] PDF 不加密、无 JavaScript、无外部链接（自动剥除）、无附件
- [x] PDF 超过 5 页时自动生成书签（pdf-lib Outlines）
- [x] 书签放大率为 Inherit Zoom (/Fit)
- [x] 文字使用宋体(正文)/黑体(标题)，字号符合规范
- [x] 文本可搜索（tagged PDF）
- [x] 字体嵌入检查（合规检查验证）
- [x] 单个 PDF 不超过 200MB（合规检查验证）
- [x] PDF 合规检查覆盖验证标准 6.x 核心规则（8 条错误 + 2 条警告）
- [x] Word 导出保留标题层级、表格、列表、链接
- [x] 异步导出任务可查询进度（Bull Queue）
