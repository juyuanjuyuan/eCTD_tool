"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const application_service_1 = require("./application.service");
const common_1 = require("@nestjs/common");
const mockPrisma = {
    project: { findUnique: jest.fn() },
    application: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        delete: jest.fn(),
    },
};
const mockCvService = {
    getCvVersion: jest.fn().mockResolvedValue('1.0'),
};
describe('ApplicationService', () => {
    let service;
    beforeEach(() => {
        service = new application_service_1.ApplicationService(mockPrisma, mockCvService);
        jest.clearAllMocks();
        mockCvService.getCvVersion.mockResolvedValue('1.0');
    });
    describe('create', () => {
        const dto = {
            applicationTypeCode: 'cnapt2',
            productTypeCode: 'cnprt1',
            productNumber: '2026000001',
        };
        it('should throw if project not found', async () => {
            mockPrisma.project.findUnique.mockResolvedValue(null);
            await expect(service.create('proj1', dto)).rejects.toThrow(common_1.NotFoundException);
        });
        it('should throw if application number already exists', async () => {
            mockPrisma.project.findUnique.mockResolvedValue({ id: 'proj1' });
            mockPrisma.application.findUnique.mockResolvedValue({ id: 'existing' });
            await expect(service.create('proj1', dto)).rejects.toThrow(common_1.BadRequestException);
        });
        it('should create application with x prefix for chemical products', async () => {
            mockPrisma.project.findUnique.mockResolvedValue({ id: 'proj1' });
            mockPrisma.application.findUnique.mockResolvedValue(null);
            mockPrisma.application.create.mockImplementation(({ data }) => Promise.resolve(data));
            const result = await service.create('proj1', dto);
            expect(result.applicationNumber).toMatch(/^x\d{9}$/);
        });
        it('should create application with y prefix for biological products', async () => {
            mockPrisma.project.findUnique.mockResolvedValue({ id: 'proj1' });
            mockPrisma.application.findUnique.mockResolvedValue(null);
            mockPrisma.application.create.mockImplementation(({ data }) => Promise.resolve(data));
            const result = await service.create('proj1', {
                ...dto,
                productTypeCode: 'cnprt2',
            });
            expect(result.applicationNumber).toMatch(/^y\d{9}$/);
        });
        it('should create application with s prefix for API (cnapt4)', async () => {
            mockPrisma.project.findUnique.mockResolvedValue({ id: 'proj1' });
            mockPrisma.application.findUnique.mockResolvedValue(null);
            mockPrisma.application.create.mockImplementation(({ data }) => Promise.resolve(data));
            const result = await service.create('proj1', {
                ...dto,
                applicationTypeCode: 'cnapt4',
            });
            expect(result.applicationNumber).toMatch(/^s\d{9}$/);
        });
        it('should include the current year in the application number', async () => {
            mockPrisma.project.findUnique.mockResolvedValue({ id: 'proj1' });
            mockPrisma.application.findUnique.mockResolvedValue(null);
            mockPrisma.application.create.mockImplementation(({ data }) => Promise.resolve(data));
            const result = await service.create('proj1', dto);
            const year = new Date().getFullYear().toString();
            expect(result.applicationNumber).toContain(year);
        });
        it('should accept a caller-supplied valid applicationNumber (NMPA V1.1)', async () => {
            mockPrisma.project.findUnique.mockResolvedValue({ id: 'proj1' });
            mockPrisma.application.findUnique.mockResolvedValue(null);
            mockPrisma.application.create.mockImplementation(({ data }) => Promise.resolve(data));
            const result = await service.create('proj1', {
                ...dto,
                applicationNumber: 'l202412345',
            });
            expect(result.applicationNumber).toBe('l202412345');
        });
        it('should reject caller-supplied applicationNumber with invalid prefix', async () => {
            mockPrisma.project.findUnique.mockResolvedValue({ id: 'proj1' });
            mockPrisma.application.findUnique.mockResolvedValue(null);
            await expect(service.create('proj1', { ...dto, applicationNumber: 'z202412345' })).rejects.toThrow(common_1.BadRequestException);
        });
        it('should reject caller-supplied applicationNumber with wrong length', async () => {
            mockPrisma.project.findUnique.mockResolvedValue({ id: 'proj1' });
            mockPrisma.application.findUnique.mockResolvedValue(null);
            await expect(service.create('proj1', { ...dto, applicationNumber: 'x20241234' })).rejects.toThrow(common_1.BadRequestException);
        });
        it('should always auto-generate applicationNumber matching NMPA V1.1 regex', async () => {
            mockPrisma.project.findUnique.mockResolvedValue({ id: 'proj1' });
            mockPrisma.application.findUnique.mockResolvedValue(null);
            mockPrisma.application.create.mockImplementation(({ data }) => Promise.resolve(data));
            const result = await service.create('proj1', dto);
            expect(result.applicationNumber).toMatch(/^[xyls]\d{4}\d{5}$/);
        });
    });
    describe('findAllByProject', () => {
        it('should query applications by project ID', async () => {
            mockPrisma.application.findMany.mockResolvedValue([]);
            await service.findAllByProject('proj1');
            expect(mockPrisma.application.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { projectId: 'proj1' } }));
        });
    });
    describe('findOne', () => {
        it('should throw if not found', async () => {
            mockPrisma.application.findUnique.mockResolvedValue(null);
            await expect(service.findOne('nonexistent')).rejects.toThrow(common_1.NotFoundException);
        });
        it('should return application with project and RA details', async () => {
            mockPrisma.application.findUnique.mockResolvedValue({ id: 'app1' });
            const result = await service.findOne('app1');
            expect(result.id).toBe('app1');
        });
    });
    describe('remove', () => {
        it('should throw if not found', async () => {
            mockPrisma.application.findUnique.mockResolvedValue(null);
            await expect(service.remove('nonexistent')).rejects.toThrow(common_1.NotFoundException);
        });
        it('should throw if application has regulatory activities', async () => {
            mockPrisma.application.findUnique.mockResolvedValue({
                id: 'app1',
                _count: { regulatoryActivities: 2 },
            });
            await expect(service.remove('app1')).rejects.toThrow(common_1.ForbiddenException);
        });
        it('should delete if no regulatory activities', async () => {
            mockPrisma.application.findUnique.mockResolvedValue({
                id: 'app1',
                _count: { regulatoryActivities: 0 },
            });
            mockPrisma.application.delete.mockResolvedValue({ id: 'app1' });
            await service.remove('app1');
            expect(mockPrisma.application.delete).toHaveBeenCalledWith({ where: { id: 'app1' } });
        });
    });
});
//# sourceMappingURL=application.service.spec.js.map