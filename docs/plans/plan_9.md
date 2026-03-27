# Plan 9 — WP-09: 多成员协同编辑与项目协作增强

## 目标

在现有项目成员基础能力（添加/移除成员、OWNER/MEMBER/VIEWER 三级角色）之上，构建完整的多成员协同编辑体系。包括：邀请机制、细粒度权限分配、章节任务指派、实时在线状态与协同感知、站内通知系统、成员工作台仪表盘。使团队可高效分工协作完成 eCTD 申报资料的撰写。

## 前置依赖

- Plan 7 完成（编辑锁、审批流程、评论功能已可用）
- Plan 3 完成（富文本编辑器可用）
- Redis 已部署（编辑锁、在线状态依赖）

## 现状分析

**已有能力:**
- `project_member` 表：OWNER / MEMBER / VIEWER 三种角色
- 后端 API：POST 添加成员、DELETE 移除成员、GET 查询成员列表
- 前端：ProjectDetailPage 成员 Tab 展示简单表格（姓名、邮箱、角色）
- 编辑锁：Redis 节点级锁，30 分钟 TTL + 心跳续期
- 审批流程：DRAFT → SUBMITTED → APPROVED/REJECTED 状态机
- 评论系统：节点级评论 + @提及

**缺失能力:**
- 无邀请机制（目前只能直接添加已注册用户）
- 无角色变更、所有权转移
- 无细粒度权限（无法控制谁能编辑哪些章节）
- 无章节任务指派（无法分配谁负责哪个章节）
- 无实时协同感知（无法看到谁在线、谁在看哪个页面）
- 无站内通知（审批、评论、@提及等事件无主动推送）
- 无成员工作仪表盘（无法一览团队分工与进度）

---

## 阶段 1: 成员管理增强

### 1.1 邮箱邀请机制
- [x] 新增 `project_invitation` 表

  | 字段 | 类型 | 说明 |
  |------|------|------|
  | id | UUID | 主键 |
  | project_id | UUID | FK→project |
  | email | VARCHAR(255) | 被邀请人邮箱 |
  | role | ENUM | 邀请角色 MEMBER/VIEWER |
  | invited_by | UUID | FK→user，邀请人 |
  | token | VARCHAR(64) | 邀请令牌（唯一） |
  | status | ENUM | PENDING/ACCEPTED/EXPIRED/CANCELLED |
  | expires_at | TIMESTAMP | 过期时间（7 天） |
  | created_at | TIMESTAMP | 创建时间 |

- [x] POST `/api/v1/projects/:id/invitations` — 创建邀请（OWNER/MANAGER）
  - 输入: email, role
  - 若用户已注册：直接添加为成员 + 发站内通知
  - 若用户未注册：生成邀请链接 + 发邮件（MVP 阶段可先只生成链接，邮件后续接入）
  - 校验：不能邀请已是成员的用户，不能重复邀请未处理的
- [x] GET `/api/v1/projects/:id/invitations` — 邀请列表（OWNER/MANAGER）
- [x] DELETE `/api/v1/projects/:id/invitations/:invitationId` — 取消邀请
- [x] POST `/api/v1/invitations/:token/accept` — 接受邀请（被邀请人调用）
  - 未注册用户接受邀请时跳转注册页，注册后自动加入项目
- [x] 邀请过期自动失效（查询时检查 expires_at）

### 1.2 角色变更与所有权转移
- [x] PATCH `/api/v1/projects/:id/members/:userId/role` — 变更成员角色
  - 仅 OWNER 可操作
  - 不能通过此接口设置 OWNER（用专门的转移接口）
  - 不能变更自己的角色
- [x] POST `/api/v1/projects/:id/transfer-ownership` — 转移所有权
  - 仅当前 OWNER 可操作
  - 目标用户必须是项目现有成员
  - 原 OWNER 降级为 MEMBER
  - 需要二次确认（前端弹窗确认）
- [x] 成员移除增强
  - 移除前检查：该成员是否有进行中的编辑锁（提示先释放）
  - 移除前检查：该成员是否有待审批的提交（提示先处理）
  - OWNER 不可被移除（必须先转移所有权）

### 1.3 前端成员管理页面增强
- [x] 成员列表增强
  - 操作列：变更角色（下拉选择）、移除成员（二次确认）
  - 仅 OWNER 显示操作列
  - 成员列增加"加入时间"列
  - 成员列增加在线状态指示灯（绿色/灰色圆点）
- [x] 邀请成员弹窗
  - 输入邮箱 + 选择角色
  - 显示待处理邀请列表，可取消
  - 邀请成功后展示邀请链接（可复制）
- [x] 所有权转移弹窗（OWNER 专属，带警告提示和二次确认）

### 1.4 验收标准
- [x] OWNER 可通过邮箱邀请新成员
- [x] 邀请链接可正常接受，用户自动加入项目
- [x] OWNER 可变更成员角色
- [x] 所有权可安全转移
- [x] 移除成员前有合理检查

---

## 阶段 2: 细粒度权限与章节指派

### 2.1 章节级权限分配
- [x] 新增 `node_assignment` 表

  | 字段 | 类型 | 说明 |
  |------|------|------|
  | id | UUID | 主键 |
  | node_id | UUID | FK→sequence_node |
  | user_id | UUID | FK→user |
  | permission | ENUM | EDIT/REVIEW/VIEW |
  | assigned_by | UUID | FK→user |
  | created_at | TIMESTAMP | 创建时间 |

  @@unique([node_id, user_id])

- [x] 权限继承规则
  - 父节点的权限自动继承到子节点（除非子节点有显式覆盖）
  - OWNER 对所有节点拥有完全权限（不受限于 assignment）
  - MEMBER 对未指派的节点拥有默认 EDIT 权限
  - VIEWER 对所有节点仅有 VIEW 权限（不受指派影响）
  - 显式指派优先于继承权限

- [x] POST `/api/v1/nodes/:nodeId/assignments` — 指派成员（OWNER/MANAGER）
  - 输入: userId, permission
  - 支持批量指派（body 为数组）
- [x] GET `/api/v1/nodes/:nodeId/assignments` — 获取节点指派列表
- [x] DELETE `/api/v1/nodes/:nodeId/assignments/:userId` — 取消指派
- [x] GET `/api/v1/sequences/:seqId/assignments/overview` — 序列全局指派总览
  - 返回每个节点的指派状态（已指派/未指派/指派人）

### 2.2 编辑权限拦截
- [x] 修改编辑锁获取逻辑：获取锁前检查用户对该节点是否有 EDIT 权限
  - 无 EDIT 权限 → 拒绝获取锁，返回 403 + "您对此章节没有编辑权限"
- [x] 修改内容保存逻辑：保存前检查权限
- [x] 修改审批提交逻辑：REVIEW 权限的成员可审批，无需系统级 MANAGER 角色
  - 保留系统级 MANAGER 的全局审批权限作为 fallback

### 2.3 前端章节指派
- [x] CTD 目录树增加指派信息展示
  - 节点名称旁显示指派人头像/姓名缩写（最多显示 2 个 + N）
  - 未指派的节点显示灰色标记
- [x] 属性面板新增"指派"Tab
  - 展示当前节点的所有指派成员及权限
  - OWNER 可添加/移除指派、变更权限级别
  - 搜索项目成员下拉选择
- [x] 序列指派总览页
  - 以 CTD 树结构展示，每个节点旁显示指派人
  - 支持批量指派：选择多个节点 → 批量设置负责人
  - 筛选：按成员筛选（查看某人负责哪些章节）
  - 未指派章节高亮提示

### 2.4 验收标准
- [x] OWNER 可对任意节点指派编辑/审阅/查看权限
- [x] 指派权限正确拦截编辑操作
- [x] 权限继承逻辑正确（父→子）
- [x] 前端正确展示指派信息和未指派提示

---

## 阶段 3: 实时协同感知（WebSocket）

### 3.1 WebSocket 基础设施
- [x] 后端集成 `@nestjs/websockets` + Socket.IO
- [x] WebSocket Gateway: `/ws/collaboration`
  - JWT 鉴权：连接时携带 access_token，验证身份
  - 自动加入项目房间（room = `project:{projectId}`）
  - 自动加入序列房间（room = `sequence:{sequenceId}`）
  - 连接/断开事件处理

### 3.2 在线状态
- [x] Redis 存储在线状态
  - Key: `presence:{projectId}:{userId}` → Value: `{ name, currentPage, currentNodeId, lastSeen }`
  - TTL: 2 分钟，前端每 60 秒心跳续期
- [x] 用户打开项目页面时上报当前位置（哪个页面、哪个节点）
- [x] WebSocket 事件:
  - `user:online` — 用户上线，广播给项目房间
  - `user:offline` — 用户下线，广播给项目房间
  - `user:location` — 用户位置变更，广播给序列房间
- [x] GET `/api/v1/projects/:id/presence` — HTTP 接口查询在线成员列表（WebSocket 不可用时的 fallback）

### 3.3 实时编辑感知
- [x] 编辑锁事件广播
  - `node:locked` — 某节点被锁定，广播给序列房间
  - `node:unlocked` — 某节点锁释放，广播给序列房间
  - 其他用户收到后实时更新 UI（无需轮询）
- [x] 内容变更事件广播
  - `node:updated` — 某节点内容保存，广播给序列房间
  - 其他查看该节点的用户收到后刷新内容
- [x] 审批状态变更广播
  - `node:approval` — 节点审批状态变化，广播给序列房间

### 3.4 前端实时 UI
- [x] 在线成员头像栏
  - 项目详情页顶部显示当前在线成员头像列表
  - 悬停显示：姓名 + 当前所在位置（如"正在编辑 3.2.S.1 物质基本信息"）
- [x] CTD 目录树实时状态
  - 编辑锁状态实时更新（不再需要轮询）
  - 其他用户编辑锁图标旁显示编辑者头像
- [x] 编辑器页面协同指示
  - 页面顶部显示"张三正在查看此章节"（基于 user:location）
  - 编辑锁被他人获取时实时切换为只读模式

### 3.5 验收标准
- [x] WebSocket 连接稳定，支持断线重连
- [x] 在线状态实时更新（上线/下线/位置变更）
- [x] 编辑锁变更实时广播，其他用户无需刷新即可看到
- [x] 内容保存和审批状态变更实时同步

---

## 阶段 4: 站内通知系统

### 4.1 通知数据模型
- [x] 新增 `notification` 表

  | 字段 | 类型 | 说明 |
  |------|------|------|
  | id | UUID | 主键 |
  | user_id | UUID | FK→user，接收人 |
  | type | ENUM | 通知类型（见下方枚举） |
  | title | VARCHAR(200) | 通知标题 |
  | content | TEXT | 通知内容 |
  | project_id | UUID | 关联项目（可选） |
  | resource_type | VARCHAR(50) | 关联资源类型（node/comment/invitation 等） |
  | resource_id | UUID | 关联资源 ID |
  | is_read | BOOLEAN | 是否已读，默认 false |
  | created_at | TIMESTAMP | 创建时间 |

- [x] 通知类型枚举 `NotificationType`:
  - `INVITATION` — 收到项目邀请
  - `ASSIGNMENT` — 被指派章节编辑任务
  - `MENTION` — 被 @提及（评论中）
  - `APPROVAL_SUBMITTED` — 有人提交了审批（通知审阅者）
  - `APPROVAL_APPROVED` — 你的提交被审批通过
  - `APPROVAL_REJECTED` — 你的提交被驳回
  - `COMMENT` — 你负责的章节收到新评论
  - `LOCK_FORCE_RELEASED` — 你的编辑锁被管理员强制释放
  - `MEMBER_ROLE_CHANGED` — 你的项目角色被变更
  - `OWNERSHIP_TRANSFERRED` — 项目所有权变更

### 4.2 通知 API
- [x] GET `/api/v1/notifications` — 我的通知列表（分页）
  - 查询参数: is_read, type, project_id
  - 返回未读数量
- [x] PATCH `/api/v1/notifications/:id/read` — 标记单条已读
- [x] POST `/api/v1/notifications/read-all` — 全部标记已读
- [x] GET `/api/v1/notifications/unread-count` — 未读数量（轻量接口，顶栏轮询用）

### 4.3 通知触发点（Service 层事件）
- [x] 邀请创建 → 通知被邀请人（若已注册）
- [x] 章节指派 → 通知被指派人
- [x] @提及 → 通知被提及人（已有 Comment.mentions 字段）
- [x] 审批提交 → 通知有 REVIEW 权限的成员 + 项目 OWNER
- [x] 审批通过/驳回 → 通知提交者
- [x] 新评论 → 通知该节点的指派编辑者（排除评论人自己）
- [x] 强制解锁 → 通知被解锁的用户
- [x] 角色变更 → 通知被变更的用户
- [x] 所有权转移 → 通知新 OWNER + 全体成员

### 4.4 实时通知推送（WebSocket 集成）
- [x] 通知创建后通过 WebSocket 实时推送给在线用户
  - WebSocket 事件: `notification:new` → 携带通知内容
  - 用户不在线时，下次登录/刷新通过 API 获取
- [x] 未读数量变更推送: `notification:count` → 更新顶栏角标

### 4.5 前端通知中心
- [x] 顶栏通知图标 + 未读角标
  - 铃铛图标，红色数字角标显示未读数
  - 点击展开通知下拉面板
- [x] 通知下拉面板
  - 按时间倒序显示最近 20 条通知
  - 区分已读/未读样式（未读加粗+蓝色圆点）
  - 点击通知跳转到对应页面（如点击审批通知跳转到对应节点）
  - "全部标为已读"按钮
  - "查看全部"链接 → 跳转通知列表页
- [x] 通知列表页 `/notifications`
  - 全量通知列表，支持分页
  - 筛选: 按类型、按项目、已读/未读
  - 批量操作: 全部已读

### 4.6 验收标准
- [x] 所有关键操作触发对应通知
- [x] WebSocket 在线推送通知实时到达
- [x] 未读角标数量准确
- [x] 点击通知正确跳转到对应页面
- [x] 通知的已读/未读状态管理正确

---

## 阶段 5: 成员工作台与进度仪表盘

### 5.1 个人工作台（Dashboard）
- [x] 页面路由: `/dashboard` （登录后默认首页）
- [x] "我的待办"卡片
  - 我被指派的待编辑章节（按项目分组）
  - 待我审阅的提交（REVIEW 权限 + SUBMITTED 状态）
  - 待处理的邀请
- [x] "我的最近编辑"卡片
  - 最近编辑的 5 个节点（基于 activity_log 查询）
  - 点击可直接跳转到编辑器
- [x] "我的项目"卡片
  - 参与的所有项目列表，显示角色和项目进度概要

### 5.2 项目协作看板
- [x] 页面入口: 项目详情页新增"协作"Tab
- [x] 团队进度总览
  - 横向进度条: 总节点数 / 已完成（APPROVED）节点数
  - 按模块（M1-M5）分别展示进度
- [x] 成员工作量分布
  - 表格或卡片展示每个成员:
    - 指派的章节数
    - 已完成（APPROVED）数
    - 编辑中（有编辑锁）数
    - 待审阅数
- [x] 章节状态看板（可选 Kanban 视图）
  - 列: 未开始 | 编辑中 | 待审阅 | 已通过 | 已驳回
  - 卡片: 章节名称 + 负责人头像
  - 支持拖拽（仅辅助可视化，不触发状态变更）

### 5.3 后端 API
- [x] GET `/api/v1/dashboard/my-tasks` — 我的待办
  - 返回: 待编辑节点列表、待审阅节点列表、待处理邀请数
- [x] GET `/api/v1/dashboard/recent-edits` — 我的最近编辑
- [x] GET `/api/v1/projects/:id/collaboration/progress` — 项目进度总览
  - 返回: 各模块节点数、已完成数、进度百分比
- [x] GET `/api/v1/projects/:id/collaboration/workload` — 成员工作量分布
  - 返回: 每个成员的指派/完成/进行中/待审阅数量

### 5.4 验收标准
- [x] 个人工作台正确展示待办事项和最近编辑
- [x] 项目协作看板正确展示团队进度和成员工作量
- [x] 数据实时准确（基于 assignment + approval_status + 编辑锁状态）

---

## 阶段 6: 成员操作审计增强

### 6.1 审计日志扩展
- [x] 在已有 `activity_log` 中增加新的 action 类型:
  - `INVITE` — 邀请成员
  - `INVITE_ACCEPT` — 接受邀请
  - `ROLE_CHANGE` — 角色变更
  - `OWNERSHIP_TRANSFER` — 所有权转移
  - `ASSIGN` — 章节指派
  - `UNASSIGN` — 取消指派
- [x] 所有成员管理操作写入审计日志（不可删除）

### 6.2 成员活动时间线
- [x] GET `/api/v1/projects/:id/members/:userId/activity` — 某成员在项目中的活动时间线
  - 返回该成员的所有操作日志（编辑、审批、评论等）
  - 支持按时间范围筛选
- [x] 前端: 成员详情抽屉中展示活动时间线

### 6.3 验收标准
- [x] 所有成员管理操作均记录审计日志
- [x] 成员活动时间线完整可查

---

## 技术方案摘要

### 数据库变更
| 操作 | 表 | 说明 |
|------|-------|------|
| 新增 | `project_invitation` | 邀请机制 |
| 新增 | `node_assignment` | 章节指派 |
| 新增 | `notification` | 站内通知 |
| 修改 | `activity_log` | 新增 action 枚举值 |

### 后端新增模块
| 模块 | 说明 |
|------|------|
| `invitation` | 邀请服务（或放在 project 模块内） |
| `assignment` | 章节指派服务 |
| `notification` | 通知服务 |
| `collaboration-gateway` | WebSocket Gateway |
| `dashboard` | 工作台聚合查询 |

### 前端新增页面/组件
| 页面/组件 | 路由/位置 |
|-----------|----------|
| 通知中心下拉面板 | 全局 Layout 顶栏 |
| 通知列表页 | `/notifications` |
| 个人工作台 | `/dashboard` |
| 邀请成员弹窗 | ProjectDetailPage 成员 Tab |
| 章节指派面板 | PropertiesPanel 新增"指派"Tab |
| 指派总览页 | 序列编辑器新增 Tab |
| 协作看板 | ProjectDetailPage 新增"协作"Tab |

### WebSocket 事件清单
| 事件 | 方向 | 说明 |
|------|------|------|
| `user:online` | Server→Client | 成员上线 |
| `user:offline` | Server→Client | 成员下线 |
| `user:location` | Client→Server→Client | 位置变更广播 |
| `node:locked` | Server→Client | 编辑锁获取 |
| `node:unlocked` | Server→Client | 编辑锁释放 |
| `node:updated` | Server→Client | 节点内容变更 |
| `node:approval` | Server→Client | 审批状态变更 |
| `notification:new` | Server→Client | 新通知推送 |
| `notification:count` | Server→Client | 未读数变更 |

## 开发顺序建议

```
阶段 1 (成员管理) → 阶段 2 (权限指派) → 阶段 4 (通知系统) → 阶段 3 (WebSocket) → 阶段 5 (仪表盘) → 阶段 6 (审计增强)
```

建议先做阶段 1+2（核心权限能力），再做阶段 4（通知，不依赖 WebSocket，先用轮询），然后接入阶段 3（WebSocket 升级为实时推送），最后做阶段 5+6（锦上添花）。

## 总体验收标准

- [x] OWNER 可邀请/移除/变更角色/转移所有权
- [x] 章节级权限指派正确控制编辑/审阅权限
- [x] WebSocket 实时同步在线状态和编辑锁状态
- [x] 站内通知覆盖所有关键事件，实时推送
- [x] 个人工作台和项目看板为团队提供清晰的分工与进度视图
- [x] 所有协作操作留有完整审计日志
