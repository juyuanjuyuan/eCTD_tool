import React, { useEffect, useState } from 'react';
import {
  Card,
  Typography,
  Row,
  Col,
  Statistic,
  List,
  Tag,
  Space,
  Empty,
  Spin,
  Badge,
} from 'antd';
import {
  ProjectOutlined,
  EditOutlined,
  AuditOutlined,
  MailOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/useAuthStore';
import { projectApi } from '../../services/project';
import {
  dashboardApi,
  type DashboardTasks,
  type RecentEdit,
} from '../../services/dashboard';
import type { Project } from '../../types';

const { Text, Title } = Typography;

const statusLabels: Record<string, { text: string; color: string }> = {
  EMPTY: { text: '未开始', color: 'default' },
  EDITING: { text: '编辑中', color: 'processing' },
  COMPLETED: { text: '已完成', color: 'success' },
};

const DashboardPage: React.FC = () => {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [tasks, setTasks] = useState<DashboardTasks | null>(null);
  const [recentEdits, setRecentEdits] = useState<RecentEdit[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      dashboardApi.getMyTasks().then(setTasks).catch(() => {}),
      dashboardApi.getRecentEdits().then(setRecentEdits).catch(() => {}),
      projectApi.list({ page: 1, pageSize: 10 }).then((r) => setProjects(r.items)).catch(() => {}),
    ]).finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div>
      <Title level={3}>欢迎回来，{user?.name}</Title>
      <Text type="secondary">eCTD 在线文档撰写工具 - 按照 CTD 五模块结构编辑申报资料</Text>

      {/* Stats */}
      <Row gutter={16} style={{ marginTop: 24 }}>
        <Col span={6}>
          <Card>
            <Statistic
              title="待编辑章节"
              value={tasks?.pendingEditNodes.length || 0}
              prefix={<EditOutlined />}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="待审阅提交"
              value={tasks?.pendingReviewNodes.length || 0}
              prefix={<AuditOutlined />}
              valueStyle={{ color: '#fa8c16' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="待处理邀请"
              value={tasks?.pendingInvitations || 0}
              prefix={<MailOutlined />}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card hoverable onClick={() => navigate('/projects')}>
            <Statistic
              title="我的项目"
              value={projects.length}
              prefix={<ProjectOutlined />}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={16} style={{ marginTop: 24 }}>
        {/* Pending edit tasks */}
        <Col span={12}>
          <Card
            title={
              <Space>
                <EditOutlined />
                <span>我的待编辑章节</span>
                {(tasks?.pendingEditNodes.length || 0) > 0 && (
                  <Badge count={tasks!.pendingEditNodes.length} size="small" />
                )}
              </Space>
            }
            size="small"
          >
            {!tasks?.pendingEditNodes.length ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无待编辑任务" />
            ) : (
              <List
                size="small"
                dataSource={tasks.pendingEditNodes.slice(0, 8)}
                renderItem={(item) => (
                  <List.Item
                    style={{ cursor: 'pointer' }}
                    onClick={() => navigate(`/sequences/${item.sequenceId}/editor`)}
                  >
                    <List.Item.Meta
                      title={
                        <Space size={4}>
                          <Text style={{ fontSize: 13 }}>{item.ctdSectionNumber}</Text>
                          <Text style={{ fontSize: 13 }}>{item.title}</Text>
                        </Space>
                      }
                      description={
                        <Space size={4}>
                          <Tag color="blue" style={{ fontSize: 11 }}>{item.projectName}</Tag>
                          <Tag color={statusLabels[item.status]?.color} style={{ fontSize: 11 }}>
                            {statusLabels[item.status]?.text}
                          </Tag>
                        </Space>
                      }
                    />
                  </List.Item>
                )}
              />
            )}
          </Card>
        </Col>

        {/* Recent edits */}
        <Col span={12}>
          <Card
            title={
              <Space>
                <ClockCircleOutlined />
                <span>最近编辑</span>
              </Space>
            }
            size="small"
          >
            {!recentEdits.length ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无编辑记录" />
            ) : (
              <List
                size="small"
                dataSource={recentEdits}
                renderItem={(item) => (
                  <List.Item
                    style={{ cursor: 'pointer' }}
                    onClick={() => navigate(`/sequences/${item.sequenceId}/editor`)}
                  >
                    <List.Item.Meta
                      title={
                        <Text style={{ fontSize: 13 }}>
                          {item.ctdSectionNumber} {item.title}
                        </Text>
                      }
                      description={
                        <Space size={4}>
                          <Tag color="blue" style={{ fontSize: 11 }}>{item.projectName}</Tag>
                          <Text type="secondary" style={{ fontSize: 11 }}>
                            {new Date(item.editedAt).toLocaleString('zh-CN')}
                          </Text>
                        </Space>
                      }
                    />
                  </List.Item>
                )}
              />
            )}
          </Card>
        </Col>
      </Row>

      {/* Pending reviews */}
      {tasks && tasks.pendingReviewNodes.length > 0 && (
        <Card
          title={
            <Space>
              <AuditOutlined />
              <span>待我审阅的提交</span>
              <Badge count={tasks.pendingReviewNodes.length} size="small" />
            </Space>
          }
          size="small"
          style={{ marginTop: 16 }}
        >
          <List
            size="small"
            dataSource={tasks.pendingReviewNodes}
            renderItem={(item) => (
              <List.Item
                style={{ cursor: 'pointer' }}
                onClick={() => navigate(`/sequences/${item.sequenceId}/editor`)}
              >
                <List.Item.Meta
                  title={
                    <Text style={{ fontSize: 13 }}>
                      {item.ctdSectionNumber} {item.title}
                    </Text>
                  }
                  description={
                    <Space size={4}>
                      <Tag color="orange" style={{ fontSize: 11 }}>{item.projectName}</Tag>
                      <Text type="secondary" style={{ fontSize: 11 }}>
                        提交于 {new Date(item.submittedAt).toLocaleString('zh-CN')}
                      </Text>
                    </Space>
                  }
                />
              </List.Item>
            )}
          />
        </Card>
      )}

      {/* My projects */}
      <Card
        title={
          <Space>
            <ProjectOutlined />
            <span>我的项目</span>
          </Space>
        }
        size="small"
        style={{ marginTop: 16 }}
        extra={<a onClick={() => navigate('/projects')}>查看全部</a>}
      >
        {!projects.length ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无项目" />
        ) : (
          <List
            size="small"
            dataSource={projects}
            renderItem={(p) => (
              <List.Item
                style={{ cursor: 'pointer' }}
                onClick={() => navigate(`/projects/${p.id}`)}
              >
                <List.Item.Meta
                  title={<Text style={{ fontSize: 13 }}>{p.name}</Text>}
                  description={
                    <Space size={4}>
                      <Tag color={p.status === 'ACTIVE' ? 'green' : 'default'} style={{ fontSize: 11 }}>
                        {p.status === 'ACTIVE' ? '进行中' : p.status === 'ARCHIVED' ? '已归档' : '草稿'}
                      </Tag>
                      <Text type="secondary" style={{ fontSize: 11 }}>
                        {p._count?.applications || 0} 个申请 · {p._count?.members || 0} 个成员
                      </Text>
                    </Space>
                  }
                />
              </List.Item>
            )}
          />
        )}
      </Card>
    </div>
  );
};

export default DashboardPage;
