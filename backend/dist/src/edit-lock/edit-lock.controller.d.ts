import { EditLockService } from './edit-lock.service';
import { AssignmentService } from '../assignment/assignment.service';
export declare class EditLockController {
    private readonly editLockService;
    private readonly assignmentService;
    constructor(editLockService: EditLockService, assignmentService: AssignmentService);
    acquireLock(nodeId: string, user: {
        id: string;
        name: string;
    }): Promise<import("./edit-lock.service").LockInfo>;
    releaseLock(nodeId: string, userId: string): Promise<void>;
    queryLock(nodeId: string): Promise<import("./edit-lock.service").LockInfo | null>;
    forceUnlock(nodeId: string): Promise<void>;
    heartbeat(nodeId: string, userId: string): Promise<import("./edit-lock.service").LockInfo | null>;
}
