import { PrismaService } from '../prisma/prisma.service';
export interface LogActivityParams {
    userId: string;
    action: string;
    resource: string;
    resourceId: string;
    detail?: Record<string, any>;
}
export declare class ActivityLogService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    log(params: LogActivityParams): Promise<{
        id: string;
        createdAt: Date;
        userId: string;
        action: string;
        resource: string;
        resourceId: string;
        detail: import("@prisma/client/runtime/library").JsonValue | null;
    }>;
    logMemberAction(userId: string, action: string, projectId: string, detail?: Record<string, any>): Promise<{
        id: string;
        createdAt: Date;
        userId: string;
        action: string;
        resource: string;
        resourceId: string;
        detail: import("@prisma/client/runtime/library").JsonValue | null;
    }>;
    getBySequence(sequenceId: string, page?: number, pageSize?: number): Promise<{
        items: ({
            user: {
                id: string;
                name: string;
            };
        } & {
            id: string;
            createdAt: Date;
            userId: string;
            action: string;
            resource: string;
            resourceId: string;
            detail: import("@prisma/client/runtime/library").JsonValue | null;
        })[];
        total: number;
        page: number;
        pageSize: number;
    }>;
    getMemberActivity(projectId: string, userId: string, page?: number, pageSize?: number): Promise<{
        items: ({
            user: {
                id: string;
                name: string;
            };
        } & {
            id: string;
            createdAt: Date;
            userId: string;
            action: string;
            resource: string;
            resourceId: string;
            detail: import("@prisma/client/runtime/library").JsonValue | null;
        })[];
        total: number;
        page: number;
        pageSize: number;
    }>;
}
