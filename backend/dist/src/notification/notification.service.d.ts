import { PrismaService } from '../prisma/prisma.service';
import { NotificationType } from '@prisma/client';
export interface CreateNotificationParams {
    userId: string;
    type: NotificationType;
    title: string;
    content: string;
    projectId?: string;
    resourceType?: string;
    resourceId?: string;
}
export declare class NotificationService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    create(params: CreateNotificationParams): Promise<{
        id: string;
        createdAt: Date;
        userId: string;
        resourceId: string | null;
        title: string;
        projectId: string | null;
        type: import("@prisma/client").$Enums.NotificationType;
        content: string;
        resourceType: string | null;
        isRead: boolean;
    }>;
    createMany(notifications: CreateNotificationParams[]): Promise<import("@prisma/client").Prisma.BatchPayload>;
    findAll(userId: string, query: {
        page?: number;
        pageSize?: number;
        isRead?: boolean;
        type?: NotificationType;
        projectId?: string;
    }): Promise<{
        items: {
            id: string;
            createdAt: Date;
            userId: string;
            resourceId: string | null;
            title: string;
            projectId: string | null;
            type: import("@prisma/client").$Enums.NotificationType;
            content: string;
            resourceType: string | null;
            isRead: boolean;
        }[];
        total: number;
        page: number;
        pageSize: number;
        unreadCount: number;
    }>;
    markAsRead(notificationId: string, userId: string): Promise<{
        id: string;
        createdAt: Date;
        userId: string;
        resourceId: string | null;
        title: string;
        projectId: string | null;
        type: import("@prisma/client").$Enums.NotificationType;
        content: string;
        resourceType: string | null;
        isRead: boolean;
    }>;
    markAllAsRead(userId: string): Promise<import("@prisma/client").Prisma.BatchPayload>;
    getUnreadCount(userId: string): Promise<{
        count: number;
    }>;
}
