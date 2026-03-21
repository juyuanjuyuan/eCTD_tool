# 技术栈选型与项目目录结构

## 1. 技术栈总览

| 层级 | 技术 | 版本 | 选型理由 |
|------|------|------|---------|
| **后端框架** | NestJS | ^10 | 企业级 Node.js 框架，模块化架构，TypeScript 原生支持 |
| **ORM** | Prisma | ^6 | 类型安全的数据库访问，自动迁移，可视化管理 |
| **数据库** | PostgreSQL | 16 | 支持 JSON 字段、全文搜索，适合文档类应用 |
| **缓存** | Redis | 7 | 会话管理、编辑锁、序列号生成 |
| **前端框架** | React | ^19 | 生态成熟，组件丰富 |
| **UI 组件库** | Ant Design Pro | ^6 | 企业级中后台方案，表格/表单/布局开箱即用 |
| **富文本编辑器** | TipTap | ^2 | 基于 ProseMirror，可深度定制，支持协同编辑 |
| **Word 导出** | docx | ^9 | 纯 JS 生成 .docx，支持复杂样式和目录 |
| **PDF 导出** | Puppeteer | ^23 | Chrome 无头浏览器渲染，样式还原度高 |
| **XML 处理** | fast-xml-parser | ^4 | 高性能 XML 解析/生成，支持 DTD |
| **MD5 计算** | crypto (Node.js) | 内置 | 生成 eCTD 文件校验值 |
| **文件存储** | MinIO | latest | S3 兼容对象存储，适合大量 PDF 文件管理 |
| **容器化** | Docker + Compose | latest | 统一开发/生产环境 |

## 2. 后端目录结构

```
backend/
├── src/
│   ├── main.ts                          # 应用入口
│   ├── app.module.ts                    # 根模块
│   ├── common/                          # 公共模块
│   │   ├── decorators/                  # 自定义装饰器
│   │   ├── filters/                     # 异常过滤器
│   │   ├── guards/                      # 认证/权限守卫
│   │   ├── interceptors/               # 响应拦截器
│   │   ├── pipes/                       # 参数校验管道
│   │   └── dto/                         # 公共 DTO（分页等）
│   ├── auth/                            # 认证模块
│   │   ├── auth.module.ts
│   │   ├── auth.controller.ts
│   │   ├── auth.service.ts
│   │   ├── jwt.strategy.ts
│   │   └── dto/
│   ├── user/                            # 用户管理模块
│   ├── project/                         # 项目管理模块（一个项目 = 一个药品申请）
│   │   ├── project.module.ts
│   │   ├── project.controller.ts
│   │   ├── project.service.ts
│   │   └── dto/
│   ├── application/                     # 申请管理模块（信封申请级别属性，创建后不可变）
│   │   ├── application.module.ts
│   │   ├── application.controller.ts
│   │   ├── application.service.ts
│   │   └── dto/
│   ├── regulatory-activity/             # 注册行为管理模块（信封注册行为级别属性）
│   │   ├── regulatory-activity.module.ts
│   │   ├── regulatory-activity.controller.ts
│   │   ├── regulatory-activity.service.ts
│   │   └── dto/
│   ├── sequence/                        # 序列管理模块（序列号、序列类型、联系人）
│   ├── controlled-vocabulary/           # 受控词汇模块（4种申请类型×9种注册行为×4种序列类型关联）
│   │   ├── controlled-vocabulary.module.ts
│   │   ├── controlled-vocabulary.controller.ts
│   │   ├── controlled-vocabulary.service.ts  # CV 解析与级联查询
│   │   └── dto/
│   ├── ctd-structure/                   # CTD 目录结构模块
│   │   ├── ctd-structure.module.ts
│   │   ├── ctd-structure.service.ts     # CTD 五模块目录树管理
│   │   ├── ctd-template.service.ts      # CTD 章节模板
│   │   ├── completeness.service.ts      # 内容完整性规则 (4.3.x)
│   │   └── dto/
│   ├── document/                        # 文档编辑模块
│   │   ├── document.module.ts
│   │   ├── document.controller.ts
│   │   ├── document.service.ts          # 文档 CRUD、版本管理
│   │   ├── document-content.service.ts  # 富文本内容存取
│   │   └── dto/
│   ├── export/                          # 文档导出模块
│   │   ├── export.module.ts
│   │   ├── export.controller.ts
│   │   ├── word-export.service.ts       # Word (.docx) 导出
│   │   ├── pdf-export.service.ts        # PDF 导出（Puppeteer 渲染）
│   │   ├── pdf-compliance.service.ts    # PDF 合规性检查（26 条规则）
│   │   └── template/                    # 导出模板（CSS 样式、字体配置）
│   ├── ectd/                            # eCTD 核心模块
│   │   ├── ectd.module.ts
│   │   ├── xml-backbone.service.ts      # index.xml / cn-regional.xml 生成
│   │   ├── md5-checksum.service.ts      # MD5 校验值计算与 index-md5.txt 生成
│   │   ├── validator.service.ts         # eCTD 验证标准实现（80+ 条规则）
│   │   ├── lifecycle.service.ts         # 叶元素生命周期状态机（new/replace/append/delete）
│   │   ├── stf.service.ts              # 研究标签文件（模块四五必须）
│   │   ├── envelope.service.ts          # 信封元素管理（12 个属性，不可变性约束）
│   │   └── package-assembler.service.ts # eCTD 提交包组装
│   ├── file/                            # 文件存储模块
│   │   ├── file.module.ts
│   │   ├── file.controller.ts
│   │   ├── file.service.ts             # MinIO 文件操作
│   │   ├── file-name-normalizer.service.ts  # 文件命名规范化（a-z 0-9 - _ 仅允许）
│   │   └── dto/
│   └── prisma/                          # Prisma 服务
│       ├── prisma.module.ts
│       └── prisma.service.ts
├── prisma/
│   ├── schema.prisma                    # 数据库 Schema
│   ├── migrations/                      # 迁移文件
│   └── seed.ts                          # 种子数据（CTD 目录结构、受控词汇）
├── test/
├── package.json
├── tsconfig.json
└── nest-cli.json
```

## 3. 前端目录结构

```
frontend/
├── src/
│   ├── main.tsx                         # 应用入口
│   ├── app.tsx                          # 根组件
│   ├── routes/                          # 路由配置
│   ├── layouts/                         # 布局组件
│   │   ├── BasicLayout.tsx              # 标准侧边栏布局
│   │   └── EditorLayout.tsx             # 编辑器全屏布局
│   ├── pages/                           # 页面
│   │   ├── auth/                        # 登录/注册
│   │   ├── dashboard/                   # 工作台
│   │   ├── project/                     # 项目管理
│   │   │   ├── list/                    # 项目列表
│   │   │   └── detail/                  # 项目详情
│   │   ├── application/                 # 申请管理
│   │   ├── sequence/                    # 序列管理
│   │   ├── editor/                      # 文档编辑（核心页面）
│   │   │   ├── index.tsx                # 编辑器主页面
│   │   │   ├── CTDTreePanel.tsx         # 左侧 CTD 目录树
│   │   │   ├── EditorPanel.tsx          # 中间编辑区
│   │   │   ├── PropertiesPanel.tsx      # 右侧属性面板
│   │   │   └── components/
│   │   ├── export/                      # 导出管理
│   │   ├── validation/                  # eCTD 验证
│   │   └── settings/                    # 系统设置
│   ├── components/                      # 公共组件
│   │   ├── CTDTree/                     # CTD 目录树组件
│   │   ├── RichEditor/                  # TipTap 编辑器封装
│   │   ├── FileUploader/               # 文件上传组件
│   │   └── PDFViewer/                   # PDF 预览组件
│   ├── services/                        # API 请求
│   ├── stores/                          # 状态管理 (Zustand)
│   ├── hooks/                           # 自定义 Hooks
│   ├── utils/                           # 工具函数
│   └── types/                           # TypeScript 类型定义
├── public/
├── package.json
├── tsconfig.json
└── vite.config.ts
```

## 4. Docker Compose 服务

```yaml
services:
  postgres:     # PostgreSQL 16
  redis:        # Redis 7
  minio:        # MinIO 对象存储
  backend:      # NestJS 后端
  frontend:     # React 前端 (Vite dev server)
```
