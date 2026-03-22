import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Layout,
  Breadcrumb,
  Button,
  Tag,
  Space,
  Spin,
  message,
  Result,
  Tooltip,
  Alert,
} from 'antd';
import {
  ArrowLeftOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  SaveOutlined,
  CheckCircleOutlined,
  SyncOutlined,
  ExclamationCircleOutlined,
  ExportOutlined,
  SafetyCertificateOutlined,
  SendOutlined,
  LockOutlined,
} from '@ant-design/icons';
import { sequenceApi } from '../../services/application';
import { ctdApi } from '../../services/ctd';
import { ectdApi } from '../../services/ectd';
import { documentApi } from '../../services/document';
import { editLockApi } from '../../services/editLock';
import { approvalApi } from '../../services/approval';
import { useEditorStore } from '../../stores/useEditorStore';
import { useAutoSave } from '../../hooks/useAutoSave';
import CTDTree from '../../components/CTDTree';
import RichEditor from '../../components/RichEditor';
import ExportModal from '../../components/ExportModal';
import PropertiesPanel from './PropertiesPanel';
import type { SequenceNode, CompletenessResult, EditLockInfo } from '../../types';

const { Sider, Content } = Layout;

const saveStatusConfig = {
  saved: { icon: <CheckCircleOutlined />, text: '已保存', color: '#52c41a' },
  saving: { icon: <SyncOutlined spin />, text: '保存中...', color: '#1890ff' },
  unsaved: { icon: <ExclamationCircleOutlined />, text: '未保存', color: '#faad14' },
  error: { icon: <ExclamationCircleOutlined />, text: '保存失败', color: '#ff4d4f' },
};

const EditorPage: React.FC = () => {
  const { seqId } = useParams<{ seqId: string }>();
  const navigate = useNavigate();

  const {
    selectedNode,
    setSelectedNode,
    document: currentDoc,
    setDocument,
    saveStatus,
    leftCollapsed,
    rightCollapsed,
    toggleLeft,
    toggleRight,
  } = useEditorStore();

  const [sequence, setSequence] = useState<any>(null);
  const [nodes, setNodes] = useState<SequenceNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [docLoading, setDocLoading] = useState(false);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [completeness, setCompleteness] = useState<CompletenessResult | null>(null);
  const [validating, setValidating] = useState(false);

  // Edit lock state
  const [lockInfo, setLockInfo] = useState<EditLockInfo | null>(null);
  const [lockedByOther, setLockedByOther] = useState(false);
  const [lockedByName, setLockedByName] = useState('');
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const currentUserId = localStorage.getItem('userId') || '';

  // Read-only: locked by another user OR node is approved
  const isReadOnly = lockedByOther || selectedNode?.approvalStatus === 'APPROVED';

  const { debouncedSave, flushSave } = useAutoSave(selectedNode?.id || null);
  const prevNodeRef = useRef<string | null>(null);

  // Load sequence and nodes
  useEffect(() => {
    if (!seqId) return;
    const load = async () => {
      setLoading(true);
      try {
        const [seq, tree, comp] = await Promise.all([
          sequenceApi.detail(seqId),
          ctdApi.getSequenceNodeTree(seqId),
          ctdApi.checkCompleteness(seqId).catch(() => null),
        ]);
        setSequence(seq);
        setNodes(tree);
        if (comp) setCompleteness(comp);
      } catch (err: any) {
        message.error(err.message);
      } finally {
        setLoading(false);
      }
    };
    load();

    // Cleanup on unmount: release lock
    return () => {
      const currentNodeId = prevNodeRef.current;
      if (currentNodeId) {
        editLockApi.release(currentNodeId).catch(() => {});
      }
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      setSelectedNode(null);
      setDocument(null);
    };
  }, [seqId, setSelectedNode, setDocument]);

  // Release lock on current node
  const releaseLock = useCallback(async (nodeId: string) => {
    try {
      await editLockApi.release(nodeId);
    } catch {
      // Ignore release errors
    }
    setLockInfo(null);
    setLockedByOther(false);
    setLockedByName('');
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }
  }, []);

  // Load document when node changes
  const loadDocument = useCallback(async (nodeId: string) => {
    setDocLoading(true);
    try {
      const doc = await documentApi.get(nodeId);
      setDocument(doc);
    } catch (err: any) {
      message.error(`加载文档失败: ${err.message}`);
    } finally {
      setDocLoading(false);
    }
  }, [setDocument]);

  // Handle node selection — save current first, then load new
  const handleNodeSelect = useCallback(async (node: SequenceNode) => {
    if (!node.isLeaf) {
      setSelectedNode(node);
      return;
    }

    // Save previous node's content and release lock before switching
    if (prevNodeRef.current && prevNodeRef.current !== node.id) {
      await flushSave();
      await releaseLock(prevNodeRef.current);
    }

    setSelectedNode(node);
    prevNodeRef.current = node.id;

    // Try to acquire lock (skip if approved)
    if (node.approvalStatus !== 'APPROVED') {
      try {
        const lock = await editLockApi.acquire(node.id);
        setLockInfo(lock);
        setLockedByOther(false);
        setLockedByName('');

        // Start heartbeat
        if (heartbeatRef.current) clearInterval(heartbeatRef.current);
        heartbeatRef.current = setInterval(async () => {
          try {
            await editLockApi.heartbeat(node.id);
          } catch {
            // Lock lost
          }
        }, 5 * 60 * 1000); // 5 minutes
      } catch (err: any) {
        // Locked by another user
        const lockedBy = err?.response?.data?.lockedBy;
        setLockedByOther(true);
        setLockedByName(lockedBy?.userName || '其他用户');
        setLockInfo(null);
      }
    } else {
      // Approved node — no lock needed, read-only
      setLockedByOther(false);
      setLockInfo(null);
    }

    await loadDocument(node.id);
  }, [flushSave, setSelectedNode, loadDocument, releaseLock]);

  // Handle editor content updates (blocked in read-only mode)
  const handleEditorUpdate = useCallback((json: any, html: string) => {
    if (selectedNode?.id && !isReadOnly) {
      debouncedSave(json, html);
    }
  }, [selectedNode?.id, debouncedSave, isReadOnly]);

  // Submit for approval
  const handleSubmitApproval = useCallback(async () => {
    if (!selectedNode?.id) return;
    try {
      await approvalApi.submit(selectedNode.id);
      message.success('已提交审批');
      refreshNodes();
    } catch (err: any) {
      message.error(err.message || '提交审批失败');
    }
  }, [selectedNode?.id]);

  // Manual save
  const handleManualSave = useCallback(async () => {
    await flushSave();
    message.success('已保存');
  }, [flushSave]);

  // Run eCTD validation
  const handleRunValidation = useCallback(async () => {
    if (!seqId) return;
    setValidating(true);
    try {
      const result = await ectdApi.runValidation(seqId);
      const errors = (result as any)?.results?.filter((r: any) => r.severity === 'ERROR') || [];
      if (errors.length === 0) {
        message.success('eCTD 验证通过');
      } else {
        message.warning(`验证发现 ${errors.length} 个错误，请前往序列详情页查看完整报告`);
      }
    } catch (err: any) {
      message.error(`验证失败: ${err.message}`);
    } finally {
      setValidating(false);
    }
  }, [seqId]);

  // Refresh nodes (after property changes)
  const refreshNodes = useCallback(async () => {
    if (!seqId) return;
    try {
      const tree = await ctdApi.getSequenceNodeTree(seqId);
      setNodes(tree);
    } catch {
      // Ignore refresh errors
    }
  }, [seqId]);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!sequence) {
    return <Result status="404" title="序列不存在" />;
  }

  const appInfo = sequence.regulatoryActivity?.application;
  const statusCfg = saveStatusConfig[saveStatus];

  return (
    <Layout style={{ height: '100vh' }}>
      {/* Top bar */}
      <div style={{
        height: 48,
        background: '#fff',
        borderBottom: '1px solid #e8e8e8',
        padding: '0 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <Space>
          <Button
            type="text"
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate(`/sequences/${seqId}`)}
          />
          <Breadcrumb
            items={[
              { title: appInfo?.project?.name || '项目' },
              { title: `申请 ${appInfo?.applicationNumber || ''}` },
              { title: `序列 ${sequence.sequenceNumber}` },
              ...(selectedNode
                ? [{ title: `${selectedNode.ctdSectionNumber} ${selectedNode.title}` }]
                : []),
            ]}
          />
        </Space>
        <Space>
          {/* Save status */}
          <Tag
            icon={statusCfg.icon}
            color={statusCfg.color}
            style={{ margin: 0 }}
          >
            {statusCfg.text}
          </Tag>

          {/* Manual save */}
          <Tooltip title="保存 (Ctrl+S)">
            <Button
              type="text"
              icon={<SaveOutlined />}
              onClick={handleManualSave}
              disabled={saveStatus === 'saved'}
            />
          </Tooltip>

          {/* Completeness status */}
          {completeness && (
            <Tag color={completeness.completedRequired >= completeness.requiredSections ? 'green' : 'orange'}>
              必填 {completeness.completedRequired}/{completeness.requiredSections} 已完成
            </Tag>
          )}

          {/* Validation */}
          <Tooltip title="运行 eCTD 验证">
            <Button
              type="text"
              icon={<SafetyCertificateOutlined />}
              onClick={handleRunValidation}
              loading={validating}
            />
          </Tooltip>

          {/* Submit for approval */}
          {selectedNode?.isLeaf &&
            (selectedNode.approvalStatus === 'DRAFT' ||
              selectedNode.approvalStatus === 'REJECTED') && (
              <Tooltip title="提交审批">
                <Button
                  type="text"
                  icon={<SendOutlined />}
                  onClick={handleSubmitApproval}
                  disabled={selectedNode.status === 'EMPTY'}
                />
              </Tooltip>
            )}

          {/* Approval status indicator */}
          {selectedNode?.isLeaf && selectedNode.approvalStatus !== 'DRAFT' && (
            <Tag
              color={
                selectedNode.approvalStatus === 'APPROVED'
                  ? 'green'
                  : selectedNode.approvalStatus === 'SUBMITTED'
                    ? 'blue'
                    : 'red'
              }
            >
              {selectedNode.approvalStatus === 'APPROVED'
                ? '已审批'
                : selectedNode.approvalStatus === 'SUBMITTED'
                  ? '待审批'
                  : '已驳回'}
            </Tag>
          )}

          {/* Lock indicator */}
          {lockedByOther && (
            <Tag icon={<LockOutlined />} color="warning">
              {lockedByName} 正在编辑
            </Tag>
          )}

          {/* Export */}
          <Tooltip title="导出">
            <Button
              type="text"
              icon={<ExportOutlined />}
              onClick={() => setExportModalOpen(true)}
              disabled={!selectedNode?.isLeaf}
            />
          </Tooltip>
        </Space>
      </div>

      <Layout style={{ flex: 1, overflow: 'hidden' }}>
        {/* Left panel: CTD Tree */}
        <Sider
          width={300}
          collapsedWidth={0}
          collapsed={leftCollapsed}
          theme="light"
          style={{
            borderRight: '1px solid #e8e8e8',
            overflow: 'auto',
          }}
        >
          <div style={{
            padding: '12px',
            borderBottom: '1px solid #f0f0f0',
            fontWeight: 600,
            fontSize: 14,
          }}>
            CTD 目录结构
          </div>
          <div style={{ padding: '0 8px 8px' }}>
            <CTDTree
              nodes={nodes}
              onNodeSelect={handleNodeSelect}
            />
          </div>
        </Sider>

        {/* Toggle left panel */}
        <div
          style={{
            width: 24,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            background: '#fafafa',
            borderRight: '1px solid #e8e8e8',
            flexShrink: 0,
          }}
          onClick={toggleLeft}
        >
          {leftCollapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
        </div>

        {/* Center: Editor */}
        <Content style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          background: '#f5f5f5',
          padding: selectedNode?.isLeaf ? 16 : 0,
        }}>
          {!selectedNode ? (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              color: '#8c8c8c',
              fontSize: 16,
            }}>
              请在左侧目录中选择一个章节开始编辑
            </div>
          ) : !selectedNode.isLeaf ? (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              color: '#8c8c8c',
              fontSize: 16,
            }}>
              请选择一个叶节点（文件级章节）进行编辑
            </div>
          ) : docLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
              <Spin />
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
              {isReadOnly && (
                <Alert
                  type={lockedByOther ? 'warning' : 'info'}
                  message={
                    lockedByOther
                      ? `${lockedByName} 正在编辑此节点，当前为只读模式`
                      : '该节点已审批通过，不可编辑'
                  }
                  banner
                  style={{ flexShrink: 0 }}
                />
              )}
              <div style={{ flex: 1, overflow: 'auto' }}>
                <RichEditor
                  content={currentDoc?.contentJson || undefined}
                  onUpdate={handleEditorUpdate}
                  sectionTitle={`${selectedNode.ctdSectionNumber} ${selectedNode.title}`}
                  sequenceId={seqId}
                  editable={!isReadOnly}
                />
              </div>
            </div>
          )}
        </Content>

        {/* Toggle right panel */}
        <div
          style={{
            width: 24,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            background: '#fafafa',
            borderLeft: '1px solid #e8e8e8',
            flexShrink: 0,
          }}
          onClick={toggleRight}
        >
          {rightCollapsed ? <MenuFoldOutlined /> : <MenuUnfoldOutlined />}
        </div>

        {/* Right panel: Properties */}
        <Sider
          width={320}
          collapsedWidth={0}
          collapsed={rightCollapsed}
          theme="light"
          style={{
            borderLeft: '1px solid #e8e8e8',
            overflow: 'auto',
          }}
        >
          {selectedNode && (
            <PropertiesPanel
              node={selectedNode}
              sequenceId={seqId!}
              sequenceNumber={sequence.sequenceNumber}
              document={currentDoc}
              onNodeUpdated={refreshNodes}
              onDocumentReloaded={(doc) => setDocument(doc)}
            />
          )}
        </Sider>
      </Layout>

      {/* Export Modal */}
      {selectedNode && selectedNode.isLeaf && (
        <ExportModal
          open={exportModalOpen}
          onClose={() => setExportModalOpen(false)}
          sequenceId={seqId!}
          node={selectedNode}
        />
      )}
    </Layout>
  );
};

export default EditorPage;
