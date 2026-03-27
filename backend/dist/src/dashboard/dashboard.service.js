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
exports.DashboardService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const redis_cache_service_1 = require("../common/redis-cache.service");
let DashboardService = class DashboardService {
    prisma;
    redis;
    constructor(prisma, redis) {
        this.prisma = prisma;
        this.redis = redis;
    }
    async getMyTasks(userId) {
        const assignedNodes = await this.prisma.nodeAssignment.findMany({
            where: { userId, permission: 'EDIT' },
            include: {
                node: {
                    select: {
                        id: true,
                        ctdSectionNumber: true,
                        title: true,
                        status: true,
                        approvalStatus: true,
                        sequenceId: true,
                        sequence: {
                            select: {
                                id: true,
                                sequenceNumber: true,
                                regulatoryActivity: {
                                    select: {
                                        application: {
                                            select: {
                                                projectId: true,
                                                project: { select: { id: true, name: true } },
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            },
        });
        const pendingEditNodes = assignedNodes
            .filter((a) => a.node.approvalStatus !== 'APPROVED')
            .map((a) => ({
            nodeId: a.node.id,
            ctdSectionNumber: a.node.ctdSectionNumber,
            title: a.node.title,
            status: a.node.status,
            approvalStatus: a.node.approvalStatus,
            sequenceId: a.node.sequenceId,
            projectId: a.node.sequence.regulatoryActivity.application.projectId,
            projectName: a.node.sequence.regulatoryActivity.application.project.name,
        }));
        const reviewAssignments = await this.prisma.nodeAssignment.findMany({
            where: { userId, permission: 'REVIEW' },
            select: { nodeId: true },
        });
        const reviewNodeIds = reviewAssignments.map((a) => a.nodeId);
        let pendingReviewNodes = [];
        if (reviewNodeIds.length > 0) {
            pendingReviewNodes = await this.prisma.sequenceNode.findMany({
                where: {
                    id: { in: reviewNodeIds },
                    approvalStatus: 'SUBMITTED',
                },
                select: {
                    id: true,
                    ctdSectionNumber: true,
                    title: true,
                    submittedBy: true,
                    submittedAt: true,
                    sequenceId: true,
                    sequence: {
                        select: {
                            regulatoryActivity: {
                                select: {
                                    application: {
                                        select: {
                                            projectId: true,
                                            project: { select: { name: true } },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            });
        }
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: { email: true },
        });
        const pendingInvitations = user
            ? await this.prisma.projectInvitation.count({
                where: {
                    email: user.email,
                    status: 'PENDING',
                    expiresAt: { gt: new Date() },
                },
            })
            : 0;
        return {
            pendingEditNodes,
            pendingReviewNodes: pendingReviewNodes.map((n) => ({
                nodeId: n.id,
                ctdSectionNumber: n.ctdSectionNumber,
                title: n.title,
                submittedBy: n.submittedBy,
                submittedAt: n.submittedAt,
                sequenceId: n.sequenceId,
                projectName: n.sequence.regulatoryActivity.application.project.name,
            })),
            pendingInvitations,
        };
    }
    async getRecentEdits(userId) {
        const recentLogs = await this.prisma.activityLog.findMany({
            where: {
                userId,
                resource: { in: ['document', 'node'] },
                action: { in: ['CREATED', 'UPDATED', 'SAVED'] },
            },
            orderBy: { createdAt: 'desc' },
            take: 10,
            distinct: ['resourceId'],
        });
        const nodeIds = recentLogs.map((l) => l.resourceId);
        if (nodeIds.length === 0)
            return [];
        const nodes = await this.prisma.sequenceNode.findMany({
            where: { id: { in: nodeIds } },
            select: {
                id: true,
                ctdSectionNumber: true,
                title: true,
                status: true,
                sequenceId: true,
                sequence: {
                    select: {
                        regulatoryActivity: {
                            select: {
                                application: {
                                    select: {
                                        project: { select: { id: true, name: true } },
                                    },
                                },
                            },
                        },
                    },
                },
            },
        });
        const nodeMap = new Map(nodes.map((n) => [n.id, n]));
        return recentLogs
            .filter((l) => nodeMap.has(l.resourceId))
            .slice(0, 5)
            .map((l) => {
            const n = nodeMap.get(l.resourceId);
            return {
                nodeId: n.id,
                ctdSectionNumber: n.ctdSectionNumber,
                title: n.title,
                status: n.status,
                sequenceId: n.sequenceId,
                projectId: n.sequence.regulatoryActivity.application.project.id,
                projectName: n.sequence.regulatoryActivity.application.project.name,
                editedAt: l.createdAt,
            };
        });
    }
    async getProjectProgress(projectId) {
        const sequences = await this.prisma.sequence.findMany({
            where: {
                regulatoryActivity: { application: { projectId } },
            },
            select: { id: true },
        });
        const seqIds = sequences.map((s) => s.id);
        if (seqIds.length === 0) {
            return { modules: {}, totalNodes: 0, approvedNodes: 0 };
        }
        const nodes = await this.prisma.sequenceNode.findMany({
            where: { sequenceId: { in: seqIds }, isLeaf: true },
            select: {
                ctdSectionNumber: true,
                approvalStatus: true,
            },
        });
        const moduleStats = {};
        for (const n of nodes) {
            const module = `M${n.ctdSectionNumber.split('.')[0]}`;
            if (!moduleStats[module])
                moduleStats[module] = { total: 0, approved: 0 };
            moduleStats[module].total++;
            if (n.approvalStatus === 'APPROVED')
                moduleStats[module].approved++;
        }
        const totalNodes = nodes.length;
        const approvedNodes = nodes.filter((n) => n.approvalStatus === 'APPROVED').length;
        return { modules: moduleStats, totalNodes, approvedNodes };
    }
    async getProjectWorkload(projectId) {
        const members = await this.prisma.projectMember.findMany({
            where: { projectId },
            include: { user: { select: { id: true, name: true } } },
        });
        const seqIds = (await this.prisma.sequence.findMany({
            where: {
                regulatoryActivity: { application: { projectId } },
            },
            select: { id: true },
        })).map((s) => s.id);
        const workload = await Promise.all(members.map(async (m) => {
            const assignedCount = await this.prisma.nodeAssignment.count({
                where: {
                    userId: m.userId,
                    node: { sequenceId: { in: seqIds } },
                },
            });
            const approvedCount = await this.prisma.nodeAssignment.count({
                where: {
                    userId: m.userId,
                    node: {
                        sequenceId: { in: seqIds },
                        approvalStatus: 'APPROVED',
                    },
                },
            });
            const submittedCount = await this.prisma.nodeAssignment.count({
                where: {
                    userId: m.userId,
                    node: {
                        sequenceId: { in: seqIds },
                        approvalStatus: 'SUBMITTED',
                    },
                },
            });
            let editingCount = 0;
            if (seqIds.length > 0) {
                const nodeIds = (await this.prisma.nodeAssignment.findMany({
                    where: { userId: m.userId, node: { sequenceId: { in: seqIds } } },
                    select: { nodeId: true },
                })).map((a) => a.nodeId);
                for (const nid of nodeIds) {
                    const lock = await this.redis.get(`lock:node:${nid}`);
                    if (lock && lock.userId === m.userId)
                        editingCount++;
                }
            }
            return {
                userId: m.userId,
                name: m.user.name,
                role: m.role,
                assigned: assignedCount,
                approved: approvedCount,
                editing: editingCount,
                pendingReview: submittedCount,
            };
        }));
        return workload;
    }
};
exports.DashboardService = DashboardService;
exports.DashboardService = DashboardService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        redis_cache_service_1.RedisCacheService])
], DashboardService);
//# sourceMappingURL=dashboard.service.js.map