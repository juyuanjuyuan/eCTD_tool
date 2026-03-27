import { DashboardService } from './dashboard.service';
export declare class DashboardController {
    private readonly dashboardService;
    constructor(dashboardService: DashboardService);
    getMyTasks(userId: string): Promise<{
        pendingEditNodes: {
            nodeId: string;
            ctdSectionNumber: string;
            title: string;
            status: import("@prisma/client").$Enums.SequenceNodeStatus;
            approvalStatus: import("@prisma/client").$Enums.ApprovalStatus;
            sequenceId: string;
            projectId: string;
            projectName: string;
        }[];
        pendingReviewNodes: {
            nodeId: any;
            ctdSectionNumber: any;
            title: any;
            submittedBy: any;
            submittedAt: any;
            sequenceId: any;
            projectName: any;
        }[];
        pendingInvitations: number;
    }>;
    getRecentEdits(userId: string): Promise<{
        nodeId: string;
        ctdSectionNumber: string;
        title: string;
        status: import("@prisma/client").$Enums.SequenceNodeStatus;
        sequenceId: string;
        projectId: string;
        projectName: string;
        editedAt: Date;
    }[]>;
    getProjectProgress(projectId: string): Promise<{
        modules: Record<string, {
            total: number;
            approved: number;
        }>;
        totalNodes: number;
        approvedNodes: number;
    }>;
    getProjectWorkload(projectId: string): Promise<{
        userId: string;
        name: string;
        role: import("@prisma/client").$Enums.ProjectMemberRole;
        assigned: number;
        approved: number;
        editing: number;
        pendingReview: number;
    }[]>;
}
