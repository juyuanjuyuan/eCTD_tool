# 前端架构设计

## 1. 页面模块

### 1.1 页面清单

| 模块 | 路由 | 说明 | 权限 |
|------|------|------|------|
| 登录 | `/login` | 登录/注册页 | 公开 |
| 工作台 | `/dashboard` | 项目概览、最近编辑、待办任务 | ALL |
| 项目列表 | `/projects` | 项目（药品）列表 CRUD | EDITOR+ |
| 项目详情 | `/projects/:id` | 项目下的申请、序列管理 | EDITOR+ |
| 申请管理 | `/projects/:id/applications` | 申请编号、类型管理 | EDITOR+ |
| 序列管理 | `/projects/:id/applications/:appId/sequences` | 序列号、注册行为管理 | EDITOR+ |
| **文档编辑** | `/editor/:sequenceId` | **核心页面** — CTD 目录树 + 富文本编辑器 | EDITOR+ |
| 导出中心 | `/export/:sequenceId` | Word/PDF 导出、eCTD 包生成 | EDITOR+ |
| 验证报告 | `/validation/:sequenceId` | eCTD 验证结果查看 | VIEWER+ |
| 文件管理 | `/files/:sequenceId` | 上传/管理 PDF、附件文件 | EDITOR+ |
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

### 2.1 CTD 目录树组件 (`CTDTree`)

- 基于 Ant Design `Tree` 组件
- 展示 CTD 五模块目录结构（约 200+ 节点）
- 支持:
  - 点击节点切换编辑区内容
  - 叶节点显示多维状态图标:
    - 内容状态（空/编辑中/已完成）
    - 审批状态（草稿/待审/通过/驳回）
    - 文件合规状态（合规/警告/错误）
    - 需要 STF 标记（模块四五的 4.2.X/5.3.1-5.3.5）
    - 需要电子签章标记（cn-1-0/cn-1-2/cn-1-3-8/cn-1-10/cn-1-11/cn-1-12）
  - 必填章节醒目标识（根据 4.3.x 内容完整性规则标红）
  - 拖拽排序（仅限扩展节点）
  - 右键菜单（新建扩展子节点仅对生物制品 3.2.R、上传文件、删除）
  - 搜索过滤节点

### 2.2 富文本编辑器 (`RichEditor`)

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

### 2.3 文件上传组件 (`FileUploader`)

- 支持拖拽上传
- PDF 文件自动验证（版本、书签、安全设置）
- 上传后自动计算 MD5
- 显示上传进度

### 2.4 PDF 预览组件 (`PDFViewer`)

- 基于 react-pdf 或 PDF.js
- 支持在线预览已上传的 PDF
- 书签导航

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

## 5. 自动保存

- 编辑器内容变化后 3 秒自动保存（防抖）
- 保存状态指示: "已保存" / "保存中..." / "未保存"
- 页面关闭前检查未保存内容，弹出确认框
