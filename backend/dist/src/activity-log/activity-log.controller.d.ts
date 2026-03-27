import { PaginationDto } from '../common/dto/pagination.dto';
import { ActivityLogService } from './activity-log.service';
export declare class ActivityLogController {
    private readonly activityLogService;
    constructor(activityLogService: ActivityLogService);
    getActivityLog(seqId: string, query: PaginationDto): Promise<{
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
    getMemberActivity(projectId: string, userId: string, query: PaginationDto): Promise<{
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
