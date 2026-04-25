"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const sequence_service_1 = require("./sequence.service");
const common_1 = require("@nestjs/common");
const mockPrisma = {
    regulatoryActivity: { findUnique: jest.fn() },
    sequence: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
    },
};
const mockCvService = {
    validateDependency: jest.fn().mockResolvedValue(true),
    getCvVersion: jest.fn().mockResolvedValue('1.0'),
};
describe('SequenceService', () => {
    let service;
    beforeEach(() => {
        service = new sequence_service_1.SequenceService(mockPrisma, mockCvService);
        jest.clearAllMocks();
        mockCvService.validateDependency.mockResolvedValue(true);
        mockCvService.getCvVersion.mockResolvedValue('1.0');
    });
    describe('create', () => {
        const dto = {
            sequenceTypeCode: 'cnsqt1',
            description: '首次提交',
            contactName: '张三',
            contactPhone: '010-12345678',
            contactEmail: 'test@example.com',
        };
        it('should throw if RA not found', async () => {
            mockPrisma.regulatoryActivity.findUnique.mockResolvedValue(null);
            await expect(service.create('ra1', dto)).rejects.toThrow(common_1.NotFoundException);
        });
        it('should throw if CV dependency is invalid', async () => {
            mockPrisma.regulatoryActivity.findUnique.mockResolvedValue({
                id: 'ra1',
                regulatoryActivityTypeCode: 'cnrat1',
                application: { applicationTypeCode: 'cnapt1' },
            });
            mockCvService.validateDependency.mockResolvedValue(false);
            await expect(service.create('ra1', dto)).rejects.toThrow(common_1.BadRequestException);
        });
        it('should assign sequence number 0000 for first sequence', async () => {
            mockPrisma.regulatoryActivity.findUnique.mockResolvedValue({
                id: 'ra1',
                regulatoryActivityTypeCode: 'cnrat1',
                application: { applicationTypeCode: 'cnapt2' },
            });
            mockPrisma.sequence.findFirst.mockResolvedValue(null);
            mockPrisma.sequence.create.mockImplementation(({ data }) => Promise.resolve(data));
            const result = await service.create('ra1', dto);
            expect(result.sequenceNumber).toBe('0000');
        });
        it('should auto-increment sequence number', async () => {
            mockPrisma.regulatoryActivity.findUnique.mockResolvedValue({
                id: 'ra1',
                regulatoryActivityTypeCode: 'cnrat1',
                application: { applicationTypeCode: 'cnapt2' },
            });
            mockPrisma.sequence.findFirst.mockResolvedValue({ sequenceNumber: '0002' });
            mockPrisma.sequence.create.mockImplementation(({ data }) => Promise.resolve(data));
            const result = await service.create('ra1', {
                ...dto,
                sequenceTypeCode: 'cnsqt2',
            });
            expect(result.sequenceNumber).toBe('0003');
        });
        it('should reject non-cnsqt1 type for first sequence (0000)', async () => {
            mockPrisma.regulatoryActivity.findUnique.mockResolvedValue({
                id: 'ra1',
                regulatoryActivityTypeCode: 'cnrat1',
                application: { applicationTypeCode: 'cnapt2' },
            });
            mockPrisma.sequence.findFirst.mockResolvedValue(null);
            await expect(service.create('ra1', { ...dto, sequenceTypeCode: 'cnsqt2' })).rejects.toThrow(common_1.BadRequestException);
        });
        it('should pad sequence number to 4 digits', async () => {
            mockPrisma.regulatoryActivity.findUnique.mockResolvedValue({
                id: 'ra1',
                regulatoryActivityTypeCode: 'cnrat1',
                application: { applicationTypeCode: 'cnapt2' },
            });
            mockPrisma.sequence.findFirst.mockResolvedValue({ sequenceNumber: '0000' });
            mockPrisma.sequence.create.mockImplementation(({ data }) => Promise.resolve(data));
            const result = await service.create('ra1', {
                ...dto,
                sequenceTypeCode: 'cnsqt2',
            });
            expect(result.sequenceNumber).toBe('0001');
            expect(result.sequenceNumber).toHaveLength(4);
        });
    });
    describe('findOne', () => {
        it('should throw if sequence not found', async () => {
            mockPrisma.sequence.findUnique.mockResolvedValue(null);
            await expect(service.findOne('nonexistent')).rejects.toThrow(common_1.NotFoundException);
        });
        it('should return sequence with RA and application context', async () => {
            mockPrisma.sequence.findUnique.mockResolvedValue({
                id: 'seq1',
                regulatoryActivity: {
                    application: { id: 'app1', applicationNumber: 'x202600001' },
                },
            });
            const result = await service.findOne('seq1');
            expect(result.id).toBe('seq1');
        });
    });
    describe('update', () => {
        it('should throw if sequence is SUBMITTED', async () => {
            mockPrisma.sequence.findUnique.mockResolvedValue({
                id: 'seq1',
                status: 'SUBMITTED',
                regulatoryActivity: { application: {} },
            });
            await expect(service.update('seq1', { description: 'new' })).rejects.toThrow(common_1.ForbiddenException);
        });
        it('should update if sequence is in DRAFT status', async () => {
            mockPrisma.sequence.findUnique.mockResolvedValue({
                id: 'seq1',
                status: 'DRAFT',
                regulatoryActivity: { application: {} },
            });
            mockPrisma.sequence.update.mockResolvedValue({ id: 'seq1' });
            await service.update('seq1', { description: 'updated' });
            expect(mockPrisma.sequence.update).toHaveBeenCalled();
        });
    });
    describe('remove', () => {
        it('should throw if not in DRAFT status', async () => {
            mockPrisma.sequence.findUnique.mockResolvedValue({
                id: 'seq1',
                status: 'EDITING',
                regulatoryActivity: { application: {} },
            });
            await expect(service.remove('seq1')).rejects.toThrow(common_1.ForbiddenException);
        });
        it('should throw if later sequences exist (gap prevention)', async () => {
            mockPrisma.sequence.findUnique.mockResolvedValue({
                id: 'seq1',
                status: 'DRAFT',
                sequenceNumber: '0001',
                regulatoryActivityId: 'ra1',
                regulatoryActivity: { application: {} },
            });
            mockPrisma.sequence.findFirst.mockResolvedValue({ id: 'seq2', sequenceNumber: '0002' });
            await expect(service.remove('seq1')).rejects.toThrow(common_1.ForbiddenException);
        });
        it('should delete if DRAFT and no later sequences', async () => {
            mockPrisma.sequence.findUnique.mockResolvedValue({
                id: 'seq1',
                status: 'DRAFT',
                sequenceNumber: '0002',
                regulatoryActivityId: 'ra1',
                regulatoryActivity: { application: {} },
            });
            mockPrisma.sequence.findFirst.mockResolvedValue(null);
            mockPrisma.sequence.delete.mockResolvedValue({ id: 'seq1' });
            await service.remove('seq1');
            expect(mockPrisma.sequence.delete).toHaveBeenCalledWith({ where: { id: 'seq1' } });
        });
    });
});
//# sourceMappingURL=sequence.service.spec.js.map