"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const lifecycle_service_1 = require("./lifecycle.service");
const client_1 = require("@prisma/client");
const mockPrisma = {
    sequence: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
    },
    sequenceNode: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
    },
};
describe('LifecycleService', () => {
    let service;
    beforeEach(() => {
        service = new lifecycle_service_1.LifecycleService(mockPrisma);
        jest.clearAllMocks();
    });
    describe('validateOperation', () => {
        it('should return invalid if sequence not found', async () => {
            mockPrisma.sequence.findUnique.mockResolvedValue(null);
            const result = await service.validateOperation('seq1', 'node1', client_1.LeafOperation.NEW);
            expect(result.isValid).toBe(false);
            expect(result.message).toBe('序列不存在');
        });
        it('should allow NEW on first sequence (0000)', async () => {
            mockPrisma.sequence.findUnique.mockResolvedValue({
                id: 'seq1',
                sequenceNumber: '0000',
                regulatoryActivity: { id: 'ra1' },
            });
            const result = await service.validateOperation('seq1', 'node1', client_1.LeafOperation.NEW);
            expect(result.isValid).toBe(true);
        });
        it('should reject non-NEW operations on first sequence (0000)', async () => {
            mockPrisma.sequence.findUnique.mockResolvedValue({
                id: 'seq1',
                sequenceNumber: '0000',
                regulatoryActivity: { id: 'ra1' },
            });
            const result = await service.validateOperation('seq1', 'node1', client_1.LeafOperation.REPLACE);
            expect(result.isValid).toBe(false);
            expect(result.message).toContain('0000');
        });
        it('should reject DELETE on first sequence', async () => {
            mockPrisma.sequence.findUnique.mockResolvedValue({
                id: 'seq1',
                sequenceNumber: '0000',
                regulatoryActivity: { id: 'ra1' },
            });
            const result = await service.validateOperation('seq1', 'node1', client_1.LeafOperation.DELETE);
            expect(result.isValid).toBe(false);
        });
        it('should return invalid if node not found (non-first sequence)', async () => {
            mockPrisma.sequence.findUnique.mockResolvedValue({
                id: 'seq1',
                sequenceNumber: '0001',
                regulatoryActivityId: 'ra1',
                regulatoryActivity: { id: 'ra1' },
            });
            mockPrisma.sequenceNode.findUnique.mockResolvedValue(null);
            const result = await service.validateOperation('seq1', 'node1', client_1.LeafOperation.REPLACE);
            expect(result.isValid).toBe(false);
            expect(result.message).toBe('节点不存在');
        });
        describe('operation transitions (non-first sequence)', () => {
            beforeEach(() => {
                mockPrisma.sequence.findUnique.mockResolvedValue({
                    id: 'seq2',
                    sequenceNumber: '0001',
                    regulatoryActivityId: 'ra1',
                    regulatoryActivity: { id: 'ra1' },
                });
                mockPrisma.sequenceNode.findUnique.mockResolvedValue({
                    templateNodeId: 'tpl1',
                    ctdSectionNumber: '2.3',
                });
            });
            function mockPreviousOp(op) {
                if (op === null) {
                    mockPrisma.sequence.findMany.mockResolvedValue([{ id: 'seq1' }]);
                    mockPrisma.sequenceNode.findFirst.mockResolvedValue(null);
                }
                else {
                    mockPrisma.sequence.findMany.mockResolvedValue([{ id: 'seq1' }]);
                    mockPrisma.sequenceNode.findFirst.mockResolvedValue({ operation: op });
                }
            }
            it('should allow NEW when no previous operation exists', async () => {
                mockPreviousOp(null);
                const result = await service.validateOperation('seq2', 'node1', client_1.LeafOperation.NEW);
                expect(result.isValid).toBe(true);
            });
            it('should reject REPLACE when no previous operation exists', async () => {
                mockPreviousOp(null);
                const result = await service.validateOperation('seq2', 'node1', client_1.LeafOperation.REPLACE);
                expect(result.isValid).toBe(false);
            });
            it('should allow REPLACE after NEW', async () => {
                mockPreviousOp(client_1.LeafOperation.NEW);
                const result = await service.validateOperation('seq2', 'node1', client_1.LeafOperation.REPLACE);
                expect(result.isValid).toBe(true);
            });
            it('should allow DELETE after NEW', async () => {
                mockPreviousOp(client_1.LeafOperation.NEW);
                const result = await service.validateOperation('seq2', 'node1', client_1.LeafOperation.DELETE);
                expect(result.isValid).toBe(true);
            });
            it('should reject NEW after NEW', async () => {
                mockPreviousOp(client_1.LeafOperation.NEW);
                const result = await service.validateOperation('seq2', 'node1', client_1.LeafOperation.NEW);
                expect(result.isValid).toBe(false);
            });
            it('should allow REPLACE after REPLACE', async () => {
                mockPreviousOp(client_1.LeafOperation.REPLACE);
                const result = await service.validateOperation('seq2', 'node1', client_1.LeafOperation.REPLACE);
                expect(result.isValid).toBe(true);
            });
            it('should allow DELETE after REPLACE', async () => {
                mockPreviousOp(client_1.LeafOperation.REPLACE);
                const result = await service.validateOperation('seq2', 'node1', client_1.LeafOperation.DELETE);
                expect(result.isValid).toBe(true);
            });
            it('should allow NEW after DELETE', async () => {
                mockPreviousOp(client_1.LeafOperation.DELETE);
                const result = await service.validateOperation('seq2', 'node1', client_1.LeafOperation.NEW);
                expect(result.isValid).toBe(true);
            });
            it('should reject REPLACE after DELETE', async () => {
                mockPreviousOp(client_1.LeafOperation.DELETE);
                const result = await service.validateOperation('seq2', 'node1', client_1.LeafOperation.REPLACE);
                expect(result.isValid).toBe(false);
            });
            it('should reject DELETE after DELETE', async () => {
                mockPreviousOp(client_1.LeafOperation.DELETE);
                const result = await service.validateOperation('seq2', 'node1', client_1.LeafOperation.DELETE);
                expect(result.isValid).toBe(false);
            });
            it('should allow REPLACE after APPEND', async () => {
                mockPreviousOp(client_1.LeafOperation.APPEND);
                const result = await service.validateOperation('seq2', 'node1', client_1.LeafOperation.REPLACE);
                expect(result.isValid).toBe(true);
            });
            it('should allow DELETE after APPEND', async () => {
                mockPreviousOp(client_1.LeafOperation.APPEND);
                const result = await service.validateOperation('seq2', 'node1', client_1.LeafOperation.DELETE);
                expect(result.isValid).toBe(true);
            });
            it('should allow APPEND after APPEND', async () => {
                mockPreviousOp(client_1.LeafOperation.APPEND);
                const result = await service.validateOperation('seq2', 'node1', client_1.LeafOperation.APPEND);
                expect(result.isValid).toBe(true);
            });
            it('should reject NEW after APPEND', async () => {
                mockPreviousOp(client_1.LeafOperation.APPEND);
                const result = await service.validateOperation('seq2', 'node1', client_1.LeafOperation.NEW);
                expect(result.isValid).toBe(false);
            });
        });
    });
    describe('validateReplaceLanguage', () => {
        it('should return invalid if node not found', async () => {
            mockPrisma.sequenceNode.findUnique.mockResolvedValue(null);
            const result = await service.validateReplaceLanguage('seq1', 'node1', 'zh');
            expect(result.isValid).toBe(false);
        });
        it('should return invalid if sequence not found', async () => {
            mockPrisma.sequenceNode.findUnique.mockResolvedValue({ templateNodeId: 'tpl1' });
            mockPrisma.sequence.findUnique.mockResolvedValue(null);
            const result = await service.validateReplaceLanguage('seq1', 'node1', 'zh');
            expect(result.isValid).toBe(false);
        });
        it('should allow matching language', async () => {
            mockPrisma.sequenceNode.findUnique.mockResolvedValue({ templateNodeId: 'tpl1' });
            mockPrisma.sequence.findUnique.mockResolvedValue({
                regulatoryActivityId: 'ra1',
                sequenceNumber: '0001',
                regulatoryActivity: { applicationId: 'app1' },
            });
            mockPrisma.sequence.findMany.mockResolvedValue([{ id: 'seq0' }]);
            mockPrisma.sequenceNode.findFirst.mockResolvedValue({
                document: { xmlLang: 'zh' },
            });
            const result = await service.validateReplaceLanguage('seq1', 'node1', 'zh');
            expect(result.isValid).toBe(true);
        });
        it('should reject mismatching language', async () => {
            mockPrisma.sequenceNode.findUnique.mockResolvedValue({ templateNodeId: 'tpl1' });
            mockPrisma.sequence.findUnique.mockResolvedValue({
                regulatoryActivityId: 'ra1',
                sequenceNumber: '0001',
                regulatoryActivity: { applicationId: 'app1' },
            });
            mockPrisma.sequence.findMany.mockResolvedValue([{ id: 'seq0' }]);
            mockPrisma.sequenceNode.findFirst.mockResolvedValue({
                document: { xmlLang: 'zh' },
            });
            const result = await service.validateReplaceLanguage('seq1', 'node1', 'en');
            expect(result.isValid).toBe(false);
            expect(result.message).toContain('zh');
            expect(result.message).toContain('en');
        });
        it('should allow if no prior document has language', async () => {
            mockPrisma.sequenceNode.findUnique.mockResolvedValue({ templateNodeId: 'tpl1' });
            mockPrisma.sequence.findUnique.mockResolvedValue({
                regulatoryActivityId: 'ra1',
                sequenceNumber: '0001',
                regulatoryActivity: { applicationId: 'app1' },
            });
            mockPrisma.sequence.findMany.mockResolvedValue([{ id: 'seq0' }]);
            mockPrisma.sequenceNode.findFirst.mockResolvedValue({
                document: null,
            });
            const result = await service.validateReplaceLanguage('seq1', 'node1', 'en');
            expect(result.isValid).toBe(true);
        });
    });
    describe('generateWithdrawOperations', () => {
        it('should convert NEW → DELETE (step 1)', async () => {
            mockPrisma.sequenceNode.findMany.mockResolvedValue([
                { templateNodeId: 'tpl1', operation: client_1.LeafOperation.NEW, isLeaf: true },
            ]);
            const ops = await service.generateWithdrawOperations('seq1');
            expect(ops).toHaveLength(1);
            expect(ops[0].operation).toBe(client_1.LeafOperation.DELETE);
            expect(ops[0].templateNodeId).toBe('tpl1');
        });
        it('should convert REPLACE → NEW (step 2: restore original)', async () => {
            mockPrisma.sequenceNode.findMany.mockResolvedValue([
                { templateNodeId: 'tpl1', operation: client_1.LeafOperation.REPLACE, isLeaf: true },
            ]);
            const ops = await service.generateWithdrawOperations('seq1');
            expect(ops).toHaveLength(1);
            expect(ops[0].operation).toBe(client_1.LeafOperation.NEW);
        });
        it('should convert DELETE → NEW (step 3: recreate)', async () => {
            mockPrisma.sequenceNode.findMany.mockResolvedValue([
                { templateNodeId: 'tpl1', operation: client_1.LeafOperation.DELETE, isLeaf: true },
            ]);
            const ops = await service.generateWithdrawOperations('seq1');
            expect(ops).toHaveLength(1);
            expect(ops[0].operation).toBe(client_1.LeafOperation.NEW);
        });
        it('should convert APPEND → DELETE', async () => {
            mockPrisma.sequenceNode.findMany.mockResolvedValue([
                { templateNodeId: 'tpl1', operation: client_1.LeafOperation.APPEND, isLeaf: true },
            ]);
            const ops = await service.generateWithdrawOperations('seq1');
            expect(ops).toHaveLength(1);
            expect(ops[0].operation).toBe(client_1.LeafOperation.DELETE);
        });
        it('should handle mixed operations in a sequence', async () => {
            mockPrisma.sequenceNode.findMany.mockResolvedValue([
                { templateNodeId: 'tpl1', operation: client_1.LeafOperation.NEW, isLeaf: true },
                { templateNodeId: 'tpl2', operation: client_1.LeafOperation.REPLACE, isLeaf: true },
                { templateNodeId: 'tpl3', operation: client_1.LeafOperation.DELETE, isLeaf: true },
            ]);
            const ops = await service.generateWithdrawOperations('seq1');
            expect(ops).toHaveLength(3);
            expect(ops[0].operation).toBe(client_1.LeafOperation.DELETE);
            expect(ops[1].operation).toBe(client_1.LeafOperation.NEW);
            expect(ops[2].operation).toBe(client_1.LeafOperation.NEW);
        });
        it('should return empty array for empty sequence', async () => {
            mockPrisma.sequenceNode.findMany.mockResolvedValue([]);
            const ops = await service.generateWithdrawOperations('seq1');
            expect(ops).toHaveLength(0);
        });
    });
    describe('checkParallelConflicts', () => {
        it('should return empty array if sequence not found', async () => {
            mockPrisma.sequence.findUnique.mockResolvedValue(null);
            const result = await service.checkParallelConflicts('seq1');
            expect(result).toHaveLength(0);
        });
        it('should return empty array if no parallel sequences', async () => {
            mockPrisma.sequence.findUnique.mockResolvedValue({
                id: 'seq1',
                regulatoryActivityId: 'ra1',
                regulatoryActivity: { id: 'ra1' },
            });
            mockPrisma.sequence.findMany.mockResolvedValue([]);
            const result = await service.checkParallelConflicts('seq1');
            expect(result).toHaveLength(0);
        });
        it('should detect conflicts with parallel sequences', async () => {
            mockPrisma.sequence.findUnique.mockResolvedValue({
                id: 'seq1',
                regulatoryActivityId: 'ra1',
                regulatoryActivity: { id: 'ra1' },
            });
            mockPrisma.sequence.findMany.mockResolvedValue([
                { id: 'seq2', sequenceNumber: '0002' },
            ]);
            mockPrisma.sequenceNode.findMany
                .mockResolvedValueOnce([
                { id: 'n1', templateNodeId: 'tpl1', isLeaf: true },
                { id: 'n2', templateNodeId: 'tpl2', isLeaf: true },
            ])
                .mockResolvedValueOnce([
                { id: 'n3', templateNodeId: 'tpl1', isLeaf: true },
            ]);
            const result = await service.checkParallelConflicts('seq1');
            expect(result).toHaveLength(1);
            expect(result[0].conflictNodeIds).toContain('n1');
            expect(result[0].conflictNodeIds).not.toContain('n2');
        });
        it('should report no conflicts when template nodes differ', async () => {
            mockPrisma.sequence.findUnique.mockResolvedValue({
                id: 'seq1',
                regulatoryActivityId: 'ra1',
                regulatoryActivity: { id: 'ra1' },
            });
            mockPrisma.sequence.findMany.mockResolvedValue([
                { id: 'seq2', sequenceNumber: '0002' },
            ]);
            mockPrisma.sequenceNode.findMany
                .mockResolvedValueOnce([
                { id: 'n1', templateNodeId: 'tpl1', isLeaf: true },
            ])
                .mockResolvedValueOnce([
                { id: 'n3', templateNodeId: 'tpl99', isLeaf: true },
            ]);
            const result = await service.checkParallelConflicts('seq1');
            expect(result).toHaveLength(0);
        });
    });
});
//# sourceMappingURL=lifecycle.service.spec.js.map