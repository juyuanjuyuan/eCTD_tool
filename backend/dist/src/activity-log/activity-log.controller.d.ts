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
