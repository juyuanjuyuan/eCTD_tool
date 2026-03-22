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
} from '@ant-design/icons';
import { sequenceApi } from '../../services/application';
import { ctdApi } from '../../services/ctd';
import { documentApi } from '../../services/document';
import { useEditorStore } from '../../stores/useEditorStore';
import { useAutoSave } from '../../hooks/useAutoSave';
import CTDTree from '../../components/CTDTree';
import RichEditor from '../../components/RichEditor';
import ExportModal from '../../components/ExportModal';
import PropertiesPanel from './PropertiesPanel';
import type { SequenceNode } from '../../types';

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

  const { debouncedSave, flushSave } = useAutoSave(selectedNode?.id || null);
  const prevNodeRef = useRef<string | null>(null);

  // Load sequence and nodes
  useEffect(() => {
    if (!seqId) return;
    const load = async () => {
      setLoading(true);
      try {
        const [seq, tree] = await Promise.all([
          sequenceApi.detail(seqId),
          ctdApi.getSequenceNodeTree(seqId),
        ]);
        setSequence(seq);
        setNodes(tree);
      } catch (err: any) {
        message.error(err.message);
      } finally {
        setLoading(false);
      }
    };
    load();

    // Cleanup on unmount
    return () => {
      setSelectedNode(null);
      setDocument(null);
    };
  }, [seqId, setSelectedNode, setDocument]);

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

    // Save previous node's content before switching
    if (prevNodeRef.current && prevNodeRef.current !== node.id) {
      await flushSave();
    }

    setSelectedNode(node);
    prevNodeRef.current = node.id;
    await loadDocument(node.id);
  }, [flushSave, setSelectedNode, loadDocument]);

  // Handle editor content updates
  const handleEditorUpdate = useCallback((json: any, html: string) => {
    if (selectedNode?.id) {
      debouncedSave(json, html);
    }
  }, [selectedNode?.id, debouncedSave]);

  // Manual save
  const handleManualSave = useCallback(async () => {
    await flushSave();
    message.success('已保存');
  }, [flushSave]);

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
            <RichEditor
              content={currentDoc?.contentJson || undefined}
              onUpdate={handleEditorUpdate}
              sectionTitle={`${selectedNode.ctdSectionNumber} ${selectedNode.title}`}
            />
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
