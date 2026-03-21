import React from 'react';
import { Card, Typography, Row, Col, Statistic } from 'antd';
import { ProjectOutlined, FileTextOutlined, CheckCircleOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/useAuthStore';

const DashboardPage: React.FC = () => {
  const { user } = useAuthStore();
  const navigate = useNavigate();

  return (
    <div>
      <Typography.Title level={3}>
        欢迎回来，{user?.name}
      </Typography.Title>
      <Typography.Paragraph type="secondary">
        eCTD 在线文档撰写工具 - 按照 CTD 五模块结构编辑申报资料
      </Typography.Paragraph>
      <Row gutter={16} style={{ marginTop: 24 }}>
        <Col span={8}>
          <Card hoverable onClick={() => navigate('/projects')}>
            <Statistic
              title="项目管理"
              prefix={<ProjectOutlined />}
              value="进入"
              valueStyle={{ fontSize: 18 }}
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <Statistic
              title="文档编辑"
              prefix={<FileTextOutlined />}
              value="在项目中选择序列开始编辑"
              valueStyle={{ fontSize: 14 }}
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <Statistic
              title="eCTD 验证"
              prefix={<CheckCircleOutlined />}
              value="编辑完成后运行验证"
              valueStyle={{ fontSize: 14 }}
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default DashboardPage;
