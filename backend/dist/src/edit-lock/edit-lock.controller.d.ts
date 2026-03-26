import { EditLockService } from './edit-lock.service';
export declare class EditLockController {
    private readonly editLockService;
    constructor(editLockService: EditLockService);
    acquireLock(nodeId: string, user: {
        id: string;
        name: string;
    }): Promise<import("./edit-lock.service").LockInfo>;
    releaseLock(nodeId: string, userId: string): Promise<void>;
    queryLock(nodeId: string): Promise<import("./edit-lock.service").LockInfo | null>;
    forceUnlock(nodeId: string): Promise<void>;
    heartbeat(nodeId: string, userId: string): Promise<import("./edit-lock.service").LockInfo | null>;
}
