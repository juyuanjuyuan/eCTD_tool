import api from './api';
import type { Notification, PaginatedData } from '../types';

export const notificationApi = {
  list: (params?: {
    page?: number;
    pageSize?: number;
    isRead?: boolean;
    type?: string;
    projectId?: string;
  }) => api.get<any, PaginatedData<Notification> & { unreadCount: number }>(
    '/notifications',
    { params },
  ),

  unreadCount: () =>
    api.get<any, { count: number }>('/notifications/unread-count'),

  markAsRead: (id: string) =>
    api.patch(`/notifications/${id}/read`),

  markAllAsRead: () =>
    api.post('/notifications/read-all'),
};
