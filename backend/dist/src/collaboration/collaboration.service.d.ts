import { RedisCacheService } from '../common/redis-cache.service';
export interface PresenceInfo {
    userId: string;
    name: string;
    currentPage: string;
    currentNodeId: string | null;
    lastSeen: string;
}
export declare class CollaborationService {
    private readonly redis;
    constructor(redis: RedisCacheService);
    getProjectPresence(projectId: string): Promise<PresenceInfo[]>;
}
