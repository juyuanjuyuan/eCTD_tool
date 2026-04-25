"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const testing_1 = require("@nestjs/testing");
const comment_service_1 = require("./comment.service");
const prisma_service_1 = require("../prisma/prisma.service");
const common_1 = require("@nestjs/common");
describe('CommentService', () => {
    let service;
    let prisma;
    const mockComment = {
        id: 'comment-1',
        sequenceNodeId: 'node-1',
        userId: 'user-1',
        content: '这是一条评论',
        parentId: null,
        createdAt: new Date(),
        user: { id: 'user-1', name: '张三' },
    };
    beforeEach(async () => {
        prisma = {
            sequenceNode: {
                findUnique: jest.fn().mockResolvedValue({ id: 'node-1' }),
            },
            comment: {
                create: jest.fn().mockResolvedValue(mockComment),
                findMany: jest.fn().mockResolvedValue([]),
                findUnique: jest.fn().mockResolvedValue(mockComment),
                delete: jest.fn().mockResolvedValue({}),
                count: jest.fn().mockResolvedValue(5),
            },
        };
        const module = await testing_1.Test.createTestingModule({
            providers: [
                comment_service_1.CommentService,
                { provide: prisma_service_1.PrismaService, useValue: prisma },
            ],
        }).compile();
        service = module.get(comment_service_1.CommentService);
    });
    describe('createComment', () => {
        it('should create a top-level comment', async () => {
            const result = await service.createComment('node-1', 'user-1', {
                content: '这是一条评论',
            });
            expect(result.content).toBe('这是一条评论');
            expect(prisma.comment.create).toHaveBeenCalledWith({
                data: expect.objectContaining({
                    sequenceNodeId: 'node-1',
                    userId: 'user-1',
                    content: '这是一条评论',
                    parentId: null,
                }),
                include: expect.anything(),
            });
        });
        it('should create a reply to existing comment', async () => {
            prisma.comment.findUnique.mockResolvedValue({
                id: 'parent-1',
                sequenceNodeId: 'node-1',
            });
            await service.createComment('node-1', 'user-1', {
                content: '回复',
                parentId: 'parent-1',
            });
            expect(prisma.comment.create).toHaveBeenCalledWith({
                data: expect.objectContaining({ parentId: 'parent-1' }),
                include: expect.anything(),
            });
        });
        it('should throw when node not found', async () => {
            prisma.sequenceNode.findUnique.mockResolvedValue(null);
            await expect(service.createComment('x', 'user-1', { content: 'test' })).rejects.toThrow(common_1.NotFoundException);
        });
        it('should throw when parent comment not found', async () => {
            prisma.comment.findUnique.mockResolvedValue(null);
            await expect(service.createComment('node-1', 'user-1', { content: 'reply', parentId: 'x' })).rejects.toThrow(common_1.NotFoundException);
        });
        it('should throw when parent belongs to different node', async () => {
            prisma.comment.findUnique.mockResolvedValue({
                id: 'parent-1',
                sequenceNodeId: 'other-node',
            });
            await expect(service.createComment('node-1', 'user-1', { content: 'reply', parentId: 'parent-1' })).rejects.toThrow(common_1.NotFoundException);
        });
    });
    describe('getComments', () => {
        it('should return tree-structured comments', async () => {
            prisma.comment.findMany.mockResolvedValue([
                { ...mockComment, id: 'c1', parentId: null },
                { ...mockComment, id: 'c2', parentId: null },
                { ...mockComment, id: 'c3', parentId: 'c1' },
            ]);
            const result = await service.getComments('node-1');
            expect(result).toHaveLength(2);
            expect(result[0].replies).toHaveLength(1);
            expect(result[1].replies).toHaveLength(0);
        });
        it('should return empty array when no comments', async () => {
            prisma.comment.findMany.mockResolvedValue([]);
            const result = await service.getComments('node-1');
            expect(result).toEqual([]);
        });
    });
    describe('deleteComment', () => {
        it('should delete own comment', async () => {
            const result = await service.deleteComment('comment-1', 'user-1', 'USER');
            expect(prisma.comment.delete).toHaveBeenCalledWith({ where: { id: 'comment-1' } });
            expect(result.message).toBe('评论已删除');
        });
        it('should allow ADMIN to delete any comment', async () => {
            await service.deleteComment('comment-1', 'user-2', 'ADMIN');
            expect(prisma.comment.delete).toHaveBeenCalled();
        });
        it('should allow MANAGER to delete any comment', async () => {
            await service.deleteComment('comment-1', 'user-2', 'MANAGER');
            expect(prisma.comment.delete).toHaveBeenCalled();
        });
        it('should throw when non-author USER tries to delete', async () => {
            await expect(service.deleteComment('comment-1', 'user-2', 'USER')).rejects.toThrow(common_1.ForbiddenException);
        });
        it('should throw when comment not found', async () => {
            prisma.comment.findUnique.mockResolvedValue(null);
            await expect(service.deleteComment('x', 'user-1', 'USER')).rejects.toThrow(common_1.NotFoundException);
        });
    });
    describe('getCommentCount', () => {
        it('should return count', async () => {
            const count = await service.getCommentCount('node-1');
            expect(count).toBe(5);
            expect(prisma.comment.count).toHaveBeenCalledWith({
                where: { sequenceNodeId: 'node-1' },
            });
        });
    });
});
//# sourceMappingURL=comment.service.spec.js.map