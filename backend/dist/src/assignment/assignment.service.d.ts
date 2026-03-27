import { PrismaService } from '../prisma/prisma.service';
import { NodePermission } from '@prisma/client';
export interface CreateAssignmentDto {
    userId: string;
    permission: NodePermission;
}
export declare class AssignmentService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    assignNode(nodeId: string, assignments: CreateAssignmentDto[], assignerId: string): Promise<({
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
    removeAssignment(nodeId: string, userId: string, removerId: string): Promise<{
        id: string;
        createdAt: Date;
        userId: string;
        nodeId: string;
        permission: import("@prisma/client").$Enums.NodePermission;
        assignedBy: string;
    }>;
    getSequenceAssignmentOverview(sequenceId: string): Promise<{
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
    checkNodePermission(nodeId: string, userId: string, requiredPermission: NodePermission): Promise<boolean>;
    private permissionSatisfies;
}
