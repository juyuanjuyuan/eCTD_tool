"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const testing_1 = require("@nestjs/testing");
const user_service_1 = require("./user.service");
const prisma_service_1 = require("../prisma/prisma.service");
const common_1 = require("@nestjs/common");
describe('UserService', () => {
    let service;
    let prisma;
    const mockUser = {
        id: 'user-1',
        email: 'test@example.com',
        name: '张三',
        phone: '13800000000',
        role: 'USER',
        status: 'ACTIVE',
        createdAt: new Date(),
    };
    beforeEach(async () => {
        prisma = {
            user: {
                findMany: jest.fn().mockResolvedValue([mockUser]),
                findUnique: jest.fn().mockResolvedValue(mockUser),
                count: jest.fn().mockResolvedValue(1),
                update: jest.fn().mockResolvedValue(mockUser),
            },
        };
        const module = await testing_1.Test.createTestingModule({
            providers: [
                user_service_1.UserService,
                { provide: prisma_service_1.PrismaService, useValue: prisma },
            ],
        }).compile();
        service = module.get(user_service_1.UserService);
    });
    describe('findAll', () => {
        it('should return paginated users', async () => {
            const result = await service.findAll({ page: 1, pageSize: 20 });
            expect(result.items).toHaveLength(1);
            expect(result.total).toBe(1);
        });
        it('should apply search filter', async () => {
            await service.findAll({ page: 1, pageSize: 10, search: '张' });
            expect(prisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({
                where: expect.objectContaining({
                    OR: expect.arrayContaining([
                        expect.objectContaining({ name: expect.objectContaining({ contains: '张' }) }),
                    ]),
                }),
            }));
        });
        it('should filter by role', async () => {
            await service.findAll({ page: 1, pageSize: 10, role: 'ADMIN' });
            expect(prisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({
                where: expect.objectContaining({ role: 'ADMIN' }),
            }));
        });
    });
    describe('findOne', () => {
        it('should return user', async () => {
            const result = await service.findOne('user-1');
            expect(result.id).toBe('user-1');
        });
        it('should throw when not found', async () => {
            prisma.user.findUnique.mockResolvedValue(null);
            await expect(service.findOne('x')).rejects.toThrow(common_1.NotFoundException);
        });
    });
    describe('update', () => {
        it('should update user', async () => {
            await service.update('user-1', { name: '新名' });
            expect(prisma.user.update).toHaveBeenCalledWith({
                where: { id: 'user-1' },
                data: { name: '新名' },
                select: expect.anything(),
            });
        });
    });
    describe('disable', () => {
        it('should disable user', async () => {
            await service.disable('user-1');
            expect(prisma.user.update).toHaveBeenCalledWith({
                where: { id: 'user-1' },
                data: { status: 'DISABLED' },
                select: expect.anything(),
            });
        });
    });
});
//# sourceMappingURL=user.service.spec.js.map