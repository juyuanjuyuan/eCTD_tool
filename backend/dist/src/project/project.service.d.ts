import { PrismaService } from '../prisma/prisma.service';
import { RedisCacheService } from '../common/redis-cache.service';
import { CreateProjectDto, UpdateProjectDto, AddMemberDto, QueryProjectDto, CreateInvitationDto, ChangeRoleDto, TransferOwnershipDto } from './dto';
import { ActivityLogService } from '../activity-log/activity-log.service';
export declare class ProjectService {
    private prisma;
    private redis;
    private activityLog;
    constructor(prisma: PrismaService, redis: RedisCacheService, activityLog: ActivityLogService);
    create(dto: CreateProjectDto, userId: string): Promise<{
        id: string;
        description: string | null;
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
            id: string;
            description: string | null;
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
        id: string;
        description: string | null;
        name: string;
        status: import("@prisma/client").$Enums.ProjectStatus;
        createdAt: Date;
        updatedAt: Date;
        createdBy: string;
    }>;
    update(id: string, dto: UpdateProjectDto, userId: string): Promise<{
        id: string;
        description: string | null;
        name: string;
        status: import("@prisma/client").$Enums.ProjectStatus;
        createdAt: Date;
        updatedAt: Date;
        createdBy: string;
    }>;
    archive(id: string, userId: string): Promise<{
        id: string;
        description: string | null;
        name: string;
        status: import("@prisma/client").$Enums.ProjectStatus;
        createdAt: Date;
        updatedAt: Date;
        createdBy: string;
    }>;
    addMember(projectId: string, dto: AddMemberDto, userId: string): Promise<{
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
    removeMember(projectId: string, targetUserId: string, userId: string): Promise<{
        id: string;
        role: import("@prisma/client").$Enums.ProjectMemberRole;
        createdAt: Date;
        userId: string;
        projectId: string;
    }>;
    createInvitation(projectId: string, dto: CreateInvitationDto, userId: string): Promise<{
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
    listInvitations(projectId: string, userId: string): Promise<{
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
        invitedBy: string;
        token: string;
        expiresAt: Date;
    }[]>;
    cancelInvitation(projectId: string, invitationId: string, userId: string): Promise<{
        id: string;
        email: string;
        role: import("@prisma/client").$Enums.ProjectMemberRole;
        status: import("@prisma/client").$Enums.InvitationStatus;
        createdAt: Date;
        projectId: string;
        invitedBy: string;
        token: string;
        expiresAt: Date;
    }>;
    acceptInvitation(token: string, userId: string): Promise<{
        message: string;
        projectId?: undefined;
        projectName?: undefined;
    } | {
        message: string;
        projectId: string;
        projectName: string;
    }>;
    changeMemberRole(projectId: string, targetUserId: string, dto: ChangeRoleDto, userId: string): Promise<{
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
    transferOwnership(projectId: string, dto: TransferOwnershipDto, userId: string): Promise<{
        message: string;
    }>;
    checkMemberRole(projectId: string, userId: string, allowedRoles: string[]): Promise<{
        id: string;
        role: import("@prisma/client").$Enums.ProjectMemberRole;
        createdAt: Date;
        userId: string;
        projectId: string;
    }>;
}
