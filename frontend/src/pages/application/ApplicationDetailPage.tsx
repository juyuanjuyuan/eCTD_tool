import React, { useEffect, useState, useCallback } from 'react';
import {
  Typography,
  Descriptions,
  Tag,
  Table,
  Button,
  Space,
  Modal,
  Form,
  Input,
  Select,
  Collapse,
  message,
  Breadcrumb,
  Spin,
  Result,
} from 'antd';
import { PlusOutlined, EditOutlined } from '@ant-design/icons';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { applicationApi, regulatoryActivityApi, sequenceApi } from '../../services/application';
import { cvApi } from '../../services/cv';
import type {
  Application,
  RegulatoryActivity,
  Sequence,
  ControlledVocabulary,
} from '../../types';

const appTypeLabels: Record<string, string> = {
  cnapt1: '临床试验申请', cnapt2: '新药申请', cnapt3: '仿制药申请', cnapt4: '原料药申请',
};
const ratLabels: Record<string, string> = {
  cnrat1: '首次申请', cnrat2: '补充申请', cnrat3: '备案', cnrat4: '报告',
  cnrat5: '新适应症和联合用药', cnrat6: '新适应症', cnrat7: '研发期间安全性报告',
  cnrat8: '再注册', cnrat9: '基线',
};
const sqtLabels: Record<string, string> = {
  cnsqt1: '首次提交', cnsqt2: '回复', cnsqt3: '撤回', cnsqt4: '格式转换',
};
const statusLabels: Record<string, { color: string; text: string }> = {
  DRAFT: { color: 'default', text: '草稿' },
  EDITING: { color: 'blue', text: '编辑中' },
  VALIDATING: { color: 'orange', text: '验证中' },
  EXPORTED: { color: 'green', text: '已导出' },
  SUBMITTED: { color: 'purple', text: '已提交' },
};

const ApplicationDetailPage: React.FC = () => {
  const { id: projectId, appId } = useParams<{ id: string; appId: string }>();
  const navigate = useNavigate();
  const [application, setApplication] = useState<Application | null>(null);
  const [raList, setRaList] = useState<(RegulatoryActivity & { sequences?: Sequence[] })[]>([]);
  const [seqModalOpen, setSeqModalOpen] = useState(false);
  const [ratOptions, setRatOptions] = useState<ControlledVocabulary[]>([]);
  const [sqtOptions, setSqtOptions] = useState<ControlledVocabulary[]>([]);
  const [seqForm] = Form.useForm();
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const selectedRatCode = Form.useWatch('regulatoryActivityTypeCode', seqForm);

  const fetchData = useCallback(async () => {
    if (!appId) return;
    setLoading(true);
    try {
      const apps = await applicationApi.list(projectId!);
      const app = apps.find((a: Application) => a.id === appId);
      if (app) setApplication(app);

      const ras = await regulatoryActivityApi.list(appId);
      const rasWithSeqs = await Promise.all(
        ras.map(async (ra: RegulatoryActivity) => {
          const sequences = await sequenceApi.list(ra.id);
          return { ...ra, sequences };
        }),
      );
      setRaList(rasWithSeqs);
    } catch (error: any) {
      message.error(error.message);
    } finally {
      setLoading(false);
    }
  }, [appId, projectId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Load RAT options when modal opens
  const openSeqModal = async () => {
    if (!application) return;
    const rats = await cvApi.getRegulatoryActivityTypes(application.applicationTypeCode);
    setRatOptions(rats);
    setSqtOptions([]);
    setSeqModalOpen(true);
  };

  // When RAT selection changes, load corresponding sequence types
  useEffect(() => {
    if (!selectedRatCode || !application) {
      setSqtOptions([]);
      return;
    }
    cvApi.getSequenceTypes(application.applicationTypeCode, selectedRatCode)
      .then(setSqtOptions)
      .catch(() => setSqtOptions([]));
    // Reset sequence type when RAT changes
    seqForm.setFieldValue('sequenceTypeCode', undefined);
  }, [selectedRatCode, application]);

  const handleCreateSequence = async (values: {
    regulatoryActivityTypeCode: string;
    sequenceTypeCode: string;
    description: string;
    contactName: string;
    contactPhone: string;
    contactEmail: string;
  }) => {
    setCreating(true);
    try {
      const result = await applicationApi.createSequenceWithRa(appId!, values);
      message.success(`序列 ${result.sequenceNumber} 创建成功`);
      setSeqModalOpen(false);
      seqForm.resetFields();
      fetchData();
    } catch (error: any) {
      message.error(error.message);
    } finally {
      setCreating(false);
    }
  };

  // Compute total sequence count and next sequence number hint
  const totalSequences = raList.reduce((sum, ra) => sum + (ra.sequences?.length || 0), 0);
  const nextSeqHint = totalSequences === 0
    ? '将创建首个序列 (0000)'
    : `当前共 ${totalSequences} 个序列`;

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!application) {
    return <Result status="404" title="申请不存在" subTitle="请检查链接是否正确，或返回项目详情" />;
  }

  return (
    <div>
      <Breadcrumb
        items={[
          { title: <Link to="/projects">项目列表</Link> },
          { title: <Link to={`/projects/${projectId}`}>项目详情</Link> },
          { title: `申请 ${application.applicationNumber}` },
        ]}
        style={{ marginBottom: 16 }}
      />

      <Typography.Title level={4}>
        申请 {application.applicationNumber}
      </Typography.Title>

      <Descriptions bordered column={2} style={{ marginBottom: 24 }}>
        <Descriptions.Item label="申请编号">{application.applicationNumber}</Descriptions.Item>
        <Descriptions.Item label="申请类型">
          <Tag color="blue">{appTypeLabels[application.applicationTypeCode]}</Tag>
        </Descriptions.Item>
        <Descriptions.Item label="产品类型">
          {application.productTypeCode === 'cnprt1' ? '化学药品' : '生物制品'}
        </Descriptions.Item>
        <Descriptions.Item label="原始编号">{application.productNumber}</Descriptions.Item>
      </Descriptions>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Space align="center">
          <Typography.Title level={5} style={{ margin: 0 }}>
            序列管理
          </Typography.Title>
          <Typography.Text type="secondary" style={{ fontSize: 13 }}>
            {nextSeqHint}
          </Typography.Text>
        </Space>
        <Button type="primary" icon={<PlusOutlined />} onClick={openSeqModal}>
          创建序列
        </Button>
      </div>

      {raList.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: '#8c8c8c' }}>
          <Typography.Text type="secondary">
            尚未创建任何序列，点击"创建序列"开始
          </Typography.Text>
        </div>
      ) : (
        <Collapse
          defaultActiveKey={raList.map((ra) => ra.id)}
          items={raList.map((ra) => ({
            key: ra.id,
            label: (
              <Space>
                <Tag color="blue">{ratLabels[ra.regulatoryActivityTypeCode]}</Tag>
                <span>关联序列: {ra.relatedSequence}</span>
                <span>序列数: {ra.sequences?.length || 0}</span>
              </Space>
            ),
            children: (
              <Table
                rowKey="id"
                dataSource={ra.sequences || []}
                pagination={false}
                size="small"
                columns={[
                  { title: '序列号', dataIndex: 'sequenceNumber' },
                  {
                    title: '序列类型',
                    dataIndex: 'sequenceTypeCode',
                    render: (c: string) => sqtLabels[c] || c,
                  },
                  { title: '描述', dataIndex: 'description', ellipsis: true },
                  {
                    title: '状态',
                    dataIndex: 'status',
                    render: (s: string) => {
                      const info = statusLabels[s] || { color: 'default', text: s };
                      return <Tag color={info.color}>{info.text}</Tag>;
                    },
                  },
                  { title: '联系人', dataIndex: 'contactName' },
                  {
                    title: '创建时间',
                    dataIndex: 'createdAt',
                    render: (t: string) => new Date(t).toLocaleDateString('zh-CN'),
                  },
                  {
                    title: '操作',
                    key: 'action',
                    render: (_: any, record: Sequence) => (
                      <Button
                        type="link"
                        icon={<EditOutlined />}
                        onClick={() => navigate(`/sequences/${record.id}`)}
                      >
                        编辑
                      </Button>
                    ),
                  },
                ]}
              />
            ),
          }))}
        />
      )}

      {/* Combined Create Sequence Modal */}
      <Modal
        title="创建序列"
        open={seqModalOpen}
        onCancel={() => { setSeqModalOpen(false); seqForm.resetFields(); }}
        onOk={() => seqForm.submit()}
        confirmLoading={creating}
        width={560}
      >
        <Form form={seqForm} layout="vertical" onFinish={handleCreateSequence}>
          <Form.Item
            name="regulatoryActivityTypeCode"
            label="注册行为类型"
            rules={[{ required: true, message: '请选择注册行为类型' }]}
            extra="如果该类型的注册行为不存在，系统将自动创建"
          >
            <Select placeholder="选择注册行为类型（已按申请类型过滤）">
              {ratOptions.map((r) => (
                <Select.Option key={r.code} value={r.code}>
                  {r.descriptionZh} ({r.code})
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item
            name="sequenceTypeCode"
            label="序列类型"
            rules={[{ required: true, message: '请选择序列类型' }]}
          >
            <Select
              placeholder={selectedRatCode ? '选择序列类型' : '请先选择注册行为类型'}
              disabled={!selectedRatCode}
            >
              {sqtOptions.map((s) => (
                <Select.Option key={s.code} value={s.code}>
                  {s.descriptionZh} ({s.code})
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item
            name="description"
            label="序列描述"
            rules={[{ required: true, message: '请输入序列描述' }]}
          >
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item
            name="contactName"
            label="联系人姓名"
            rules={[{ required: true, message: '请输入联系人姓名' }]}
          >
            <Input />
          </Form.Item>
          <Form.Item
            name="contactPhone"
            label="联系人电话"
            rules={[{ required: true, message: '请输入联系人电话' }]}
          >
            <Input />
          </Form.Item>
          <Form.Item
            name="contactEmail"
            label="联系人邮箱"
            rules={[
              { required: true, message: '请输入联系人邮箱' },
              { type: 'email', message: '邮箱格式不正确' },
            ]}
          >
            <Input />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default ApplicationDetailPage;
