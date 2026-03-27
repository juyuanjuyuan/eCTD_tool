# Plan 10: 全局功能检查结果

> 检查执行日期: 2026-03-27
> 检查方式: 代码审查（前端组件 + 后端 Controller/Service + 配置文件）

---

## 问题汇总

| 编号 | 严重程度 | 功能模块 | 问题摘要 | 状态 |
|------|----------|----------|----------|------|
| BUG-01 | **P0** | 文件预览/下载 | MinIO presigned URL 包含 `localhost:9000`，外部浏览器无法访问 | FAIL |
| BUG-02 | **P0** | 指派（Assignment） | DTO 是 interface 而非 class，被 ValidationPipe 清空/拒绝 | FAIL |
| BUG-03 | **P0** | 指派（Assignment） | 后端仅允许 OWNER 指派，前端未获取项目角色也无权限提示 | FAIL |
| BUG-04 | **P0** | PDF 合规检查 | 所有检查方法 catch 默认返回 "通过"，pdf-lib 解析失败时全部静默通过 | FAIL |
| BUG-05 | **P0** | PDF 合规检查 | 加密检测只扫描前 4096 字节，几乎永远检测不到 `/Encrypt` | FAIL |
| BUG-06 | **P1** | 文档状态选择 | 更改状态后 selectedNode 未更新，UI 显示旧值 | FAIL |
| BUG-07 | **P1** | 骨架属性输入 | Input 使用 `defaultValue`，切换节点时不更新，显示旧节点数据 | FAIL |
| BUG-08 | **P1** | eCTD 包导出 | Blob 可能被双重包装（axios interceptor + new Blob），导致 zip 损坏 | FAIL |
| BUG-09 | **P1** | 语言属性选择 | Select 无 `onChange` 处理器，界面可交互但实际无效果 | FAIL |
| BUG-10 | **P1** | 审批后状态锁定 | APPROVED/SUBMITTED 节点的状态 Select 未 disabled，可绕过审批 | FAIL |
| BUG-11 | **P2** | 导出按钮 | 无节点选中时可点击，`exportModalOpen` 状态卡住不复位 | WARN |
| BUG-12 | **P2** | 验证状态持久化 | 重进页面 `validationPassed` 重置 false，已通过验证的包仍不能导出 | WARN |
| BUG-13 | **P2** | PDF 导出流程 | 合规通过时前端显示合规面板而非直接下载文件 | WARN |
| BUG-14 | **P2** | 状态转换校验 | 无任何校验，可从 EMPTY 直接设为 COMPLETED | WARN |
| BUG-15 | **P2** | 节点导航传参 | Dashboard/SequenceDetail 跳转编辑器不传选中节点 ID | WARN |
| BUG-16 | **P2** | 返回按钮 | SequenceDetailPage 返回按钮依赖深层嵌套数据，可能 fallback 到 /projects | WARN |

---

## 一、文件预览/下载不可用 — BUG-01

### 状态: **FAIL (P0)**

### 问题描述

MinIO presigned URL 使用 `localhost:9000` 作为 host，外部浏览器无法访问。

### 根因分析

**MinIO 客户端配置** (`backend/src/file/minio.service.ts:15-21`):
```typescript
this.client = new Minio.Client({
  endPoint: this.config.get<string>('MINIO_ENDPOINT', 'localhost'),
  port: this.config.get<number>('MINIO_PORT', 9000),
  useSSL: false,
  // ...
});
```

**环境变量** (`backend/.env:14-15`):
```
MINIO_ENDPOINT="localhost"
MINIO_PORT=9000
```

**presigned URL 生成** (`backend/src/file/minio.service.ts:105-128`):
```typescript
async getPresignedDownloadUrl(objectName: string, expirySeconds = 3600): Promise<string> {
    return this.client.presignedGetObject(this.bucket, objectName, expirySeconds);
}
```

SDK 生成的 URL 格式为 `http://localhost:9000/ectd-files/...?X-Amz-...`，返回给浏览器后，浏览器在用户本地机器上请求 `localhost:9000`，自然无法连接到服务器上的 MinIO。

**前端调用** (`frontend/src/components/FilePanel.tsx:133-152`):
```typescript
const handlePreview = async (fileId: string) => {
    const { url } = await fileApi.preview(nodeId, fileId);
    window.open(url, '_blank');  // url = http://localhost:9000/... — 不可达
};
```

### 影响范围
- 文件预览按钮（PDF 预览）
- 文件下载按钮（所有文件类型）
- 编辑器图片加载（如果图片 URL 也用 presigned URL）

---

## 二、指派功能不可用 — BUG-02, BUG-03

### 状态: **FAIL (P0)**

### BUG-02: DTO 是 interface，被 ValidationPipe 清空

**问题**: `CreateAssignmentDto` 定义为 TypeScript `interface`（非 `class`），NestJS `ValidationPipe` 配置了 `whitelist: true` + `forbidNonWhitelisted: true`。

`interface` 在运行时不存在，ValidationPipe 无法识别任何属性，导致:
- `whitelist: true` → 清空所有属性 → service 收到 `[{}]`
- `forbidNonWhitelisted: true` → 直接返回 400 错误："property userId should not exist"

**代码位置** (`backend/src/assignment/assignment.service.ts:10-13`):
```typescript
export interface CreateAssignmentDto {  // ← 应该是 class + decorators
  userId: string;
  permission: NodePermission;
}
```

**全局 ValidationPipe** (`backend/src/main.ts:83-89`):
```typescript
app.useGlobalPipes(new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
}));
```

### BUG-03: 权限模型不匹配

**后端** (`backend/src/assignment/assignment.service.ts:40-46`):
```typescript
// 只有 ProjectMemberRole === 'OWNER' 才能指派
if (!assignerMember || assignerMember.role !== 'OWNER') {
  throw new ForbiddenException('只有项目所有者可以指派章节');
}
```

**前端** (`frontend/src/pages/editor/PropertiesPanel.tsx:128-130`):
```typescript
const userStr = localStorage.getItem('user');
const currentUser = userStr ? JSON.parse(userStr) : null;
const isManager = currentUser?.role === 'ADMIN' || currentUser?.role === 'MANAGER';
```

三个问题:
1. `localStorage.getItem('user')` **从未被设置** — auth store 只存 token，不存 user 对象到 localStorage → `currentUser` 永远是 `null`
2. 即使设置了，前端检查的是**系统角色**（ADMIN/MANAGER），后端检查的是**项目成员角色**（OWNER）— 完全不同的角色体系
3. 指派 Tab 始终可见，任何用户都能看到并尝试指派，但非 OWNER 必然收到 403

### 影响范围
- 指派用户到章节节点
- 移除指派
- 指派通知

---

## 三、PDF 合规检查误报 — BUG-04, BUG-05

### 状态: **FAIL (P0)**

### BUG-04: 所有检查方法 catch 默认返回 "通过"

**问题**: `PDFComplianceService` 的 7 个检查方法全部使用 `try/catch`，catch 块一律返回 "无问题"：

| 方法 | 行号 | catch 返回值 | 含义 |
|------|------|-------------|------|
| `checkJavaScript()` | :238 | `return false` | "无 JavaScript" |
| `checkExternalLinks()` | :268 | `return []` | "无外部链接" |
| `checkMultimedia()` | :313 | `return false` | "无多媒体" |
| `checkBookmarks()` | :324 | `return false` | "无书签" |
| `checkBookmarkZoom()` | :370 | `return 0` | "0 个异常缩放" |
| `checkAttachments()` | :392 | `return false` | "无附件" |
| `checkFontEmbedding()` | :437 | `return []` | "无未嵌入字体" |

**文件**: `backend/src/export/pdf-compliance.service.ts`

`pdf-lib` 是 PDF 创建/编辑库，不是专业分析工具。解析第三方 PDF（如 resume）时，内部结构检查经常抛异常。所有异常被静默捕获并默认为 "合规"，导致:

- 一份没有书签的 10 页 resume → `checkBookmarks()` 异常 → catch 返回 `false`（无书签）→ 但因 `getPageCount()` 可能也异常/不准确 → 书签检查可能不触发
- 一份含外部链接的 PDF → `checkExternalLinks()` 解析失败 → catch 返回 `[]` → 报告无外部链接
- 一份加密的 PDF → 加密检查用了另一种方式（见 BUG-05）

### BUG-05: 加密检测只扫前 4096 字节

```typescript
// pdf-compliance.service.ts:210-213
private checkEncryption(buffer: Buffer): boolean {
  const content = buffer.toString('ascii', 0, Math.min(buffer.length, 4096));
  return content.includes('/Encrypt');
}
```

PDF 的 `/Encrypt` 字典引用通常在文件末尾的 trailer/xref 段，不在开头 4096 字节内。绝大多数加密 PDF 会漏检。

### 影响范围
- 所有上传 PDF 的合规判定
- 文件列表中的合规 Tag 显示（几乎所有 PDF 都显示绿色 "合规"）
- PDF 导出合规检查

---

## 四、文档状态选择 UI 瑕疵 — BUG-06

### 状态: **FAIL (P1)**

### 问题描述

用户更改文档状态（如 EMPTY → EDITING）后，API 调用成功，但 UI 中的 Select 组件仍显示旧值。

### 根因

**PropertiesPanel** (`PropertiesPanel.tsx:237-239`):
```typescript
const handleStatusChange = async (status: string) => {
    await ctdApi.updateSequenceNode(sequenceId, node.id, { status });
    onNodeUpdated();  // 调用 refreshNodes
};
```

`onNodeUpdated` 调用 `refreshNodes`，只更新树数据 `setNodes(tree)`，但不更新 zustand store 中的 `selectedNode`。PropertiesPanel 的 `node` prop 来自 `selectedNode`，其 `status` 属性仍是旧值。

**EditorPage** (`EditorPage.tsx:128-136`):
```typescript
const refreshNodes = useCallback(async () => {
    const tree = await ctdApi.getSequenceNodeTree(seqId!);
    setNodes(tree);           // ← 只更新树
    // 缺失: 没有更新 selectedNode
}, [seqId]);
```

---

## 五、骨架属性显示旧数据 — BUG-07

### 状态: **FAIL (P1)**

### 问题描述

骨架属性 Input（活性成分、生产商等）使用 `defaultValue`，切换节点时不更新。

**PropertiesPanel** (`PropertiesPanel.tsx:341-366`):
```typescript
<Input defaultValue={node.substance || ''} onBlur={(e) => handleBackboneUpdate('substance', e.target.value)} />
```

React 的 `defaultValue` 只在组件首次挂载时设置值，后续 prop 变化不会更新 DOM 输入框的显示值。用户选择节点 A（substance="X"）后选择节点 B（substance="Y"），输入框仍显示 "X"。

---

## 六、eCTD 包导出 Blob 损坏 — BUG-08

### 状态: **FAIL (P1)**

### 问题描述

**EctdPackagePanel** (`EctdPackagePanel.tsx:88-98`):
```typescript
const response = await ectdApi.exportPackage(sequenceId) as any;
const blob = new Blob([response], { type: 'application/zip' });
```

**ectd.ts:35**:
```typescript
exportPackage: (seqId: string) =>
    api.post(`/sequences/${seqId}/export/ectd-package`, {}, { responseType: 'blob' }),
```

共享 `api` 实例有 response interceptor 提取 `response.data`，返回的已经是 Blob。再用 `new Blob([response])` 包装会双重封装，损坏 ZIP 文件。

对比 `export.ts` 中的 Word/PDF 导出使用**独立的 axios 实例**（不经过 interceptor），不存在此问题。

---

## 七、语言属性 Select 无效 — BUG-09

### 状态: **FAIL (P1)**

**PropertiesPanel** (`PropertiesPanel.tsx:298-299`):
```typescript
<Select value={doc?.xmlLang || 'zh'} options={langOptions} style={{ width: '100%' }} />
```

缺少 `onChange` 处理器。用户可以打开下拉选择，但选择后无任何效果——不调用 API，不更新状态。

---

## 八、已审批节点状态未锁定 — BUG-10

### 状态: **FAIL (P1)**

**PropertiesPanel** (`PropertiesPanel.tsx:287`):
```typescript
<Select value={node.status} options={statusOptions} onChange={handleStatusChange} style={{ width: '100%' }} />
```

状态 Select 在任何审批状态下都可编辑。APPROVED 或 SUBMITTED 的节点应禁止修改文档状态，否则用户可绕过审批流程。

---

## 九、导出按钮状态异常 — BUG-11

### 状态: **WARN (P2)**

**EditorPage** (`EditorPage.tsx:243-249`): 导出按钮始终可点击。
**EditorPage** (`EditorPage.tsx:474-481`): ExportModal 只在 `selectedNode?.isLeaf` 时渲染。

无叶节点选中时点击导出 → `exportModalOpen = true` 但 Modal 不渲染 → 之后选中叶节点时 Modal 立即弹出（非预期行为）。

---

## 十、验证状态不持久化 — BUG-12

### 状态: **WARN (P2)**

**SequenceDetailPage** (`SequenceDetailPage.tsx:72`):
```typescript
const [validationPassed, setValidationPassed] = useState(false);
```

用户之前运行过验证并通过，离开页面再回来时 `validationPassed` 重置为 `false`，eCTD 导出按钮仍被禁用。应在加载最新验证报告时检查其结果并设置 `validationPassed`。

---

## 十一、PDF 导出合规通过时不下载 — BUG-13

### 状态: **WARN (P2)**

**ExportModal** (`ExportModal.tsx:56-63`): 当 PDF 合规通过时，后端可能仍返回 JSON（含 `isCompliant: true`），前端将其判定为 `complianceError`，显示合规面板而非直接下载文件。用户看到 "通过" 但拿不到文件。

---

## 十二、状态转换无校验 — BUG-14

### 状态: **WARN (P2)**

后端 `updateSequenceNode()` 不校验状态转换合理性。用户可以:
- EMPTY → COMPLETED（跳过 EDITING）
- COMPLETED → EMPTY（回退）
- 空内容节点设为 COMPLETED

---

## 十三、编辑器导航不传节点 ID — BUG-15

### 状态: **WARN (P2)**

Dashboard 待编辑章节、最近编辑、序列详情页的节点点击，跳转到 `/sequences/:seqId/editor` 时不传递选中节点信息。用户需要手动在树中再次选择。

---

## 十四、返回按钮 fallback — BUG-16

### 状态: **WARN (P2)**

`SequenceDetailPage` 返回按钮依赖 `sequence.regulatoryActivity.application.project` 深层嵌套数据。如后端未 include 完整关系链，按钮 fallback 到 `/projects` 而非正确的申请详情页。

---

## 通过的检查项（抽样）

| 检查项 | 状态 |
|--------|------|
| 1.1 登录/注册流程 | PASS — 前后端对接正确，JWT 存储正常 |
| 2.x Dashboard 统计与列表 | PASS — API 调用正确，数据渲染正确 |
| 3.x 项目列表 CRUD | PASS — 创建/列表/分页正常 |
| 4.1-4.2 项目详情概览+申请 Tab | PASS — 信息显示正确，创建申请正常 |
| 4.3 成员管理 | PASS — 添加/移除/角色变更/邀请/转移所有权正常 |
| 5.x 申请详情 RA/序列管理 | PASS — CRUD 正常，CV 联动过滤正常 |
| 6.2 初始化流程 | PASS — CTD 结构初始化正常 |
| 6.3 CTD 树显示 | PASS — 五模块结构正确渲染 |
| 6.4 内容完整性 | PASS — 进度条和缺失章节正确 |
| 7.4.1 文件上传 | PASS — 拖拽/点击上传、类型/大小限制正常 |
| 7.4.6 文件删除 | PASS — 确认框+删除+引用保护正常 |
| 7.6 版本管理 | PASS — 快照创建/恢复正常 |
| 7.7 审批流程（核心） | PASS — 提交/通过/驳回/解锁状态机正常 |
| 7.8 评论系统 | PASS — 发表/回复/@提及/删除正常 |
| 8.x 通知系统 | PASS — 列表/过滤/标记已读/全部已读正常 |
| 9.x 路由权限/错误处理 | PASS — 未登录跳转、401 刷新 token 正常 |
