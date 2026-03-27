import React, { useEffect, useState } from 'react';
import {
  Typography,
  Table,
  Tag,
  Button,
  Space,
  Select,
  message,
} from 'antd';
import { CheckOutlined } from '@ant-design/icons';
import { notificationApi } from '../../services/notification';
import type { Notification } from '../../types';

const typeLabels: Record<string, { text: string; color: string }> = {
  INVITATION: { text: '邀请', color: 'blue' },
  ASSIGNMENT: { text: '指派', color: 'purple' },
  MENTION: { text: '提及', color: 'cyan' },
  APPROVAL_SUBMITTED: { text: '待审批', color: 'orange' },
  APPROVAL_APPROVED: { text: '已通过', color: 'green' },
  APPROVAL_REJECTED: { text: '已驳回', color: 'red' },
  COMMENT: { text: '评论', color: 'geekblue' },
  LOCK_FORCE_RELEASED: { text: '解锁', color: 'volcano' },
  MEMBER_ROLE_CHANGED: { text: '角色变更', color: 'gold' },
  OWNERSHIP_TRANSFERRED: { text: '所有权', color: 'magenta' },
};

const NotificationListPage: React.FC = () => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [filterRead, setFilterRead] = useState<string | undefined>(undefined);
  const [filterType, setFilterType] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(false);

  const loadNotifications = async () => {
    setLoading(true);
    try {
      const params: any = { page, pageSize };
      if (filterRead !== undefined) params.isRead = filterRead;
      if (filterType) params.type = filterType;
      const result = await notificationApi.list(params);
      setNotifications(result.items);
      setTotal(result.total);
    } catch (e: any) {
      message.error(e.message);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadNotifications();
  }, [page, filterRead, filterType]);

  const handleMarkAllAsRead = async () => {
    try {
      await notificationApi.markAllAsRead();
      message.success('已全部标为已读');
      loadNotifications();
    } catch (e: any) {
      message.error(e.message);
    }
  };

  const handleMarkAsRead = async (id: string) => {
    try {
      await notificationApi.markAsRead(id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)),
      );
    } catch { /* */ }
  };

  const columns = [
    {
      title: '类型',
      dataIndex: 'type',
      width: 100,
      render: (type: string) => (
        <Tag color={typeLabels[type]?.color || 'default'}>
          {typeLabels[type]?.text || type}
        </Tag>
      ),
    },
    {
      title: '标题',
      dataIndex: 'title',
      render: (title: string, record: Notification) => (
        <span style={{ fontWeight: record.isRead ? 'normal' : 600 }}>
          {!record.isRead && (
            <span style={{
              display: 'inline-block',
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: '#1890ff',
              marginRight: 6,
            }} />
          )}
          {title}
        </span>
      ),
    },
    {
      title: '内容',
      dataIndex: 'content',
      ellipsis: true,
    },
    {
      title: '时间',
      dataIndex: 'createdAt',
      width: 180,
      render: (t: string) => new Date(t).toLocaleString('zh-CN'),
    },
    {
      title: '操作',
      width: 80,
      render: (_: any, record: Notification) => {
        if (record.isRead) return <Tag color="default">已读</Tag>;
        return (
          <Button
            type="link"
            size="small"
            onClick={() => handleMarkAsRead(record.id)}
          >
            标为已读
          </Button>
        );
      },
    },
  ];

  return (
    <div>
      <Typography.Title level={4}>通知中心</Typography.Title>
      <Space style={{ marginBottom: 16 }}>
        <Select
          value={filterRead}
          onChange={setFilterRead}
          placeholder="已读状态"
          allowClear
          style={{ width: 120 }}
          options={[
            { value: 'false', label: '未读' },
            { value: 'true', label: '已读' },
          ]}
        />
        <Select
          value={filterType}
          onChange={setFilterType}
          placeholder="通知类型"
          allowClear
          style={{ width: 140 }}
          options={Object.entries(typeLabels).map(([value, { text }]) => ({
            value,
            label: text,
          }))}
        />
        <Button icon={<CheckOutlined />} onClick={handleMarkAllAsRead}>
          全部已读
        </Button>
      </Space>
      <Table
        rowKey="id"
        columns={columns}
        dataSource={notifications}
        loading={loading}
        pagination={{
          current: page,
          pageSize,
          total,
          onChange: setPage,
          showTotal: (t) => `共 ${t} 条`,
        }}
      />
    </div>
  );
};

export default NotificationListPage;
