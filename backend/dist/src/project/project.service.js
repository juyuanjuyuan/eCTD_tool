"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProjectService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const redis_cache_service_1 = require("../common/redis-cache.service");
const activity_log_service_1 = require("../activity-log/activity-log.service");
const crypto_1 = require("crypto");
let ProjectService = class ProjectService {
    prisma;
    redis;
    activityLog;
    constructor(prisma, redis, activityLog) {
        this.prisma = prisma;
        this.redis = redis;
        this.activityLog = activityLog;
    }
    async create(dto, userId) {
        return this.prisma.$transaction(async (tx) => {
            const project = await tx.project.create({
                data: {
                    name: dto.name,
                    description: dto.description,
                    createdBy: userId,
                    status: 'ACTIVE',
                },
            });
            await tx.projectMember.create({
                data: {
                    projectId: project.id,
                    userId,
                    role: 'OWNER',
                },
            });
            return project;
        });
    }
    async findAll(query, userId) {
        const { page = 1, pageSize = 20, search, status } = query;
        const where = {
            members: { some: { userId } },
            ...(status && { status }),
            ...(search && {
                OR: [
                    { name: { contains: search, mode: 'insensitive' } },
                    { description: { contains: search, mode: 'insensitive' } },
                ],
            }),
        };
        const [items, total] = await Promise.all([
            this.prisma.project.findMany({
                where,
                skip: (page - 1) * pageSize,
                take: pageSize,
                orderBy: { createdAt: 'desc' },
                include: {
                    creator: { select: { id: true, name: true } },
                    _count: { select: { applications: true, members: true } },
                },
            }),
            this.prisma.project.count({ where }),
        ]);
        return { items, total, page, pageSize };
    }
    async findOne(id) {
        const project = await this.prisma.project.findUnique({
            where: { id },
            include: {
                creator: { select: { id: true, name: true, email: true } },
                members: {
                    include: { user: { select: { id: true, name: true, email: true } } },
                    orderBy: { createdAt: 'asc' },
                },
                _count: { select: { applications: true } },
            },
        });
        if (!project)
            throw new common_1.NotFoundException(`项目 ${id} 不存在`);
        return project;
    }
    async update(id, dto, userId) {
        await this.checkMemberRole(id, userId, ['OWNER']);
        return this.prisma.project.update({ where: { id }, data: dto });
    }
    async archive(id, userId) {
        await this.checkMemberRole(id, userId, ['OWNER']);
        return this.prisma.project.update({
            where: { id },
            data: { status: 'ARCHIVED' },
        });
    }
    async addMember(projectId, dto, userId) {
        await this.checkMemberRole(projectId, userId, ['OWNER']);
        return this.prisma.projectMember.create({
            data: {
                projectId,
                userId: dto.userId,
                role: dto.role,
            },
            include: { user: { select: { id: true, name: true, email: true } } },
        });
    }
    async removeMember(projectId, targetUserId, userId) {
        await this.checkMemberRole(projectId, userId, ['OWNER']);
        const member = await this.prisma.projectMember.findFirst({
            where: { projectId, userId: targetUserId },
        });
        if (!member)
            throw new common_1.NotFoundException('成员不存在');
        if (member.role === 'OWNER') {
            throw new common_1.ForbiddenException('不能移除项目所有者，请先转移所有权');
        }
        const lockKey = `lock:node:*`;
        const projectNodes = await this.prisma.sequenceNode.findMany({
            where: {
                sequence: {
                    regulatoryActivity: {
                        application: { projectId },
                    },
                },
            },
            select: { id: true },
        });
        for (const node of projectNodes) {
            const lock = await this.redis.get(`lock:node:${node.id}`);
            if (lock && lock.userId === targetUserId) {
                throw new common_1.BadRequestException('该成员有正在编辑的章节（编辑锁未释放），请先通知其释放编辑锁');
            }
        }
        const pendingApprovals = await this.prisma.sequenceNode.count({
            where: {
                sequence: {
                    regulatoryActivity: {
                        application: { projectId },
                    },
                },
                approvalStatus: 'SUBMITTED',
                submittedBy: targetUserId,
            },
        });
        if (pendingApprovals > 0) {
            throw new common_1.BadRequestException(`该成员有 ${pendingApprovals} 个待审批的提交，请先处理后再移除`);
        }
        return this.prisma.projectMember.delete({ where: { id: member.id } });
    }
    async createInvitation(projectId, dto, userId) {
        await this.checkMemberRole(projectId, userId, ['OWNER']);
        if (dto.role === 'OWNER') {
            throw new common_1.BadRequestException('不能邀请为 OWNER 角色，请使用所有权转移');
        }
        const existingMember = await this.prisma.projectMember.findFirst({
            where: {
                projectId,
                user: { email: dto.email },
            },
        });
        if (existingMember) {
            throw new common_1.ConflictException('该用户已是项目成员');
        }
        const existingInvitation = await this.prisma.projectInvitation.findFirst({
            where: {
                projectId,
                email: dto.email,
                status: 'PENDING',
                expiresAt: { gt: new Date() },
            },
        });
        if (existingInvitation) {
            throw new common_1.ConflictException('已存在待处理的邀请');
        }
        const existingUser = await this.prisma.user.findUnique({
            where: { email: dto.email },
        });
        if (existingUser) {
            await this.prisma.projectMember.create({
                data: {
                    projectId,
                    userId: existingUser.id,
                    role: dto.role,
                },
            });
            const project = await this.prisma.project.findUnique({
                where: { id: projectId },
                select: { name: true },
            });
            const inviter = await this.prisma.user.findUnique({
                where: { id: userId },
                select: { name: true },
            });
            await this.prisma.notification.create({
                data: {
                    userId: existingUser.id,
                    type: 'INVITATION',
                    title: '您已被添加到项目',
                    content: `${inviter?.name} 邀请您加入项目「${project?.name}」，角色为 ${dto.role === 'MEMBER' ? '成员' : '查看者'}`,
                    projectId,
                    resourceType: 'project',
                    resourceId: projectId,
                },
            });
            return {
                directlyAdded: true,
                member: await this.prisma.projectMember.findFirst({
                    where: { projectId, userId: existingUser.id },
                    include: { user: { select: { id: true, name: true, email: true } } },
                }),
            };
        }
        const token = (0, crypto_1.randomBytes)(32).toString('hex');
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        const invitation = await this.prisma.projectInvitation.create({
            data: {
                projectId,
                email: dto.email,
                role: dto.role,
                invitedBy: userId,
                token,
                expiresAt,
            },
            include: {
                project: { select: { name: true } },
                inviter: { select: { name: true } },
            },
        });
        await this.activityLog.logMemberAction(userId, 'INVITE', projectId, {
            email: dto.email,
            role: dto.role,
        });
        return {
            directlyAdded: false,
            invitation: {
                id: invitation.id,
                email: invitation.email,
                role: invitation.role,
                token: invitation.token,
                expiresAt: invitation.expiresAt,
                inviteLink: `/invitations/${token}/accept`,
            },
        };
    }
    async listInvitations(projectId, userId) {
        await this.checkMemberRole(projectId, userId, ['OWNER']);
        const invitations = await this.prisma.projectInvitation.findMany({
            where: { projectId },
            include: {
                inviter: { select: { id: true, name: true } },
            },
            orderBy: { createdAt: 'desc' },
        });
        return invitations.map((inv) => ({
            ...inv,
            status: inv.status === 'PENDING' && inv.expiresAt < new Date()
                ? 'EXPIRED'
                : inv.status,
        }));
    }
    async cancelInvitation(projectId, invitationId, userId) {
        await this.checkMemberRole(projectId, userId, ['OWNER']);
        const invitation = await this.prisma.projectInvitation.findFirst({
            where: { id: invitationId, projectId },
        });
        if (!invitation)
            throw new common_1.NotFoundException('邀请不存在');
        if (invitation.status !== 'PENDING') {
            throw new common_1.BadRequestException('只能取消待处理的邀请');
        }
        return this.prisma.projectInvitation.update({
            where: { id: invitationId },
            data: { status: 'CANCELLED' },
        });
    }
    async acceptInvitation(token, userId) {
        const invitation = await this.prisma.projectInvitation.findUnique({
            where: { token },
            include: { project: { select: { name: true } } },
        });
        if (!invitation)
            throw new common_1.NotFoundException('邀请不存在或链接无效');
        if (invitation.status !== 'PENDING') {
            throw new common_1.BadRequestException('该邀请已处理');
        }
        if (invitation.expiresAt < new Date()) {
            await this.prisma.projectInvitation.update({
                where: { id: invitation.id },
                data: { status: 'EXPIRED' },
            });
            throw new common_1.BadRequestException('邀请已过期');
        }
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: { email: true },
        });
        if (user?.email !== invitation.email) {
            throw new common_1.ForbiddenException('此邀请不是发给您的');
        }
        const existingMember = await this.prisma.projectMember.findFirst({
            where: { projectId: invitation.projectId, userId },
        });
        if (existingMember) {
            await this.prisma.projectInvitation.update({
                where: { id: invitation.id },
                data: { status: 'ACCEPTED' },
            });
            return { message: '您已是项目成员' };
        }
        await this.prisma.$transaction([
            this.prisma.projectInvitation.update({
                where: { id: invitation.id },
                data: { status: 'ACCEPTED' },
            }),
            this.prisma.projectMember.create({
                data: {
                    projectId: invitation.projectId,
                    userId,
                    role: invitation.role,
                },
            }),
        ]);
        await this.activityLog.logMemberAction(userId, 'INVITE_ACCEPT', invitation.projectId, {
            role: invitation.role,
        });
        return {
            message: '已成功加入项目',
            projectId: invitation.projectId,
            projectName: invitation.project.name,
        };
    }
    async changeMemberRole(projectId, targetUserId, dto, userId) {
        await this.checkMemberRole(projectId, userId, ['OWNER']);
        if (targetUserId === userId) {
            throw new common_1.BadRequestException('不能变更自己的角色');
        }
        if (dto.role === 'OWNER') {
            throw new common_1.BadRequestException('不能通过此接口设置 OWNER，请使用所有权转移');
        }
        const member = await this.prisma.projectMember.findFirst({
            where: { projectId, userId: targetUserId },
        });
        if (!member)
            throw new common_1.NotFoundException('成员不存在');
        if (member.role === 'OWNER') {
            throw new common_1.ForbiddenException('不能变更所有者的角色');
        }
        const updated = await this.prisma.projectMember.update({
            where: { id: member.id },
            data: { role: dto.role },
            include: { user: { select: { id: true, name: true, email: true } } },
        });
        await this.activityLog.logMemberAction(userId, 'ROLE_CHANGE', projectId, {
            targetUserId,
            oldRole: member.role,
            newRole: dto.role,
        });
        const project = await this.prisma.project.findUnique({
            where: { id: projectId },
            select: { name: true },
        });
        await this.prisma.notification.create({
            data: {
                userId: targetUserId,
                type: 'MEMBER_ROLE_CHANGED',
                title: '您的项目角色已变更',
                content: `您在项目「${project?.name}」中的角色已变更为 ${dto.role === 'MEMBER' ? '成员' : '查看者'}`,
                projectId,
                resourceType: 'project',
                resourceId: projectId,
            },
        });
        return updated;
    }
    async transferOwnership(projectId, dto, userId) {
        await this.checkMemberRole(projectId, userId, ['OWNER']);
        if (dto.targetUserId === userId) {
            throw new common_1.BadRequestException('不能将所有权转移给自己');
        }
        const targetMember = await this.prisma.projectMember.findFirst({
            where: { projectId, userId: dto.targetUserId },
        });
        if (!targetMember) {
            throw new common_1.NotFoundException('目标用户不是项目成员');
        }
        const currentOwner = await this.prisma.projectMember.findFirst({
            where: { projectId, userId },
        });
        await this.prisma.$transaction([
            this.prisma.projectMember.update({
                where: { id: currentOwner.id },
                data: { role: 'MEMBER' },
            }),
            this.prisma.projectMember.update({
                where: { id: targetMember.id },
                data: { role: 'OWNER' },
            }),
        ]);
        await this.activityLog.logMemberAction(userId, 'OWNERSHIP_TRANSFER', projectId, {
            fromUserId: userId,
            toUserId: dto.targetUserId,
        });
        const project = await this.prisma.project.findUnique({
            where: { id: projectId },
            select: { name: true },
        });
        const members = await this.prisma.projectMember.findMany({
            where: { projectId },
            select: { userId: true },
        });
        const ownerUser = await this.prisma.user.findUnique({
            where: { id: userId },
            select: { name: true },
        });
        const targetUser = await this.prisma.user.findUnique({
            where: { id: dto.targetUserId },
            select: { name: true },
        });
        const notifications = members.map((m) => ({
            userId: m.userId,
            type: 'OWNERSHIP_TRANSFERRED',
            title: '项目所有权已转移',
            content: `项目「${project?.name}」的所有权已从 ${ownerUser?.name} 转移给 ${targetUser?.name}`,
            projectId,
            resourceType: 'project',
            resourceId: projectId,
        }));
        await this.prisma.notification.createMany({ data: notifications });
        return { message: '所有权转移成功' };
    }
    async checkMemberRole(projectId, userId, allowedRoles) {
        const member = await this.prisma.projectMember.findFirst({
            where: { projectId, userId },
        });
        if (!member || !allowedRoles.includes(member.role)) {
            throw new common_1.ForbiddenException('权限不足');
        }
        return member;
    }
};
exports.ProjectService = ProjectService;
exports.ProjectService = ProjectService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        redis_cache_service_1.RedisCacheService,
        activity_log_service_1.ActivityLogService])
], ProjectService);
//# sourceMappingURL=project.service.js.map