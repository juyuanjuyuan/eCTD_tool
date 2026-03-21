# Plan 1 — WP-01: 基础平台搭建与 eCTD 规范数据冻结

## 目标

搭建项目基础架构，**冻结 eCTD 规范核心数据**: 受控词汇体系、编号规则、信封元素验证、申请类型-注册行为-序列类型关联矩阵。确保所有后续模块基于正确的法规数据运行。

## 阶段 0: eCTD 规范数据冻结（最高优先级）

### 0.1 受控词汇解析与入库
- [ ] 解析 `cv-application-type.xml` — 4 种申请类型:
  - cnapt1 临床试验申请 | cnapt2 新药申请 | cnapt3 仿制药申请 | cnapt4 原料药申请
- [ ] 解析 `cv-product-type.xml` — 2 种产品类型:
  - cnprt1 化学药品 | cnprt2 生物制品
- [ ] 解析 `cv-regulatory-activity-type.xml` — 9 种注册行为类型:
  - cnrat1 首次申请 | cnrat2 补充申请 | cnrat3 备案 | cnrat4 报告 | cnrat5 新适应症和联合用药 | cnrat6 新适应症 | cnrat7 研发期间安全性报告 | cnrat8 再注册 | cnrat9 基线
- [ ] 解析 `cv-sequence-type.xml` — 4 种序列类型:
  - cnsqt1 首次提交 | cnsqt2 回复 | cnsqt3 撤回 | cnsqt4 格式转换
- [ ] 受控词汇版本管理: 每个代码有 version、valid-from、valid-to 属性，系统需按提交日期选用有效版本

### 0.2 申请类型-注册行为-序列类型关联矩阵
- [ ] 解析 `depend-apt-rat-sqt.xml`，建立三级关联:
  - cnapt1（临床试验）→ 支持 cnrat1/cnrat2/cnrat5/cnrat7/cnrat9
  - cnapt2（新药申请）→ 支持 cnrat1/cnrat2/cnrat3/cnrat4/cnrat6/cnrat8/cnrat9
  - cnapt3（仿制药）→ 支持 cnrat1/cnrat2/cnrat3/cnrat4/cnrat6/cnrat8/cnrat9
  - cnapt4（原料药）→ 支持 cnrat1/cnrat2/cnrat3/cnrat4/cnrat8/cnrat9
- [ ] 每种注册行为类型下支持的序列类型联动
- [ ] 前端创建序列时，选择申请类型后级联过滤可选的注册行为类型和序列类型

### 0.3 eCTD 编号规则确认
- [ ] **原始编号**: 10 位数字 = 4 位年份 + 6 位流水号（如 2026123456）
- [ ] **申请编号**: 字母前缀 + 4 位年份 + 5 位流水号（如 x202612345）
  - 前缀规则: x=化学药品临床/新药/仿制药, y=生物制品, l=进口药品, s=原料药
  - 申请编号在创建后不可更改（跨序列不可变）
- [ ] **序列号**: 4 位数字，从 0000 开始递增，同一注册行为内连续（不允许跳号）
- [ ] 编号唯一性验证（全局唯一）

### 0.4 信封元素规则确认（cn-regional.xml 的 cn-envelope）
- [ ] 信封包含 3 个层级共 12 个属性，**所有属性均为必填**:
  - 申请级别（创建后不可变）: application-id, application-type(受控词汇), product-type(受控词汇), product-number
  - 注册行为级别（同一注册行为内不可变）: related-sequence, regulatory-activity-type(受控词汇)
  - 序列级别: sequence-number, sequence-type(受控词汇), sequence-description, sequence-contact(name/phone/email)
- [ ] 受控词汇属性值必须使用代码名称（如 cnapt2），不使用显示值

### 0.5 角色权限矩阵
- [ ] ADMIN: 用户管理、项目管理
- [ ] MANAGER: 项目管理、审批、强制解锁
- [ ] EDITOR: 文档编辑、文件上传
- [ ] VIEWER: 只读

## 阶段 1: 后端脚手架

### 1.1 NestJS 项目初始化
- [ ] 创建 NestJS 项目 (`nest new backend`)
- [ ] 配置 TypeScript 严格模式
- [ ] 配置 ESLint + Prettier
- [ ] 配置环境变量 (.env)
- [ ] 配置 CORS

### 1.2 数据库与 ORM
- [ ] 配置 Prisma ORM
- [ ] 编写 `schema.prisma`:
  - user 表
  - project 表
  - project_member 表
  - application 表（含 application_type, product_type, product_number 等信封级属性）
  - regulatory_activity 表（含 regulatory_activity_type, related_sequence）
  - sequence 表（含 sequence_number, sequence_type, sequence_description, contact 信息）
  - controlled_vocabulary 表（存储解析后的受控词汇及版本信息）
  - cv_dependency 表（存储申请类型-注册行为-序列类型关联）
- [ ] 执行首次迁移
- [ ] 创建 PrismaModule / PrismaService

### 1.3 受控词汇服务
- [ ] 创建 `ControlledVocabularyModule`
- [ ] XML 解析服务: 启动时自动解析所有 cv-*.xml 和 depend-apt-rat-sqt.xml
- [ ] GET `/api/v1/cv/application-types` — 获取申请类型列表
- [ ] GET `/api/v1/cv/product-types` — 获取产品类型列表
- [ ] GET `/api/v1/cv/regulatory-activity-types?appType=cnapt2` — 按申请类型过滤注册行为类型
- [ ] GET `/api/v1/cv/sequence-types?appType=cnapt2&ratType=cnrat1` — 按申请类型+注册行为过滤序列类型
- [ ] 受控词汇缓存 (Redis)

### 1.4 公共模块
- [ ] 统一响应拦截器 (TransformInterceptor)
- [ ] 全局异常过滤器 (AllExceptionsFilter)
- [ ] 分页 DTO (PaginationDto)
- [ ] 参数校验管道 (ValidationPipe)

## 阶段 2: 认证模块

### 2.1 后端
- [ ] AuthModule: 注册、登录、Token 刷新
- [ ] JwtStrategy + JwtAuthGuard
- [ ] RolesGuard + @Roles() 装饰器
- [ ] UserModule: 用户 CRUD (ADMIN 管理)
- [ ] 密码 bcrypt 加密

### 2.2 前端
- [ ] React + Vite 项目初始化
- [ ] Ant Design Pro 布局集成
- [ ] 登录页面
- [ ] 路由守卫 (ProtectedRoute)
- [ ] Axios 拦截器 (Token 管理)

## 阶段 3: 项目管理

### 3.1 后端
- [ ] ProjectModule: 创建/列表/详情/更新/归档
- [ ] 项目成员管理 (添加/移除成员)
- [ ] 按当前用户的项目成员身份过滤项目列表
- [ ] 原始编号生成服务（4位年份 + 6位流水号，全局唯一校验）

### 3.2 前端
- [ ] 项目列表页 (ProTable)
- [ ] 创建项目弹窗
- [ ] 项目详情页（Tab 页: 概览/申请/成员）

## 阶段 4: 申请与序列管理（含信封元素验证）

### 4.1 申请管理后端
- [ ] ApplicationModule: 创建/列表/详情/更新
- [ ] 创建申请时:
  - 必填: 申请类型(受控词汇)、产品类型(受控词汇)、原始编号
  - 自动生成申请编号（前缀根据产品类型和申请类型决定）
  - 验证原始编号格式（10位数字）
  - 验证申请编号唯一性
- [ ] **申请创建后，申请级别信封属性不可修改**（application-id, application-type, product-type, product-number）

### 4.2 注册行为管理后端
- [ ] RegulatoryActivityModule: 创建/列表
- [ ] 创建注册行为时:
  - 验证 regulatory-activity-type 在当前申请类型下是否允许（依据 depend-apt-rat-sqt.xml）
  - 设置 related-sequence（关联上一个序列号，首次为 0000）
- [ ] **同一注册行为内，注册行为级别信封属性不可修改**

### 4.3 序列管理后端
- [ ] SequenceModule: 创建/列表/详情/更新
- [ ] 创建序列时:
  - 序列号自动递增（同一注册行为内从 0000 开始）
  - 验证序列号连续性（不允许跳号）
  - 验证 sequence-type 在当前申请类型+注册行为类型下是否允许
  - 必填: sequence-type, sequence-description, sequence-contact(name/phone/email)
- [ ] 序列状态: DRAFT → EDITING → VALIDATING → EXPORTED → SUBMITTED

### 4.4 前端
- [ ] 申请管理页面（嵌入项目详情 Tab）
- [ ] 创建申请弹窗:
  - 申请类型下拉（从受控词汇 API 获取）
  - 产品类型下拉（受控词汇联动）
  - 原始编号输入（格式校验）
  - 申请编号自动生成预览
- [ ] 注册行为管理（申请详情页 Tab）
- [ ] 创建序列弹窗:
  - 注册行为类型→序列类型**级联选择**（根据关联矩阵过滤）
  - 序列描述输入
  - 联系人信息填写
- [ ] 序列详情页（进入编辑器的入口）

## 阶段 5: Docker 开发环境

- [ ] docker-compose.yml (PostgreSQL + Redis + MinIO)
- [ ] 后端 Dockerfile (开发模式)
- [ ] .dockerignore
- [ ] 种子数据脚本: 导入受控词汇、关联矩阵

## 验收标准

- [ ] 受控词汇正确解析并可通过 API 查询
- [ ] 申请类型→注册行为类型→序列类型级联选择正确
- [ ] 申请编号按规则自动生成，前缀正确
- [ ] 序列号从 0000 自动递增，不允许跳号
- [ ] 信封元素不可变性约束正确执行（申请级别创建后不可改、注册行为级别同一活动内不可改）
- [ ] 用户可注册/登录，权限控制正常
- [ ] Docker 一键启动开发环境
