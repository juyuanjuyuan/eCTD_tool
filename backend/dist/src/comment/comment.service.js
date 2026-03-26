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
exports.CommentService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
let CommentService = class CommentService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async createComment(nodeId, userId, dto) {
        const node = await this.prisma.sequenceNode.findUnique({
            where: { id: nodeId },
        });
        if (!node)
            throw new common_1.NotFoundException('节点不存在');
        if (dto.parentId) {
            const parent = await this.prisma.comment.findUnique({
                where: { id: dto.parentId },
            });
            if (!parent || parent.sequenceNodeId !== nodeId) {
                throw new common_1.NotFoundException('父评论不存在');
            }
        }
        const mentions = dto.mentions || this.extractMentions(dto.content);
        return this.prisma.comment.create({
            data: {
                sequenceNodeId: nodeId,
                userId,
                content: dto.content,
                mentions: mentions,
                parentId: dto.parentId || null,
            },
            include: {
                user: { select: { id: true, name: true } },
            },
        });
    }
    async getComments(nodeId) {
        const comments = await this.prisma.comment.findMany({
            where: { sequenceNodeId: nodeId },
            include: {
                user: { select: { id: true, name: true } },
            },
            orderBy: { createdAt: 'asc' },
        });
        const topLevel = comments.filter((c) => !c.parentId);
        const repliesMap = new Map();
        for (const c of comments) {
            if (c.parentId) {
                const existing = repliesMap.get(c.parentId) || [];
                existing.push(c);
                repliesMap.set(c.parentId, existing);
            }
        }
        return topLevel.map((c) => ({
            ...c,
            replies: repliesMap.get(c.id) || [],
        }));
    }
    async deleteComment(commentId, userId, userRole) {
        const comment = await this.prisma.comment.findUnique({
            where: { id: commentId },
        });
        if (!comment)
            throw new common_1.NotFoundException('评论不存在');
        if (comment.userId !== userId && userRole !== 'ADMIN' && userRole !== 'MANAGER') {
            throw new common_1.ForbiddenException('无权删除此评论');
        }
        await this.prisma.comment.delete({ where: { id: commentId } });
        return { message: '评论已删除' };
    }
    async getCommentCount(nodeId) {
        return this.prisma.comment.count({
            where: { sequenceNodeId: nodeId },
        });
    }
    extractMentions(content) {
        const matches = content.match(/@(\S+)/g);
        if (!matches)
            return [];
        return [...new Set(matches.map((m) => m.slice(1)))];
    }
};
exports.CommentService = CommentService;
exports.CommentService = CommentService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], CommentService);
//# sourceMappingURL=comment.service.js.map