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
        detail: import("@prisma/client/runtime/library").JsonValue | null;
        action: string;
        resource: string;
        resourceId: string;
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
            detail: import("@prisma/client/runtime/library").JsonValue | null;
            action: string;
            resource: string;
            resourceId: string;
        })[];
        total: number;
        page: number;
        pageSize: number;
    }>;
}
