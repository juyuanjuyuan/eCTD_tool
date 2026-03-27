# 数据库设计

## 1. ER 关系概览

```
User (1) ──< (N) ProjectMember >── (1) Project
Project (1) ──< (N) Application
Application (1) ──< (N) RegulatoryActivity
RegulatoryActivity (1) ──< (N) Sequence
Sequence (1) ──< (N) SequenceNode (CTD 目录树节点)
SequenceNode (1) ──< (1) Document (文档内容)
SequenceNode (1) ──< (N) FileAttachment (上传的 PDF 等文件)
Document (1) ──< (N) DocumentVersion (历史版本)
Sequence (1) ──< (N) ValidationReport
ValidationReport (1) ──< (N) ValidationItem
SequenceNode (1) ──< (N) Comment
SequenceNode (1) ──< (N) NodeAssignment >── (1) User
Project (1) ──< (N) ProjectInvitation
User (1) ──< (N) Notification
```

## 2. 表设计

### 2.1 用户相关

#### `user` — 用户表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| email | VARCHAR(255) | 邮箱（唯一） |
| password_hash | VARCHAR(255) | 密码哈希 |
| name | VARCHAR(100) | 姓名 |
| phone | VARCHAR(20) | 电话 |
| role | ENUM | ADMIN/MANAGER/EDITOR/VIEWER |
| status | ENUM | ACTIVE/DISABLED |
| created_at | TIMESTAMP | 创建时间 |
| updated_at | TIMESTAMP | 更新时间 |

### 2.2 项目与申请

#### `project` — 项目表（一个项目对应一个药品）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| name | VARCHAR(200) | 项目名称（药品名称） |
| description | TEXT | 项目描述 |
| status | ENUM | DRAFT/ACTIVE/ARCHIVED |
| created_by | UUID | 创建人 FK→user |
| created_at | TIMESTAMP | 创建时间 |
| updated_at | TIMESTAMP | 更新时间 |

#### `project_member` — 项目成员表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| project_id | UUID | FK→project |
| user_id | UUID | FK→user |
| role | ENUM | OWNER/MEMBER/VIEWER |

#### `application` — 申请表（信封申请级别属性，创建后不可变）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| project_id | UUID | FK→project |
| application_number | VARCHAR(15) | 申请编号（如 x202612345），唯一，创建后不可变 |
| application_type_code | VARCHAR(10) | 申请类型受控词汇代码（cnapt1/cnapt2/cnapt3/cnapt4），创建后不可变 |
| application_type_version | VARCHAR(10) | 受控词汇版本号（如 1.1） |
| product_type_code | VARCHAR(10) | 产品类型受控词汇代码（cnprt1/cnprt2），创建后不可变 |
| product_type_version | VARCHAR(10) | 受控词汇版本号（如 1.0） |
| product_number | VARCHAR(10) | 原始编号（10位数字: 年份4位+流水号6位），创建后不可变 |
| created_at | TIMESTAMP | 创建时间 |
| updated_at | TIMESTAMP | 更新时间 |

#### `regulatory_activity` — 注册行为表（信封注册行为级别属性，同一活动内不可变）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| application_id | UUID | FK→application |
| regulatory_activity_type_code | VARCHAR(10) | 注册行为类型代码（cnrat1-cnrat9），同一活动内不可变 |
| regulatory_activity_type_version | VARCHAR(10) | 受控词汇版本号 |
| related_sequence | CHAR(4) | 相关序列号（首次为 0000），同一活动内不可变 |
| created_at | TIMESTAMP | 创建时间 |

#### `sequence` — 序列表（信封序列级别属性）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| regulatory_activity_id | UUID | FK→regulatory_activity |
| sequence_number | CHAR(4) | 序列号（0000-9999），同一活动内自动递增 |
| sequence_type_code | VARCHAR(10) | 序列类型代码（cnsqt1/cnsqt2/cnsqt3/cnsqt4） |
| sequence_type_version | VARCHAR(10) | 受控词汇版本号 |
| description | VARCHAR(500) | 序列描述 |
| contact_name | VARCHAR(100) | 联系人姓名 |
| contact_phone | VARCHAR(20) | 联系人电话 |
| contact_email | VARCHAR(255) | 联系人邮箱 |
| status | ENUM | DRAFT/EDITING/VALIDATING/EXPORTED/SUBMITTED |
| created_at | TIMESTAMP | 创建时间 |
| updated_at | TIMESTAMP | 更新时间 |

### 2.3 受控词汇

#### `controlled_vocabulary` — 受控词汇表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| vocabulary_name | VARCHAR(50) | 词汇类别名（application-type/product-type/regulatory-activity-type/sequence-type） |
| code | VARCHAR(10) | 代码名称（如 cnapt1, cnprt1, cnrat1, cnsqt1） |
| version | VARCHAR(10) | 版本号 |
| valid_from | DATE | 生效日期 |
| valid_to | DATE | 失效日期（可空，空表示永久有效） |
| description_zh | VARCHAR(200) | 中文描述 |
| description_en | VARCHAR(200) | 英文描述 |

#### `cv_dependency` — 受控词汇关联表（申请类型→注册行为→序列类型三级关联）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| application_type_code | VARCHAR(10) | 申请类型代码 |
| regulatory_activity_type_code | VARCHAR(10) | 注册行为类型代码 |
| sequence_type_code | VARCHAR(10) | 序列类型代码（可空，表示所有序列类型都允许） |
| version | VARCHAR(10) | 关联关系版本号 |

### 2.4 CTD 目录结构

#### `ctd_template_node` — CTD 目录模板（系统预置，229 节点）✅ 已实现

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| parent_id | UUID | 父节点 FK→self（自引用树结构） |
| module | SMALLINT | 模块号（1-5） |
| element_name | VARCHAR(120) | XML 元素名（唯一，如 cn-1-0, m2-3-s-drug-substance） |
| ctd_section_number | VARCHAR(20) | CTD 章节号（如 1.0, 2.3.S, 3.2.P.4.1） |
| title_zh | VARCHAR(500) | 中文标题 |
| title_en | VARCHAR(500) | 英文标题 |
| node_type | ENUM | MODULE(5)/SECTION(43)/LEAF(180)/EXTENSION_POINT(1) |
| is_leaf | BOOLEAN | 是否为叶节点（可放置文件） |
| requires_stf | BOOLEAN | 是否需要 STF（48个: 模块四 4.2.X 和模块五 5.3.1-5.3.5 叶节点） |
| requires_e_seal | BOOLEAN | 是否需要电子签章（6个: cn-1-0, cn-1-2, cn-1-3-8, cn-1-10, cn-1-11, cn-1-12） |
| allows_extension | BOOLEAN | 是否允许扩展子节点（仅 3.2.R） |
| sort_order | INT | 排序序号 |

数据来源: `element-property_CN.xml`（模块一71节点）+ `element-property_ICH.xml`（模块二至五158节点）

#### `ctd_completeness_rule` — 内容完整性规则表（验证标准 4.3.x）✅ 已实现

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| application_type_code | VARCHAR(10) | 申请类型代码 |
| regulatory_activity_type_code | VARCHAR(10) | 注册行为类型代码 |
| template_node_id | UUID | FK→ctd_template_node |
| rule_type | ENUM | REQUIRED(90条)/FORBIDDEN(40条) |
| severity | ENUM | ERROR/WARNING |

已导入130条规则，覆盖验证标准 4.3.1-4.3.11

#### `sequence_node` — 序列目录节点（实例化的 CTD 树）✅ 已实现

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| sequence_id | UUID | FK→sequence |
| template_node_id | UUID | FK→ctd_template_node |
| parent_id | UUID | 父节点 FK→self（自引用树结构） |
| element_name | VARCHAR(120) | XML 元素名 |
| ctd_section_number | VARCHAR(20) | CTD 章节号 |
| title | VARCHAR(500) | 标题（默认取模板中文标题） |
| operation | ENUM | NEW/REPLACE/APPEND/DELETE（叶节点的生命周期操作，非叶节点为空） |
| status | ENUM | EMPTY/EDITING/COMPLETED |
| is_required | BOOLEAN | 是否必填（根据内容完整性规则计算） |
| is_leaf | BOOLEAN | 是否为叶节点 |
| sort_order | INT | 排序序号 |
| substance | VARCHAR(200) | 骨架属性: 活性成分（2.3.S/3.2.S 节点） |
| manufacturer | VARCHAR(200) | 骨架属性: 生产商（2.3.S/3.2.S/2.3.P/3.2.P 节点） |
| product_name | VARCHAR(200) | 骨架属性: 产品名称（2.3.P/3.2.P 节点） |
| dosage_form | VARCHAR(200) | 骨架属性: 剂型（2.3.P/3.2.P 节点） |
| indication | VARCHAR(500) | 骨架属性: 适应症（2.7.3 节点） |
| approval_status | ApprovalStatus | 审批状态（默认 DRAFT） |
| submitted_by | UUID? | 提交审批的用户 ID |
| submitted_at | TIMESTAMP? | 提交审批时间 |
| approved_by | UUID? | 审批人用户 ID |
| approved_at | TIMESTAMP? | 审批时间 |
| rejection_reason | TEXT? | 驳回理由 |

### 2.5 文档内容 ✅ (WP-03 已实现)

#### `document` — 文档表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| node_id | UUID | FK→sequence_node (唯一，一个叶节点一个文档) |
| content_json | JSONB | TipTap 编辑器 JSON 内容 |
| content_html | TEXT | 渲染后的 HTML（用于导出） |
| content_text | TEXT | 纯文本（用于搜索/字数统计） |
| word_count | INT | 字数统计（中文字符+英文词） |
| version | INT | 版本号（每次保存自增） |
| xml_lang | VARCHAR(10) | 语言属性: zh/en/空 |
| created_by | UUID | 创建人 |
| updated_by | UUID | 最后编辑人 |
| created_at | TIMESTAMP | 创建时间 |
| updated_at | TIMESTAMP | 更新时间 |

#### `document_version` — 文档版本历史表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| document_id | UUID | FK→document |
| version | INT | 快照时的版本号 |
| content_json | JSONB | 该版本的内容快照 |
| content_html | TEXT | 该版本的 HTML |
| word_count | INT | 该版本字数 |
| xml_lang | VARCHAR(10) | 该版本语言属性 |
| created_by | UUID | 创建人 |
| created_at | TIMESTAMP | 创建时间 |

### 2.6 文件管理 ✅ (WP-05 已实现)

#### `file_attachment` — 文件附件表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| sequence_node_id | UUID | FK→sequence_node |
| original_name | VARCHAR(255) | 原始文件名 |
| stored_name | VARCHAR(255) | 存储文件名（eCTD 规范命名） |
| storage_path | VARCHAR(500) | MinIO 存储路径 |
| ectd_relative_path | VARCHAR(180) | eCTD 包中的相对路径（用于 xlink:href） |
| file_type | VARCHAR(10) | 文件类型（pdf/xml/xpt/txt/xsl） |
| file_size | BIGINT | 文件大小（字节） |
| md5_checksum | CHAR(32) | MD5 校验值 |
| xml_lang | VARCHAR(10) | 语言属性（zh/en/空） |
| is_reference | BOOLEAN | 是否为引用（引用其他序列的文件，非实体文件） |
| reference_file_id | UUID | 引用的原始文件 FK→file_attachment（文件复用时） |
| uploaded_by | UUID | FK→user |
| created_at | TIMESTAMP | 创建时间 |

#### `file_pdf_analysis` — PDF 合规分析结果表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| file_attachment_id | UUID | FK→file_attachment (唯一) |
| pdf_version | VARCHAR(10) | PDF 版本（如 1.4, 1.7, PDF/A-1） |
| page_count | INT | 页数 |
| has_bookmarks | BOOLEAN | 是否有书签 |
| bookmark_zoom_inherit | BOOLEAN | 书签放大率是否为 Inherit Zoom |
| is_encrypted | BOOLEAN | 是否加密 |
| has_javascript | BOOLEAN | 是否包含 JavaScript |
| has_external_links | BOOLEAN | 是否包含外部链接（URL/mailto） |
| has_attachments | BOOLEAN | 是否包含附件/嵌入式文件 |
| has_multimedia | BOOLEAN | 是否包含音频/视频/3D 对象 |
| is_text_searchable | BOOLEAN | 文本是否可搜索 |
| fonts_embedded | BOOLEAN | 字体是否嵌入 |
| has_e_seal | BOOLEAN | 是否有电子签章 |
| compliance_status | ENUM | PASS/WARNING/ERROR |
| compliance_details | JSONB | 详细合规检查结果 |
| analyzed_at | TIMESTAMP | 分析时间 |

### 2.7 STF（研究标签文件）✅ (WP-05 已实现)

#### `study_tagging_file` — STF 表（模块四五的研究标签）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| sequence_node_id | UUID | FK→sequence_node |
| study_title | VARCHAR(500) | 研究标题 |
| study_id | VARCHAR(100) | 研究编号 |
| categories | JSONB | 分类属性（species/route-of-admin/duration/type-of-control） |
| file_tags | JSONB | 文件标签列表（file-tag name 值，取自 valid-values.xml） |
| stf_xml_content | TEXT | 生成的 STF XML 内容 |
| operation | ENUM | new/replace/append/delete |
| created_at | TIMESTAMP | 创建时间 |
| updated_at | TIMESTAMP | 更新时间 |

### 2.8 验证 ✅ (WP-05 已实现)

#### `validation_report` — 验证报告表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| sequence_id | UUID | FK→sequence |
| total_errors | INT | 错误数 |
| total_warnings | INT | 警告数 |
| total_infos | INT | 提示信息数 |
| is_passed | BOOLEAN | 是否通过（无错误） |
| created_at | TIMESTAMP | 验证时间 |

#### `validation_item` — 验证明细表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| report_id | UUID | FK→validation_report |
| rule_code | VARCHAR(10) | 规则编号（如 2.1, 3.14, 4.3.1, 6.19） |
| rule_category | VARCHAR(50) | 规则类别（基础识别/文件夹/ICH骨架/区域信息/STF/PDF） |
| severity | ENUM | ERROR/WARNING/INFO |
| description | TEXT | 规则描述 |
| detail | TEXT | 具体问题详情 |
| file_path | VARCHAR(500) | 涉及的文件路径 |
| suggestion | TEXT | 修复建议 |

### 2.9 协作

#### `comment` — 评论表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| sequence_node_id | UUID | FK→sequence_node |
| user_id | UUID | FK→user |
| content | TEXT | 评论内容 |
| parent_id | UUID | 父评论 FK→self（回复） |
| created_at | TIMESTAMP | 创建时间 |

#### `activity_log` — 操作日志表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| user_id | UUID | FK→user |
| action | VARCHAR(50) | 操作类型（CREATE/EDIT/DELETE/UPLOAD/APPROVE/REJECT/EXPORT/SIGN） |
| resource | VARCHAR(50) | 资源类型（document/file/sequence/node） |
| resource_id | UUID | 资源 ID |
| detail | JSONB | 操作详情 |
| created_at | TIMESTAMP | 操作时间 |

### 2.10 协作增强（WP-09）

#### `project_invitation` — 项目邀请表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| project_id | UUID | FK→project |
| email | VARCHAR(255) | 被邀请人邮箱 |
| role | ENUM(InvitationRole) | 邀请角色: MEMBER/VIEWER |
| invited_by | UUID | FK→user，邀请人 |
| token | VARCHAR(64) | 邀请令牌（唯一） |
| status | ENUM(InvitationStatus) | PENDING/ACCEPTED/EXPIRED/CANCELLED |
| expires_at | TIMESTAMP | 过期时间（创建后 7 天） |
| created_at | TIMESTAMP | 创建时间 |

#### `node_assignment` — 章节指派表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| node_id | UUID | FK→sequence_node |
| user_id | UUID | FK→user |
| permission | ENUM(NodePermission) | EDIT/REVIEW/VIEW |
| assigned_by | UUID | FK→user，指派人 |
| created_at | TIMESTAMP | 创建时间 |

@@unique([node_id, user_id]) — 同一节点同一用户仅一条指派记录

#### `notification` — 通知表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| user_id | UUID | FK→user，接收人 |
| type | ENUM(NotificationType) | 通知类型 |
| title | VARCHAR(200) | 通知标题 |
| content | TEXT | 通知内容 |
| project_id | UUID | 关联项目（可选） |
| resource_type | VARCHAR(50) | 关联资源类型（node/comment/invitation 等） |
| resource_id | UUID | 关联资源 ID |
| is_read | BOOLEAN | 是否已读，默认 false |
| created_at | TIMESTAMP | 创建时间 |

## 3. 索引设计

```sql
-- 高频查询索引
CREATE INDEX idx_application_project ON application(project_id);
CREATE INDEX idx_reg_activity_application ON regulatory_activity(application_id);
CREATE INDEX idx_sequence_reg_activity ON sequence(regulatory_activity_id);
CREATE INDEX idx_sequence_node_sequence ON sequence_node(sequence_id);
CREATE INDEX idx_document_node ON document(sequence_node_id);
CREATE INDEX idx_file_node ON file_attachment(sequence_node_id);
CREATE INDEX idx_project_member ON project_member(project_id, user_id);
CREATE INDEX idx_cv_vocabulary ON controlled_vocabulary(vocabulary_name, code);
CREATE INDEX idx_cv_dep ON cv_dependency(application_type_code, regulatory_activity_type_code);
CREATE INDEX idx_completeness_rule ON ctd_completeness_rule(application_type_code, regulatory_activity_type_code);
CREATE INDEX idx_stf_node ON study_tagging_file(sequence_node_id);
CREATE INDEX idx_comment_node ON comment(sequence_node_id);
CREATE INDEX idx_activity_log ON activity_log(resource, resource_id);
CREATE INDEX idx_invitation_project ON project_invitation(project_id);
CREATE INDEX idx_invitation_email ON project_invitation(email);
CREATE INDEX idx_assignment_node ON node_assignment(node_id);
CREATE INDEX idx_assignment_user ON node_assignment(user_id);
CREATE INDEX idx_notification_user ON notification(user_id, is_read);
CREATE INDEX idx_notification_project ON notification(project_id);

-- 唯一约束
CREATE UNIQUE INDEX idx_user_email ON "user"(email);
CREATE UNIQUE INDEX idx_seq_number ON sequence(regulatory_activity_id, sequence_number);
CREATE UNIQUE INDEX idx_app_number ON application(application_number);
CREATE UNIQUE INDEX idx_document_node_unique ON document(sequence_node_id);
CREATE UNIQUE INDEX idx_pdf_analysis_unique ON file_pdf_analysis(file_attachment_id);
CREATE UNIQUE INDEX idx_invitation_token ON project_invitation(token);
CREATE UNIQUE INDEX idx_assignment_node_user ON node_assignment(node_id, user_id);
```

## 4. 枚举定义

```typescript
// 系统角色
enum Role { ADMIN, MANAGER, EDITOR, VIEWER }
enum ProjectStatus { DRAFT, ACTIVE, ARCHIVED }
enum ProjectMemberRole { OWNER, MEMBER, VIEWER }

// 受控词汇代码（使用 NMPA 官方代码，不使用自定义枚举）
// 申请类型: cnapt1(临床试验), cnapt2(新药), cnapt3(仿制药), cnapt4(原料药)
// 产品类型: cnprt1(化学药品), cnprt2(生物制品)
// 注册行为类型: cnrat1-cnrat9
// 序列类型: cnsqt1(首次提交), cnsqt2(回复), cnsqt3(撤回), cnsqt4(格式转换)

// 序列状态
enum SequenceStatus { DRAFT, EDITING, VALIDATING, EXPORTED, SUBMITTED }

// CTD 节点
enum NodeType { MODULE, SECTION, LEAF, EXTENSION_POINT }
enum NodeOperation { NEW, REPLACE, APPEND, DELETE }
enum NodeStatus { EMPTY, EDITING, COMPLETED }
enum ApprovalStatus { DRAFT, SUBMITTED, APPROVED, REJECTED }

// 验证
enum Severity { ERROR, WARNING, INFO }
enum ComplianceStatus { PASS, WARNING, ERROR }

// 日志
enum ActionType { CREATE, EDIT, DELETE, UPLOAD, APPROVE, REJECT, EXPORT, SIGN, INVITE, INVITE_ACCEPT, ROLE_CHANGE, OWNERSHIP_TRANSFER, ASSIGN, UNASSIGN }

// 邀请 (WP-09)
enum InvitationStatus { PENDING, ACCEPTED, EXPIRED, CANCELLED }

// 章节指派权限 (WP-09)
enum NodePermission { EDIT, REVIEW, VIEW }

// 通知类型 (WP-09)
enum NotificationType {
  INVITATION,              // 收到项目邀请
  ASSIGNMENT,              // 被指派章节编辑任务
  MENTION,                 // 被 @提及
  APPROVAL_SUBMITTED,      // 有人提交审批
  APPROVAL_APPROVED,       // 提交被审批通过
  APPROVAL_REJECTED,       // 提交被驳回
  COMMENT,                 // 负责章节收到新评论
  LOCK_FORCE_RELEASED,     // 编辑锁被强制释放
  MEMBER_ROLE_CHANGED,     // 项目角色被变更
  OWNERSHIP_TRANSFERRED    // 项目所有权变更
}
```

## 5. 关键设计说明

### 5.1 受控词汇使用代码而非枚举
申请类型等属性使用 VARCHAR 存储 NMPA 官方代码（如 cnapt2），而非自定义枚举值。原因:
- 受控词汇文件带版本号和有效期，版本更新时仅需更新 controlled_vocabulary 表
- 三级关联关系通过 cv_dependency 表管理，支持动态查询
- 前端级联选择直接使用代码查询

### 5.2 信封属性不可变性
- application 表的 application_number, application_type_code, product_type_code, product_number 创建后不可 UPDATE
- regulatory_activity 表的 regulatory_activity_type_code, related_sequence 创建后不可 UPDATE
- 通过 Service 层逻辑和数据库触发器双重保障

### 5.3 文件复用（跨序列引用）
- file_attachment.is_reference = true 表示引用其他序列的文件
- reference_file_id 指向原始文件记录
- 骨架文件中 xlink:href 使用相对路径指向原文件位置
- 不允许跨 application 引用
