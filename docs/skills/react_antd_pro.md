# React + Ant Design Pro 前端开发规范

## 1. 项目初始化

```bash
npm create vite@latest frontend -- --template react-ts
cd frontend
npm install antd @ant-design/pro-components @ant-design/icons
npm install axios @tanstack/react-query zustand
npm install react-router-dom
```

## 2. 路由配置

```typescript
// routes/index.tsx
import { createBrowserRouter } from 'react-router-dom';
import BasicLayout from '../layouts/BasicLayout';
import EditorLayout from '../layouts/EditorLayout';

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    path: '/',
    element: <BasicLayout />,
    children: [
      { path: 'dashboard', element: <DashboardPage /> },
      { path: 'projects', element: <ProjectListPage /> },
      { path: 'projects/:id', element: <ProjectDetailPage /> },
    ],
  },
  {
    path: '/editor',
    element: <EditorLayout />,
    children: [
      { path: ':sequenceId', element: <EditorPage /> },
    ],
  },
]);
```

## 3. ProTable CRUD 页面模板

```tsx
// pages/project/list/index.tsx
import { ProTable, ProColumns } from '@ant-design/pro-components';
import { Button, Space, Modal, message } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useState } from 'react';
import { projectApi } from '@/services/project';

const ProjectListPage = () => {
  const [createModalOpen, setCreateModalOpen] = useState(false);

  const columns: ProColumns[] = [
    { title: '项目名称', dataIndex: 'name', ellipsis: true },
    { title: '原始编号', dataIndex: 'originalNumber' },
    { title: '产品类型', dataIndex: 'productType', valueEnum: { ... } },
    { title: '状态', dataIndex: 'status', valueEnum: { ... } },
    { title: '创建时间', dataIndex: 'createdAt', valueType: 'dateTime' },
    {
      title: '操作',
      valueType: 'option',
      render: (_, record) => (
        <Space>
          <a onClick={() => navigate(`/projects/${record.id}`)}>查看</a>
          <a onClick={() => handleEdit(record)}>编辑</a>
        </Space>
      ),
    },
  ];

  return (
    <>
      <ProTable
        headerTitle="项目列表"
        columns={columns}
        request={async (params) => {
          const res = await projectApi.list(params);
          return { data: res.data.items, total: res.data.total, success: true };
        }}
        toolBarRender={() => [
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setCreateModalOpen(true)}
          >
            创建项目
          </Button>,
        ]}
        rowKey="id"
        pagination={{ defaultPageSize: 20 }}
      />
      <CreateProjectModal
        open={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
      />
    </>
  );
};
```

## 4. 表单弹窗模板

```tsx
// components/CreateProjectModal.tsx
import { ModalForm, ProFormText, ProFormSelect, ProFormTextArea } from '@ant-design/pro-components';
import { message } from 'antd';
import { projectApi } from '@/services/project';

const CreateProjectModal = ({ open, onClose, onSuccess }) => {
  return (
    <ModalForm
      title="创建项目"
      open={open}
      modalProps={{ onCancel: onClose, destroyOnClose: true }}
      onFinish={async (values) => {
        await projectApi.create(values);
        message.success('创建成功');
        onSuccess?.();
        return true;
      }}
    >
      <ProFormText
        name="name"
        label="项目名称（药品名称）"
        rules={[{ required: true, message: '请输入项目名称' }]}
      />
      <ProFormSelect
        name="productType"
        label="产品类型"
        options={[
          { label: '化学药品', value: 'CHEMICAL' },
          { label: '生物制品', value: 'BIOLOGICAL' },
        ]}
        rules={[{ required: true }]}
      />
      <ProFormTextArea name="description" label="项目描述" />
    </ModalForm>
  );
};
```

## 5. API 请求封装

```typescript
// services/api.ts
import axios from 'axios';
import { message } from 'antd';

const api = axios.create({
  baseURL: '/api/v1',
  timeout: 30000,
});

// 请求拦截器
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// 响应拦截器
api.interceptors.response.use(
  (response) => response.data,
  (error) => {
    const { response } = error;
    if (response?.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    } else {
      message.error(response?.data?.message || '请求失败');
    }
    return Promise.reject(error);
  },
);

export default api;

// services/project.ts
import api from './api';

export const projectApi = {
  list: (params) => api.get('/projects', { params }),
  detail: (id: string) => api.get(`/projects/${id}`),
  create: (data) => api.post('/projects', data),
  update: (id: string, data) => api.patch(`/projects/${id}`, data),
  remove: (id: string) => api.delete(`/projects/${id}`),
};
```

## 6. Zustand 状态管理

```typescript
// stores/editor.ts
import { create } from 'zustand';

interface EditorState {
  currentSequence: Sequence | null;
  ctdTree: CTDNode[];
  activeNodeId: string | null;
  isDirty: boolean;
  setCurrentSequence: (seq: Sequence) => void;
  setCtdTree: (tree: CTDNode[]) => void;
  setActiveNode: (nodeId: string) => void;
  setDirty: (dirty: boolean) => void;
}

export const useEditorStore = create<EditorState>((set) => ({
  currentSequence: null,
  ctdTree: [],
  activeNodeId: null,
  isDirty: false,
  setCurrentSequence: (seq) => set({ currentSequence: seq }),
  setCtdTree: (tree) => set({ ctdTree: tree }),
  setActiveNode: (nodeId) => set({ activeNodeId: nodeId }),
  setDirty: (dirty) => set({ isDirty: dirty }),
}));
```

## 7. 编辑器布局模板

```tsx
// layouts/EditorLayout.tsx
import { Layout } from 'antd';
import { Outlet } from 'react-router-dom';

const { Header, Sider, Content } = Layout;

const EditorLayout = () => {
  return (
    <Layout style={{ height: '100vh' }}>
      <Header style={{ /* 顶栏 */ }}>
        {/* 面包屑、保存按钮、导出按钮 */}
      </Header>
      <Layout>
        <Sider width={280} style={{ /* 左侧 CTD 目录树 */ }}>
          <CTDTreePanel />
        </Sider>
        <Content style={{ /* 编辑区 */ }}>
          <Outlet />
        </Content>
        <Sider width={300} style={{ /* 右侧属性面板 */ }}>
          <PropertiesPanel />
        </Sider>
      </Layout>
    </Layout>
  );
};
```
