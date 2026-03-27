# API 接口清单

## 1. 认证模块 `/api/v1/auth`

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| POST | `/register` | 用户注册 | 公开 |
| POST | `/login` | 用户登录，返回 JWT | 公开 |
| POST | `/refresh` | 刷新 Token | 已登录 |
| POST | `/logout` | 退出登录 | 已登录 |
| GET | `/me` | 获取当前用户信息 | 已登录 |

## 2. 用户管理 `/api/v1/users`

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | `/` | 用户列表（分页） | ADMIN |
| GET | `/:id` | 用户详情 | ADMIN |
| PATCH | `/:id` | 更新用户信息 | ADMIN |
| DELETE | `/:id` | 禁用用户 | ADMIN |
| PATCH | `/:id/role` | 修改用户角色 | ADMIN |

## 3. 项目管理 `/api/v1/projects`

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| POST | `/` | 创建项目 | EDITOR+ |
| GET | `/` | 项目列表（分页，按成员过滤） | ALL |
| GET | `/:id` | 项目详情 | 成员 |
| PATCH | `/:id` | 更新项目信息 | OWNER/MANAGER |
| DELETE | `/:id` | 归档项目 | OWNER |
| POST | `/:id/members` | 添加项目成员 | OWNER/MANAGER |
| DELETE | `/:id/members/:userId` | 移除项目成员 | OWNER/MANAGER |

## 4. 申请管理 `/api/v1/projects/:projectId/applications`

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| POST | `/` | 创建申请（自动生成申请编号，信封申请级别属性创建后不可变） | EDITOR+ |
| GET | `/` | 申请列表 | 成员 |
| GET | `/:id` | 申请详情 | 成员 |
| DELETE | `/:id` | 删除申请（仅草稿状态且无序列） | MANAGER+ |

## 5. 注册行为管理 `/api/v1/applications/:appId/regulatory-activities`

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| POST | `/` | 创建注册行为（验证类型关联合法性） | EDITOR+ |
| GET | `/` | 注册行为列表 | 成员 |
| GET | `/:id` | 注册行为详情（含序列列表） | 成员 |

## 6. 序列管理 `/api/v1/regulatory-activities/:raId/sequences`

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| POST | `/` | 创建序列（自动生成序列号，验证类型关联合法性） | EDITOR+ |
| GET | `/` | 序列列表 | 成员 |
| GET | `/:id` | 序列详情（含 CTD 目录树概况、内容完整性统计） | 成员 |
| PATCH | `/:id` | 更新序列信息（描述、联系人、序列类型） | EDITOR+ |
| DELETE | `/:id` | 删除序列（仅草稿状态） | MANAGER+ |
| POST | `/:id/initialize` | 初始化序列目录结构（根据申请类型+注册行为类型生成 CTD 树） | EDITOR+ |
| GET | `/:id/completeness` | 获取内容完整性检查结果（必填章节完成情况） | 成员 |

## 7. 受控词汇 `/api/v1/cv`

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | `/application-types` | 申请类型列表（cnapt1-4） | ALL |
| GET | `/product-types` | 产品类型列表（cnprt1-2） | ALL |
| GET | `/regulatory-activity-types?appType=cnapt2` | 按申请类型过滤的注册行为类型列表 | ALL |
| GET | `/sequence-types?appType=cnapt2&ratType=cnrat1` | 按申请类型+注册行为类型过滤的序列类型列表 | ALL |
| GET | `/stf-valid-values` | STF 合法标签值（species/route/duration/control/file-tag） | ALL |

## 8. CTD 目录结构 `/api/v1/sequences/:seqId`

| 方法 | 路径 | 说明 | 权限 | 状态 |
|------|------|------|------|------|
| POST | `/initialize` | 初始化序列 CTD 目录树（从模板复制，标记必填，设置 operation） | EDITOR+ | ✅ |
| GET | `/nodes/tree` | 获取完整 CTD 目录树（含状态、必填标记） | 成员 | ✅ |
| PATCH | `/nodes/:nodeId` | 更新节点信息（status、operation、title） | EDITOR+ | ✅ |
| PATCH | `/nodes/:nodeId/attributes` | 更新骨架属性（substance/manufacturer/indication 等） | EDITOR+ | ✅ |
| POST | `/nodes/:parentNodeId/extensions` | 创建扩展节点（仅 3.2.R 章节，仅生物制品） | EDITOR+ | ✅ |
| DELETE | `/nodes/:nodeId/extension` | 删除扩展节点 | EDITOR+ | ✅ |
| GET | `/completeness` | 获取内容完整性检查结果（必填章节完成情况、模块统计） | 成员 | ✅ |
| GET | `/preview-required` | 初始化前预览必填章节清单（按申请类型+注册行为类型） | 成员 | ✅ |
| GET | `/nodes/:id` | 获取节点详情（含骨架属性） | 成员 | 待开发 |
| PATCH | `/nodes/:id/sort` | 调整节点排序 | EDITOR+ | 待开发 |

## 9. CTD 模板 `/api/v1/ctd-templates`

| 方法 | 路径 | 说明 | 权限 | 状态 |
|------|------|------|------|------|
| GET | `/tree` | 获取 CTD 目录模板树（229 节点，6 级嵌套） | ALL | ✅ |
| GET | `/extension-options` | 获取扩展节点类型列表（3.2.R.1~3.2.R.6） | ALL | ✅ |
| GET | `/tree?appType=cnapt2&ratType=cnrat1` | 按申请类型+注册行为类型过滤并标记必填章节 | ALL | ✅ |

## 10. 文档编辑 `/api/v1/nodes/:nodeId/document` ✅ (WP-03 已实现)

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | `/` | 获取文档内容（TipTap JSON） | 成员 |
| PUT | `/` | 保存文档内容（自动保存调用，含 xml_lang） | EDITOR+ |
| GET | `/versions` | 获取文档版本列表 | 成员 |
| GET | `/versions/:version` | 获取特定版本内容 | 成员 |
| POST | `/versions` | 创建版本快照 | EDITOR+ |
| POST | `/restore/:version` | 恢复到指定版本 | EDITOR+ |

## 11. 文件管理 `/api/v1/nodes/:nodeId/files` ✅ (WP-06 已实现)

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| POST | `/upload` | 上传单文件（自动命名规范化、MD5 计算、PDF 合规分析、MinIO 存储） | EDITOR+ |
| POST | `/upload-batch` | 批量上传文件（最多20个） | EDITOR+ |
| GET | `/` | 获取节点下的文件列表（含 PDF 分析结果） | 成员 |
| GET | `/:id` | 获取文件详情（含 PDF 合规分析结果） | 成员 |
| GET | `/:id/download` | 下载文件（返回 presigned URL） | 成员 |
| GET | `/:id/preview` | 预览文件（返回 presigned URL，inline） | 成员 |
| DELETE | `/:id` | 删除文件（检查引用关系，同步删除 MinIO） | EDITOR+ |
| POST | `/reference` | 创建文件引用（同一申请跨序列复用，验证前序存在性） | EDITOR+ |
| GET | `/referenceable` | 列出可引用的前序序列文件 | 成员 |

### 11.1 编辑器图片上传 `/api/v1/sequences/:seqId/editor`

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| POST | `/upload-image` | 上传编辑器图片到 MinIO（PNG/JPG/GIF/SVG，≤10MB） | EDITOR+ |

## 12. STF 管理 `/api/v1/nodes/:nodeId/stf` ✅ (WP-05 已实现)

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | `/` | 获取 STF 数据 | 成员 |
| PUT | `/` | 保存/更新 STF 数据（study-id, title, categories, file-tags） | EDITOR+ |

## 12b. STF 参考数据 `/api/v1/stf` ✅ (WP-05 已实现)

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | `/categories` | 获取 STF category 名称和合法值（从 valid-values.xml） | 已登录 |
| GET | `/file-tags` | 获取 STF file-tag 合法值列表（145+ 标签） | 已登录 |

## 13. 文档导出 `/api/v1/sequences/:seqId/export` ✅ (WP-04 已实现)

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| POST | `/word` | 导出单个章节为 Word | EDITOR+ |
| POST | `/word/batch` | 批量导出为 Word（按模块或全部） | EDITOR+ |
| POST | `/pdf` | 导出单个章节为 PDF（自动合规检查） | EDITOR+ |
| POST | `/pdf/batch` | 批量导出为 PDF | EDITOR+ |
| GET | `/status/:taskId` | 查询导出任务进度 | 成员 |
| GET | `/download/:taskId` | 下载批量导出结果（MinIO presigned URL） | 成员 |

## 13b. eCTD 包导出 `/api/v1/sequences/:seqId/export` ✅ (WP-05 已实现)

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | `/ectd-preview` | 预览 eCTD 包文件结构树 | 成员 |
| POST | `/ectd-package` | 生成完整 eCTD 提交包 ZIP（含验证前置，有错误则阻止） | MANAGER+ |

## 13c. XML 骨架预览 `/api/v1/sequences/:seqId/xml` ✅ (WP-05 已实现)

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | `/cn-regional` | 预览 cn-regional.xml（模块一骨架） | 成员 |
| GET | `/index` | 预览 index.xml（模块二至五 ICH 骨架） | 成员 |

## 14. eCTD 验证 `/api/v1/sequences/:seqId/validate` ✅ (WP-05 已实现)

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| POST | `/` | 执行完整 eCTD 验证（80+ 条规则，6 大类） | EDITOR+ |
| GET | `/latest` | 获取最新验证报告 | 成员 |
| GET | `/report/:id` | 获取验证报告详情（含每条规则结果） | 成员 |

## 14b. 生命周期操作 ✅ (WP-05 已实现)

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| POST | `/api/v1/sequences/:seqId/nodes/:nodeId/validate-operation` | 验证操作是否合法（状态转换表+首序列规则） | EDITOR+ |
| GET | `/api/v1/sequences/:seqId/parallel-conflicts` | 检测并行变更冲突 | 成员 |
| POST | `/api/v1/sequences/:seqId/withdraw-preview` | 预览撤回序列自动生成的操作 | EDITOR+ |

## 15. 编辑锁 `/api/v1/nodes/:nodeId/lock`

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| POST | `/` | 获取编辑锁（30 分钟过期，5 分钟心跳续期） | EDITOR+ |
| DELETE | `/` | 释放编辑锁 | EDITOR+ |
| GET | `/` | 查询锁状态（谁在编辑） | 成员 |
| DELETE | `/force` | 强制解锁 | MANAGER+ |

## 16. 审批 `/api/v1/nodes/:nodeId/approval`

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| POST | `/submit` | 提交审批 | EDITOR+ |
| POST | `/approve` | 审批通过（通过后不可再编辑） | MANAGER+ |
| POST | `/reject` | 审批驳回（需填写理由） | MANAGER+ |
| GET | `/history` | 审批历史 | 成员 |

## 17. 审批总览 `/api/v1/sequences/:seqId/approval-status`

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | `/` | 序列审批总览（各节点审批状态汇总） | 成员 |

## 18. 评论 `/api/v1/nodes/:nodeId/comments`

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| POST | `/` | 添加评论 | EDITOR+ |
| GET | `/` | 评论列表 | 成员 |
| DELETE | `/:id` | 删除评论 | 评论者/MANAGER+ |

## 19. 操作日志 `/api/v1/sequences/:seqId/activity-log`

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | `/` | 操作日志列表（分页） | 成员 |

## 20. 项目邀请 `/api/v1/projects/:id/invitations` ✅ (WP-09 已实现)

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| POST | `/` | 创建邀请（输入 email+role，已注册用户直接加入+通知，未注册生成邀请链接） | OWNER/MANAGER |
| GET | `/` | 邀请列表（含 PENDING/ACCEPTED/EXPIRED/CANCELLED） | OWNER/MANAGER |
| DELETE | `/:invitationId` | 取消邀请 | OWNER/MANAGER |

### 20.1 接受邀请 `/api/v1/invitations`

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| POST | `/:token/accept` | 接受邀请（校验令牌有效性和过期时间，自动加入项目） | 已登录 |

## 21. 成员角色与所有权 `/api/v1/projects/:id` ✅ (WP-09 已实现)

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| PATCH | `/members/:userId/role` | 变更成员角色（不能设 OWNER，不能变更自己） | OWNER |
| POST | `/transfer-ownership` | 转移所有权（目标须为现有成员，原 OWNER 降级为 MEMBER） | OWNER |

## 22. 章节指派 `/api/v1/nodes/:nodeId/assignments` ✅ (WP-09 已实现)

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| POST | `/` | 指派成员（输入 userId+permission，支持批量，触发 ASSIGNMENT 通知） | OWNER/MANAGER |
| GET | `/` | 获取节点指派列表（含权限继承信息） | 成员 |
| DELETE | `/:userId` | 取消指派 | OWNER/MANAGER |

### 22.1 序列指派总览 `/api/v1/sequences/:seqId/assignments`

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | `/overview` | 序列全局指派总览（每个节点的指派状态和指派人） | 成员 |

## 23. 通知 `/api/v1/notifications` ✅ (WP-09 已实现)

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | `/` | 我的通知列表（分页，查询参数: is_read/type/project_id） | 已登录 |
| PATCH | `/:id/read` | 标记单条已读 | 已登录 |
| POST | `/read-all` | 全部标记已读 | 已登录 |
| GET | `/unread-count` | 未读数量（轻量接口，顶栏轮询/WebSocket 推送用） | 已登录 |

## 24. 在线状态 `/api/v1/projects/:id/presence` ✅ (WP-09 已实现)

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | `/` | 查询在线成员列表（WebSocket 不可用时的 HTTP fallback） | 成员 |

## 25. 工作台 `/api/v1/dashboard` ✅ (WP-09 已实现)

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | `/my-tasks` | 我的待办（待编辑节点+待审阅节点+待处理邀请数） | 已登录 |
| GET | `/recent-edits` | 我的最近编辑（最近 5 个节点，含项目名+序列号） | 已登录 |

## 26. 项目协作 `/api/v1/projects/:id/collaboration` ✅ (WP-09 已实现)

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | `/progress` | 项目进度总览（按模块 M1-M5 统计节点数/已完成数/百分比） | 成员 |
| GET | `/workload` | 成员工作量分布（每人指派数/完成数/编辑中数/待审阅数） | 成员 |

## 27. 成员活动 `/api/v1/projects/:projectId/members/:userId/activity` ✅ (WP-09 已实现)

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | `/` | 某成员在项目中的活动时间线（支持按时间范围筛选） | 成员 |
