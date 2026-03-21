# Plan 4 — WP-04: eCTD 合规文档导出（Word/PDF）

## 目标

实现文档导出为 Word (.docx) 和 PDF 格式，**PDF 必须严格符合 eCTD 技术规范 3.4 节和验证标准 6.x 的全部要求**。V1.1 将 8 项 PDF 相关验证从"警告"提升为"错误"级别，PDF 合规是导出功能的核心。

## 前置依赖

- Plan 3 完成（编辑器可用，文档内容已存储）

## 阶段 1: eCTD PDF 合规规则清单

在开始编码前，必须完全理解 eCTD 对 PDF 的全部要求:

### 1.1 PDF 基本要求（技术规范 3.4 + ICH eCTD 文件格式规范 V1.3）
- [ ] 版本: 1.4, 1.5, 1.6, 1.7 或 PDF/A-1, PDF/A-2（验证规则 6.18）
- [ ] 不加密、不设密码保护（验证规则 6.19）— **V1.1 升级为错误**
- [ ] 文本可搜索（非扫描图片）— **V1.1 升级为错误**
- [ ] 不包含 JavaScript（验证规则 6.20）— **V1.1 升级为错误**
- [ ] 不包含附件/嵌入式文件 — **V1.1 升级为错误**
- [ ] 不包含外部链接（网页 URL、mailto 链接）（验证规则 6.21）— **V1.1 升级为错误**
- [ ] 不包含音频/视频/3D 对象（验证规则 6.22）— **V1.1 升级为错误**
- [ ] 单个 PDF 文件大小不超过 200MB（V1.1 从 500MB 下调）
- [ ] Fast Web View (线性化) 优化
- [ ] 页面大小规范化

### 1.2 书签和导航要求
- [ ] 超过 5 页的 PDF 必须有书签（验证规则 6.1）— **V1.1 升级为错误**
- [ ] 书签使用相对路径指向（非绝对路径）
- [ ] 书签放大率必须为 Inherit Zoom（验证规则 6.23）— **V1.1 升级为错误**
- [ ] 初始视图设置: 显示书签面板 (BookmarksPanel)
- [ ] 书签层级应与文档章节层级对应

### 1.3 超链接要求
- [ ] 文档内超链接仅允许使用相对路径
- [ ] 超链接动作仅允许: GoTo（文档内跳转）, GoToR（跨文档跳转）, Launch（启动外部文件）
- [ ] 不允许 URI 类型动作（外部 URL）
- [ ] 不允许包含 mailto 链接
- [ ] 跨文档超链接要求:
  - 模块一的上市后变更/研究 → 模块二至五具体内容
  - 模块二的概述和总结 → 模块三至五详细信息
  - 临床研究报告 → 对应附件图表
  - PDF 格式临床数据集说明 → 对应 .xpt 文件

### 1.4 字体和格式要求
- [ ] 中文字体: 宋体（正文）、黑体（标题）
- [ ] 英文字体: Times New Roman
- [ ] 字号: 正文不小于小四号字 (12pt)、表格不小于五号字 (10.5pt)
- [ ] 字体必须嵌入或使用标准 14 种 PDF 字体
- [ ] 字体颜色: 叙述性文字黑色

## 阶段 2: Word 导出

### 2.1 后端 Word 导出服务
- [ ] 安装 `docx` 库
- [ ] 创建 `WordExportService`
- [ ] TipTap JSON → docx 节点映射:
  - heading → HeadingParagraph (对应 CTD 章节层级)
  - paragraph → Paragraph (宋体, 小四号, 1.5 倍行距)
  - bulletList/orderedList → Paragraph with numbering
  - table → Table/TableRow/TableCell (五号字以上)
  - image → ImageRun (从 MinIO 下载图片)
  - blockquote → 缩进段落
- [ ] 页面设置: A4 纸张 (210mm x 297mm)、页边距 2cm
- [ ] 页眉: 章节标题（宋体 9pt）
- [ ] 页脚: 页码
- [ ] 自动生成文档目录 (Table of Contents)
- [ ] 标题样式: 黑体，H1=22pt, H2=16pt, H3=14pt

### 2.2 Word 导出 API
- [ ] POST `/api/v1/sequences/:seqId/export/word` — 导出单个章节
- [ ] POST `/api/v1/sequences/:seqId/export/word/batch` — 批量导出（异步任务）

## 阶段 3: PDF 导出（eCTD 合规）

### 3.1 PDF 生成引擎
- [ ] 安装 Puppeteer
- [ ] 创建 `PDFExportService`
- [ ] 导出流程: TipTap JSON → HTML + 合规 CSS → Puppeteer 渲染 → PDF
- [ ] **合规 CSS 模板**:
  ```css
  body { font-family: 'SimSun', serif; font-size: 12pt; line-height: 1.5; color: #000; }
  h1 { font-family: 'SimHei', sans-serif; font-size: 22pt; }
  h2 { font-family: 'SimHei', sans-serif; font-size: 16pt; }
  h3 { font-family: 'SimHei', sans-serif; font-size: 14pt; }
  table td, table th { font-size: 10.5pt; } /* 不小于五号字 */
  ```
- [ ] Puppeteer PDF 配置:
  - `format: 'A4'`
  - `margin: { top: '2cm', right: '2cm', bottom: '2cm', left: '2cm' }`
  - `tagged: true` (生成 tagged PDF，确保文本可搜索)
  - `printBackground: true`
  - 不设置任何安全选项

### 3.2 PDF 书签自动生成
- [ ] 从文档标题层级 (H1-H6) 自动生成 PDF outline/bookmarks
- [ ] 书签层级与 CTD 章节层级对应
- [ ] 超过 5 页自动添加书签
- [ ] 设置书签放大率为 Inherit Zoom
- [ ] 设置 PDF 初始视图为 BookmarksPanel（打开时显示书签）

### 3.3 超链接处理
- [ ] 文档内链接转换为相对路径 GoTo 动作
- [ ] 跨文档链接转换为 GoToR 动作（使用相对路径）
- [ ] **自动剥除所有外部 URL 链接**（http://, https://, mailto:）
- [ ] 剥除后在原位置保留文本但移除链接动作
- [ ] 导出日志记录被移除的外部链接，提醒用户

### 3.4 字体嵌入
- [ ] 确保宋体 (SimSun)、黑体 (SimHei) 字体嵌入 PDF
- [ ] 使用 Puppeteer 的字体配置确保中文字体正确渲染
- [ ] 验证导出 PDF 的字体嵌入状态

### 3.5 PDF 导出 API
- [ ] POST `/api/v1/sequences/:seqId/export/pdf` — 导出单个章节
- [ ] POST `/api/v1/sequences/:seqId/export/pdf/batch` — 批量导出
- [ ] 异步任务处理（大文件导出）

## 阶段 4: PDF 合规自动检查

### 4.1 PDF 验证服务（实现验证标准 6.x 全部 26 条规则）
- [ ] 创建 `PDFComplianceService`
- [ ] **错误级别 (V1.1)**:
  - 6.1 超过 5 页无书签 → 错误
  - 6.18 PDF 版本不在允许范围 → 错误
  - 6.19 PDF 加密/有安全设置 → 错误
  - 6.20 包含 JavaScript → 错误
  - 6.21 包含外部链接 → 错误
  - 6.22 包含音频/视频/3D → 错误
  - 6.23 书签放大率非 Inherit Zoom → 错误
  - 文本不可搜索（扫描件无 OCR）→ 错误
- [ ] **警告级别**:
  - 书签层级与文档标题不一致
  - 字体未嵌入
  - Fast Web View 未启用
  - 页面大小不规范
  - 文件大小超过 200MB
- [ ] 每个导出的 PDF 自动运行合规检查
- [ ] 有错误级别问题时阻止导出，返回详细错误信息

### 4.2 用户上传 PDF 的合规检查
- [ ] 用户上传的 PDF 文件（非编辑器内容导出的）也自动运行合规检查
- [ ] 不合规的 PDF 标记警告/错误
- [ ] 提供修复建议（如 "此 PDF 包含外部链接，请移除后重新上传"）

## 阶段 5: 导出任务管理

### 5.1 异步任务
- [ ] 使用 Bull Queue (Redis) 管理导出任务
- [ ] GET `/api/v1/export/status/:taskId` — 查询进度
- [ ] GET `/api/v1/export/download/:taskId` — 下载结果

### 5.2 前端导出页面
- [ ] 导出选项页面（选择章节、选择格式 Word/PDF）
- [ ] 导出前自动预检 PDF 合规性
- [ ] 导出进度显示
- [ ] 合规检查结果展示（通过/警告/错误）
- [ ] 下载按钮（仅无错误时可下载）

## 验收标准

- [ ] 导出的 PDF 版本为 1.4/1.5/1.6/1.7 或 PDF/A
- [ ] PDF 不加密、无 JavaScript、无外部链接、无附件
- [ ] PDF 超过 5 页时自动生成书签
- [ ] 书签放大率为 Inherit Zoom
- [ ] 文字使用宋体(正文)/黑体(标题)，字号符合规范
- [ ] 文本可搜索（tagged PDF）
- [ ] 字体正确嵌入
- [ ] 单个 PDF 不超过 200MB
- [ ] PDF 合规检查覆盖验证标准 6.x 全部规则
- [ ] Word 导出保留标题层级、表格、图片
- [ ] 异步导出任务可查询进度和下载结果
