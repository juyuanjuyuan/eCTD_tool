import React, { useState } from 'react';
import { Form, Input, Button, Card, Typography, Tabs, message, Space } from 'antd';
import { UserOutlined, LockOutlined, MailOutlined, PhoneOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/useAuthStore';

const { Title } = Typography;

const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const { login, register, loading } = useAuthStore();
  const [activeTab, setActiveTab] = useState('login');

  const onLogin = async (values: { email: string; password: string }) => {
    try {
      await login(values.email, values.password);
      message.success('登录成功');
      navigate('/projects');
    } catch (error: any) {
      message.error(error.message || '登录失败');
    }
  };

  const onRegister = async (values: {
    email: string;
    password: string;
    name: string;
    phone?: string;
  }) => {
    try {
      await register(values);
      message.success('注册成功');
      navigate('/projects');
    } catch (error: any) {
      message.error(error.message || '注册失败');
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
        background: '#f0f2f5',
      }}
    >
      <Card style={{ width: 420 }}>
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          <div style={{ textAlign: 'center' }}>
            <Title level={2} style={{ marginBottom: 4 }}>
              eCTD 文档工具
            </Title>
            <Typography.Text type="secondary">
              药品注册申报资料在线编辑与管理平台
            </Typography.Text>
          </div>

          <Tabs
            activeKey={activeTab}
            onChange={setActiveTab}
            centered
            items={[
              {
                key: 'login',
                label: '登录',
                children: (
                  <Form onFinish={onLogin} size="large" autoComplete="off">
                    <Form.Item
                      name="email"
                      rules={[
                        { required: true, message: '请输入邮箱' },
                        { type: 'email', message: '邮箱格式不正确' },
                      ]}
                    >
                      <Input prefix={<MailOutlined />} placeholder="邮箱" />
                    </Form.Item>
                    <Form.Item
                      name="password"
                      rules={[{ required: true, message: '请输入密码' }]}
                    >
                      <Input.Password prefix={<LockOutlined />} placeholder="密码" />
                    </Form.Item>
                    <Form.Item>
                      <Button type="primary" htmlType="submit" block loading={loading}>
                        登录
                      </Button>
                    </Form.Item>
                  </Form>
                ),
              },
              {
                key: 'register',
                label: '注册',
                children: (
                  <Form onFinish={onRegister} size="large" autoComplete="off">
                    <Form.Item
                      name="name"
                      rules={[{ required: true, message: '请输入姓名' }]}
                    >
                      <Input prefix={<UserOutlined />} placeholder="姓名" />
                    </Form.Item>
                    <Form.Item
                      name="email"
                      rules={[
                        { required: true, message: '请输入邮箱' },
                        { type: 'email', message: '邮箱格式不正确' },
                      ]}
                    >
                      <Input prefix={<MailOutlined />} placeholder="邮箱" />
                    </Form.Item>
                    <Form.Item
                      name="password"
                      rules={[
                        { required: true, message: '请输入密码' },
                        { min: 6, message: '密码至少6位' },
                      ]}
                    >
                      <Input.Password prefix={<LockOutlined />} placeholder="密码" />
                    </Form.Item>
                    <Form.Item name="phone">
                      <Input prefix={<PhoneOutlined />} placeholder="手机号（选填）" />
                    </Form.Item>
                    <Form.Item>
                      <Button type="primary" htmlType="submit" block loading={loading}>
                        注册
                      </Button>
                    </Form.Item>
                  </Form>
                ),
              },
            ]}
          />
        </Space>
      </Card>
    </div>
  );
};

export default LoginPage;
