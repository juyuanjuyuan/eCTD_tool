# Plan 10: 全局功能检查计划

> **目标**: 对 eCTD 在线文档撰写工具的所有页面进行逐一功能检查，确保所有已显示的按钮、交互组件、业务流程都能正常工作，不存在死按钮、逻辑错误或后端未实现的功能。
>
> **检查方式**: 由 Agent 逐页阅读前端代码 + 后端对应 Controller/Service 代码，对比检查 UI 调用的 API 是否后端已实现、逻辑是否正确、边界情况是否处理。
>
> **产出**: 检查结果记录在 `/home/eCTD_tool/docs/plans/plan_10_inspection_results.md`，之后根据结果编写 `plan_11_fixes.md` 修正执行计划。

---

## 检查规则

每项检查需记录以下信息:
- **状态**: `PASS` / `FAIL` / `WARN`（逻辑瑕疵）
- **问题描述**: 具体问题说明
- **前端文件**: 相关前端代码位置
- **后端文件**: 相关后端代码位置
- **严重程度**: `P0`（功能完全不可用）/ `P1`（功能部分可用但有明显缺陷）/ `P2`（小瑕疵但不影响主流程）

---

## 一、登录与注册页面 (`/login`)

**前端文件**: `frontend/src/pages/auth/LoginPage.tsx`
**后端文件**: `backend/src/auth/auth.controller.ts`, `backend/src/auth/auth.service.ts`

### 1.1 登录功能
- [ ] 1.1.1 输入正确邮箱+密码 → 是否成功登录并跳转到 Dashboard
- [ ] 1.1.2 输入错误密码 → 是否显示错误提示（不是未处理的异常）
- [ ] 1.1.3 输入不存在的邮箱 → 是否显示友好错误提示
- [ ] 1.1.4 空表单提交 → 是否有前端校验拦截
- [ ] 1.1.5 登录后 token 存储 → 检查 localStorage/cookie 中是否正确存储 JWT
- [ ] 1.1.6 登录后刷新页面 → 是否保持登录状态

### 1.2 注册功能
- [ ] 1.2.1 填写完整信息 → 是否成功注册
- [ ] 1.2.2 已存在邮箱注册 → 是否显示"邮箱已注册"提示
- [ ] 1.2.3 密码少于 6 位 → 是否前端校验拦截
- [ ] 1.2.4 注册成功后 → 是否自动登录或跳转到登录 Tab

### 1.3 Tab 切换
- [ ] 1.3.1 登录/注册 Tab 切换是否流畅、表单是否清空

---

## 二、Dashboard 页面 (`/`)

**前端文件**: `frontend/src/pages/dashboard/DashboardPage.tsx`
**后端文件**: `backend/src/dashboard/dashboard.controller.ts`, `backend/src/dashboard/dashboard.service.ts`

### 2.1 统计卡片
- [ ] 2.1.1 「待编辑章节」数字 → 检查 API `GET /dashboard/my-tasks` 返回的 pendingEdits 数量是否与显示一致
- [ ] 2.1.2 「待审阅提交」数字 → 检查 pendingReviews 数量
- [ ] 2.1.3 「待处理邀请」数字 → 检查 pendingInvitations 数量
- [ ] 2.1.4 「我的项目」数字 → 检查 myProjects 数量
- [ ] 2.1.5 「我的项目」卡片点击 → 是否跳转到 `/projects`

### 2.2 待编辑章节列表
- [ ] 2.2.1 列表数据 → 是否正确显示章节号、标题、项目 Tag、状态 Tag
- [ ] 2.2.2 点击章节 → 是否正确跳转到 Editor 页面（URL 是否正确拼接 sequenceId）
- [ ] 2.2.3 空状态 → 无待编辑章节时是否显示空状态占位

### 2.3 最近编辑列表
- [ ] 2.3.1 列表数据 → 检查 `GET /dashboard/recent-edits` 返回数据是否正确渲染
- [ ] 2.3.2 点击项 → 是否跳转到对应 Editor 页面

### 2.4 待审阅提交卡片
- [ ] 2.4.1 条件渲染 → 无待审阅时是否隐藏此卡片
- [ ] 2.4.2 点击审阅项 → 是否跳转到对应 Editor 页面

### 2.5 我的项目列表
- [ ] 2.5.1 「查看全部」链接 → 是否跳转到 `/projects`
- [ ] 2.5.2 项目列表 → 是否显示状态 Tag、申请数、成员数
- [ ] 2.5.3 点击项目 → 是否跳转到项目详情

---

## 三、项目列表页面 (`/projects`)

**前端文件**: `frontend/src/pages/project/ProjectListPage.tsx`
**后端文件**: `backend/src/project/project.controller.ts`, `backend/src/project/project.service.ts`

### 3.1 项目列表
- [ ] 3.1.1 表格列 → 项目名称、状态、申请数、成员数、创建人、创建时间是否正确显示
- [ ] 3.1.2 分页 → 项目数量超过 pageSize 时分页是否工作
- [ ] 3.1.3 点击项目名称 → 是否跳转到 `/projects/:id`
- [ ] 3.1.4 空表格 → 无项目时是否显示空状态

### 3.2 创建项目
- [ ] 3.2.1 点击「创建项目」按钮 → Modal 是否弹出
- [ ] 3.2.2 填写项目名称 + 描述 → 提交是否成功，列表是否刷新
- [ ] 3.2.3 项目名称为空提交 → 是否前端校验拦截
- [ ] 3.2.4 创建成功后 → Modal 是否关闭，新项目是否出现在列表中

---

## 四、项目详情页面 (`/projects/:id`)

**前端文件**: `frontend/src/pages/project/ProjectDetailPage.tsx`
**后端文件**: `backend/src/project/project.controller.ts`, `backend/src/application/application.controller.ts`

### 4.1 概览 Tab
- [ ] 4.1.1 项目信息 → 名称、状态 Tag、描述、创建时间是否正确显示
- [ ] 4.1.2 状态 Tag 颜色 → 草稿/进行中/已归档 颜色是否区分

### 4.2 申请 Tab
- [ ] 4.2.1 申请列表 → 表格列（申请编号、申请类型、产品类型、原始编号、注册行为数、创建时间）是否正确
- [ ] 4.2.2 点击申请编号 → 是否跳转到 `/projects/:id/applications/:appId`
- [ ] 4.2.3 创建申请 → 点击按钮是否弹出 Modal
- [ ] 4.2.4 创建申请 Modal → 申请类型下拉（从 CV 获取）是否有选项
- [ ] 4.2.5 创建申请 Modal → 产品类型下拉是否有选项
- [ ] 4.2.6 创建申请 Modal → 原始编号输入（10 位数字）校验是否工作
- [ ] 4.2.7 创建申请 Modal → 提交后列表是否刷新
- [ ] 4.2.8 产品类型联动 → 选择不同申请类型后，产品类型选项是否联动变化（检查 CV 依赖关系）

### 4.3 成员 Tab
- [ ] 4.3.1 当前用户角色 → 是否正确显示角色 Badge
- [ ] 4.3.2 成员列表 → 姓名、邮箱、角色、加入时间是否正确
- [ ] 4.3.3 OWNER 的角色显示 → 是否为不可编辑的 Tag（非下拉框）
- [ ] 4.3.4 自己的角色显示 → 是否为不可编辑的 Tag
- [ ] 4.3.5 修改其他成员角色 → 下拉框选择后是否调用 API 更新（`PATCH /projects/:id/members/:userId/role`）
- [ ] 4.3.6 修改角色的 API 调用 → 检查后端是否正确处理角色变更（权限校验、通知发送）
- [ ] 4.3.7 移除成员 → 点击删除按钮是否弹出确认框，确认后是否移除
- [ ] 4.3.8 OWNER 不可被移除 → 是否隐藏 OWNER 的删除按钮
- [ ] 4.3.9 非 OWNER 看到的操作 → 是否隐藏添加成员、邀请、转移所有权按钮

#### 4.3.A 添加成员 Modal
- [ ] 4.3.A.1 搜索用户 → 输入关键词是否调用 `GET /users/search?q=X`
- [ ] 4.3.A.2 搜索结果 → 是否过滤已是成员的用户
- [ ] 4.3.A.3 选择用户 + 角色 → 提交是否成功添加
- [ ] 4.3.A.4 添加后 → 成员列表是否刷新

#### 4.3.B 邮箱邀请 Modal
- [ ] 4.3.B.1 输入邮箱 + 选择角色 → 是否调用 `POST /projects/:id/invitations`
- [ ] 4.3.B.2 邀请成功后 → 是否显示邀请链接并支持复制
- [ ] 4.3.B.3 邀请列表 → 是否显示待接受/已接受/已过期/已取消状态
- [ ] 4.3.B.4 取消邀请 → PENDING 状态的邀请是否可取消

#### 4.3.C 转移所有权 Modal
- [ ] 4.3.C.1 选择目标成员 → 下拉框是否只显示非 OWNER 成员
- [ ] 4.3.C.2 确认转移 → 是否调用 API，转移后角色是否正确变更
- [ ] 4.3.C.3 警告提示 → 是否显示不可逆警告

### 4.4 协作 Tab
- [ ] 4.4.1 团队进度 → 总体进度 X/Y 是否正确，百分比 Tag 是否正确
- [ ] 4.4.2 模块进度表 → 各模块总章节、已通过、进度条是否正确渲染
- [ ] 4.4.3 成员工作量 → 成员名、角色、指派章节数、已通过数、编辑中数、待审阅数是否正确
- [ ] 4.4.4 数据来源 → 检查 `GET /projects/:id/collaboration/progress` 和 `/workload` API 是否正确返回数据
- [ ] 4.4.5 无申请/序列时 → 协作 Tab 是否优雅处理空数据

---

## 五、申请详情页面 (`/projects/:id/applications/:appId`)

**前端文件**: `frontend/src/pages/application/ApplicationDetailPage.tsx`
**后端文件**: `backend/src/application/application.controller.ts`, `backend/src/regulatory-activity/regulatory-activity.controller.ts`, `backend/src/sequence/sequence.controller.ts`

### 5.1 申请信息
- [ ] 5.1.1 申请编号、申请类型 Tag、产品类型、原始编号是否正确显示
- [ ] 5.1.2 面包屑导航 → 各级链接是否可点击跳转

### 5.2 创建注册行为
- [ ] 5.2.1 点击「创建注册行为」→ Modal 是否弹出
- [ ] 5.2.2 注册行为类型下拉 → 是否根据申请类型过滤（调用 `GET /cv/regulatory-activity-types?appType=X`）
- [ ] 5.2.3 提交后 → 注册行为是否出现在 Collapse 列表中

### 5.3 注册行为 Collapse 面板
- [ ] 5.3.1 展开面板 → 是否显示注册行为类型 Tag、关联序列、序列数
- [ ] 5.3.2 序列表格 → 序列号、序列类型、描述、状态、联系人、创建时间、操作列是否正确
- [ ] 5.3.3 序列状态 Tag → 草稿/编辑中/验证中/已导出/已提交 颜色是否区分

### 5.4 创建序列
- [ ] 5.4.1 在注册行为面板内点击「创建序列」→ Modal 是否弹出
- [ ] 5.4.2 序列类型下拉 → 是否根据申请类型 + 注册行为类型过滤（调用 `GET /cv/sequence-types?appType=X&ratType=Y`）
- [ ] 5.4.3 序列描述、联系人姓名/电话/邮箱字段 → 是否可正常输入
- [ ] 5.4.4 提交后 → 序列是否出现在表格中

### 5.5 序列操作
- [ ] 5.5.1 点击「编辑」按钮 → 是否跳转到 `/sequences/:seqId`（序列详情页）
- [ ] 5.5.2 URL 路由 → 检查跳转 URL 是否正确拼接参数

---

## 六、序列详情页面 (`/sequences/:seqId`)

**前端文件**: `frontend/src/pages/sequence/SequenceDetailPage.tsx`
**后端文件**: `backend/src/ctd-template/ctd-template.controller.ts`, `backend/src/ectd/ectd.controller.ts`

### 6.1 基本信息
- [ ] 6.1.1 序列号 + 状态 Tag → 是否正确显示
- [ ] 6.1.2 序列类型、描述、联系人信息 → 是否完整
- [ ] 6.1.3 返回按钮 → 是否返回申请详情页
- [ ] 6.1.4 编辑器按钮 → 是否跳转到 `/sequences/:seqId/editor`
- [ ] 6.1.5 编辑器按钮禁用条件 → 未初始化时是否 disabled

### 6.2 初始化流程
- [ ] 6.2.1 未初始化状态 → 是否显示初始化卡片
- [ ] 6.2.2 必填章节预览 → 调用 `GET /sequences/:seqId/preview-required` 是否正确显示
- [ ] 6.2.3 点击「初始化」按钮 → 是否调用 `POST /sequences/:seqId/initialize`
- [ ] 6.2.4 初始化成功后 → 是否显示 CTD 目录树 Tab
- [ ] 6.2.5 初始化 loading 状态 → 按钮是否有 loading 反馈

### 6.3 CTD 目录结构 Tab
- [ ] 6.3.1 树形结构 → 调用 `GET /sequences/:seqId/nodes/tree` 是否正确渲染五模块结构
- [ ] 6.3.2 树节点展开/折叠 → 是否流畅
- [ ] 6.3.3 节点状态标识 → EMPTY/EDITING/COMPLETED/APPROVED 是否有视觉区分

### 6.4 内容完整性 Tab
- [ ] 6.4.1 完整性数据 → 调用 `GET /sequences/:seqId/completeness` 是否返回正确数据
- [ ] 6.4.2 各模块进度条 → 是否正确显示总数、必填数、已完成数
- [ ] 6.4.3 缺失章节列表 → 是否标识出未完成的必填章节
- [ ] 6.4.4 Badge 数字 → Tab 标题旁的红色 Badge 是否显示缺失数量

### 6.5 eCTD 验证 Tab
- [ ] 6.5.1 运行验证 → 点击按钮是否调用 `POST /sequences/:seqId/validate`
- [ ] 6.5.2 验证报告 → 是否按类别（6 大类）和严重级别（ERROR/WARNING/INFO）显示
- [ ] 6.5.3 过滤功能 → 按类别、严重级别过滤是否工作
- [ ] 6.5.4 历史报告 → 调用 `GET /sequences/:seqId/validate/latest` 是否正确加载
- [ ] 6.5.5 结果统计 → 错误/警告/信息数量汇总是否正确

### 6.6 XML 骨架预览 Tab
- [ ] 6.6.1 index.xml 预览 → 调用 `GET /sequences/:seqId/xml/index` 是否返回 XML 内容
- [ ] 6.6.2 cn-regional.xml 预览 → 调用 `GET /sequences/:seqId/xml/cn-regional` 是否返回 XML 内容
- [ ] 6.6.3 XML 格式化显示 → 是否有语法高亮或格式化展示
- [ ] 6.6.4 空序列 → 未上传文件时 XML 预览是否合理处理

### 6.7 eCTD 导出 Tab
- [ ] 6.7.1 预览包结构 → 调用 `GET /sequences/:seqId/export/ectd-preview` 是否显示目录树
- [ ] 6.7.2 导出 eCTD 包 → 调用 `POST /sequences/:seqId/export/ectd-package` 是否下载 ZIP
- [ ] 6.7.3 导出前验证 → 是否先运行验证，有 ERROR 时是否阻止导出
- [ ] 6.7.4 导出 loading → 是否有进度反馈

---

## 七、编辑器页面 (`/sequences/:seqId/editor`) — 核心检查

**前端文件**: `frontend/src/pages/editor/EditorPage.tsx`, `frontend/src/pages/editor/components/`
**后端文件**: 多个 Controller/Service

### 7.1 页面布局与导航
- [ ] 7.1.1 三栏布局 → 左侧 CTD 树 + 中间内容区 + 右侧属性面板是否正确渲染
- [ ] 7.1.2 返回按钮 → 是否返回序列详情页
- [ ] 7.1.3 面包屑 → 项目/申请/序列各级链接是否可跳转
- [ ] 7.1.4 左侧栏折叠/展开 → 按钮是否工作
- [ ] 7.1.5 右侧栏折叠/展开 → 按钮是否工作

### 7.2 顶部操作栏
- [ ] 7.2.1 必填完成度 Tag → 显示 "必填 X/Y" 或 "无必填"，数据来源是否正确
- [ ] 7.2.2 审批状态显示 → 已审批/待审批/已驳回 + 图标颜色是否正确
- [ ] 7.2.3 「提交审批」按钮 → 条件显示（canSubmit=true 时），点击是否调用 `POST /nodes/:id/submit`
- [ ] 7.2.4 「运行 eCTD 验证」按钮 → 点击是否调用验证 API，loading 是否正确
- [ ] 7.2.5 「导出文档」按钮 → 是否弹出 ExportModal

### 7.3 CTD 树导航（左侧）
- [ ] 7.3.1 树节点选择 → 点击叶节点是否更新中间内容区
- [ ] 7.3.2 目录节点选择 → 点击非叶节点是否显示 "请展开选择下级叶节点" 提示
- [ ] 7.3.3 无选中状态 → 是否显示 "选择一个章节开始工作" 占位
- [ ] 7.3.4 节点状态标识 → 各状态（空/编辑中/已完成/已审批）是否有视觉标识
- [ ] 7.3.5 必填标识 → 必填章节是否有红色标识

### 7.4 文件管理面板（中间区域） — **用户反馈重点**

**前端文件**: `frontend/src/pages/editor/components/FilePanel.tsx`
**后端文件**: `backend/src/file/file.controller.ts`, `backend/src/file/file.service.ts`

#### 7.4.1 文件上传
- [ ] 7.4.1.1 拖拽上传 → 拖拽文件到上传区域是否触发上传
- [ ] 7.4.1.2 点击上传 → 点击上传区域是否弹出文件选择器
- [ ] 7.4.1.3 文件类型限制 → 只允许 .pdf/.xml/.xpt/.txt/.xsl，其他类型是否被拒绝
- [ ] 7.4.1.4 文件大小限制 → 超过 200MB（非 .xpt）是否被拒绝
- [ ] 7.4.1.5 上传进度条 → 是否显示上传百分比
- [ ] 7.4.1.6 上传成功后 → 文件列表是否自动刷新

#### 7.4.2 文件列表显示
- [ ] 7.4.2.1 文件名 → 是否正确显示，图标是否按类型区分（PDF 红色、XML 蓝色等）
- [ ] 7.4.2.2 文件大小 → 是否正确格式化显示（KB/MB）
- [ ] 7.4.2.3 引用标记 → 引用文件是否显示蓝色 "引用" Tag

#### 7.4.3 合规状态显示 — **用户反馈: 上传 resume 显示合规**
- [ ] 7.4.3.1 合规 Tag 数据来源 → 检查前端是否正确读取 `pdfAnalysis` 字段
- [ ] 7.4.3.2 后端 PDF 分析逻辑 → 上传时是否调用 `PdfComplianceService.checkCompliance()`
- [ ] 7.4.3.3 合规判定逻辑 → 检查 `checkCompliance()` 方法:
  - 是否检查 PDF 版本（1.4-1.7 或 PDF/A）
  - 是否检查加密
  - 是否检查 JavaScript
  - 是否检查外部链接
  - 是否检查书签（>5 页时必须有）
  - 是否检查附件
  - 是否检查多媒体
- [ ] 7.4.3.4 非 PDF 文件合规 → 上传 XML/TXT 等非 PDF 文件时合规列如何显示
- [ ] 7.4.3.5 异步分析时序 → PDF 分析是异步的，上传后是否等分析完成再显示结果（还是显示为合规然后再更新）
- [ ] 7.4.3.6 错误详情弹窗 → 点击 "警告"/"错误" Tag 是否弹出合规详情 Modal
- [ ] 7.4.3.7 合规详情 Modal → 是否显示文件信息（名称、版本、页数、大小）、错误表格、警告表格
- [ ] 7.4.3.8 **关键检查**: resume PDF 的合规判定 → 一份普通 resume PDF 通常不含书签（如果 >5 页应报错）、可能含外部链接（应报错）→ 为何显示合规？需检查:
  - `pdfAnalysis` 是否真正被执行
  - 分析结果是否被正确存储到 DB
  - 前端读取分析结果的字段映射是否正确
  - `isCompliant` 判定条件是否正确（是否把所有 errors.length === 0 才合规）

#### 7.4.4 文件预览 — **用户反馈: 不可用**
- [ ] 7.4.4.1 预览按钮条件 → 是否仅对 PDF 文件显示预览按钮
- [ ] 7.4.4.2 点击预览 → 是否调用 `GET /nodes/:id/files/:fileId/preview`
- [ ] 7.4.4.3 后端预览 URL → 检查 `getPreviewUrl()` 是否返回有效的 MinIO presigned URL
- [ ] 7.4.4.4 MinIO presigned URL → URL 是否包含正确的 host（是否返回了内网 IP/docker 容器名而非可访问地址）
- [ ] 7.4.4.5 打开方式 → 是否 `window.open()` 在新窗口打开，URL 是否可从浏览器访问
- [ ] 7.4.4.6 **关键检查**: MinIO endpoint 配置 → 检查 `.env` 中 MinIO 的 `MINIO_ENDPOINT` 和 `MINIO_PUBLIC_URL` 是否配置为外部可访问地址（常见问题：容器内用 `minio:9000` 但浏览器无法访问）
- [ ] 7.4.4.7 CORS 配置 → MinIO 是否允许浏览器直接访问 presigned URL

#### 7.4.5 文件下载 — **用户反馈: 不可用**
- [ ] 7.4.5.1 点击下载 → 是否调用 `GET /nodes/:id/files/:fileId/download`
- [ ] 7.4.5.2 后端下载 URL → 检查 `getDownloadUrl()` 返回的 presigned URL
- [ ] 7.4.5.3 前端下载实现 → 是否通过创建 `<a>` 元素触发下载
- [ ] 7.4.5.4 **关键检查**: 同预览问题 → presigned URL 中的 host 是否为浏览器可访问地址
- [ ] 7.4.5.5 下载失败处理 → 是否有错误提示（而非静默失败）

#### 7.4.6 文件删除
- [ ] 7.4.6.1 删除按钮 → 是否显示确认框
- [ ] 7.4.6.2 确认删除 → 是否调用 `DELETE /nodes/:id/files/:fileId`
- [ ] 7.4.6.3 被引用文件 → 被引用的文件删除是否被阻止，是否有提示
- [ ] 7.4.6.4 删除后 → 列表是否刷新

#### 7.4.7 文件引用
- [ ] 7.4.7.1 「引用前序文件」按钮 → 是否显示并弹出引用 Modal
- [ ] 7.4.7.2 可引用文件列表 → 是否调用 `GET /nodes/:id/files/referenceable` 并正确显示
- [ ] 7.4.7.3 创建引用 → 点击后是否调用 `POST /nodes/:id/files/reference`
- [ ] 7.4.7.4 首次序列限制 → 序列号 0000 时是否无可引用文件

### 7.5 属性面板 — 信息 Tab

**前端文件**: `frontend/src/pages/editor/components/PropertiesPanel.tsx`
**后端文件**: `backend/src/ctd-template/ctd-template.controller.ts`

#### 7.5.1 文档状态选择 — **用户反馈: 有瑕疵**
- [ ] 7.5.1.1 状态下拉框选项 → 是否显示 EMPTY(未开始)/EDITING(编辑中)/COMPLETED(已完成)
- [ ] 7.5.1.2 选择状态后 → 是否调用 `PATCH /sequences/:seqId/nodes/:nodeId` 更新
- [ ] 7.5.1.3 状态回显 → 切换节点后重新选择时，是否正确回显当前状态
- [ ] 7.5.1.4 自动状态变更 → 上传文件后 EMPTY 是否自动变为 EDITING
- [ ] 7.5.1.5 APPROVED 状态 → 已审批节点的状态是否锁定不可修改
- [ ] 7.5.1.6 **检查**: 手动将 EDITING 改回 EMPTY 是否被允许（逻辑是否合理）
- [ ] 7.5.1.7 **检查**: COMPLETED 状态下是否还允许编辑文档

#### 7.5.2 操作类型选择
- [ ] 7.5.2.1 首次序列（cnsqt1/0000）→ 是否锁定为 "new" 不可选择
- [ ] 7.5.2.2 非首次序列 → 是否显示 new/replace/append/delete 四个选项
- [ ] 7.5.2.3 选择后 → 是否调用更新 API
- [ ] 7.5.2.4 操作类型校验 → 选择 replace/delete 时是否验证前序序列中有对应文件
- [ ] 7.5.2.5 **检查**: 是否调用 `POST /sequences/:seqId/nodes/:nodeId/validate-operation` 进行后端校验

#### 7.5.3 语言属性
- [ ] 7.5.3.1 选项 → zh(中文)/en(英文)/未指定 是否可选
- [ ] 7.5.3.2 选择后 → 是否调用更新 API
- [ ] 7.5.3.3 replace 操作时 → 语言是否与被替换文件一致（后端校验）

#### 7.5.4 骨架属性
- [ ] 7.5.4.1 2.3.S/3.2.S 节点 → 是否显示「活性成分」和「生产商」输入框
- [ ] 7.5.4.2 2.3.P/3.2.P 节点 → 是否显示「产品名称」「剂型」「生产商」
- [ ] 7.5.4.3 2.7.3 节点 → 是否显示「适应症」
- [ ] 7.5.4.4 非特定节点 → 是否隐藏骨架属性区域
- [ ] 7.5.4.5 属性保存 → 失焦时是否调用 `PATCH /sequences/:seqId/nodes/:nodeId/attributes`
- [ ] 7.5.4.6 属性回显 → 切换节点再切回时属性值是否保留

#### 7.5.5 文档信息
- [ ] 7.5.5.1 版本号 → 是否显示当前版本
- [ ] 7.5.5.2 字数 → 是否显示文档字数
- [ ] 7.5.5.3 最后编辑时间 → 是否正确显示

### 7.6 属性面板 — 版本 Tab

- [ ] 7.6.1 「创建版本快照」按钮 → 是否调用 `POST /nodes/:id/document/versions`
- [ ] 7.6.2 版本列表 → 是否显示所有历史版本
- [ ] 7.6.3 恢复版本 → 点击恢复按钮是否调用 `POST /nodes/:id/document/restore/:v`
- [ ] 7.6.4 恢复确认 → 是否有确认提示

### 7.7 属性面板 — 审批 Tab

**后端文件**: `backend/src/approval/approval.controller.ts`, `backend/src/approval/approval.service.ts`

- [ ] 7.7.1 审批历史 → 是否调用 `GET /nodes/:id/approval-history` 并显示时间线
- [ ] 7.7.2 「审批通过」按钮 → 权限检查（ADMIN/MANAGER 可见），点击是否调用 `POST /nodes/:id/approve`
- [ ] 7.7.3 「驳回」按钮 → 点击是否弹出原因输入框，提交是否调用 `POST /nodes/:id/reject`
- [ ] 7.7.4 「解锁」按钮 → 已审批节点是否显示此按钮，点击是否调用 `POST /nodes/:id/unlock-approval`
- [ ] 7.7.5 按钮条件显示 → DRAFT 状态下审批/驳回/解锁是否隐藏
- [ ] 7.7.6 SUBMITTED 状态 → 是否显示审批/驳回按钮
- [ ] 7.7.7 APPROVED 状态 → 是否显示解锁按钮
- [ ] 7.7.8 驳回原因 Modal → 原因是否必填，空提交是否拦截

### 7.8 属性面板 — 评论 Tab

**后端文件**: `backend/src/comment/comment.controller.ts`

- [ ] 7.8.1 评论列表 → 是否调用 `GET /nodes/:id/comments` 并正确显示
- [ ] 7.8.2 发表评论 → 输入内容提交是否调用 `POST /nodes/:id/comments`
- [ ] 7.8.3 @提及 → 输入 @ 是否弹出用户选择下拉
- [ ] 7.8.4 回复评论 → 是否支持嵌套回复
- [ ] 7.8.5 删除评论 → 自己的评论是否可删除，他人的是否隐藏删除按钮
- [ ] 7.8.6 评论后通知 → 被 @提及的用户是否收到通知

### 7.9 属性面板 — 指派 Tab — **用户反馈: 不可用**

**前端文件**: `frontend/src/pages/editor/components/PropertiesPanel.tsx`（指派部分）
**后端文件**: `backend/src/assignment/assignment.controller.ts`, `backend/src/assignment/assignment.service.ts`

- [ ] 7.9.1 当前指派列表 → 是否调用 `GET /nodes/:id/assignments` 并显示已指派用户
- [ ] 7.9.2 搜索用户 → 输入关键词是否调用 `GET /users/search?q=X`
- [ ] 7.9.3 选择用户 + 权限 → 权限下拉（EDIT/READ）是否可选
- [ ] 7.9.4 指派提交 → 是否调用 `POST /nodes/:id/assignments`
- [ ] 7.9.5 **关键检查 — 权限问题**: 指派 API 要求调用者是 OWNER → 检查后端 `assignNode()` 方法:
  - 项目角色如何判定？是否只有 OWNER 才能指派？
  - 如果当前用户不是 OWNER，是否返回 403 错误？
  - 前端是否正确处理 403 错误并显示提示？
  - **问题假设**: 可能 ADMIN/MANAGER 角色用户无法指派，因为后端只允许 OWNER
- [ ] 7.9.6 移除指派 → 点击移除是否调用 `DELETE /nodes/:id/assignments/:userId`
- [ ] 7.9.7 指派后通知 → 被指派用户是否收到通知
- [ ] 7.9.8 **检查**: 指派 Tab 在非叶节点选中时的表现

### 7.10 导出 Modal

**前端文件**: `frontend/src/pages/editor/components/ExportModal.tsx`
**后端文件**: `backend/src/export/export.controller.ts`, `backend/src/export/export.service.ts`

- [ ] 7.10.1 Modal 弹出 → 点击「导出文档」是否显示 Modal
- [ ] 7.10.2 格式选择 → Word (.docx) / PDF (eCTD compliant) Radio 是否可切换
- [ ] 7.10.3 Word 导出 → 是否调用 `POST /sequences/:id/export/word`，是否下载 .docx 文件
- [ ] 7.10.4 PDF 导出 → 是否调用 `POST /sequences/:id/export/pdf`
- [ ] 7.10.5 PDF 合规失败 → 返回合规错误时是否显示 ComplianceResult 面板
- [ ] 7.10.6 导出 loading → 按钮是否有 loading 状态
- [ ] 7.10.7 导出文件名 → 下载的文件名是否合理（章节号_标题.docx/pdf）
- [ ] 7.10.8 **检查**: 文档内容为空时导出是否处理合理（空文件 or 错误提示）

---

## 八、通知页面 (`/notifications`)

**前端文件**: `frontend/src/pages/notification/NotificationListPage.tsx`
**后端文件**: `backend/src/notification/notification.controller.ts`

### 8.1 通知列表
- [ ] 8.1.1 列表加载 → 是否调用 `GET /notifications` 并正确显示
- [ ] 8.1.2 类型 Tag → 10 种通知类型颜色是否区分
- [ ] 8.1.3 未读标识 → 未读通知是否有蓝点 + 加粗标题
- [ ] 8.1.4 分页 → 通知较多时分页是否工作

### 8.2 过滤功能
- [ ] 8.2.1 已读状态过滤 → 选择「未读」/「已读」后列表是否正确过滤
- [ ] 8.2.2 通知类型过滤 → 选择特定类型后列表是否正确过滤
- [ ] 8.2.3 清除过滤 → 清除选择后是否恢复全部显示

### 8.3 操作
- [ ] 8.3.1 标记已读 → 点击单条通知的标记已读按钮是否调用 `PATCH /notifications/:id/read`
- [ ] 8.3.2 全部已读 → 点击「全部已读」是否调用 `POST /notifications/read-all`
- [ ] 8.3.3 标记后状态 → 标记已读后蓝点和加粗是否消失
- [ ] 8.3.4 Header 未读数 → 全局 Header 中的未读数是否实时更新

---

## 九、全局通用检查

### 9.1 路由与权限
- [ ] 9.1.1 未登录访问 → 是否跳转到 `/login`
- [ ] 9.1.2 登录后访问 `/login` → 是否跳转到 Dashboard
- [ ] 9.1.3 无权限项目 → 访问非自己的项目是否显示 403 或友好提示
- [ ] 9.1.4 不存在的路由 → 是否有 404 页面

### 9.2 API 错误处理
- [ ] 9.2.1 网络错误 → 断网时操作是否有错误提示
- [ ] 9.2.2 401 未授权 → Token 过期后是否自动刷新或跳转登录
- [ ] 9.2.3 403 无权限 → 是否有 "无权限" 提示（而非空白或报错）
- [ ] 9.2.4 500 服务端错误 → 是否有通用错误提示

### 9.3 响应式与 UI
- [ ] 9.3.1 页面加载 → 数据加载时是否有 loading/skeleton 状态
- [ ] 9.3.2 空状态 → 各列表页无数据时是否有友好的空状态展示
- [ ] 9.3.3 操作反馈 → 创建/删除/更新操作是否有 success/error message 提示

### 9.4 Header 与导航
- [ ] 9.4.1 全局 Header → Logo/首页链接是否工作
- [ ] 9.4.2 通知铃铛 → 是否显示未读数 Badge，点击是否跳转到通知页
- [ ] 9.4.3 用户头像/菜单 → 是否可退出登录
- [ ] 9.4.4 退出登录 → 是否清除 Token 并跳转登录页

---

## 十、高优先级重点排查项（基于用户反馈）

> 以下是用户明确报告不可用的功能，需要**优先深入排查**:

### 10.1 文件预览不可用 (P0)
**排查路径**:
1. 检查 `FilePanel.tsx` 中预览按钮的 onClick 处理
2. 检查 `fileApi.getPreviewUrl(nodeId, fileId)` 的请求路径
3. 检查后端 `FileController.getPreviewUrl()` 返回的 URL 格式
4. 检查 MinIO `presignedGetObject()` 生成的 URL 中的 host
5. **重点**: 检查 `.env` 中 `MINIO_ENDPOINT` vs `MINIO_PUBLIC_URL` 配置
6. 验证生成的 URL 是否从浏览器可达

### 10.2 文件下载不可用 (P0)
**排查路径**: 同预览，核心是 presigned URL 的 host 问题

### 10.3 指派功能不可用 (P0)
**排查路径**:
1. 检查 PropertiesPanel 中指派 Tab 的渲染逻辑
2. 检查 `assignmentApi.assign()` 的请求参数格式
3. 检查后端 `AssignmentController.assignNode()` 的权限校验
4. 检查是否存在角色不匹配（前端用户角色 vs 后端期望角色）
5. 检查是否有前端错误被静默吞掉

### 10.4 文档状态选择有瑕疵 (P1)
**排查路径**:
1. 检查 `PropertiesPanel` 中状态 Select 的 `onChange` 处理
2. 检查 `PATCH /sequences/:seqId/nodes/:nodeId` 的请求和响应
3. 检查状态变更后是否刷新节点数据
4. 检查与审批状态的交互（审批后是否锁定）

### 10.5 合规检查疑似未执行 (P0)
**排查路径**:
1. 检查 `file.service.ts` 中上传后的 PDF 分析调用
2. 检查 `PdfComplianceService.checkCompliance()` 是否真正执行
3. 检查 `pdfAnalysis` 字段是否持久化到数据库
4. 检查前端 FilePanel 读取分析结果的字段映射
5. 检查是否是异步问题（分析未完成就显示结果）
6. **测试**: 上传一个不含书签的 >5 页 PDF，检查是否报错

---

## 执行说明

### 检查顺序
1. **第一轮**: 执行第十章（高优先级排查），找到根本原因
2. **第二轮**: 按页面顺序（第一至第九章）逐项检查前端代码与后端代码的对接
3. **第三轮**: 汇总所有问题到 `plan_10_inspection_results.md`

### 检查方法
- **代码审查**: 阅读前端组件代码中的 API 调用、事件处理、条件渲染逻辑
- **后端对照**: 对比前端调用的 API 路径/参数与后端 Controller 定义是否一致
- **Service 逻辑审查**: 检查 Service 层的业务逻辑是否正确实现
- **配置检查**: 检查 `.env`、MinIO、Redis 等基础设施配置

### 产出文件
1. `plan_10_inspection_results.md` — 每项检查的结果（PASS/FAIL/WARN + 详细说明）
2. `plan_11_fixes.md` — 基于检查结果的修正执行计划（按优先级排序，含具体代码修改方案）
