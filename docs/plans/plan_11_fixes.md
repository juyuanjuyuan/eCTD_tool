# Plan 11: 全局功能缺陷修正执行计划

> 基于 `plan_10_inspection_results.md` 的检查结果，按优先级排序的修正方案。
> 优先级: P0（功能完全不可用）→ P1（功能有明显缺陷）→ P2（小瑕疵）

---

## 阶段一: P0 修复（功能不可用）

### FIX-01: 修复文件预览/下载 — MinIO presigned URL 外部不可访问

**关联 BUG**: BUG-01
**影响文件**:
- `backend/.env`
- `backend/src/file/minio.service.ts`

**修改方案**:

#### 步骤 1: 添加 `MINIO_PUBLIC_URL` 环境变量

```diff
# backend/.env
MINIO_ENDPOINT="localhost"
MINIO_PORT=9000
+MINIO_PUBLIC_URL="http://<服务器外网IP>:9000"
```

#### 步骤 2: 修改 MinIO Service，替换 presigned URL 中的 host

```diff
# backend/src/file/minio.service.ts

+  private publicUrl: string;
+  private internalUrl: string;

   constructor(private config: ConfigService) {
     this.client = new Minio.Client({ ... });
+    const endpoint = this.config.get<string>('MINIO_ENDPOINT', 'localhost');
+    const port = this.config.get<number>('MINIO_PORT', 9000);
+    this.internalUrl = `http://${endpoint}:${port}`;
+    this.publicUrl = this.config.get<string>('MINIO_PUBLIC_URL', this.internalUrl);
   }

   async getPresignedDownloadUrl(objectName: string, expirySeconds = 3600): Promise<string> {
     const url = await this.client.presignedGetObject(this.bucket, objectName, expirySeconds);
-    return url;
+    return this.toPublicUrl(url);
   }

   async getPresignedPreviewUrl(objectName: string, expirySeconds = 3600): Promise<string> {
     const url = await this.client.presignedGetObject(this.bucket, objectName, expirySeconds,
       { 'response-content-disposition': 'inline' });
-    return url;
+    return this.toPublicUrl(url);
   }

+  private toPublicUrl(presignedUrl: string): string {
+    if (this.publicUrl === this.internalUrl) return presignedUrl;
+    return presignedUrl.replace(this.internalUrl, this.publicUrl);
+  }
```

#### 步骤 3: 确保服务器防火墙开放 9000 端口

- [ ] GCP 防火墙规则: 允许 TCP 入站 9000
- [ ] docker-compose MinIO 端口映射: `9000:9000`（已有）

**验证**: 上传 PDF → 点击预览 → 新窗口打开 PDF → 点击下载 → 文件下载成功

---

### FIX-02: 修复指派功能 — DTO class 化 + 权限模型调整

**关联 BUG**: BUG-02, BUG-03
**影响文件**:
- `backend/src/assignment/dto/create-assignment.dto.ts`（新建）
- `backend/src/assignment/assignment.service.ts`
- `backend/src/assignment/assignment.controller.ts`
- `frontend/src/pages/editor/components/PropertiesPanel.tsx`（或 `frontend/src/pages/editor/PropertiesPanel.tsx`）

#### 步骤 1: 创建正式 DTO 文件

```typescript
// backend/src/assignment/dto/create-assignment.dto.ts
import { IsString, IsEnum, IsNotEmpty } from 'class-validator';
import { NodePermission } from '@prisma/client';

export class CreateAssignmentDto {
  @IsString()
  @IsNotEmpty()
  userId: string;

  @IsEnum(NodePermission)
  permission: NodePermission;
}
```

#### 步骤 2: 修改 Controller 使用正式 DTO

```diff
# backend/src/assignment/assignment.controller.ts
+import { CreateAssignmentDto } from './dto/create-assignment.dto';

  @Post()
- async assignNode(@Param('nodeId') nodeId: string, @Body() body: CreateAssignmentDto | CreateAssignmentDto[], @Req() req) {
+ async assignNode(@Param('nodeId') nodeId: string, @Body() body: CreateAssignmentDto, @Req() req) {
-   const assignments = Array.isArray(body) ? body : [body];
+   const assignments = [body];
    return this.assignmentService.assignNode(nodeId, assignments, req.user.id);
  }
```

#### 步骤 3: 删除 Service 中的 interface 定义

```diff
# backend/src/assignment/assignment.service.ts
-export interface CreateAssignmentDto {
-  userId: string;
-  permission: NodePermission;
-}
+import { CreateAssignmentDto } from './dto/create-assignment.dto';
```

#### 步骤 4: 放宽权限检查 — 允许 OWNER 和 MEMBER 角色指派

```diff
# backend/src/assignment/assignment.service.ts

  // Verify assigner has permission
  const assignerMember = await this.prisma.projectMember.findFirst({
    where: { projectId, userId: assignerId },
  });
- if (!assignerMember || assignerMember.role !== 'OWNER') {
-   throw new ForbiddenException('只有项目所有者可以指派章节');
+ if (!assignerMember || assignerMember.role === 'VIEWER') {
+   throw new ForbiddenException('查看者无法指派章节');
  }
```

#### 步骤 5: 修复前端用户信息获取

```diff
# frontend/src/pages/editor/components/PropertiesPanel.tsx (或对应路径)

-const userStr = localStorage.getItem('user');
-const currentUser = userStr ? JSON.parse(userStr) : null;
-const isManager = currentUser?.role === 'ADMIN' || currentUser?.role === 'MANAGER';
+// 从 auth store 获取当前用户
+import { useAuthStore } from '@/stores/authStore';
+const { user } = useAuthStore();
```

**验证**: 登录非 VIEWER 用户 → 选择叶节点 → 指派 Tab → 搜索用户 → 选择权限 → 点击指派 → 成功

---

### FIX-03: 修复 PDF 合规检查 — 解析失败时标记为 WARNING 而非 PASS

**关联 BUG**: BUG-04, BUG-05
**影响文件**:
- `backend/src/export/pdf-compliance.service.ts`

#### 步骤 1: 修改所有 catch 块 — 解析失败标记为 WARNING

```diff
# backend/src/export/pdf-compliance.service.ts

  // 为每个 check 方法统一修改模式
  // 以 checkBookmarks 为例:
  private checkBookmarks(pdfDoc: PDFDocument): boolean {
    try {
      const outlines = pdfDoc.catalog.lookup(PDFName.of('Outlines'));
      if (!(outlines instanceof PDFDict)) return false;
      const first = outlines.lookup(PDFName.of('First'));
      return !!first;
    } catch {
-     return false;
+     return false;  // 保持返回 false 表示"无法确认有书签"
+     // 但在调用处增加 warning
    }
  }
```

在 `checkCompliance()` 主方法中，对每个检查增加 try/catch 并在 catch 时添加 WARNING:

```diff
# checkCompliance 主方法中

+ // 包装检查方法，失败时添加 WARNING
+ const safeCheck = <T>(checkFn: () => T, defaultVal: T, ruleName: string): T => {
+   try {
+     return checkFn();
+   } catch (e) {
+     warnings.push({
+       ruleId: ruleName,
+       severity: 'WARNING' as const,
+       message: `无法执行检查: ${ruleName}`,
+       detail: `PDF 结构解析失败，请人工确认。错误: ${e.message}`,
+     });
+     return defaultVal;
+   }
+ };

- const hasJs = this.checkJavaScript(pdfDoc);
+ const hasJs = safeCheck(() => this.checkJavaScript(pdfDoc), false, '6.20-JS检查');

- const externalLinks = this.checkExternalLinks(pdfDoc);
+ const externalLinks = safeCheck(() => this.checkExternalLinks(pdfDoc), [], '6.21-外部链接检查');

  // ... 对每个检查方法同样包装
```

#### 步骤 2: 修复加密检测 — 扫描完整文件

```diff
# backend/src/export/pdf-compliance.service.ts

  private checkEncryption(buffer: Buffer): boolean {
-   const content = buffer.toString('ascii', 0, Math.min(buffer.length, 4096));
+   // /Encrypt 通常在 trailer 段（文件尾部），需要扫描完整文件
+   const content = buffer.toString('ascii');
    return content.includes('/Encrypt');
  }
```

#### 步骤 3: 增加检查失败计数 — 影响 `isCompliant` 判定

```diff
# 在 ComplianceResult 中增加字段

+ checksSkipped: number;  // 因解析失败跳过的检查数

# isCompliant 判定
- isCompliant: errors.length === 0,
+ isCompliant: errors.length === 0 && checksSkipped === 0,
```

或者更温和的方案 — 当有检查被跳过时，`complianceStatus` 设为 `WARNING`（而非 PASS）:

```diff
  const status = errors.length > 0 ? 'ERROR' : (warnings.length > 0 ? 'WARNING' : 'PASS');
```

**验证**: 上传一份普通 PDF → 合规 Tag 应为"警告"（橙色）而非"合规"（绿色），除非 PDF 确实完全符合 eCTD 要求

---

## 阶段二: P1 修复（明显缺陷）

### FIX-04: 修复文档状态 Select 更新后 UI 不刷新

**关联 BUG**: BUG-06
**影响文件**:
- `frontend/src/pages/editor/EditorPage.tsx`

```diff
# EditorPage.tsx

  const refreshNodes = useCallback(async () => {
    const tree = await ctdApi.getSequenceNodeTree(seqId!);
    setNodes(tree);
+   // 更新 selectedNode
+   if (selectedNode) {
+     const findNode = (nodes: any[]): any => {
+       for (const n of nodes) {
+         if (n.id === selectedNode.id) return n;
+         if (n.children?.length) {
+           const found = findNode(n.children);
+           if (found) return found;
+         }
+       }
+       return null;
+     };
+     const updated = findNode(tree);
+     if (updated) setSelectedNode(updated);
+   }
- }, [seqId]);
+ }, [seqId, selectedNode?.id]);
```

**验证**: 选中叶节点 → 修改状态 → Select 立即显示新值

---

### FIX-05: 修复骨架属性 Input 切换节点后不更新

**关联 BUG**: BUG-07
**影响文件**:
- `frontend/src/pages/editor/components/PropertiesPanel.tsx`

方案 A — 给 Input 添加 `key` 强制重新挂载:

```diff
-<Input defaultValue={node.substance || ''} onBlur={(e) => handleBackboneUpdate('substance', e.target.value)} placeholder="必填" />
+<Input key={`${node.id}-substance`} defaultValue={node.substance || ''} onBlur={(e) => handleBackboneUpdate('substance', e.target.value)} placeholder="必填" />
```

方案 B（更好）— 使用受控组件:

```diff
+const [substanceVal, setSubstanceVal] = useState(node.substance || '');
+useEffect(() => { setSubstanceVal(node.substance || ''); }, [node.id, node.substance]);

-<Input defaultValue={node.substance || ''} onBlur={(e) => handleBackboneUpdate('substance', e.target.value)} />
+<Input value={substanceVal} onChange={(e) => setSubstanceVal(e.target.value)} onBlur={(e) => handleBackboneUpdate('substance', e.target.value)} />
```

对所有骨架属性字段（substance, manufacturer, productName, dosageForm, indication）执行相同修改。

**验证**: 选择 3.2.S 节点 → 输入活性成分 → 选择 3.2.P 节点 → 显示 3.2.P 的属性值（非 3.2.S 的值）→ 切回 3.2.S → 显示之前输入的活性成分

---

### FIX-06: 修复 eCTD 包导出 Blob 双重包装

**关联 BUG**: BUG-08
**影响文件**:
- `frontend/src/pages/sequence/components/EctdPackagePanel.tsx`（或 `frontend/src/components/EctdPackagePanel.tsx`）
- `frontend/src/services/ectd.ts`

方案: 使 ectd 导出使用独立 axios 实例（与 export.ts 保持一致）:

```diff
# frontend/src/services/ectd.ts

+import axios from 'axios';
+
+const rawApi = axios.create({
+  baseURL: import.meta.env.VITE_API_BASE_URL || '/api/v1',
+});

  exportPackage: (seqId: string) =>
-   api.post(`/sequences/${seqId}/export/ectd-package`, {}, { responseType: 'blob' }),
+   rawApi.post(`/sequences/${seqId}/export/ectd-package`, {}, {
+     responseType: 'blob',
+     headers: { Authorization: `Bearer ${localStorage.getItem('accessToken')}` },
+   }).then(res => res.data),
```

```diff
# EctdPackagePanel.tsx

  const response = await ectdApi.exportPackage(sequenceId);
- const blob = new Blob([response], { type: 'application/zip' });
+ const blob = response instanceof Blob ? response : new Blob([response], { type: 'application/zip' });
```

**验证**: 完成验证通过 → 点击导出 eCTD 包 → 下载 ZIP → 解压成功

---

### FIX-07: 修复语言属性 Select 无效

**关联 BUG**: BUG-09
**影响文件**:
- `frontend/src/pages/editor/components/PropertiesPanel.tsx`

```diff
-<Select value={doc?.xmlLang || 'zh'} options={langOptions} style={{ width: '100%' }} />
+<Select
+  value={node.xmlLang || 'zh'}
+  options={langOptions}
+  style={{ width: '100%' }}
+  onChange={async (val) => {
+    try {
+      await ctdApi.updateSequenceNode(sequenceId, node.id, { xmlLang: val });
+      message.success('语言属性已更新');
+      onNodeUpdated();
+    } catch (err: any) { message.error(err.message); }
+  }}
+/>
```

同时需确保后端 `UpdateSequenceNodeDto` 包含 `xmlLang` 字段。

**验证**: 选择叶节点 → 修改语言为 "en" → 切换节点再切回 → 显示 "en"

---

### FIX-08: 已审批节点状态 Select 禁用

**关联 BUG**: BUG-10
**影响文件**:
- `frontend/src/pages/editor/components/PropertiesPanel.tsx`

```diff
  <Select
    value={node.status}
    options={statusOptions}
    onChange={handleStatusChange}
    style={{ width: '100%' }}
+   disabled={node.approvalStatus === 'APPROVED' || node.approvalStatus === 'SUBMITTED'}
  />
```

同时对操作类型 Select 也做类似处理:

```diff
  <Select
    value={node.operation || 'new'}
    options={operationOptions}
    onChange={handleOperationChange}
    style={{ width: '100%' }}
+   disabled={node.approvalStatus === 'APPROVED' || node.approvalStatus === 'SUBMITTED'}
  />
```

**验证**: 提交节点审批 → 审批通过 → 状态 Select 变为不可编辑灰色

---

## 阶段三: P2 修复（小瑕疵）

### FIX-09: 导出按钮无节点时禁用

**关联 BUG**: BUG-11
**影响文件**:
- `frontend/src/pages/editor/EditorPage.tsx`

```diff
  <Button
    type="text"
    icon={<ExportOutlined />}
    onClick={() => setExportModalOpen(true)}
+   disabled={!selectedNode?.isLeaf}
  />
```

---

### FIX-10: 加载已有验证报告时设置 validationPassed

**关联 BUG**: BUG-12
**影响文件**:
- `frontend/src/pages/sequence/SequenceDetailPage.tsx`
- `frontend/src/pages/sequence/components/ValidationPanel.tsx`

在 ValidationPanel 的 `fetchLatestReport` 成功后，回调通知父组件:

```diff
# ValidationPanel.tsx
+useEffect(() => {
+  if (latestReport) {
+    const hasErrors = latestReport.items?.some(item => item.severity === 'ERROR');
+    onValidationComplete?.(!hasErrors);
+  }
+}, [latestReport]);
```

或者在 SequenceDetailPage 中直接获取最新报告:

```diff
# SequenceDetailPage.tsx
+useEffect(() => {
+  if (seqId) {
+    ectdApi.getLatestValidationReport(seqId).then(report => {
+      if (report) {
+        const hasErrors = report.items?.some((i: any) => i.severity === 'ERROR');
+        setValidationPassed(!hasErrors);
+      }
+    }).catch(() => {});
+  }
+}, [seqId]);
```

---

### FIX-11: 修复 PDF 导出合规通过时不下载

**关联 BUG**: BUG-13
**影响文件**:
- `frontend/src/components/ExportModal.tsx`
- `frontend/src/services/export.ts`

检查 `exportPdf` 的返回值处理，确保当后端返回二进制 PDF（非 JSON）时，前端正确创建 Blob 并触发下载:

```diff
# export.ts - exportPdf 方法

  exportPdf: async (seqId: string, nodeId: string) => {
    const res = await rawApi.post(`/sequences/${seqId}/export/pdf`, { nodeId }, { responseType: 'blob' });
    const contentType = res.headers['content-type'];
    if (contentType?.includes('application/json')) {
      // 后端返回 JSON = 合规错误
      const text = await res.data.text();
      return { complianceError: JSON.parse(text) };
    }
    // 后端返回 PDF = 合规通过
    return { blob: res.data };
  }
```

---

### FIX-12: 添加基本状态转换校验

**关联 BUG**: BUG-14
**影响文件**:
- `backend/src/ctd-template/ctd-template.service.ts`

```diff
  async updateSequenceNode(sequenceId: string, nodeId: string, dto: UpdateSequenceNodeDto) {
    const node = await this.prisma.sequenceNode.findFirst({ where: { id: nodeId, sequenceId } });
    if (!node) throw new NotFoundException('序列节点不存在');
+   // 审批状态锁定
+   if (dto.status && (node.approvalStatus === 'APPROVED' || node.approvalStatus === 'SUBMITTED')) {
+     throw new BadRequestException('已提交审批或已审批的节点不允许修改状态');
+   }
+   // 基本状态转换校验
+   if (dto.status === 'COMPLETED' && node.status === 'EMPTY') {
+     throw new BadRequestException('未开始的节点不能直接标记为已完成');
+   }
    return this.prisma.sequenceNode.update({ where: { id: nodeId }, data: dto });
  }
```

---

### FIX-13: 编辑器导航传递节点 ID

**关联 BUG**: BUG-15
**影响文件**:
- `frontend/src/pages/dashboard/DashboardPage.tsx`
- `frontend/src/pages/sequence/SequenceDetailPage.tsx`
- `frontend/src/pages/editor/EditorPage.tsx`

通过 URL query parameter 传递节点 ID:

```diff
# DashboardPage.tsx
-onClick={() => navigate(`/sequences/${item.sequenceId}/editor`)}
+onClick={() => navigate(`/sequences/${item.sequenceId}/editor?nodeId=${item.nodeId}`)}

# EditorPage.tsx
+const [searchParams] = useSearchParams();
+const initialNodeId = searchParams.get('nodeId');
+
+useEffect(() => {
+  if (initialNodeId && nodes.length > 0) {
+    const findNode = (items: any[]): any => { /* 递归查找 */ };
+    const target = findNode(nodes);
+    if (target) setSelectedNode(target);
+  }
+}, [initialNodeId, nodes]);
```

---

### FIX-14: SequenceDetailPage 返回按钮兼容处理

**关联 BUG**: BUG-16
**影响文件**:
- `frontend/src/pages/sequence/SequenceDetailPage.tsx`

使用 `navigate(-1)` 作为备选方案:

```diff
  onClick={() => {
    const projectId = appInfo?.project?.id;
    const appId = appInfo?.id;
    if (projectId && appId) {
      navigate(`/projects/${projectId}/applications/${appId}`);
-   } else {
-     navigate('/projects');
+   } else if (window.history.length > 1) {
+     navigate(-1);
+   } else {
+     navigate('/projects');
    }
  }}
```

---

## 执行顺序

| 顺序 | 修复编号 | 预估改动量 | 依赖关系 | 状态 |
|------|----------|-----------|----------|------|
| 1 | FIX-01 | 小（~20 行 + 环境配置） | 无 | [x] 已完成 |
| 2 | FIX-02 | 中（~60 行，跨 4 文件） | 无 | [x] 已完成 |
| 3 | FIX-03 | 中（~80 行，1 文件） | 无 | [x] 已完成 |
| 4 | FIX-04 | 小（~15 行） | 无 | [x] 已完成 |
| 5 | FIX-05 | 小（~20 行） | 无 | [x] 已完成 |
| 6 | FIX-06 | 小（~15 行） | 无 | [x] 已完成 |
| 7 | FIX-07 | 小（~10 行） | FIX-04 | [x] 已完成 |
| 8 | FIX-08 | 小（~5 行） | 无 | [x] 已完成 |
| 9 | FIX-09 | 小（~3 行） | 无 | [x] 已完成 |
| 10 | FIX-10 | 小（~10 行） | 无 | [x] 已完成 |
| 11 | FIX-11 | 小（~15 行） | 无 | [-] 经复查后端逻辑正确，无需修复 |
| 12 | FIX-12 | 小（~10 行） | 无 | [x] 已完成 |
| 13 | FIX-13 | 中（~30 行，跨 3 文件） | FIX-04 | [x] 已完成 |
| 14 | FIX-14 | 小（~5 行） | 无 | [x] 已完成 |

**总预估**: ~300 行代码改动，涉及 ~15 个文件

---

## 验证清单

修复完成后需逐项验证:

- [ ] 上传 PDF → 预览在新窗口打开 ✓
- [ ] 上传 PDF → 下载成功 ✓
- [ ] 上传非 eCTD 规范 PDF → 合规 Tag 显示"警告"或"错误" ✓
- [ ] 非 VIEWER 用户 → 指派章节成功 ✓
- [ ] 修改文档状态 → Select 立即显示新值 ✓
- [ ] 切换节点 → 骨架属性显示正确数据 ✓
- [ ] 导出 eCTD 包 → ZIP 可正常解压 ✓
- [ ] 语言属性修改 → 保存成功 ✓
- [ ] 已审批节点 → 状态 Select 不可编辑 ✓
- [ ] 无节点选中 → 导出按钮灰色 ✓
- [ ] 已有验证报告 → 重进页面导出按钮可用 ✓
- [ ] PDF 合规通过 → 自动下载文件 ✓
- [ ] Dashboard 点击待编辑 → 跳转编辑器并选中节点 ✓
