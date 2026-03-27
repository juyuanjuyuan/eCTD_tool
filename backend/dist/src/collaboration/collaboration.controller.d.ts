import { CollaborationService } from './collaboration.service';
export declare class CollaborationController {
    private readonly collaborationService;
    constructor(collaborationService: CollaborationService);
    getPresence(projectId: string): Promise<import("./collaboration.service").PresenceInfo[]>;
}
