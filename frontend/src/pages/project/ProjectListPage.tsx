import React, { useEffect, useState } from 'react';
import {
  Table,
  Button,
  Space,
  Typography,
  Tag,
  Modal,
  Form,
  Input,
  message,
} from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { projectApi } from '../../services/project';
import type { Project, PaginatedData } from '../../types';

const statusMap: Record<string, { color: string; text: string }> = {
  DRAFT: { color: 'default', text: '草稿' },
  ACTIVE: { color: 'green', text: '进行中' },
  ARCHIVED: { color: 'red', text: '已归档' },
};

const ProjectListPage: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<PaginatedData<Project>>({
    items: [],
    total: 0,
    page: 1,
    pageSize: 20,
  });
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();

  const fetchProjects = async (page = 1) => {
    setLoading(true);
    try {
      const result = await projectApi.list({ page });
      setData(result);
    } catch (error: any) {
      message.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  const handleCreate = async (values: { name: string; description?: string }) => {
    try {
      const newProject = await projectApi.create(values);
      message.success('项目创建成功');
      setModalOpen(false);
      form.resetFields();
      navigate(`/projects/${newProject.id}`);
    } catch (error: any) {
      message.error(error.message);
    }
  };

  const columns = [
    {
      title: '项目名称',
      dataIndex: 'name',
      render: (name: string, record: Project) => (
        <a onClick={() => navigate(`/projects/${record.id}`)}>{name}</a>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      render: (status: string) => {
        const s = statusMap[status] || { color: 'default', text: status };
        return <Tag color={s.color}>{s.text}</Tag>;
      },
    },
    {
      title: '申请数',
      dataIndex: ['_count', 'applications'],
    },
    {
      title: '成员数',
      dataIndex: ['_count', 'members'],
    },
    {
      title: '创建人',
      dataIndex: ['creator', 'name'],
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      render: (t: string) => new Date(t).toLocaleDateString('zh-CN'),
    },
  ];

  return (
    <div>
      <Space style={{ marginBottom: 16, width: '100%', justifyContent: 'space-between' }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          项目列表
        </Typography.Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
          新建项目
        </Button>
      </Space>

      <Table
        rowKey="id"
        columns={columns}
        dataSource={data.items}
        loading={loading}
        pagination={{
          current: data.page,
          pageSize: data.pageSize,
          total: data.total,
          onChange: fetchProjects,
        }}
      />

      <Modal
        title="新建项目"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => form.submit()}
      >
        <Form form={form} layout="vertical" onFinish={handleCreate}>
          <Form.Item
            name="name"
            label="项目名称（药品名称）"
            rules={[{ required: true, message: '请输入项目名称' }]}
          >
            <Input placeholder="例如：xxx注射液" />
          </Form.Item>
          <Form.Item name="description" label="项目描述">
            <Input.TextArea rows={3} placeholder="项目说明（选填）" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default ProjectListPage;
