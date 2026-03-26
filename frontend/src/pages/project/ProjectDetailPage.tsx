import React, { useEffect, useState } from 'react';
import {
  Typography,
  Tabs,
  Descriptions,
  Tag,
  Table,
  Button,
  Space,
  Modal,
  Form,
  Input,
  Select,
  message,
  Breadcrumb,
  Spin,
  Result,
} from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { projectApi } from '../../services/project';
import { applicationApi } from '../../services/application';
import { cvApi } from '../../services/cv';
import type {
  Project,
  ProjectMember,
  Application,
  ControlledVocabulary,
} from '../../types';

const ProjectDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [project, setProject] = useState<(Project & { members: ProjectMember[] }) | null>(null);
  const [applications, setApplications] = useState<Application[]>([]);
  const [appModalOpen, setAppModalOpen] = useState(false);
  const [appTypes, setAppTypes] = useState<ControlledVocabulary[]>([]);
  const [productTypes, setProductTypes] = useState<ControlledVocabulary[]>([]);
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    Promise.all([
      projectApi.detail(id).then(setProject).catch((e) => message.error(e.message)),
      applicationApi.list(id).then(setApplications).catch((e) => message.error(e.message)),
    ]).finally(() => setLoading(false));
  }, [id]);

  const openAppModal = async () => {
    const [at, pt] = await Promise.all([
      cvApi.getApplicationTypes(),
      cvApi.getProductTypes(),
    ]);
    setAppTypes(at);
    setProductTypes(pt);
    setAppModalOpen(true);
  };

  const handleCreateApp = async (values: {
    applicationTypeCode: string;
    productTypeCode: string;
    productNumber: string;
  }) => {
    try {
      await applicationApi.create(id!, values);
      message.success('申请创建成功');
      setAppModalOpen(false);
      form.resetFields();
      applicationApi.list(id!).then(setApplications);
    } catch (error: any) {
      message.error(error.message);
    }
  };

  const appColumns = [
    {
      title: '申请编号',
      dataIndex: 'applicationNumber',
      render: (num: string, record: Application) => (
        <a onClick={() => navigate(`/projects/${id}/applications/${record.id}`)}>
          {num}
        </a>
      ),
    },
    {
      title: '申请类型',
      dataIndex: 'applicationTypeCode',
      render: (code: string) => {
        const labels: Record<string, string> = {
          cnapt1: '临床试验申请',
          cnapt2: '新药申请',
          cnapt3: '仿制药申请',
          cnapt4: '原料药申请',
        };
        return labels[code] || code;
      },
    },
    {
      title: '产品类型',
      dataIndex: 'productTypeCode',
      render: (code: string) =>
        code === 'cnprt1' ? '化学药品' : code === 'cnprt2' ? '生物制品' : code,
    },
    {
      title: '原始编号',
      dataIndex: 'productNumber',
    },
    {
      title: '注册行为数',
      dataIndex: ['_count', 'regulatoryActivities'],
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      render: (t: string) => new Date(t).toLocaleDateString('zh-CN'),
    },
  ];

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!project) {
    return <Result status="404" title="项目不存在" subTitle="请检查链接是否正确，或返回项目列表" />;
  }

  return (
    <div>
      <Breadcrumb
        items={[
          { title: <Link to="/projects">项目列表</Link> },
          { title: project.name },
        ]}
        style={{ marginBottom: 16 }}
      />
      <Typography.Title level={4}>{project.name}</Typography.Title>

      <Tabs
        items={[
          {
            key: 'overview',
            label: '概览',
            children: (
              <Descriptions bordered column={2}>
                <Descriptions.Item label="项目名称">{project.name}</Descriptions.Item>
                <Descriptions.Item label="状态">
                  <Tag color={project.status === 'ACTIVE' ? 'green' : 'default'}>
                    {project.status === 'ACTIVE' ? '进行中' : project.status === 'ARCHIVED' ? '已归档' : '草稿'}
                  </Tag>
                </Descriptions.Item>
                <Descriptions.Item label="描述" span={2}>
                  {project.description || '-'}
                </Descriptions.Item>
                <Descriptions.Item label="创建时间">
                  {new Date(project.createdAt).toLocaleString('zh-CN')}
                </Descriptions.Item>
              </Descriptions>
            ),
          },
          {
            key: 'applications',
            label: `申请 (${applications.length})`,
            children: (
              <>
                <Space style={{ marginBottom: 16 }}>
                  <Button type="primary" icon={<PlusOutlined />} onClick={openAppModal}>
                    创建申请
                  </Button>
                </Space>
                <Table
                  rowKey="id"
                  columns={appColumns}
                  dataSource={applications}
                  pagination={false}
                />
              </>
            ),
          },
          {
            key: 'members',
            label: `成员 (${project.members?.length || 0})`,
            children: (
              <Table
                rowKey="id"
                dataSource={project.members}
                pagination={false}
                columns={[
                  { title: '姓名', dataIndex: ['user', 'name'] },
                  { title: '邮箱', dataIndex: ['user', 'email'] },
                  {
                    title: '角色',
                    dataIndex: 'role',
                    render: (role: string) => (
                      <Tag>{role === 'OWNER' ? '所有者' : role === 'MEMBER' ? '成员' : '查看者'}</Tag>
                    ),
                  },
                ]}
              />
            ),
          },
        ]}
      />

      <Modal
        title="创建申请"
        open={appModalOpen}
        onCancel={() => { setAppModalOpen(false); form.resetFields(); }}
        onOk={() => form.submit()}
        width={520}
      >
        <Form form={form} layout="vertical" onFinish={handleCreateApp}>
          <Form.Item
            name="applicationTypeCode"
            label="申请类型"
            rules={[{ required: true, message: '请选择申请类型' }]}
          >
            <Select placeholder="选择申请类型">
              {appTypes.map((t) => (
                <Select.Option key={t.code} value={t.code}>
                  {t.descriptionZh} ({t.code})
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item
            name="productTypeCode"
            label="产品类型"
            rules={[{ required: true, message: '请选择产品类型' }]}
          >
            <Select placeholder="选择产品类型">
              {productTypes.map((t) => (
                <Select.Option key={t.code} value={t.code}>
                  {t.descriptionZh} ({t.code})
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item
            name="productNumber"
            label="原始编号"
            rules={[
              { required: true, message: '请输入原始编号' },
              { pattern: /^\d{10}$/, message: '原始编号必须为10位数字' },
            ]}
          >
            <Input placeholder="10位数字，如 2026123456" maxLength={10} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default ProjectDetailPage;
