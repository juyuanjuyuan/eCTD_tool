import { NotificationService } from './notification.service';
import { NotificationType } from '@prisma/client';
export declare class NotificationController {
    private readonly notificationService;
    constructor(notificationService: NotificationService);
    findAll(userId: string, page?: string, pageSize?: string, isRead?: string, type?: NotificationType, projectId?: string): Promise<{
        items: {
            id: string;
            createdAt: Date;
            type: import("@prisma/client").$Enums.NotificationType;
            userId: string;
            resourceId: string | null;
            title: string;
            projectId: string | null;
            content: string;
            resourceType: string | null;
            isRead: boolean;
        }[];
        total: number;
        page: number;
        pageSize: number;
        unreadCount: number;
    }>;
    getUnreadCount(userId: string): Promise<{
        count: number;
    }>;
    markAsRead(id: string, userId: string): Promise<{
        id: string;
        createdAt: Date;
        type: import("@prisma/client").$Enums.NotificationType;
        userId: string;
        resourceId: string | null;
        title: string;
        projectId: string | null;
        content: string;
        resourceType: string | null;
        isRead: boolean;
    }>;
    markAllAsRead(userId: string): Promise<import("@prisma/client").Prisma.BatchPayload>;
}
