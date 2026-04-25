# 前端架构设计

## 1. 页面模块

### 1.1 页面清单

| 模块 | 路由 | 说明 | 权限 |
|------|------|------|------|
| 登录 | `/login` | 登录/注册页 | 公开 |
| 激活 ✅ | `/activation` | 桌面版激活页：展示本机指纹+复制按钮、粘贴激活码、显示已激活客户名/到期日/剩余天数（software_upgrade / L 阶段） | 已登录 |
| 关于 ✅ | `/about` | 软件版本、运行形态（Web / 桌面）、机器指纹、激活状态汇总；桌面模式额外暴露"打开数据目录" / "查看日志"（software_upgrade / E6 阶段） | 已登录 |
| 工作台 ✅ | `/dashboard` | 个人工作台: 我的待办（待编辑/待审阅/待处理邀请）+ 最近编辑 + 我的项目 | ALL |
| 项目列表 | `/projects` | 项目（药品）列表 CRUD，每行末尾有蓝色「进入项目」按钮 | EDITOR+ |
| 项目详情 ✅ | `/projects/:id` | 项目下的申请、序列管理 + 协作 Tab（进度总览、工作量分布）+ 成员管理增强；申请表格每行末尾有蓝色「进入申请」按钮 | EDITOR+ |
| 申请管理 | `/projects/:id/applications` | 申请编号、类型管理 | EDITOR+ |
| 序列管理 | `/projects/:id/applications/:appId/sequences` | 序列号、注册行为管理；按注册行为折叠分组展示，**序列号在申请维度全局唯一连续递增**（方案 C, 2026-04-08 — 后端 sequence.applicationId + UNIQUE(application_id, sequence_number) 强约束，前端直接读 sequence.sequenceNumber 不再做投影），分组标题显示「起始序列 + 序列数」 | EDITOR+ |
| **文档编辑** ✅ | `/sequences/:seqId` | **核心页面** — 三栏布局: CTD 目录树(含颜色标识图例) + 文件管理区 + 右侧面板(属性/完整性/验证/eCTD工具)；含 CTD 目录初始化引导 | EDITOR+ |
| 导出中心 | `/export/:sequenceId` | Word/PDF 导出、eCTD 包生成 | EDITOR+ |
| 验证报告 | `/validation/:sequenceId` | eCTD 验证结果查看 | VIEWER+ |
| 文件管理 | `/files/:sequenceId` | 上传/管理 PDF、附件文件 | EDITOR+ |
| 通知列表 ✅ | `/notifications` | 全量通知列表（分页、按类型/项目/已读筛选、批量已读） | ALL |
| 系统设置 | `/settings` | 用户管理、模板管理 | ADMIN |

### 1.2 核心页面: 文档编辑器

```
┌──────────────────────────────────────────────────────┐
│  顶栏: 项目名 | 序列号 | 保存 | 导出Word | 导出PDF | 验证  │
├─────────┬────────────────────────┬───────────────────┤
│         │                        │                   │
│  CTD    │    TipTap 富文本编辑器    │   属性面板         │
│  目录树  │                        │   - 章节属性       │
│         │    标题、段落、表格、     │   - 文件引用       │
│  模块一  │    图片、公式           │   - 操作类型       │
│  模块二  │                        │   - 元数据         │
│  模块三  │                        │                   │
│  模块四  │                        │                   │
│  模块五  │                        │                   │
│         │                        │                   │
├─────────┴────────────────────────┴───────────────────┤
│  底栏: 字数统计 | 最后保存时间 | 编辑状态                   │
└──────────────────────────────────────────────────────┘
```

## 2. 组件设计

### 2.1 CTD 目录树组件 (`CTDTree`) ✅

- 基于 Ant Design `Tree` 组件
- 展示 CTD 五模块目录结构（229 节点）
- 已实现:
  - 搜索过滤节点（按标题、章节号、元素名匹配，自动展开祖先节点）
  - 图标区分: 模块文件夹（黄色）/章节文件夹/叶节点文件/扩展节点（紫色）
  - 叶节点状态标签: 未开始（灰）/编辑中（蓝）/已完成（绿）
  - 必填章节红色 Tag 标识
  - 叶节点操作类型标签（新建/替换/增补/删除）
  - 右键菜单: 生物制品 3.2.R 章节可添加扩展子节点
  - 扩展节点创建 Modal（Select 下拉选择 3.2.R.1~3.2.R.6）
  - 自然高度撑开 + 父容器滚动（不再使用 antd Tree 的 `virtual` 模式与固定 height，避免展开模块时下方模块被遮挡）
- WP-07 新增:
  - ✅ 审批状态图标: CheckCircleOutlined 绿(APPROVED)/ClockCircleOutlined 蓝(SUBMITTED)/CloseCircleOutlined 红(REJECTED)
- Plan 13 (2026-04-23) 新增:
  - ✅ 多实例节点标签展示：当 SequenceNode 有 `instanceLabel` 时，节点标题右侧显示蓝色小标签（如 "阿莫西林 - 石药集团"）
  - ✅ 右键菜单扩展：(a) 若节点 `templateNode.isRepeatable=true`（3.2.S / 3.2.P / 2.7.3 等容器），右键触发 `onRequestAddInstance` 弹出 `AddInstanceModal`；(b) 若节点是某实例（有 `instanceLabel`），右键触发 `onRequestRemoveInstance` 显示删除确认弹窗
- 待开发:
  - 文件合规状态图标
  - STF/电子签章标记
  - 拖拽排序

### 2.1.1 添加实例弹窗 (`AddInstanceModal`) ✅ Plan 13 (2026-04-23)

- 根据 `CtdTemplateNode.instanceKeyFields` 动态渲染骨架属性输入框（`substance` / `manufacturer` / `productName` / `dosageForm` / `indication`）
- 同组内 `instanceKeyFields` 组合唯一性由服务端校验（不能添加两个完全相同区分键的实例）
- 提交成功后调用 `ctdApi.addInstance` → 深拷贝模板子树创建新 SequenceNode 子树

### 2.2 内容完整性看板 (`CompletenessPanel`) ✅

- 4 个统计卡片: 总章节数、必填章节数、已完成必填数、完成度环形进度条
- 按模块分组的进度条（每个模块显示 完成/必填/总计）
- 未完成必填章节列表（带 ERROR/WARNING 级别 Tag）
- 禁止使用的章节违规列表

### 2.3 富文本编辑器 (`RichEditor`) ✅

基于 TipTap (ProseMirror) 封装:

**基础功能:**
- 标题（H1-H6，对应 CTD 章节层级）
- 段落、加粗、斜体、下划线
- 有序/无序列表
- 表格（可编辑行列）
- 图片插入（上传至 MinIO）
- 页内链接 / 交叉引用

**eCTD 专用扩展:**
- CTD 章节标题节点（自动编号如 2.3.S.1）
- 默认字体: 宋体(正文)、黑体(标题)、Times New Roman(英文)
- 字号规范: 正文≥小四号字(12pt)、表格≥五号字(10.5pt)
- 交叉引用节点（引用其他模块章节内容）
- 语言标记支持（xml:lang: zh/en）

### 2.4 导出对话框 (`ExportModal`) ✅

- 格式选择: Word (.docx) / PDF
- eCTD PDF 合规提示信息
- 导出进度 Spin 指示
- 合规检查结果展示:
  - Summary 描述（合规通过/不通过）
  - 错误列表（Collapse 可展开，红色标记）
  - 警告列表（橙色标记）
  - 已移除外部链接列表
- Blob 下载（PDF 合规通过时自动触发下载）
- 对应 API: `exportApi.exportWord()` / `exportApi.exportPdf()`

### 2.5 文件管理面板 (`FilePanel`) ✅ (WP-06 已实现)

嵌入属性面板的文件管理 Tab:
- 拖拽上传区域（Upload.Dragger，含红色提示「请将文件改成英文名称」以引导符合 eCTD 命名规范）
- 上传进度条（Progress）
- 文件扩展名前端校验（.pdf/.xml/.xpt/.txt/.xsl）
- 文件大小前端校验（500MB/4GB，2026-04-08 从 200MB 上调对齐 ICH 上限）
- 文件列表（Table，含文件图标、合规状态 Badge、引用标签）
- **导出名列（2026-04-24）**：用户可点击内联编辑 eCTD 导出 basename（仅 a-z/0-9/-/_，basename+ext ≤64 字符），显示当前有效名（自定义黑色、未设置灰色回落显示 stored_name），右侧只读扩展名；引用文件禁止改名
- 文件操作: 预览（PDF）、下载（presigned URL）、删除（确认弹窗）
- PDF 合规状态图标: 绿色通过/黄色警告/红色错误
- 合规详情 Modal（错误/警告列表 Table）
- 前序序列文件引用 Modal（Table 选择器，显示序列号/章节/文件名/大小）
- 文件引用创建（同一申请内跨序列复用，验证前序存在性）
- 对应 API: `fileApi.upload/list/delete/download/preview/updateExportName/createReference/listReferenceable`

### 2.6 审批面板 (PropertiesPanel 审批 Tab) ✅ (WP-07 已实现)

嵌入属性面板的审批 Tab（仅叶节点显示）:
- 审批状态展示（Tag: 草稿/待审批/已通过/已驳回）
- 提交人/时间、审批人/时间信息
- 驳回理由展示（红色背景提示）
- MANAGER 审批操作: 通过按钮 + 驳回按钮（弹窗填写理由）
- MANAGER 解锁审批按钮（允许重新编辑已通过节点）
- 对应 API: `approvalApi.submit/approve/reject/unlockApproval/getHistory`

### 2.7 评论面板 (PropertiesPanel 评论 Tab) ✅ (WP-07 已实现)

嵌入属性面板的评论 Tab:
- 评论输入框（Ctrl+Enter 发送）
- 回复功能（点击"回复"设置 parentId）
- 评论列表（顶级评论 + 嵌套回复，不同背景色区分）
- 删除评论（评论作者或 MANAGER 可删，确认弹窗）
- Badge 评论数统计
- 对应 API: `commentApi.create/list/delete`

### 2.8 编辑锁指示器 (EditorPage) ✅ (WP-07 已实现)

集成在 EditorPage 中:
- 选中叶节点时自动获取编辑锁（editLockApi.acquire）
- 切换节点/离开页面时释放锁（editLockApi.release）
- 5 分钟心跳续期（editLockApi.heartbeat）
- 锁冲突时: 顶栏 Tag 显示"xx 正在编辑" + Alert 只读模式提示
- 已审批节点: Alert "该节点已审批通过，不可编辑" + 只读模式
- RichEditor editable={!isReadOnly}
- 对应 API: `editLockApi.acquire/release/query/forceUnlock/heartbeat`

### 2.8.0 桌面环境检测 (`EnvironmentContext`) ✅ (software_upgrade / E6 阶段)

`frontend/src/contexts/EnvironmentContext.tsx`、`frontend/src/types/electron-api.d.ts`：

- 入口 `useEnvironment()` 返回 `{ isDesktop, machineId, appVersion, platform }`
- 检测：`window.electronAPI` 存在 → 桌面模式
- IPC 字段（指纹/版本/平台）由 `EnvironmentProvider` 在 mount 时一次性 await
- 业务页用 `isDesktop` 做条件渲染：项目详情页 `邮箱邀请` 按钮 / 协作分享类按钮在桌面模式隐藏（编辑器协作 Tab 仍保留以便单机用户也能看到自己工作量）
- 公共 helper `openExternalUrl(url)`：桌面模式走 `electronAPI.openExternal`，Web 模式走 `window.open(url, '_blank')`

### 2.8.1 激活码 Banner (`LicenseBanner`) ✅ (software_upgrade / L 阶段)

位置：`frontend/src/components/LicenseBanner.tsx`，挂在 `BasicLayout` 的 Header 上 NotificationCenter 左侧。

行为：
- `useLicenseStore` 拉取 `/license/status`；`enforced=false` 时整体不渲染
- 颜色：`>30 天` 绿色 / `≤30` 橙色 / `≤7` 或失效 红色
- 文案：`剩余 N 天` / `已过期` / `未激活，点此激活`
- 点击跳 `/activation` 页面（已实现重新激活 UI）
- Tooltip 显示客户名 + 到期日全文

`ActivationPage`（`frontend/src/pages/license/ActivationPage.tsx`）：复制本机指纹给厂商 → 粘贴激活码 → 提交 → 成功后跳 `/projects`。`ProtectedRoute` 中插入 license 闸门：`isLicenseBlocking(status)` 为真时强制跳 `/activation`，避免业务页面拿到 403 才提示。

### 2.9 PDF 预览组件 (`PDFViewer`)

- 基于 react-pdf 或 PDF.js
- 支持在线预览已上传的 PDF
- 书签导航

### 2.10 研究元数据面板 (`StudyMetadataPanel`) ✅ (Plan 12, 2026-04-09)

位置：`frontend/src/components/StudyMetadataPanel.tsx`

作为 `PropertiesPanel` 的「研究 (STF)」Tab 嵌入，仅在 `isStfSection(ctdSectionNumber)` 为真的 STF 必需叶节点（M4 4.2.x / M5 5.3.1-5.3.5）显示。v1 的单研究 upsert 面板已废弃，改为**多研究列表 + 编辑器 Modal** 布局以支持"一个 CTD 章节挂 N 份研究"。

**布局结构**:

```
┌────────────────────────────────────────────────────────┐
│ 研究 (STF) Tab                                           │
├────────────────────────────────────────────────────────┤
│  [+新建研究] [从 STF XML 导入]                            │
│                                                        │
│  ┌─────────────────────────────────────────────────┐  │
│  │ TOX-2024-001  重复给药毒性 — 大鼠 13 周           │  │
│  │ species:rat  route:oral  duration:subchronic     │  │
│  │ 3 文件 | NEW | [编辑] [删除] [重新生成 XML]        │  │
│  └─────────────────────────────────────────────────┘  │
│  ┌─────────────────────────────────────────────────┐  │
│  │ TOX-2024-002  重复给药毒性 — Beagle 犬 13 周      │  │
│  │ ...                                              │  │
│  └─────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────┘
```

**编辑器 Modal** 按 Plan 12 §4.1 决策 4 折中方案分两区：

- **基础区（默认展开）** — 读取当前节点 `ctd_template_node.default_stf_categories` 字段，根据预设维度渲染若干必填 Select：
  - 研究编号（studyId 文本框）
  - 研究标题（title 文本框）
  - 按 `defaultStfCategories` 的 `name` 生成 Select（如 4.2.3.2 自动渲染 species/route-of-admin/duration/type-of-control 四个 Select），`required: true` 的维度做前端必填校验
  - 每个 Select 的 options 调用 `cvApi.getStfCategoryValues('species' | 'route-of-admin' | ...)` 拉取
- **高级区（折叠，Collapse 组件）** — 「添加更多维度」按钮展开一个动态 form array，让高级用户为特殊研究追加 `defaultStfCategories` 之外的维度
- **文档区** — 集成现有 FileAttachment 选择器，每份附件绑定一个 file-tag（options 调用 `cvApi.getStfFileTags(module)`，module 由 `ctdSectionNumber` 自动判断 m4 / m5）
- **重新生成 XML 按钮** — 调用 `studyApi.regenerateXml(id)` 手动触发 stfXmlContent + stfChecksum 重算

**API 集成**：`studyApi.listByNode / create / update / delete / regenerateXml`

### 2.11 STF 导入 Modal (`StudyImportModal`) ✅ (Plan 12, 2026-04-09)

位置：`frontend/src/components/StudyImportModal.tsx`

从 `StudyMetadataPanel` 顶部「从 STF XML 导入」按钮触发，对应 Plan 12 §4.3 设计。

**Tab 布局**:

- **粘贴 XML Tab** — 大文本框粘贴 STF XML 内容 → 调 `studyApi.importXml(nodeId, { xmlString, onConflict })`
- **上传 bundle Tab** — Antd `Upload.Dragger` 上传 1 份 STF XML + N 份 PDF 附件 → 调 `studyApi.importBundleMultipart(nodeId, formData)`

**通用控件**:

- **冲突模式 Select**：`reject`（默认，保守）/ `overwrite`（删旧建新）/ `merge`（保留 id 替换 children）
- **warning 列表展示**：后端返回的 `warnings[]` 用 `Alert` 或 `List` 渲染（如"前序 Study 未找到，lifecycle 链断裂"、"附件 MD5 不一致，使用实际值"、"附件 xyz.pdf 未命中任何 FileAttachment，已跳过"）
- 成功后 `toast` 提示 + 关闭 Modal + 触发父组件刷新 Study 列表

**API 集成**：`studyApi.importXml / importBundle / importBundleMultipart`

## 3. 状态管理

使用 Zustand 管理全局状态:

```typescript
// 项目状态
useProjectStore: {
  currentProject: Project
  applications: Application[]
}

// 受控词汇状态（级联选择用）
useCVStore: {
  applicationTypes: CVCode[]    // cnapt1-4
  productTypes: CVCode[]        // cnprt1-2
  regulatoryActivityTypes: CVCode[]  // 按申请类型过滤后
  sequenceTypes: CVCode[]       // 按申请类型+注册行为过滤后
}

// 编辑器状态
useEditorStore: {
  currentSequence: Sequence
  ctdTree: CTDNode[]           // CTD 目录树
  activeNode: CTDNode          // 当前编辑的节点
  documentContent: JSON        // TipTap JSON 内容
  isDirty: boolean             // 是否有未保存修改
  autoSaveTimer: NodeJS.Timer
  completenessStats: {          // 内容完整性统计
    totalRequired: number
    completedRequired: number
  }
}

// 导出状态
useExportStore: {
  exportProgress: number
  validationResult: ValidationReport
}
```

## 4. API 请求

使用 Axios + React Query:

```typescript
// services/api.ts
const api = axios.create({
  baseURL: '/api/v1',
  timeout: 30000,
})

// 请求拦截器: 自动附加 JWT Token
// 响应拦截器: 统一错误处理、Token 刷新
```

### 4.1 服务模块清单

| 文件 | 职责 |
|------|------|
| `services/api.ts` | 基础 axios 实例 + 拦截器 |
| `services/auth.ts` | 登录、注册、刷新 token |
| `services/project.ts` | 项目 CRUD + 成员管理 |
| `services/application.ts` | 申请 + 注册行为 + 序列 |
| `services/ctdTemplate.ts` | CTD 模板树查询 |
| `services/document.ts` | 文档内容 CRUD + 版本历史 |
| `services/file.ts` | 文件上传下载 + 引用管理 |
| `services/ectd.ts` | XML 骨架预览 + eCTD 包导出 + 验证（**Plan 12 v2 已删除 v1 STF 端点 `getStf/saveStf/getStfCategories/getStfFileTags`**，前端现用 `studyApi` + `cvApi.getStfCategories`） |
| `services/study.ts` ✅ (Plan 12) | **新增** — Study CRUD + STF XML 导入 REST client。方法: `listBySequence(seqId)` / `listByNode(nodeId)` / `getById(id)` / `create(nodeId, dto)` / `update(id, dto)` / `delete(id)` / `regenerateXml(id)` / `importXml(nodeId, body)` / `importBundle(nodeId, body)` / `importBundleMultipart(nodeId, formData)` |
| `services/cv.ts` | 受控词汇查询。**Plan 12 新增** STF 方法: `getStfCategories()` / `getStfCategoryValues(name)` / `getStfFileTags(module: 'm4' \| 'm5')` |
| `services/export.ts` | Word/PDF 导出 |
| `services/validation.ts` | 验证执行 + 报告查询 |
| `services/editLock.ts` | 编辑锁获取/释放/心跳 |
| `services/approval.ts` | 审批提交/通过/驳回 |
| `services/comment.ts` | 评论 CRUD |
| `services/notification.ts` | 通知列表 + 已读 |
| `services/assignment.ts` | 章节指派 |
| `services/dashboard.ts` | 工作台聚合查询 |
| `services/collaboration.ts` | WebSocket 连接 + presence HTTP fallback |

## 5. 自动保存

- 编辑器内容变化后 3 秒自动保存（防抖）
- 保存状态指示: "已保存" / "保存中..." / "未保存"
- 页面关闭前检查未保存内容，弹出确认框

## 6. 协作功能组件（WP-09）

### 6.1 通知中心组件 (`NotificationCenter`) ✅

全局 Layout 顶栏组件:
- 铃铛图标（BellOutlined）+ 红色 Badge 显示未读数
- 点击展开 Popover 通知下拉面板
- 面板内容:
  - 按时间倒序显示最近 20 条通知
  - 已读/未读样式区分（未读加粗 + 蓝色圆点）
  - 点击通知跳转到对应页面（审批通知→编辑器对应节点，评论通知→评论 Tab 等）
  - "全部标为已读"按钮
  - "查看全部"链接 → 跳转 `/notifications` 列表页
- 未读数获取: 轮询 `notificationApi.getUnreadCount()` + WebSocket `notification:count` 事件
- 新通知: WebSocket `notification:new` 事件实时推入列表
- 对应 API: `notificationApi.findAll/markAsRead/markAllAsRead/getUnreadCount`

### 6.2 通知列表页 (`NotificationListPage`) ✅

路由: `/notifications`
- ProTable 展示全量通知列表（分页）
- 筛选: 按类型（Select）、按项目（Select）、已读/未读（Radio）
- 操作: 全部标记已读（Button）
- 点击行跳转到对应资源页面
- 对应 API: `notificationApi.findAll/markAsRead/markAllAsRead`

### 6.3 增强工作台页面 (`DashboardPage`) ✅

路由: `/dashboard`（登录后默认首页）

布局:
- 顶部统计卡片行: 待编辑数 / 待审阅数 / 待处理邀请数 / 参与项目数
- "我的待办"区域:
  - 待编辑章节列表（按项目分组，点击跳转编辑器）
  - 待审阅提交列表（显示提交人+章节名，点击跳转审批）
  - 待处理邀请（接受/拒绝操作）
- "最近编辑"区域:
  - 最近编辑的 5 个节点（Table: 项目名/序列号/章节名/编辑时间）
  - 点击直接跳转到编辑器
- "我的项目"区域:
  - 参与的所有项目列表（Card: 项目名/角色/进度概要）
- 对应 API: `dashboardApi.getMyTasks/getRecentEdits`

### 6.4 增强项目详情页 (`ProjectDetailPage`) ✅

新增"协作"Tab:
- 团队进度总览:
  - 横向 Progress 进度条: 总节点数 / 已完成（APPROVED）数
  - 按模块（M1-M5）分别展示 Progress 进度条
- 成员工作量分布:
  - Table 展示每个成员: 指派章节数 / 已完成数 / 编辑中数 / 待审阅数
  - 或 Card 布局展示
- 对应 API: `collaborationApi.getProgress/getWorkload`

成员管理 Tab 增强:
- 成员列表增加操作列: 变更角色（Select 下拉）、移除成员（Popconfirm 确认）
- 仅 OWNER 显示操作列
- 成员列增加"加入时间"列
- 成员列增加在线状态指示灯（绿色/灰色圆点）
- "邀请成员"按钮 → InviteModal（邮箱输入 + 角色选择 + 待处理邀请列表）
- "转移所有权"按钮（OWNER 专属，带 Modal 警告提示和二次确认）
- 成员详情抽屉: 活动时间线（Timeline 组件展示操作日志）
- 对应 API: `invitationApi/projectApi.changeMemberRole/transferOwnership/getMemberActivity`

在线成员头像栏:
- 项目详情页顶部 Avatar.Group 显示当前在线成员
- Tooltip 悬停: 姓名 + 当前所在位置（如"正在编辑 3.2.S.1 物质基本信息"）
- 对应 API: `collaborationApi.getPresence`（HTTP fallback）+ WebSocket 实时

### 6.5 属性面板指派 Tab (`PropertiesPanel` 指派 Tab) ✅

嵌入属性面板的"指派"Tab:
- 展示当前节点的所有指派成员（List: 头像+姓名+权限 Tag）
- OWNER 可操作:
  - 添加指派: Select 搜索项目成员下拉 + 权限选择（EDIT/REVIEW/VIEW）
  - 移除指派: 删除按钮（Popconfirm 确认）
  - 变更权限: 点击权限 Tag 切换
- 非 OWNER: 只读展示指派信息
- 对应 API: `assignmentApi.assign/getNodeAssignments/removeAssignment`

### 6.6 useCollaboration Hook ✅

Socket.IO 客户端连接 Hook:
```typescript
useCollaboration({
  projectId: string,
  sequenceId?: string,
  onUserOnline?: (user) => void,
  onUserOffline?: (user) => void,
  onUserLocation?: (data) => void,
  onNodeLocked?: (data) => void,
  onNodeUnlocked?: (data) => void,
  onNodeUpdated?: (data) => void,
  onNodeApproval?: (data) => void,
  onNotification?: (notification) => void,
  onNotificationCount?: (count) => void,
})
```

功能:
- 组件挂载时建立 Socket.IO 连接（携带 JWT access_token）
- 自动加入 project/sequence 房间
- 每 60 秒发送心跳续期在线状态
- 断线自动重连（Socket.IO 内置）
- 组件卸载时断开连接并清理在线状态
- 编辑器页面: 监听 `node:locked/unlocked` 实时更新锁状态（无需轮询）
- 编辑器页面: 监听 `node:updated` 提示其他用户内容已变更
- CTD 目录树: 实时更新编辑锁图标和编辑者头像
