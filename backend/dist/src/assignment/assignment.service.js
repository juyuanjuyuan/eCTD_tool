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
exports.AssignmentService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
let AssignmentService = class AssignmentService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async assignNode(nodeId, assignments, assignerId) {
        const node = await this.prisma.sequenceNode.findUnique({
            where: { id: nodeId },
            include: {
                sequence: {
                    include: {
                        regulatoryActivity: {
                            include: { application: { select: { projectId: true } } },
                        },
                    },
                },
            },
        });
        if (!node)
            throw new common_1.NotFoundException('节点不存在');
        const projectId = node.sequence.regulatoryActivity.application.projectId;
        const assignerMember = await this.prisma.projectMember.findFirst({
            where: { projectId, userId: assignerId },
        });
        if (!assignerMember || assignerMember.role !== 'OWNER') {
            throw new common_1.ForbiddenException('只有项目所有者可以指派章节');
        }
        for (const a of assignments) {
            const member = await this.prisma.projectMember.findFirst({
                where: { projectId, userId: a.userId },
            });
            if (!member) {
                throw new common_1.BadRequestException(`用户 ${a.userId} 不是项目成员`);
            }
        }
        const results = [];
        for (const a of assignments) {
            const result = await this.prisma.nodeAssignment.upsert({
                where: {
                    nodeId_userId: { nodeId, userId: a.userId },
                },
                update: { permission: a.permission },
                create: {
                    nodeId,
                    userId: a.userId,
                    permission: a.permission,
                    assignedBy: assignerId,
                },
                include: {
                    user: { select: { id: true, name: true, email: true } },
                },
            });
            results.push(result);
            await this.prisma.notification.create({
                data: {
                    userId: a.userId,
                    type: 'ASSIGNMENT',
                    title: '您被指派了新的章节任务',
                    content: `您被指派编辑章节「${node.ctdSectionNumber} ${node.title}」，权限为 ${a.permission}`,
                    projectId,
                    resourceType: 'node',
                    resourceId: nodeId,
                },
            });
        }
        return results;
    }
    async getNodeAssignments(nodeId) {
        return this.prisma.nodeAssignment.findMany({
            where: { nodeId },
            include: {
                user: { select: { id: true, name: true, email: true } },
                assigner: { select: { id: true, name: true } },
            },
            orderBy: { createdAt: 'asc' },
        });
    }
    async removeAssignment(nodeId, userId, removerId) {
        const node = await this.prisma.sequenceNode.findUnique({
            where: { id: nodeId },
            include: {
                sequence: {
                    include: {
                        regulatoryActivity: {
                            include: { application: { select: { projectId: true } } },
                        },
                    },
                },
            },
        });
        if (!node)
            throw new common_1.NotFoundException('节点不存在');
        const projectId = node.sequence.regulatoryActivity.application.projectId;
        const removerMember = await this.prisma.projectMember.findFirst({
            where: { projectId, userId: removerId },
        });
        if (!removerMember || removerMember.role !== 'OWNER') {
            throw new common_1.ForbiddenException('只有项目所有者可以取消指派');
        }
        const assignment = await this.prisma.nodeAssignment.findUnique({
            where: { nodeId_userId: { nodeId, userId } },
        });
        if (!assignment)
            throw new common_1.NotFoundException('指派记录不存在');
        return this.prisma.nodeAssignment.delete({
            where: { id: assignment.id },
        });
    }
    async getSequenceAssignmentOverview(sequenceId) {
        const nodes = await this.prisma.sequenceNode.findMany({
            where: { sequenceId },
            select: {
                id: true,
                ctdSectionNumber: true,
                title: true,
                isLeaf: true,
                assignments: {
                    include: {
                        user: { select: { id: true, name: true } },
                    },
                },
            },
            orderBy: { sortOrder: 'asc' },
        });
        return nodes.map((n) => ({
            nodeId: n.id,
            ctdSectionNumber: n.ctdSectionNumber,
            title: n.title,
            isLeaf: n.isLeaf,
            isAssigned: n.assignments.length > 0,
            assignees: n.assignments.map((a) => ({
                userId: a.user.id,
                name: a.user.name,
                permission: a.permission,
            })),
        }));
    }
    async checkNodePermission(nodeId, userId, requiredPermission) {
        const node = await this.prisma.sequenceNode.findUnique({
            where: { id: nodeId },
            include: {
                sequence: {
                    include: {
                        regulatoryActivity: {
                            include: { application: { select: { projectId: true } } },
                        },
                    },
                },
            },
        });
        if (!node)
            return false;
        const projectId = node.sequence.regulatoryActivity.application.projectId;
        const member = await this.prisma.projectMember.findFirst({
            where: { projectId, userId },
        });
        if (!member)
            return false;
        if (member.role === 'OWNER')
            return true;
        if (member.role === 'VIEWER')
            return requiredPermission === 'VIEW';
        const directAssignment = await this.prisma.nodeAssignment.findUnique({
            where: { nodeId_userId: { nodeId, userId } },
        });
        if (directAssignment) {
            return this.permissionSatisfies(directAssignment.permission, requiredPermission);
        }
        let currentParentId = node.parentId;
        while (currentParentId) {
            const parentAssignment = await this.prisma.nodeAssignment.findUnique({
                where: { nodeId_userId: { nodeId: currentParentId, userId } },
            });
            if (parentAssignment) {
                return this.permissionSatisfies(parentAssignment.permission, requiredPermission);
            }
            const parent = await this.prisma.sequenceNode.findUnique({
                where: { id: currentParentId },
                select: { parentId: true },
            });
            currentParentId = parent?.parentId ?? null;
        }
        return true;
    }
    permissionSatisfies(granted, required) {
        const hierarchy = {
            EDIT: 3,
            REVIEW: 2,
            VIEW: 1,
        };
        return hierarchy[granted] >= hierarchy[required];
    }
};
exports.AssignmentService = AssignmentService;
exports.AssignmentService = AssignmentService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], AssignmentService);
//# sourceMappingURL=assignment.service.js.map