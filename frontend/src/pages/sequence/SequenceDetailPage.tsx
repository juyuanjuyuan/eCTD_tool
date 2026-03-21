import React, { useState, useCallback, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Card,
  Descriptions,
  Tag,
  Tabs,
  Button,
  Spin,
  message,
  Row,
  Col,
  Breadcrumb,
  Typography,
  Space,
  Result,
} from 'antd';
import {
  ArrowLeftOutlined,
  PlayCircleOutlined,
} from '@ant-design/icons';
import { sequenceApi } from '../../services/application';
import { ctdApi } from '../../services/ctd';
import CTDTree from '../../components/CTDTree';
import CompletenessPanel from '../../components/CompletenessPanel';
import type {
  SequenceNode,
  CompletenessResult,
  ExtensionOption,
} from '../../types';

const statusLabels: Record<string, string> = {
  DRAFT: '草稿',
  EDITING: '编辑中',
  VALIDATING: '验证中',
  EXPORTED: '已导出',
  SUBMITTED: '已提交',
};

const statusColors: Record<string, string> = {
  DRAFT: 'default',
  EDITING: 'processing',
  VALIDATING: 'warning',
  EXPORTED: 'success',
  SUBMITTED: 'purple',
};

const seqTypeLabels: Record<string, string> = {
  cnsqt1: '首次提交',
  cnsqt2: '回复',
  cnsqt3: '撤回',
  cnsqt4: '格式转换',
};

const SequenceDetailPage: React.FC = () => {
  const { seqId } = useParams<{ seqId: string }>();
  const navigate = useNavigate();

  const [sequence, setSequence] = useState<any>(null);
  const [nodes, setNodes] = useState<SequenceNode[]>([]);
  const [completeness, setCompleteness] = useState<CompletenessResult | null>(null);
  const [extensionOptions, setExtensionOptions] = useState<ExtensionOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [initializing, setInitializing] = useState(false);
  const [needsInit, setNeedsInit] = useState(false);

  const fetchSequence = useCallback(async () => {
    if (!seqId) return;
    try {
      const data = await sequenceApi.detail(seqId);
      setSequence(data);
      return data;
    } catch (err: any) {
      message.error(err.message);
    }
  }, [seqId]);

  const fetchNodes = useCallback(async () => {
    if (!seqId) return;
    try {
      const data = await ctdApi.getSequenceNodeTree(seqId);
      setNodes(data);
      setNeedsInit(data.length === 0);
    } catch (err: any) {
      if (err.message?.includes('不存在')) {
        setNeedsInit(true);
      } else {
        message.error(err.message);
      }
    }
  }, [seqId]);

  const fetchCompleteness = useCallback(async () => {
    if (!seqId) return;
    try {
      const data = await ctdApi.checkCompleteness(seqId);
      setCompleteness(data);
    } catch {
      // Ignore if not initialized yet
    }
  }, [seqId]);

  const fetchExtensionOptions = useCallback(async () => {
    try {
      const data = await ctdApi.getExtensionOptions();
      setExtensionOptions(data);
    } catch {
      // Non-critical
    }
  }, []);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      await Promise.all([
        fetchSequence(),
        fetchNodes(),
        fetchExtensionOptions(),
      ]);
      await fetchCompleteness();
      setLoading(false);
    };
    load();
  }, [fetchSequence, fetchNodes, fetchCompleteness, fetchExtensionOptions]);

  const handleInitialize = async () => {
    if (!seqId) return;
    setInitializing(true);
    try {
      await ctdApi.initializeSequence(seqId);
      message.success('目录初始化完成');
      await fetchNodes();
      await fetchCompleteness();
      await fetchSequence();
      setNeedsInit(false);
    } catch (err: any) {
      message.error(err.message);
    } finally {
      setInitializing(false);
    }
  };

  const handleNodeSelect = (node: SequenceNode) => {
    if (node.isLeaf) {
      // Future: navigate to editor
      message.info(`选中: ${node.ctdSectionNumber} ${node.title}`);
    }
  };

  const handleAddExtension = async (parentNodeId: string, extensionType: string) => {
    if (!seqId) return;
    try {
      await ctdApi.createExtensionNode(seqId, parentNodeId, extensionType);
      message.success('扩展节点已创建');
      await fetchNodes();
    } catch (err: any) {
      message.error(err.message);
    }
  };

  const handleDeleteExtension = async (nodeId: string) => {
    if (!seqId) return;
    try {
      await ctdApi.deleteExtensionNode(seqId, nodeId);
      message.success('扩展节点已删除');
      await fetchNodes();
    } catch (err: any) {
      message.error(err.message);
    }
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 100 }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!sequence) {
    return <Result status="404" title="序列不存在" />;
  }

  const appInfo = sequence.regulatoryActivity?.application;
  const isBiological = appInfo?.productTypeCode === 'cnprt2';

  return (
    <div style={{ padding: 24 }}>
      <Space style={{ marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(-1)}>
          返回
        </Button>
      </Space>

      <Breadcrumb
        items={[
          { title: '项目' },
          { title: appInfo?.project?.name || '项目' },
          { title: `申请 ${appInfo?.applicationNumber || ''}` },
          { title: `序列 ${sequence.sequenceNumber}` },
        ]}
        style={{ marginBottom: 16 }}
      />

      <Card style={{ marginBottom: 16 }}>
        <Descriptions
          title={
            <Space>
              <Typography.Title level={4} style={{ margin: 0 }}>
                序列 {sequence.sequenceNumber}
              </Typography.Title>
              <Tag color={statusColors[sequence.status]}>
                {statusLabels[sequence.status]}
              </Tag>
            </Space>
          }
          column={3}
          size="small"
        >
          <Descriptions.Item label="序列类型">
            {seqTypeLabels[sequence.sequenceTypeCode] || sequence.sequenceTypeCode}
          </Descriptions.Item>
          <Descriptions.Item label="描述">
            {sequence.description}
          </Descriptions.Item>
          <Descriptions.Item label="联系人">
            {sequence.contactName} ({sequence.contactEmail})
          </Descriptions.Item>
        </Descriptions>
      </Card>

      {needsInit ? (
        <Card>
          <Result
            icon={<PlayCircleOutlined />}
            title="初始化 CTD 目录结构"
            subTitle="根据当前申请类型和注册行为类型，自动创建 eCTD 五模块目录结构并标记必填章节"
            extra={
              <Button
                type="primary"
                size="large"
                loading={initializing}
                onClick={handleInitialize}
              >
                初始化目录
              </Button>
            }
          />
        </Card>
      ) : (
        <Tabs
          defaultActiveKey="tree"
          items={[
            {
              key: 'tree',
              label: 'CTD 目录结构',
              children: (
                <Row gutter={16}>
                  <Col span={24}>
                    <Card title="CTD 五模块目录" size="small">
                      <CTDTree
                        nodes={nodes}
                        onNodeSelect={handleNodeSelect}
                        onAddExtension={handleAddExtension}
                        onDeleteExtension={handleDeleteExtension}
                        extensionOptions={extensionOptions}
                        isbiological={isBiological}
                      />
                    </Card>
                  </Col>
                </Row>
              ),
            },
            {
              key: 'completeness',
              label: (
                <span>
                  内容完整性
                  {completeness &&
                    completeness.completedRequired < completeness.requiredSections && (
                      <Tag
                        color="red"
                        style={{ marginLeft: 8, fontSize: 10, lineHeight: '16px', padding: '0 4px' }}
                      >
                        {completeness.requiredSections - completeness.completedRequired}
                      </Tag>
                    )}
                </span>
              ),
              children: (
                <CompletenessPanel data={completeness} />
              ),
            },
          ]}
        />
      )}
    </div>
  );
};

export default SequenceDetailPage;
