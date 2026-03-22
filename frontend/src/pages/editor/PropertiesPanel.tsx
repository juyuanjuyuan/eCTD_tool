import React, { useState, useEffect, useCallback } from 'react';
import {
  Tabs,
  Descriptions,
  Tag,
  Select,
  Input,
  Button,
  List,
  Space,
  message,
  Popconfirm,
  Typography,
  Divider,
} from 'antd';
import {
  HistoryOutlined,
  RollbackOutlined,
  CameraOutlined,
} from '@ant-design/icons';
import { ctdApi } from '../../services/ctd';
import { documentApi } from '../../services/document';
import type { SequenceNode, Document, DocumentVersion } from '../../types';

const operationOptions = [
  { label: '新建 (new)', value: 'NEW' },
  { label: '替换 (replace)', value: 'REPLACE' },
  { label: '增补 (append)', value: 'APPEND' },
  { label: '删除 (delete)', value: 'DELETE' },
];

const langOptions = [
  { label: '中文 (zh)', value: 'zh' },
  { label: '英文 (en)', value: 'en' },
  { label: '未指定', value: '' },
];

const statusLabels: Record<string, { text: string; color: string }> = {
  EMPTY: { text: '未开始', color: 'default' },
  EDITING: { text: '编辑中', color: 'processing' },
  COMPLETED: { text: '已完成', color: 'success' },
};

// Sections that support backbone attributes
const SUBSTANCE_SECTIONS = new Set(['2.3.S', '3.2.S']);
const PRODUCT_SECTIONS = new Set(['2.3.P', '3.2.P']);
const INDICATION_SECTIONS = new Set(['2.7.3']);

interface PropertiesPanelProps {
  node: SequenceNode;
  sequenceId: string;
  sequenceNumber: string;
  document: Document | null;
  onNodeUpdated: () => void;
  onDocumentReloaded: (doc: Document) => void;
}

const PropertiesPanel: React.FC<PropertiesPanelProps> = ({
  node,
  sequenceId,
  sequenceNumber,
  document: doc,
  onNodeUpdated,
  onDocumentReloaded,
}) => {
  const [versions, setVersions] = useState<DocumentVersion[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(false);

  const isFirstSequence = sequenceNumber === '0000';
  const hasBackboneAttrs =
    SUBSTANCE_SECTIONS.has(node.ctdSectionNumber) ||
    PRODUCT_SECTIONS.has(node.ctdSectionNumber) ||
    INDICATION_SECTIONS.has(node.ctdSectionNumber);

  // Load versions
  const loadVersions = useCallback(async () => {
    if (!node.id) return;
    setLoadingVersions(true);
    try {
      const data = await documentApi.getVersions(node.id);
      setVersions(data);
    } catch {
      // Ignore
    } finally {
      setLoadingVersions(false);
    }
  }, [node.id]);

  useEffect(() => {
    loadVersions();
  }, [loadVersions]);

  // Update operation type
  const handleOperationChange = async (operation: string) => {
    try {
      await ctdApi.updateSequenceNode(sequenceId, node.id, { operation });
      message.success('操作类型已更新');
      onNodeUpdated();
    } catch (err: any) {
      message.error(err.message);
    }
  };

  // Update node status
  const handleStatusChange = async (status: string) => {
    try {
      await ctdApi.updateSequenceNode(sequenceId, node.id, { status });
      message.success('状态已更新');
      onNodeUpdated();
    } catch (err: any) {
      message.error(err.message);
    }
  };

  // Update backbone attributes
  const handleBackboneUpdate = async (field: string, value: string) => {
    try {
      await ctdApi.updateBackboneAttributes(sequenceId, node.id, { [field]: value });
      message.success('骨架属性已更新');
      onNodeUpdated();
    } catch (err: any) {
      message.error(err.message);
    }
  };

  // Create version snapshot
  const handleCreateSnapshot = async () => {
    try {
      await documentApi.createSnapshot(node.id);
      message.success('版本快照已创建');
      loadVersions();
    } catch (err: any) {
      message.error(err.message);
    }
  };

  // Restore version
  const handleRestore = async (version: number) => {
    try {
      const restored = await documentApi.restore(node.id, version);
      message.success(`已恢复到版本 ${version}`);
      onDocumentReloaded(restored);
      loadVersions();
    } catch (err: any) {
      message.error(err.message);
    }
  };

  const tabItems = [
    {
      key: 'info',
      label: '基本信息',
      children: (
        <div style={{ padding: '0 12px' }}>
          <Descriptions column={1} size="small" style={{ marginBottom: 16 }}>
            <Descriptions.Item label="CTD 编号">
              {node.ctdSectionNumber}
            </Descriptions.Item>
            <Descriptions.Item label="标题">
              {node.title}
            </Descriptions.Item>
            <Descriptions.Item label="所属模块">
              模块 {node.ctdSectionNumber.split('.')[0]}
            </Descriptions.Item>
            <Descriptions.Item label="状态">
              <Tag color={statusLabels[node.status]?.color}>
                {statusLabels[node.status]?.text}
              </Tag>
            </Descriptions.Item>
          </Descriptions>

          {node.isLeaf && (
            <>
              <Divider style={{ margin: '12px 0' }} />

              {/* Status control */}
              <div style={{ marginBottom: 12 }}>
                <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
                  文档状态
                </Typography.Text>
                <Select
                  value={node.status}
                  options={[
                    { label: '未开始', value: 'EMPTY' },
                    { label: '编辑中', value: 'EDITING' },
                    { label: '已完成', value: 'COMPLETED' },
                  ]}
                  onChange={handleStatusChange}
                  style={{ width: '100%' }}
                  size="small"
                />
              </div>

              {/* Operation type */}
              <div style={{ marginBottom: 12 }}>
                <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
                  操作类型 (operation)
                </Typography.Text>
                {isFirstSequence ? (
                  <Tag color="blue">new (首次提交固定)</Tag>
                ) : (
                  <Select
                    value={node.operation || undefined}
                    options={operationOptions}
                    onChange={handleOperationChange}
                    style={{ width: '100%' }}
                    size="small"
                    placeholder="选择操作类型"
                  />
                )}
              </div>

              {/* Language attribute */}
              <div style={{ marginBottom: 12 }}>
                <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
                  语言属性 (xml:lang)
                </Typography.Text>
                <Select
                  value={doc?.xmlLang || 'zh'}
                  options={langOptions}
                  style={{ width: '100%' }}
                  size="small"
                />
              </div>

              {/* Document stats */}
              {doc && (
                <Descriptions column={1} size="small" style={{ marginTop: 12 }}>
                  <Descriptions.Item label="字数">
                    {doc.wordCount}
                  </Descriptions.Item>
                  <Descriptions.Item label="版本">
                    v{doc.version}
                  </Descriptions.Item>
                  {doc.updatedAt && (
                    <Descriptions.Item label="最后编辑">
                      {new Date(doc.updatedAt).toLocaleString('zh-CN')}
                    </Descriptions.Item>
                  )}
                </Descriptions>
              )}
            </>
          )}

          {/* Backbone attributes */}
          {hasBackboneAttrs && (
            <>
              <Divider style={{ margin: '12px 0' }} />
              <Typography.Text strong style={{ fontSize: 13, display: 'block', marginBottom: 8 }}>
                骨架属性
              </Typography.Text>

              {SUBSTANCE_SECTIONS.has(node.ctdSectionNumber) && (
                <>
                  <div style={{ marginBottom: 8 }}>
                    <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
                      活性成分 (substance) *
                    </Typography.Text>
                    <Input
                      size="small"
                      defaultValue={node.substance || ''}
                      onBlur={(e) => handleBackboneUpdate('substance', e.target.value)}
                      placeholder="必填"
                    />
                  </div>
                  <div style={{ marginBottom: 8 }}>
                    <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
                      生产商 (manufacturer) *
                    </Typography.Text>
                    <Input
                      size="small"
                      defaultValue={node.manufacturer || ''}
                      onBlur={(e) => handleBackboneUpdate('manufacturer', e.target.value)}
                      placeholder="必填"
                    />
                  </div>
                </>
              )}

              {PRODUCT_SECTIONS.has(node.ctdSectionNumber) && (
                <>
                  <div style={{ marginBottom: 8 }}>
                    <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
                      产品名称 (product-name)
                    </Typography.Text>
                    <Input
                      size="small"
                      defaultValue={node.productName || ''}
                      onBlur={(e) => handleBackboneUpdate('productName', e.target.value)}
                    />
                  </div>
                  <div style={{ marginBottom: 8 }}>
                    <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
                      剂型 (dosageform)
                    </Typography.Text>
                    <Input
                      size="small"
                      defaultValue={node.dosageForm || ''}
                      onBlur={(e) => handleBackboneUpdate('dosageForm', e.target.value)}
                    />
                  </div>
                  <div style={{ marginBottom: 8 }}>
                    <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
                      生产商 (manufacturer)
                    </Typography.Text>
                    <Input
                      size="small"
                      defaultValue={node.manufacturer || ''}
                      onBlur={(e) => handleBackboneUpdate('manufacturer', e.target.value)}
                    />
                  </div>
                </>
              )}

              {INDICATION_SECTIONS.has(node.ctdSectionNumber) && (
                <div style={{ marginBottom: 8 }}>
                  <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
                    适应症 (indication) *
                  </Typography.Text>
                  <Input.TextArea
                    size="small"
                    rows={2}
                    defaultValue={node.indication || ''}
                    onBlur={(e) => handleBackboneUpdate('indication', e.target.value)}
                    placeholder="必填"
                  />
                </div>
              )}
            </>
          )}
        </div>
      ),
    },
    {
      key: 'versions',
      label: (
        <span>
          <HistoryOutlined /> 版本历史
          {versions.length > 0 && (
            <Tag style={{ marginLeft: 4, fontSize: 10, lineHeight: '16px', padding: '0 4px' }}>
              {versions.length}
            </Tag>
          )}
        </span>
      ),
      children: (
        <div style={{ padding: '0 12px' }}>
          <Button
            icon={<CameraOutlined />}
            size="small"
            onClick={handleCreateSnapshot}
            style={{ marginBottom: 12 }}
            block
            disabled={!doc?.id}
          >
            创建版本快照
          </Button>
          <List
            size="small"
            loading={loadingVersions}
            dataSource={versions}
            locale={{ emptyText: '暂无版本历史' }}
            renderItem={(ver) => (
              <List.Item
                actions={[
                  <Popconfirm
                    key="restore"
                    title={`确认恢复到版本 ${ver.version}？`}
                    description="当前内容会自动保存为新版本"
                    onConfirm={() => handleRestore(ver.version)}
                  >
                    <Button
                      type="link"
                      size="small"
                      icon={<RollbackOutlined />}
                    >
                      恢复
                    </Button>
                  </Popconfirm>,
                ]}
              >
                <List.Item.Meta
                  title={
                    <Space>
                      <span>v{ver.version}</span>
                      <Tag style={{ fontSize: 10 }}>{ver.wordCount} 字</Tag>
                    </Space>
                  }
                  description={new Date(ver.createdAt).toLocaleString('zh-CN')}
                />
              </List.Item>
            )}
          />
        </div>
      ),
    },
  ];

  return (
    <div>
      <div style={{
        padding: '12px',
        borderBottom: '1px solid #f0f0f0',
        fontWeight: 600,
        fontSize: 14,
      }}>
        属性面板
      </div>
      <Tabs
        items={tabItems}
        size="small"
        style={{ padding: '0 4px' }}
        tabBarStyle={{ margin: '0 8px' }}
      />
    </div>
  );
};

export default PropertiesPanel;
