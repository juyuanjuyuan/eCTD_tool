import React, { useState, useCallback, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import {
  Layout,
  Button,
  Tag,
  Space,
  Spin,
  message,
  Result,
  Tooltip,
  Typography,
  Divider,
} from 'antd';
import {
  ArrowLeftOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  SafetyCertificateOutlined,
  SendOutlined,
  ExportOutlined,
  FolderOpenOutlined,
  CheckCircleFilled,
  ClockCircleFilled,
  CloseCircleFilled,
} from '@ant-design/icons';
import { sequenceApi } from '../../services/application';
import { ctdApi } from '../../services/ctd';
import { ectdApi } from '../../services/ectd';
import { approvalApi } from '../../services/approval';
import { useEditorStore } from '../../stores/useEditorStore';
import CTDTree from '../../components/CTDTree';
import FilePanel from '../../components/FilePanel';
import ExportModal from '../../components/ExportModal';
import PropertiesPanel from './PropertiesPanel';
import type { SequenceNode, CompletenessResult } from '../../types';

const { Sider, Content } = Layout;
const { Text } = Typography;

const approvalConfig: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  APPROVED: { label: '已审批', color: '#52c41a', icon: <CheckCircleFilled style={{ color: '#52c41a' }} /> },
  SUBMITTED: { label: '待审批', color: '#1890ff', icon: <ClockCircleFilled style={{ color: '#1890ff' }} /> },
  REJECTED: { label: '已驳回', color: '#ff4d4f', icon: <CloseCircleFilled style={{ color: '#ff4d4f' }} /> },
};

const EditorPage: React.FC = () => {
  const { seqId } = useParams<{ seqId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialNodeId = searchParams.get('nodeId');

  const {
    selectedNode,
    setSelectedNode,
    document: currentDoc,
    setDocument,
    leftCollapsed,
    rightCollapsed,
    toggleLeft,
    toggleRight,
  } = useEditorStore();

  const [sequence, setSequence] = useState<any>(null);
  const [nodes, setNodes] = useState<SequenceNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [completeness, setCompleteness] = useState<CompletenessResult | null>(null);
  const [validating, setValidating] = useState(false);

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
    return () => {
      setSelectedNode(null);
      setDocument(null);
    };
  }, [seqId, setSelectedNode, setDocument]);

  // Auto-select node from URL query param
  useEffect(() => {
    if (initialNodeId && nodes.length > 0 && !selectedNode) {
      const findNode = (items: SequenceNode[]): SequenceNode | null => {
        for (const n of items) {
          if (n.id === initialNodeId) return n;
          if (n.children?.length) {
            const found = findNode(n.children);
            if (found) return found;
          }
        }
        return null;
      };
      const target = findNode(nodes);
      if (target) setSelectedNode(target);
    }
  }, [initialNodeId, nodes, selectedNode, setSelectedNode]);

  const handleNodeSelect = useCallback((node: SequenceNode) => {
    setSelectedNode(node);
  }, [setSelectedNode]);

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

  const refreshNodes = useCallback(async () => {
    if (!seqId) return;
    try {
      const tree = await ctdApi.getSequenceNodeTree(seqId);
      setNodes(tree);
      // Update selectedNode with fresh data from tree
      if (selectedNode) {
        const findNode = (items: SequenceNode[]): SequenceNode | null => {
          for (const n of items) {
            if (n.id === selectedNode.id) return n;
            if (n.children?.length) {
              const found = findNode(n.children);
              if (found) return found;
            }
          }
          return null;
        };
        const updated = findNode(tree);
        if (updated) setSelectedNode(updated);
      }
    } catch {
      // Ignore
    }
  }, [seqId, selectedNode?.id, setSelectedNode]);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#f0f2f5' }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!sequence) {
    return <Result status="404" title="序列不存在" subTitle="请检查链接是否正确，或返回序列列表" />;
  }

  const appInfo = sequence.regulatoryActivity?.application;
  const approval = selectedNode?.isLeaf && selectedNode.approvalStatus !== 'DRAFT'
    ? approvalConfig[selectedNode.approvalStatus]
    : null;
  const canSubmit = selectedNode?.isLeaf
    && (selectedNode.approvalStatus === 'DRAFT' || selectedNode.approvalStatus === 'REJECTED')
    && selectedNode.status !== 'EMPTY';

  return (
    <Layout style={{ height: '100vh', background: '#f0f2f5' }}>
      {/* ── Top bar ── */}
      <div style={{
        height: 56,
        background: '#fff',
        borderBottom: '1px solid #e8e8e8',
        padding: '0 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0,
        boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
      }}>
        {/* Left: Navigation */}
        <Space size={12} align="center">
          <Tooltip title="返回序列详情">
            <Button
              type="text"
              icon={<ArrowLeftOutlined />}
              onClick={() => navigate(`/sequences/${seqId}`)}
              style={{ fontSize: 16 }}
            />
          </Tooltip>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <Link to={appInfo?.project?.id ? `/projects/${appInfo.project.id}` : '/projects'}
              style={{ fontSize: 13, color: '#8c8c8c' }}>
              {appInfo?.project?.name || '项目'}
            </Link>
            <Text type="secondary" style={{ fontSize: 13 }}>/</Text>
            <Link to={appInfo?.project?.id && appInfo?.id
              ? `/projects/${appInfo.project.id}/applications/${appInfo.id}`
              : '/projects'}
              style={{ fontSize: 13, color: '#8c8c8c' }}>
              {appInfo?.applicationNumber || '申请'}
            </Link>
            <Text type="secondary" style={{ fontSize: 13 }}>/</Text>
            <Link to={`/sequences/${seqId}`} style={{ fontSize: 14, fontWeight: 600, color: 'inherit' }}>
              序列 {sequence.sequenceNumber}
            </Link>
          </div>
        </Space>

        {/* Right: Actions */}
        <Space size={8} split={<Divider type="vertical" style={{ margin: 0 }} />}>
          {/* Completeness */}
          {completeness && completeness.requiredSections > 0 && (
            <Tag
              color={completeness.completedRequired >= completeness.requiredSections ? 'green' : 'orange'}
              style={{ margin: 0 }}
            >
              必填 {completeness.completedRequired}/{completeness.requiredSections}
            </Tag>
          )}
          {completeness && completeness.requiredSections === 0 && (
            <Tag color="default" style={{ margin: 0 }}>无必填</Tag>
          )}

          {/* Approval status */}
          {approval && (
            <Space size={4}>
              {approval.icon}
              <Text style={{ color: approval.color, fontSize: 13 }}>{approval.label}</Text>
            </Space>
          )}

          {/* Action buttons */}
          <Space size={4}>
            {canSubmit && (
              <Tooltip title="提交审批">
                <Button
                  type="text"
                  icon={<SendOutlined />}
                  onClick={handleSubmitApproval}
                />
              </Tooltip>
            )}
            <Tooltip title="运行 eCTD 验证">
              <Button
                type="text"
                icon={<SafetyCertificateOutlined />}
                onClick={handleRunValidation}
                loading={validating}
              />
            </Tooltip>
            <Tooltip title="导出文档">
              <Button
                type="text"
                icon={<ExportOutlined />}
                onClick={() => setExportModalOpen(true)}
                disabled={!selectedNode?.isLeaf}
              />
            </Tooltip>
          </Space>
        </Space>
      </div>

      {/* ── Body ── */}
      <Layout style={{ flex: 1, overflow: 'hidden', background: 'transparent' }}>
        {/* Left: CTD Tree */}
        <Sider
          width={320}
          collapsedWidth={0}
          collapsed={leftCollapsed}
          theme="light"
          style={{
            borderRight: '1px solid #e8e8e8',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div style={{
            padding: '14px 16px 12px',
            borderBottom: '1px solid #f0f0f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <Text strong style={{ fontSize: 14 }}>CTD 目录</Text>
            <Tooltip title="收起目录">
              <Button type="text" size="small" icon={<MenuFoldOutlined />} onClick={toggleLeft} />
            </Tooltip>
          </div>
          <div style={{ flex: 1, overflow: 'auto', padding: '8px 12px 12px' }}>
            <CTDTree nodes={nodes} onNodeSelect={handleNodeSelect} selectedNodeId={selectedNode?.id} />
          </div>
        </Sider>

        {/* Left toggle (collapsed only) */}
        {leftCollapsed && (
          <Tooltip title="展开目录" placement="right">
            <div
              style={{
                width: 28,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                background: '#fff',
                borderRight: '1px solid #e8e8e8',
                flexShrink: 0,
                transition: 'background 0.2s',
              }}
              onClick={toggleLeft}
              onMouseEnter={(e) => (e.currentTarget.style.background = '#f5f5f5')}
              onMouseLeave={(e) => (e.currentTarget.style.background = '#fff')}
            >
              <MenuUnfoldOutlined style={{ color: '#8c8c8c' }} />
            </div>
          </Tooltip>
        )}

        {/* Center: File Upload & Management */}
        <Content style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          background: '#f0f2f5',
          padding: 20,
        }}>
          {!selectedNode ? (
            <div style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              background: '#fff',
              borderRadius: 8,
            }}>
              <FolderOpenOutlined style={{ fontSize: 56, color: '#d9d9d9', marginBottom: 20 }} />
              <Text style={{ fontSize: 16, color: '#8c8c8c', marginBottom: 6 }}>
                选择一个章节开始工作
              </Text>
              <Text type="secondary" style={{ fontSize: 13 }}>
                从左侧 CTD 目录中选择叶节点，上传或管理申报文件
              </Text>
            </div>
          ) : !selectedNode.isLeaf ? (
            <div style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              background: '#fff',
              borderRadius: 8,
            }}>
              <FolderOpenOutlined style={{ fontSize: 56, color: '#d9d9d9', marginBottom: 20 }} />
              <Text style={{ fontSize: 16, color: '#595959', marginBottom: 6 }}>
                {selectedNode.ctdSectionNumber} {selectedNode.title}
              </Text>
              <Text type="secondary" style={{ fontSize: 13 }}>
                这是一个目录节点，请展开选择下级叶节点来上传文件
              </Text>
            </div>
          ) : (
            <div style={{
              flex: 1,
              background: '#fff',
              borderRadius: 8,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}>
              {/* Section header */}
              <div style={{
                padding: '16px 24px 14px',
                borderBottom: '1px solid #f0f0f0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexShrink: 0,
              }}>
                <div>
                  <Space size={8} align="center">
                    <Text strong style={{ fontSize: 16 }}>
                      {selectedNode.ctdSectionNumber}
                    </Text>
                    <Text style={{ fontSize: 16 }}>
                      {selectedNode.title}
                    </Text>
                  </Space>
                </div>
                <Space size={8}>
                  {selectedNode.operation && (
                    <Tag style={{ margin: 0 }}>{selectedNode.operation}</Tag>
                  )}
                  {approval && (
                    <Tag color={approval.color} style={{ margin: 0 }}>
                      {approval.icon} {approval.label}
                    </Tag>
                  )}
                </Space>
              </div>

              {/* File management area */}
              <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px' }}>
                <FilePanel nodeId={selectedNode.id} isLeaf={selectedNode.isLeaf} />
              </div>
            </div>
          )}
        </Content>

        {/* Right toggle (collapsed only) */}
        {rightCollapsed && (
          <Tooltip title="展开属性" placement="left">
            <div
              style={{
                width: 28,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                background: '#fff',
                borderLeft: '1px solid #e8e8e8',
                flexShrink: 0,
                transition: 'background 0.2s',
              }}
              onClick={toggleRight}
              onMouseEnter={(e) => (e.currentTarget.style.background = '#f5f5f5')}
              onMouseLeave={(e) => (e.currentTarget.style.background = '#fff')}
            >
              <MenuFoldOutlined style={{ color: '#8c8c8c' }} />
            </div>
          </Tooltip>
        )}

        {/* Right: Properties */}
        <Sider
          width={360}
          collapsedWidth={0}
          collapsed={rightCollapsed}
          theme="light"
          style={{
            borderLeft: '1px solid #e8e8e8',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div style={{
            padding: '14px 16px 12px',
            borderBottom: '1px solid #f0f0f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <Text strong style={{ fontSize: 14 }}>
              {selectedNode ? `${selectedNode.ctdSectionNumber} 属性` : '属性'}
            </Text>
            <Tooltip title="收起属性">
              <Button type="text" size="small" icon={<MenuUnfoldOutlined />} onClick={toggleRight} />
            </Tooltip>
          </div>
          <div style={{ flex: 1, overflow: 'auto' }}>
            {selectedNode ? (
              <PropertiesPanel
                node={selectedNode}
                sequenceId={seqId!}
                sequenceNumber={sequence.sequenceNumber}
                document={currentDoc}
                onNodeUpdated={refreshNodes}
                onDocumentReloaded={(doc) => setDocument(doc)}
              />
            ) : (
              <div style={{ padding: 24, textAlign: 'center', color: '#bfbfbf' }}>
                <Text type="secondary">选择一个节点查看属性</Text>
              </div>
            )}
          </div>
        </Sider>
      </Layout>

      {/* Export Modal */}
      {selectedNode?.isLeaf && (
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
