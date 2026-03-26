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
exports.ApprovalService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const client_1 = require("@prisma/client");
let ApprovalService = class ApprovalService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async submitForApproval(nodeId, userId) {
        const node = await this.prisma.sequenceNode.findUnique({
            where: { id: nodeId },
        });
        if (!node)
            throw new common_1.NotFoundException('节点不存在');
        if (!node.isLeaf)
            throw new common_1.BadRequestException('只有叶节点可以提交审批');
        if (node.approvalStatus !== client_1.ApprovalStatus.DRAFT &&
            node.approvalStatus !== client_1.ApprovalStatus.REJECTED) {
            throw new common_1.BadRequestException(`当前审批状态为 ${node.approvalStatus}，无法提交审批`);
        }
        if (node.status === 'EMPTY') {
            throw new common_1.BadRequestException('节点内容为空，无法提交审批');
        }
        return this.prisma.sequenceNode.update({
            where: { id: nodeId },
            data: {
                approvalStatus: client_1.ApprovalStatus.SUBMITTED,
                submittedBy: userId,
                submittedAt: new Date(),
                approvedBy: null,
                approvedAt: null,
                rejectionReason: null,
            },
        });
    }
    async approveNode(nodeId, approverId) {
        const node = await this.prisma.sequenceNode.findUnique({
            where: { id: nodeId },
        });
        if (!node)
            throw new common_1.NotFoundException('节点不存在');
        if (node.approvalStatus !== client_1.ApprovalStatus.SUBMITTED) {
            throw new common_1.BadRequestException('只有已提交的节点可以审批通过');
        }
        return this.prisma.sequenceNode.update({
            where: { id: nodeId },
            data: {
                approvalStatus: client_1.ApprovalStatus.APPROVED,
                approvedBy: approverId,
                approvedAt: new Date(),
            },
        });
    }
    async rejectNode(nodeId, approverId, reason) {
        const node = await this.prisma.sequenceNode.findUnique({
            where: { id: nodeId },
        });
        if (!node)
            throw new common_1.NotFoundException('节点不存在');
        if (node.approvalStatus !== client_1.ApprovalStatus.SUBMITTED) {
            throw new common_1.BadRequestException('只有已提交的节点可以驳回');
        }
        return this.prisma.sequenceNode.update({
            where: { id: nodeId },
            data: {
                approvalStatus: client_1.ApprovalStatus.REJECTED,
                approvedBy: approverId,
                approvedAt: new Date(),
                rejectionReason: reason,
            },
        });
    }
    async unlockApproval(nodeId) {
        const node = await this.prisma.sequenceNode.findUnique({
            where: { id: nodeId },
        });
        if (!node)
            throw new common_1.NotFoundException('节点不存在');
        return this.prisma.sequenceNode.update({
            where: { id: nodeId },
            data: {
                approvalStatus: client_1.ApprovalStatus.DRAFT,
                submittedBy: null,
                submittedAt: null,
                approvedBy: null,
                approvedAt: null,
                rejectionReason: null,
            },
        });
    }
    async getSequenceApprovalStatus(sequenceId) {
        const nodes = await this.prisma.sequenceNode.findMany({
            where: { sequenceId, isLeaf: true },
            select: {
                id: true,
                ctdSectionNumber: true,
                title: true,
                isRequired: true,
                approvalStatus: true,
                submittedBy: true,
                submittedAt: true,
                approvedBy: true,
                approvedAt: true,
                rejectionReason: true,
                status: true,
            },
        });
        const total = nodes.length;
        const approved = nodes.filter((n) => n.approvalStatus === 'APPROVED').length;
        const submitted = nodes.filter((n) => n.approvalStatus === 'SUBMITTED').length;
        const rejected = nodes.filter((n) => n.approvalStatus === 'REJECTED').length;
        const draft = nodes.filter((n) => n.approvalStatus === 'DRAFT').length;
        const requiredNodes = nodes.filter((n) => n.isRequired);
        const requiredApproved = requiredNodes.filter((n) => n.approvalStatus === 'APPROVED').length;
        const allRequiredApproved = requiredNodes.length > 0 && requiredApproved === requiredNodes.length;
        return {
            total,
            approved,
            submitted,
            rejected,
            draft,
            requiredTotal: requiredNodes.length,
            requiredApproved,
            allRequiredApproved,
            nodes,
        };
    }
    async getApprovalHistory(nodeId) {
        const node = await this.prisma.sequenceNode.findUnique({
            where: { id: nodeId },
            select: {
                id: true,
                approvalStatus: true,
                submittedBy: true,
                submittedAt: true,
                approvedBy: true,
                approvedAt: true,
                rejectionReason: true,
            },
        });
        if (!node)
            throw new common_1.NotFoundException('节点不存在');
        const userIds = [node.submittedBy, node.approvedBy].filter(Boolean);
        const users = userIds.length > 0
            ? await this.prisma.user.findMany({
                where: { id: { in: userIds } },
                select: { id: true, name: true },
            })
            : [];
        const userMap = Object.fromEntries(users.map((u) => [u.id, u.name]));
        return {
            ...node,
            submitterName: node.submittedBy ? userMap[node.submittedBy] || null : null,
            approverName: node.approvedBy ? userMap[node.approvedBy] || null : null,
        };
    }
    async checkNodeEditable(nodeId) {
        const node = await this.prisma.sequenceNode.findUnique({
            where: { id: nodeId },
            select: { approvalStatus: true },
        });
        return node?.approvalStatus !== client_1.ApprovalStatus.APPROVED;
    }
};
exports.ApprovalService = ApprovalService;
exports.ApprovalService = ApprovalService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], ApprovalService);
//# sourceMappingURL=approval.service.js.map