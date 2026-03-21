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
let ProjectService = class ProjectService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
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
            throw new common_1.ForbiddenException('不能移除项目所有者');
        }
        return this.prisma.projectMember.delete({ where: { id: member.id } });
    }
    async checkMemberRole(projectId, userId, allowedRoles) {
        const member = await this.prisma.projectMember.findFirst({
            where: { projectId, userId },
        });
        if (!member || !allowedRoles.includes(member.role)) {
            throw new common_1.ForbiddenException('权限不足');
        }
    }
};
exports.ProjectService = ProjectService;
exports.ProjectService = ProjectService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], ProjectService);
//# sourceMappingURL=project.service.js.map