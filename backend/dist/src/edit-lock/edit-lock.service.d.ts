import { RedisCacheService } from '../common/redis-cache.service';
export interface LockInfo {
    userId: string;
    userName: string;
    acquiredAt: string;
    expiresAt: string;
}
export declare class EditLockService {
    private readonly redis;
    constructor(redis: RedisCacheService);
    private lockKey;
    acquireLock(nodeId: string, userId: string, userName: string): Promise<LockInfo>;
    releaseLock(nodeId: string, userId: string): Promise<void>;
    queryLock(nodeId: string): Promise<LockInfo | null>;
    forceUnlock(nodeId: string): Promise<void>;
    heartbeat(nodeId: string, userId: string): Promise<LockInfo | null>;
}
