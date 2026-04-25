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
  Tabs,
  Modal,
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
  PlayCircleOutlined,
  InfoCircleOutlined,
} from '@ant-design/icons';
import { sequenceApi } from '../../services/application';
import { ctdApi } from '../../services/ctd';
import { ectdApi } from '../../services/ectd';
import { approvalApi } from '../../services/approval';
import { useEditorStore } from '../../stores/useEditorStore';
import CTDTree from '../../components/CTDTree';
import FilePanel from '../../components/FilePanel';
import ExportModal from '../../components/ExportModal';
import AddInstanceModal from '../../components/AddInstanceModal';
import CompletenessPanel from '../../components/CompletenessPanel';
import ValidationPanel from '../../components/ValidationPanel';
import XmlPreviewPanel from '../../components/XmlPreviewPanel';
import EctdPackagePanel from '../../components/EctdPackagePanel';
import PropertiesPanel from './PropertiesPanel';
import type { SequenceNode, CompletenessResult, ExtensionOption } from '../../types';
import './EditorPage.css';

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
  const [needsInit, setNeedsInit] = useState(false);
  const [initializing, setInitializing] = useState(false);
  const [extensionOptions, setExtensionOptions] = useState<ExtensionOption[]>([]);
  const [centerTab, setCenterTab] = useState('editor');
  const [requiredPreview, setRequiredPreview] = useState<{
    requiredSections: Array<{ section: string; title: string; module: number; severity: string }>;
    forbiddenSections: Array<{ section: string; title: string; module: number }>;
    totalRequired: number;
  } | null>(null);

  useEffect(() => {
    if (!seqId) return;
    const load = async () => {
      setLoading(true);
      try {
        const [seq, tree, comp] = await Promise.all([
          sequenceApi.detail(seqId),
          ctdApi.getSequenceNodeTree(seqId).catch(() => []),
          ctdApi.checkCompleteness(seqId).catch(() => null),
        ]);
        setSequence(seq);
        setNodes(tree);
        if (comp) setCompleteness(comp);
        setNeedsInit(tree.length === 0);

        ctdApi.getExtensionOptions().then(setExtensionOptions).catch(() => {});
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

  useEffect(() => {
    if (needsInit && seqId) {
      ctdApi.previewRequired(seqId)
        .then(setRequiredPreview)
        .catch(() => {});
    }
  }, [needsInit, seqId]);

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
    setCenterTab('editor');
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
        message.warning(`验证发现 ${errors.length} 个错误`);
      }
      setCenterTab('validation');
    } catch (err: any) {
      message.error(`验证失败: ${err.message}`);
    } finally {
      setValidating(false);
    }
  }, [seqId]);

  const handleInitialize = async () => {
    if (!seqId) return;
    setInitializing(true);
    try {
      await ctdApi.initializeSequence(seqId);
      message.success('目录初始化完成');
      const [tree, comp, seq] = await Promise.all([
        ctdApi.getSequenceNodeTree(seqId),
        ctdApi.checkCompleteness(seqId).catch(() => null),
        sequenceApi.detail(seqId),
      ]);
      setNodes(tree);
      if (comp) setCompleteness(comp);
      setSequence(seq);
      setNeedsInit(false);
    } catch (err: any) {
      message.error(err.message);
    } finally {
      setInitializing(false);
    }
  };

  const handleAddExtension = async (parentNodeId: string, extensionType: string) => {
    if (!seqId) return;
    try {
      await ctdApi.createExtensionNode(seqId, parentNodeId, extensionType);
      message.success('扩展节点已创建');
      await refreshNodes();
    } catch (err: any) {
      message.error(err.message);
    }
  };

  const handleDeleteExtension = async (nodeId: string) => {
    if (!seqId) return;
    try {
      await ctdApi.deleteExtensionNode(seqId, nodeId);
      message.success('扩展节点已删除');
      await refreshNodes();
    } catch (err: any) {
      message.error(err.message);
    }
  };

  // Plan 13 (2026-04-23): 多实例节点 - 弹窗接线
  const [addInstanceModal, setAddInstanceModal] = useState<{
    open: boolean;
    template: { id: string; titleZh: string; instanceKeyFields: string[] | null } | null;
  }>({ open: false, template: null });

  const handleRequestAddInstance = (node: SequenceNode) => {
    if (!node.templateNode?.isRepeatable) return;
    setAddInstanceModal({
      open: true,
      template: {
        id: node.templateNode.id,
        titleZh: node.title,
        instanceKeyFields: node.templateNode.instanceKeyFields ?? null,
      },
    });
  };

  const handleRequestRemoveInstance = (node: SequenceNode) => {
    if (!seqId) return;
    Modal.confirm({
      title: '删除实例',
      content: `确认删除 "${node.instanceLabel ?? node.title}" 实例? 首次序列将物理删除整个子树; 非首次序列将级联标记为 DELETE 操作.`,
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        try {
          await ctdApi.removeInstance(seqId, node.id);
          message.success('实例已删除');
          await refreshNodes();
        } catch (err: any) {
          message.error(err?.response?.data?.message || err.message);
        }
      },
    });
  };

  const refreshNodes = useCallback(async () => {
    if (!seqId) return;
    try {
      const [tree, comp] = await Promise.all([
        ctdApi.getSequenceNodeTree(seqId),
        ctdApi.checkCompleteness(seqId).catch(() => null),
      ]);
      setNodes(tree);
      if (comp) setCompleteness(comp);
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
  const isBiological = appInfo?.productTypeCode === 'cnprt2';
  const approval = selectedNode?.isLeaf && selectedNode.approvalStatus !== 'DRAFT'
    ? approvalConfig[selectedNode.approvalStatus]
    : null;
  const canSubmit = selectedNode?.isLeaf
    && (selectedNode.approvalStatus === 'DRAFT' || selectedNode.approvalStatus === 'REJECTED')
    && selectedNode.status !== 'EMPTY';

  const collectLeafNodeIds = useCallback((root: SequenceNode | null, tree: SequenceNode[]): string[] => {
    if (!root) return [];
    const leaves: string[] = [];
    const targetId = root.id;

    const findTargetAndCollect = (items: SequenceNode[]): boolean => {
      for (const n of items) {
        if (n.id === targetId) {
          const walk = (node: SequenceNode) => {
            if (node.isLeaf) {
              leaves.push(node.id);
              return;
            }
            node.children?.forEach(walk);
          };
          walk(n);
          return true;
        }
        if (n.children?.length && findTargetAndCollect(n.children)) {
          return true;
        }
      }
      return false;
    };

    findTargetAndCollect(tree);
    return leaves;
  }, []);

  // Render the center content based on active tab
  const renderCenterContent = () => {
    if (needsInit) {
      return (
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#fff',
          borderRadius: 8,
          padding: 40,
        }}>
          <PlayCircleOutlined style={{ fontSize: 56, color: '#1890ff', marginBottom: 20 }} />
          <Text style={{ fontSize: 18, fontWeight: 500, marginBottom: 8 }}>
            初始化 CTD 目录结构
          </Text>
          <Text type="secondary" style={{ fontSize: 14, marginBottom: 24, textAlign: 'center', maxWidth: 500 }}>
            根据当前申请类型和注册行为类型，自动创建 eCTD 五模块目录结构并标记必填章节
          </Text>
          <Button type="primary" size="large" loading={initializing} onClick={handleInitialize}>
            初始化目录
          </Button>
          {requiredPreview && requiredPreview.requiredSections.length > 0 && (
            <div style={{ marginTop: 32, width: '100%', maxWidth: 600 }}>
              <Text strong>
                <InfoCircleOutlined style={{ marginRight: 8 }} />
                必填章节清单（共 {requiredPreview.totalRequired} 项）
              </Text>
              <div style={{ maxHeight: 250, overflow: 'auto', marginTop: 12, border: '1px solid #f0f0f0', borderRadius: 6, padding: '8px 12px' }}>
                {requiredPreview.requiredSections.map((s) => (
                  <div key={s.section} style={{ padding: '4px 0', borderBottom: '1px solid #f0f0f0' }}>
                    <Tag color={s.severity === 'ERROR' ? 'red' : 'orange'} style={{ marginRight: 8 }}>
                      {s.severity === 'ERROR' ? '必填' : '建议'}
                    </Tag>
                    <span style={{ color: '#262626', fontFamily: 'monospace', fontSize: 12 }}>{s.section}</span>
                    <span style={{ marginLeft: 8, color: '#595959' }}>{s.title}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      );
    }

    // Tool panels (completeness, validation, xml, export)
    if (centerTab === 'completeness') {
      return (
        <div style={{ flex: 1, background: '#fff', borderRadius: 8, overflow: 'auto', padding: 20 }}>
          <CompletenessPanel data={completeness} />
        </div>
      );
    }
    if (centerTab === 'validation') {
      return (
        <div style={{ flex: 1, background: '#fff', borderRadius: 8, overflow: 'auto', padding: 20 }}>
          <ValidationPanel sequenceId={seqId!} />
        </div>
      );
    }
    if (centerTab === 'xml-preview') {
      return (
        <div style={{ flex: 1, background: '#fff', borderRadius: 8, overflow: 'auto', padding: 20 }}>
          <XmlPreviewPanel sequenceId={seqId!} />
        </div>
      );
    }
    if (centerTab === 'ectd-export') {
      return (
        <div style={{ flex: 1, background: '#fff', borderRadius: 8, overflow: 'auto', padding: 20 }}>
          <EctdPackagePanel sequenceId={seqId!} />
        </div>
      );
    }

    // Default: editor view
    if (!selectedNode) {
      return (
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
      );
    }
    if (!selectedNode.isLeaf) {
      return (
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
      );
    }
    return (
      <div style={{
        flex: 1,
        background: '#fff',
        borderRadius: 8,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}>
        <div style={{
          padding: '16px 24px 14px',
          borderBottom: '1px solid #f0f0f0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <Space size={8} align="center">
            <Text strong style={{ fontSize: 16 }}>{selectedNode.ctdSectionNumber}</Text>
            <Text style={{ fontSize: 16 }}>{selectedNode.title}</Text>
          </Space>
          <Space size={8}>
            {selectedNode.operation && <Tag style={{ margin: 0 }}>{selectedNode.operation}</Tag>}
            {approval && (
              <Tag color={approval.color} style={{ margin: 0 }}>
                {approval.icon} {approval.label}
              </Tag>
            )}
          </Space>
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px' }}>
          <FilePanel nodeId={selectedNode.id} isLeaf={selectedNode.isLeaf} />
        </div>
      </div>
    );
  };

  return (
    <Layout style={{ height: '100vh', background: '#f0f2f5' }}>
      {/* Top bar */}
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
          <Tooltip title="返回申请详情">
            <Button
              type="text"
              icon={<ArrowLeftOutlined />}
              onClick={() => {
                const projectId = appInfo?.project?.id;
                const aId = appInfo?.id;
                if (projectId && aId) {
                  navigate(`/projects/${projectId}/applications/${aId}`);
                } else {
                  navigate('/projects');
                }
              }}
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
            <Text style={{ fontSize: 14, fontWeight: 600 }}>
              序列 {sequence.sequenceNumber}
            </Text>
          </div>
        </Space>

        {/* Right: Actions */}
        <Space size={8} split={<Divider type="vertical" style={{ margin: 0 }} />}>
          {completeness && completeness.requiredSections > 0 && (
            <Tag
              color={completeness.completedRequired >= completeness.requiredSections ? 'green' : 'orange'}
              style={{ margin: 0 }}
            >
              必填 {completeness.completedRequired}/{completeness.requiredSections}
            </Tag>
          )}

          {approval && (
            <Space size={4}>
              {approval.icon}
              <Text style={{ color: approval.color, fontSize: 13 }}>{approval.label}</Text>
            </Space>
          )}

          <Space size={4}>
            {canSubmit && (
              <Tooltip title="提交审批">
                <Button type="text" icon={<SendOutlined />} onClick={handleSubmitApproval} />
              </Tooltip>
            )}
            <Tooltip title="运行 eCTD 验证">
              <Button
                type="text"
                icon={<SafetyCertificateOutlined />}
                onClick={handleRunValidation}
                loading={validating}
                disabled={needsInit}
              />
            </Tooltip>
            <Tooltip title="导出文档">
              <Button
                type="text"
                icon={<ExportOutlined />}
                onClick={() => setExportModalOpen(true)}
                disabled={!selectedNode}
              />
            </Tooltip>
          </Space>
        </Space>
      </div>

      {/* Body */}
      <Layout style={{ flex: 1, overflow: 'hidden', background: 'transparent' }}>
        {/* Left: CTD Tree */}
        <Sider
          width={320}
          collapsedWidth={0}
          collapsed={leftCollapsed}
          theme="light"
          className="editor-sider"
          style={{
            borderRight: '1px solid #e8e8e8',
            overflow: 'hidden',
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
            {needsInit ? (
              <div style={{ textAlign: 'center', padding: '40px 16px', color: '#8c8c8c' }}>
                <PlayCircleOutlined style={{ fontSize: 36, color: '#d9d9d9', marginBottom: 12 }} />
                <div style={{ marginBottom: 12 }}>需要初始化 CTD 目录</div>
                <Button type="primary" loading={initializing} onClick={handleInitialize}>
                  初始化目录
                </Button>
              </div>
            ) : (
              <CTDTree
                nodes={nodes}
                onNodeSelect={handleNodeSelect}
                onAddExtension={handleAddExtension}
                onDeleteExtension={handleDeleteExtension}
                extensionOptions={extensionOptions}
                isbiological={isBiological}
                selectedNodeId={selectedNode?.id}
                onRequestAddInstance={handleRequestAddInstance}
                onRequestRemoveInstance={handleRequestRemoveInstance}
              />
            )}
          </div>
        </Sider>

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

        {/* Center: Tab bar + content */}
        <Content style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          background: '#f0f2f5',
        }}>
          {/* Tab bar above the editor */}
          {!needsInit && (
            <div style={{
              background: '#fff',
              borderBottom: '1px solid #e8e8e8',
              padding: '0 20px',
              flexShrink: 0,
            }}>
              <Tabs
                activeKey={centerTab}
                onChange={setCenterTab}
                size="small"
                style={{ marginBottom: 0 }}
                items={[
                  { key: 'editor', label: '编辑' },
                  {
                    key: 'completeness',
                    label: completeness && completeness.requiredSections > 0 && completeness.completedRequired < completeness.requiredSections
                      ? <span>内容完整性 <Tag color="red" style={{ marginLeft: 4, fontSize: 10, lineHeight: '16px', padding: '0 4px' }}>{completeness.requiredSections - completeness.completedRequired}</Tag></span>
                      : '内容完整性',
                  },
                  { key: 'validation', label: 'eCTD 验证' },
                  { key: 'xml-preview', label: 'XML 骨架预览' },
                  { key: 'ectd-export', label: 'eCTD 导出' },
                ]}
              />
            </div>
          )}

          {/* Content area */}
          <div style={{ flex: 1, overflow: 'hidden', padding: 20, display: 'flex', flexDirection: 'column' }}>
            {renderCenterContent()}
          </div>
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

        {/* Right: Properties only */}
        <Sider
          width={360}
          collapsedWidth={0}
          collapsed={rightCollapsed}
          theme="light"
          className="editor-sider"
          style={{
            borderLeft: '1px solid #e8e8e8',
            overflow: 'hidden',
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
      {selectedNode && (
        <ExportModal
          open={exportModalOpen}
          onClose={() => setExportModalOpen(false)}
          sequenceId={seqId!}
          node={selectedNode}
          batchNodeIds={collectLeafNodeIds(selectedNode, nodes)}
        />
      )}

      {/* Plan 13: 多实例节点 - 添加实例弹窗 */}
      <AddInstanceModal
        open={addInstanceModal.open}
        seqId={seqId!}
        template={
          addInstanceModal.template
            ? ({
                id: addInstanceModal.template.id,
                titleZh: addInstanceModal.template.titleZh,
                instanceKeyFields: addInstanceModal.template.instanceKeyFields,
              } as any)
            : null
        }
        onClose={() => setAddInstanceModal({ open: false, template: null })}
        onAdded={refreshNodes}
      />
    </Layout>
  );
};

export default EditorPage;
