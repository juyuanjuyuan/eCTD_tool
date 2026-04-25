"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const testing_1 = require("@nestjs/testing");
const approval_service_1 = require("./approval.service");
const prisma_service_1 = require("../prisma/prisma.service");
const common_1 = require("@nestjs/common");
describe('ApprovalService', () => {
    let service;
    let prisma;
    const mockLeafNode = {
        id: 'node-1',
        isLeaf: true,
        approvalStatus: 'DRAFT',
        status: 'COMPLETED',
        submittedBy: null,
        submittedAt: null,
        approvedBy: null,
        approvedAt: null,
        rejectionReason: null,
    };
    beforeEach(async () => {
        prisma = {
            sequenceNode: {
                findUnique: jest.fn(),
                findMany: jest.fn(),
                update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...mockLeafNode, ...data })),
            },
            user: {
                findMany: jest.fn().mockResolvedValue([]),
            },
        };
        const module = await testing_1.Test.createTestingModule({
            providers: [
                approval_service_1.ApprovalService,
                { provide: prisma_service_1.PrismaService, useValue: prisma },
            ],
        }).compile();
        service = module.get(approval_service_1.ApprovalService);
    });
    describe('submitForApproval', () => {
        it('should submit DRAFT node for approval', async () => {
            prisma.sequenceNode.findUnique.mockResolvedValue(mockLeafNode);
            const result = await service.submitForApproval('node-1', 'user-1');
            expect(result.approvalStatus).toBe('SUBMITTED');
            expect(prisma.sequenceNode.update).toHaveBeenCalledWith({
                where: { id: 'node-1' },
                data: expect.objectContaining({
                    approvalStatus: 'SUBMITTED',
                    submittedBy: 'user-1',
                }),
            });
        });
        it('should submit REJECTED node for re-approval', async () => {
            prisma.sequenceNode.findUnique.mockResolvedValue({
                ...mockLeafNode,
                approvalStatus: 'REJECTED',
            });
            await service.submitForApproval('node-1', 'user-1');
            expect(prisma.sequenceNode.update).toHaveBeenCalled();
        });
        it('should throw when node not found', async () => {
            prisma.sequenceNode.findUnique.mockResolvedValue(null);
            await expect(service.submitForApproval('x', 'u')).rejects.toThrow(common_1.NotFoundException);
        });
        it('should throw when node is not a leaf', async () => {
            prisma.sequenceNode.findUnique.mockResolvedValue({ ...mockLeafNode, isLeaf: false });
            await expect(service.submitForApproval('node-1', 'u')).rejects.toThrow(common_1.BadRequestException);
        });
        it('should throw when status is SUBMITTED', async () => {
            prisma.sequenceNode.findUnique.mockResolvedValue({
                ...mockLeafNode,
                approvalStatus: 'SUBMITTED',
            });
            await expect(service.submitForApproval('node-1', 'u')).rejects.toThrow(common_1.BadRequestException);
        });
        it('should throw when status is APPROVED', async () => {
            prisma.sequenceNode.findUnique.mockResolvedValue({
                ...mockLeafNode,
                approvalStatus: 'APPROVED',
            });
            await expect(service.submitForApproval('node-1', 'u')).rejects.toThrow(common_1.BadRequestException);
        });
        it('should throw when node content is EMPTY', async () => {
            prisma.sequenceNode.findUnique.mockResolvedValue({
                ...mockLeafNode,
                status: 'EMPTY',
            });
            await expect(service.submitForApproval('node-1', 'u')).rejects.toThrow(common_1.BadRequestException);
        });
    });
    describe('approveNode', () => {
        it('should approve SUBMITTED node', async () => {
            prisma.sequenceNode.findUnique.mockResolvedValue({
                ...mockLeafNode,
                approvalStatus: 'SUBMITTED',
            });
            const result = await service.approveNode('node-1', 'approver-1');
            expect(result.approvalStatus).toBe('APPROVED');
        });
        it('should throw when not SUBMITTED', async () => {
            prisma.sequenceNode.findUnique.mockResolvedValue(mockLeafNode);
            await expect(service.approveNode('node-1', 'a')).rejects.toThrow(common_1.BadRequestException);
        });
        it('should throw when node not found', async () => {
            prisma.sequenceNode.findUnique.mockResolvedValue(null);
            await expect(service.approveNode('x', 'a')).rejects.toThrow(common_1.NotFoundException);
        });
    });
    describe('rejectNode', () => {
        it('should reject SUBMITTED node with reason', async () => {
            prisma.sequenceNode.findUnique.mockResolvedValue({
                ...mockLeafNode,
                approvalStatus: 'SUBMITTED',
            });
            const result = await service.rejectNode('node-1', 'approver-1', '格式不符合要求');
            expect(result.approvalStatus).toBe('REJECTED');
            expect(result.rejectionReason).toBe('格式不符合要求');
        });
        it('should throw when not SUBMITTED', async () => {
            prisma.sequenceNode.findUnique.mockResolvedValue(mockLeafNode);
            await expect(service.rejectNode('node-1', 'a', 'r')).rejects.toThrow(common_1.BadRequestException);
        });
    });
    describe('unlockApproval', () => {
        it('should reset to DRAFT', async () => {
            prisma.sequenceNode.findUnique.mockResolvedValue({
                ...mockLeafNode,
                approvalStatus: 'APPROVED',
            });
            const result = await service.unlockApproval('node-1');
            expect(result.approvalStatus).toBe('DRAFT');
            expect(prisma.sequenceNode.update).toHaveBeenCalledWith({
                where: { id: 'node-1' },
                data: expect.objectContaining({
                    approvalStatus: 'DRAFT',
                    submittedBy: null,
                    approvedBy: null,
                    rejectionReason: null,
                }),
            });
        });
    });
    describe('getSequenceApprovalStatus', () => {
        it('should return approval statistics', async () => {
            prisma.sequenceNode.findMany.mockResolvedValue([
                { id: 'n1', approvalStatus: 'APPROVED', isRequired: true, status: 'COMPLETED' },
                { id: 'n2', approvalStatus: 'SUBMITTED', isRequired: true, status: 'COMPLETED' },
                { id: 'n3', approvalStatus: 'DRAFT', isRequired: false, status: 'EMPTY' },
                { id: 'n4', approvalStatus: 'REJECTED', isRequired: false, status: 'EDITING' },
            ]);
            const result = await service.getSequenceApprovalStatus('seq-1');
            expect(result.total).toBe(4);
            expect(result.approved).toBe(1);
            expect(result.submitted).toBe(1);
            expect(result.rejected).toBe(1);
            expect(result.draft).toBe(1);
            expect(result.requiredTotal).toBe(2);
            expect(result.requiredApproved).toBe(1);
            expect(result.allRequiredApproved).toBe(false);
        });
        it('should report allRequiredApproved when all required are approved', async () => {
            prisma.sequenceNode.findMany.mockResolvedValue([
                { id: 'n1', approvalStatus: 'APPROVED', isRequired: true },
                { id: 'n2', approvalStatus: 'APPROVED', isRequired: true },
                { id: 'n3', approvalStatus: 'DRAFT', isRequired: false },
            ]);
            const result = await service.getSequenceApprovalStatus('seq-1');
            expect(result.allRequiredApproved).toBe(true);
        });
    });
    describe('getApprovalHistory', () => {
        it('should return history with user names', async () => {
            prisma.sequenceNode.findUnique.mockResolvedValue({
                id: 'node-1',
                approvalStatus: 'APPROVED',
                submittedBy: 'user-1',
                approvedBy: 'user-2',
                submittedAt: new Date(),
                approvedAt: new Date(),
                rejectionReason: null,
            });
            prisma.user.findMany.mockResolvedValue([
                { id: 'user-1', name: '张三' },
                { id: 'user-2', name: '李四' },
            ]);
            const result = await service.getApprovalHistory('node-1');
            expect(result.submitterName).toBe('张三');
            expect(result.approverName).toBe('李四');
        });
        it('should throw when node not found', async () => {
            prisma.sequenceNode.findUnique.mockResolvedValue(null);
            await expect(service.getApprovalHistory('x')).rejects.toThrow(common_1.NotFoundException);
        });
    });
    describe('checkNodeEditable', () => {
        it('should return true for DRAFT node', async () => {
            prisma.sequenceNode.findUnique.mockResolvedValue({ approvalStatus: 'DRAFT' });
            expect(await service.checkNodeEditable('node-1')).toBe(true);
        });
        it('should return false for APPROVED node', async () => {
            prisma.sequenceNode.findUnique.mockResolvedValue({ approvalStatus: 'APPROVED' });
            expect(await service.checkNodeEditable('node-1')).toBe(false);
        });
        it('should return true for SUBMITTED node', async () => {
            prisma.sequenceNode.findUnique.mockResolvedValue({ approvalStatus: 'SUBMITTED' });
            expect(await service.checkNodeEditable('node-1')).toBe(true);
        });
    });
});
//# sourceMappingURL=approval.service.spec.js.map