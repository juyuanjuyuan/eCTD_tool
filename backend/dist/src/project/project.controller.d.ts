import { ProjectService } from './project.service';
import { CreateProjectDto, UpdateProjectDto, AddMemberDto, QueryProjectDto, CreateInvitationDto, ChangeRoleDto, TransferOwnershipDto } from './dto';
export declare class ProjectController {
    private readonly projectService;
    constructor(projectService: ProjectService);
    create(dto: CreateProjectDto, userId: string): Promise<{
        description: string | null;
        id: string;
        name: string;
        status: import("@prisma/client").$Enums.ProjectStatus;
        createdAt: Date;
        updatedAt: Date;
        createdBy: string;
    }>;
    findAll(query: QueryProjectDto, userId: string): Promise<{
        items: ({
            _count: {
                members: number;
                applications: number;
            };
            creator: {
                id: string;
                name: string;
            };
        } & {
            description: string | null;
            id: string;
            name: string;
            status: import("@prisma/client").$Enums.ProjectStatus;
            createdAt: Date;
            updatedAt: Date;
            createdBy: string;
        })[];
        total: number;
        page: number;
        pageSize: number;
    }>;
    findOne(id: string): Promise<{
        _count: {
            applications: number;
        };
        creator: {
            id: string;
            name: string;
            email: string;
        };
        members: ({
            user: {
                id: string;
                name: string;
                email: string;
            };
        } & {
            id: string;
            role: import("@prisma/client").$Enums.ProjectMemberRole;
            createdAt: Date;
            userId: string;
            projectId: string;
        })[];
    } & {
        description: string | null;
        id: string;
        name: string;
        status: import("@prisma/client").$Enums.ProjectStatus;
        createdAt: Date;
        updatedAt: Date;
        createdBy: string;
    }>;
    update(id: string, dto: UpdateProjectDto, userId: string): Promise<{
        description: string | null;
        id: string;
        name: string;
        status: import("@prisma/client").$Enums.ProjectStatus;
        createdAt: Date;
        updatedAt: Date;
        createdBy: string;
    }>;
    archive(id: string, userId: string): Promise<{
        description: string | null;
        id: string;
        name: string;
        status: import("@prisma/client").$Enums.ProjectStatus;
        createdAt: Date;
        updatedAt: Date;
        createdBy: string;
    }>;
    addMember(id: string, dto: AddMemberDto, userId: string): Promise<{
        user: {
            id: string;
            name: string;
            email: string;
        };
    } & {
        id: string;
        role: import("@prisma/client").$Enums.ProjectMemberRole;
        createdAt: Date;
        userId: string;
        projectId: string;
    }>;
    removeMember(id: string, targetUserId: string, userId: string): Promise<{
        id: string;
        role: import("@prisma/client").$Enums.ProjectMemberRole;
        createdAt: Date;
        userId: string;
        projectId: string;
    }>;
    changeMemberRole(id: string, targetUserId: string, dto: ChangeRoleDto, userId: string): Promise<{
        user: {
            id: string;
            name: string;
            email: string;
        };
    } & {
        id: string;
        role: import("@prisma/client").$Enums.ProjectMemberRole;
        createdAt: Date;
        userId: string;
        projectId: string;
    }>;
    transferOwnership(id: string, dto: TransferOwnershipDto, userId: string): Promise<{
        message: string;
    }>;
    createInvitation(id: string, dto: CreateInvitationDto, userId: string): Promise<{
        directlyAdded: boolean;
        member: ({
            user: {
                id: string;
                name: string;
                email: string;
            };
        } & {
            id: string;
            role: import("@prisma/client").$Enums.ProjectMemberRole;
            createdAt: Date;
            userId: string;
            projectId: string;
        }) | null;
        invitation?: undefined;
    } | {
        directlyAdded: boolean;
        invitation: {
            id: string;
            email: string;
            role: import("@prisma/client").$Enums.ProjectMemberRole;
            token: string;
            expiresAt: Date;
            inviteLink: string;
        };
        member?: undefined;
    }>;
    listInvitations(id: string, userId: string): Promise<{
        status: import("@prisma/client").$Enums.InvitationStatus;
        inviter: {
            id: string;
            name: string;
        };
        id: string;
        email: string;
        role: import("@prisma/client").$Enums.ProjectMemberRole;
        createdAt: Date;
        projectId: string;
        token: string;
        expiresAt: Date;
        invitedBy: string;
    }[]>;
    cancelInvitation(id: string, invitationId: string, userId: string): Promise<{
        id: string;
        email: string;
        role: import("@prisma/client").$Enums.ProjectMemberRole;
        status: import("@prisma/client").$Enums.InvitationStatus;
        createdAt: Date;
        projectId: string;
        token: string;
        expiresAt: Date;
        invitedBy: string;
    }>;
}
export declare class InvitationController {
    private readonly projectService;
    constructor(projectService: ProjectService);
    acceptInvitation(token: string, userId: string): Promise<{
        message: string;
        projectId?: undefined;
        projectName?: undefined;
    } | {
        message: string;
        projectId: string;
        projectName: string;
    }>;
}
