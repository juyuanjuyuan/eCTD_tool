# Plan 7 — WP-07: 协作、审批流程与电子签章

## 目标

实现多用户协作编辑支持、文档审批流程，以及 eCTD 要求的电子签章功能（技术规范 3.10）。确保团队可高效协作完成 eCTD 申报资料的撰写。

## 前置依赖

- Plan 3 完成（编辑器可用）
- Plan 6 完成（文件管理可用）

## 阶段 1: 编辑锁与并发控制

### 1.1 编辑锁机制
- [x] 使用 Redis 实现节点级编辑锁
- [x] 用户打开某个 CTD 节点编辑时获取锁
- [x] 锁定信息: 锁定人、锁定时间、过期时间 (30 分钟)
- [x] 其他用户看到"xx 正在编辑"提示，进入只读模式
- [x] 用户离开页面或关闭编辑器时释放锁
- [x] 心跳续期（每 5 分钟自动续期）
- [x] 管理员可强制解锁

### 1.2 编辑锁 API
- [x] POST `/api/v1/nodes/:nodeId/lock` — 获取编辑锁
- [x] DELETE `/api/v1/nodes/:nodeId/lock` — 释放编辑锁
- [x] GET `/api/v1/nodes/:nodeId/lock` — 查询锁状态
- [x] DELETE `/api/v1/nodes/:nodeId/lock/force` — 强制解锁 (MANAGER+)

## 阶段 2: 文档审批流程

### 2.1 审批状态机
```
DRAFT → SUBMITTED → APPROVED / REJECTED
                              ↓
                           DRAFT (修改后重新提交)
```

### 2.2 后端审批 API
- [x] POST `/api/v1/nodes/:nodeId/submit` — 提交审批
- [x] POST `/api/v1/nodes/:nodeId/approve` — 审批通过 (MANAGER+)
- [x] POST `/api/v1/nodes/:nodeId/reject` — 审批驳回 (MANAGER+)
  - 需要填写驳回理由
- [x] GET `/api/v1/sequences/:seqId/approval-status` — 序列审批总览
- [x] 审批通过的节点不允许再编辑（除非 MANAGER 解锁）
- [x] **必填章节（内容完整性规则）必须全部审批通过才能生成 eCTD 包**

### 2.3 前端审批界面
- [x] CTD 目录树显示审批状态图标（草稿/待审/已通过/已驳回）
- [x] 提交审批按钮（编辑器顶栏）
- [x] 审批操作面板（MANAGER 视图）
- [x] 驳回理由展示
- [x] 审批历史记录

## 阶段 3: 电子签章（技术规范 3.10）

### 3.1 电子签章规则
eCTD 规范要求以下 6 类章节的 PDF 文件必须加盖电子签章:
- [x] cn-1-0 说明函
- [x] cn-1-2 申请表
- [x] cn-1-3-8 SME 减免费用申请
- [x] cn-1-10 上市后变更
- [x] cn-1-11 申请人/生产企业证明性文件
- [x] cn-1-12 小微企业证明文件

### 3.2 电子签章实现
- [x] 在需要电子签章的章节节点上标记 `requires_e_seal = true`
- [x] 导出 eCTD 包时检查: 需要电子签章的章节是否已签章
- [x] 电子签章方式（两种选择）:
  - **方案 A**: 集成第三方电子签章 SDK（如果需要在线签章）
  - **方案 B**: 提醒用户使用 CDE 提供的免费"PDF 批量电子签章软件"离线签章后上传（MVP 推荐）
- [x] 方案 B 实现:
  - 导出需要签章的 PDF 文件列表
  - 用户使用 CDE 签章工具签章后重新上传
  - 系统检测上传的 PDF 是否包含有效签章
  - 更新 MD5 值（签章后文件内容改变）

### 3.3 签章验证
- [x] 检查需要签章章节的 PDF 是否包含电子签章
- [x] 未签章的必签章节在验证报告中标记为警告
- [x] 导出 eCTD 包前汇总签章状态

## 阶段 4: 评论与批注

### 4.1 节点评论
- [x] comment 表 (node_id, user_id, content, parent_id, created_at)
- [x] POST `/api/v1/nodes/:nodeId/comments` — 添加评论
- [x] GET `/api/v1/nodes/:nodeId/comments` — 获取评论列表
- [x] DELETE `/api/v1/nodes/:nodeId/comments/:id` — 删除评论
- [x] 支持回复（嵌套评论）
- [x] @提及用户 — Comment.mentions JSON 字段 + 用户搜索 API + 前端 @ 触发下拉选择 + 提及高亮

### 4.2 前端评论面板
- [x] 属性面板中的评论 Tab
- [x] 评论输入框
- [x] 评论列表（时间排序）

## 阶段 5: 操作日志

### 5.1 审计日志
- [x] activity_log 表 (user_id, action, resource, resource_id, detail, created_at)
- [x] 记录关键操作: 创建/编辑/删除文档、上传文件、提交审批、导出、签章
- [x] GET `/api/v1/sequences/:seqId/activity-log` — 操作日志列表
- [x] 日志不可删除（审计合规）

## 验收标准

- [x] 同一节点同一时间仅一人可编辑
- [x] 编辑锁正常获取/释放/过期/强制解锁
- [x] 文档可提交审批、审批通过/驳回流程正常
- [x] 审批通过的文档不可再编辑
- [x] 需要电子签章的 6 类章节有明确标识
- [x] 签章状态检查功能可用
- [x] 必填章节全部审批通过才能生成 eCTD 包
- [x] 节点评论功能可用
- [x] 操作日志完整记录
