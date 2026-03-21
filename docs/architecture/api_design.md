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

## 8. CTD 目录结构 `/api/v1/sequences/:seqId/nodes`

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | `/tree` | 获取完整 CTD 目录树（含状态、必填标记） | 成员 |
| GET | `/:id` | 获取节点详情（含骨架属性） | 成员 |
| PATCH | `/:id` | 更新节点信息（标题、operation、xml_lang） | EDITOR+ |
| PATCH | `/:id/attributes` | 更新骨架属性（substance/manufacturer/indication 等） | EDITOR+ |
| POST | `/:parentId/extension` | 创建扩展节点（仅 3.2.R 章节，仅生物制品） | EDITOR+ |
| DELETE | `/:id` | 删除扩展节点 | EDITOR+ |
| PATCH | `/:id/sort` | 调整节点排序 | EDITOR+ |

## 9. CTD 模板 `/api/v1/ctd-templates`

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | `/tree` | 获取 CTD 目录模板树 | ALL |
| GET | `/tree?appType=cnapt2&ratType=cnrat1` | 按申请类型+注册行为类型过滤并标记必填章节 | ALL |

## 10. 文档编辑 `/api/v1/nodes/:nodeId/document`

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | `/` | 获取文档内容（TipTap JSON） | 成员 |
| PUT | `/` | 保存文档内容（自动保存调用，含 xml_lang） | EDITOR+ |
| GET | `/versions` | 获取文档版本列表 | 成员 |
| GET | `/versions/:version` | 获取特定版本内容 | 成员 |
| POST | `/versions` | 创建版本快照 | EDITOR+ |
| POST | `/restore/:version` | 恢复到指定版本 | EDITOR+ |

## 11. 文件管理 `/api/v1/nodes/:nodeId/files`

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| POST | `/upload` | 上传文件（自动命名规范化、MD5 计算、PDF 合规分析） | EDITOR+ |
| GET | `/` | 获取节点下的文件列表 | 成员 |
| GET | `/:id` | 获取文件详情（含 PDF 合规分析结果） | 成员 |
| GET | `/:id/download` | 下载文件（presigned URL） | 成员 |
| GET | `/:id/preview` | 预览文件（presigned URL） | 成员 |
| DELETE | `/:id` | 删除文件 | EDITOR+ |
| POST | `/:id/reference` | 创建文件引用（同一申请跨序列复用） | EDITOR+ |

## 12. STF 管理 `/api/v1/nodes/:nodeId/stf`

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | `/` | 获取 STF 数据 | 成员 |
| PUT | `/` | 保存/更新 STF 数据（study-id, title, categories, file-tags） | EDITOR+ |
| GET | `/preview-xml` | 预览生成的 STF XML | 成员 |

## 13. 文档导出 `/api/v1/sequences/:seqId/export`

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| POST | `/word` | 导出单个章节为 Word | EDITOR+ |
| POST | `/word/batch` | 批量导出为 Word（按模块或全部） | EDITOR+ |
| POST | `/pdf` | 导出单个章节为 PDF（自动合规检查） | EDITOR+ |
| POST | `/pdf/batch` | 批量导出为 PDF | EDITOR+ |
| POST | `/ectd-package` | 生成完整 eCTD 提交包（含验证，有错误则阻止） | MANAGER+ |
| GET | `/status/:taskId` | 查询导出任务进度 | 成员 |
| GET | `/download/:taskId` | 下载导出结果 | 成员 |

## 14. eCTD 验证 `/api/v1/sequences/:seqId/validation`

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| POST | `/run` | 执行完整 eCTD 验证（80+ 条规则） | EDITOR+ |
| GET | `/latest` | 获取最新验证报告 | 成员 |
| GET | `/reports` | 获取历史验证报告列表 | 成员 |
| GET | `/reports/:id` | 获取验证报告详情（含每条规则结果） | 成员 |

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
