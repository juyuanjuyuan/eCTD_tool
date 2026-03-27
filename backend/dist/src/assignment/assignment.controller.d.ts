import { AssignmentService, CreateAssignmentDto } from './assignment.service';
export declare class AssignmentController {
    private readonly assignmentService;
    constructor(assignmentService: AssignmentService);
    assignNode(nodeId: string, body: CreateAssignmentDto | CreateAssignmentDto[], userId: string): Promise<({
        user: {
            id: string;
            name: string;
            email: string;
        };
    } & {
        id: string;
        createdAt: Date;
        userId: string;
        nodeId: string;
        permission: import("@prisma/client").$Enums.NodePermission;
        assignedBy: string;
    })[]>;
    getNodeAssignments(nodeId: string): Promise<({
        user: {
            id: string;
            name: string;
            email: string;
        };
        assigner: {
            id: string;
            name: string;
        };
    } & {
        id: string;
        createdAt: Date;
        userId: string;
        nodeId: string;
        permission: import("@prisma/client").$Enums.NodePermission;
        assignedBy: string;
    })[]>;
    removeAssignment(nodeId: string, targetUserId: string, userId: string): Promise<{
        id: string;
        createdAt: Date;
        userId: string;
        nodeId: string;
        permission: import("@prisma/client").$Enums.NodePermission;
        assignedBy: string;
    }>;
    getSequenceOverview(seqId: string): Promise<{
        nodeId: string;
        ctdSectionNumber: string;
        title: string;
        isLeaf: boolean;
        isAssigned: boolean;
        assignees: {
            userId: string;
            name: string;
            permission: import("@prisma/client").$Enums.NodePermission;
        }[];
    }[]>;
}
