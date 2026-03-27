import React, { useEffect, useState, useCallback } from 'react';
import {
  Badge,
  Popover,
  List,
  Button,
  Typography,
  Tag,
  Empty,
} from 'antd';
import { BellOutlined, CheckOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { notificationApi } from '../services/notification';
import type { Notification } from '../types';

const { Text } = Typography;

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

const NotificationCenter: React.FC = () => {
  const navigate = useNavigate();
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  const fetchUnreadCount = useCallback(async () => {
    try {
      const { count } = await notificationApi.unreadCount();
      setUnreadCount(count);
    } catch { /* */ }
  }, []);

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const { items, unreadCount: uc } = await notificationApi.list({
        page: 1,
        pageSize: 20,
      });
      setNotifications(items);
      setUnreadCount(uc);
    } catch { /* */ }
    finally { setLoading(false); }
  }, []);

  // Poll for unread count every 30 seconds
  useEffect(() => {
    fetchUnreadCount();
    const timer = setInterval(fetchUnreadCount, 30000);
    return () => clearInterval(timer);
  }, [fetchUnreadCount]);

  // Fetch notifications when popover opens
  useEffect(() => {
    if (open) fetchNotifications();
  }, [open, fetchNotifications]);

  const handleMarkAsRead = async (id: string) => {
    try {
      await notificationApi.markAsRead(id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)),
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch { /* */ }
  };

  const handleMarkAllAsRead = async () => {
    try {
      await notificationApi.markAllAsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch { /* */ }
  };

  const handleClickNotification = (n: Notification) => {
    if (!n.isRead) handleMarkAsRead(n.id);

    // Navigate based on resource type
    if (n.resourceType === 'project' && n.projectId) {
      navigate(`/projects/${n.projectId}`);
    } else if (n.resourceType === 'node' && n.resourceId) {
      // Nodes are inside sequences — try to navigate to the project
      if (n.projectId) navigate(`/projects/${n.projectId}`);
    }
    setOpen(false);
  };

  const content = (
    <div style={{ width: 380 }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '8px 12px',
        borderBottom: '1px solid #f0f0f0',
      }}>
        <Text strong>通知</Text>
        {unreadCount > 0 && (
          <Button
            type="link"
            size="small"
            icon={<CheckOutlined />}
            onClick={handleMarkAllAsRead}
          >
            全部已读
          </Button>
        )}
      </div>
      <div style={{ maxHeight: 400, overflowY: 'auto' }}>
        {notifications.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="暂无通知"
            style={{ padding: '24px 0' }}
          />
        ) : (
          <List
            loading={loading}
            dataSource={notifications}
            renderItem={(n) => (
              <List.Item
                style={{
                  padding: '10px 12px',
                  cursor: 'pointer',
                  background: n.isRead ? 'transparent' : '#f6f8ff',
                }}
                onClick={() => handleClickNotification(n)}
              >
                <div style={{ width: '100%' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    {!n.isRead && (
                      <div style={{
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        background: '#1890ff',
                        flexShrink: 0,
                      }} />
                    )}
                    <Tag
                      color={typeLabels[n.type]?.color || 'default'}
                      style={{ fontSize: 11, lineHeight: '18px', margin: 0 }}
                    >
                      {typeLabels[n.type]?.text || n.type}
                    </Tag>
                    <Text
                      strong={!n.isRead}
                      style={{ fontSize: 13, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    >
                      {n.title}
                    </Text>
                  </div>
                  <Text
                    type="secondary"
                    style={{ fontSize: 12, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                  >
                    {n.content}
                  </Text>
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    {new Date(n.createdAt).toLocaleString('zh-CN')}
                  </Text>
                </div>
              </List.Item>
            )}
          />
        )}
      </div>
      <div style={{
        borderTop: '1px solid #f0f0f0',
        padding: '8px 12px',
        textAlign: 'center',
      }}>
        <Button
          type="link"
          size="small"
          onClick={() => { navigate('/notifications'); setOpen(false); }}
        >
          查看全部
        </Button>
      </div>
    </div>
  );

  return (
    <Popover
      content={content}
      trigger="click"
      open={open}
      onOpenChange={setOpen}
      placement="bottomRight"
      arrow={false}
    >
      <Badge count={unreadCount} size="small" offset={[-2, 2]}>
        <BellOutlined style={{ fontSize: 18, cursor: 'pointer' }} />
      </Badge>
    </Popover>
  );
};

export default NotificationCenter;
