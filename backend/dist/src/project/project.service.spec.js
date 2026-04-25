"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const testing_1 = require("@nestjs/testing");
const project_service_1 = require("./project.service");
const prisma_service_1 = require("../prisma/prisma.service");
const redis_cache_service_1 = require("../common/redis-cache.service");
const activity_log_service_1 = require("../activity-log/activity-log.service");
const common_1 = require("@nestjs/common");
describe('ProjectService', () => {
    let service;
    let prisma;
    let redis;
    let activityLog;
    const mockProject = {
        id: 'proj-1',
        name: '测试项目',
        description: '项目描述',
        status: 'ACTIVE',
        createdBy: 'user-1',
        createdAt: new Date(),
    };
    beforeEach(async () => {
        prisma = {
            project: {
                create: jest.fn().mockResolvedValue(mockProject),
                findMany: jest.fn().mockResolvedValue([mockProject]),
                findUnique: jest.fn().mockResolvedValue(mockProject),
                update: jest.fn().mockResolvedValue(mockProject),
                count: jest.fn().mockResolvedValue(1),
            },
            projectMember: {
                create: jest.fn().mockResolvedValue({ id: 'pm-1', role: 'OWNER' }),
                findFirst: jest.fn(),
                delete: jest.fn().mockResolvedValue({}),
            },
            sequenceNode: {
                findMany: jest.fn().mockResolvedValue([]),
                count: jest.fn().mockResolvedValue(0),
            },
            $transaction: jest.fn().mockImplementation((fn) => {
                if (typeof fn === 'function')
                    return fn(prisma);
                return Promise.all(fn);
            }),
        };
        redis = {
            get: jest.fn().mockResolvedValue(null),
        };
        activityLog = {
            log: jest.fn().mockResolvedValue({}),
            logMemberAction: jest.fn().mockResolvedValue({}),
        };
        const module = await testing_1.Test.createTestingModule({
            providers: [
                project_service_1.ProjectService,
                { provide: prisma_service_1.PrismaService, useValue: prisma },
                { provide: redis_cache_service_1.RedisCacheService, useValue: redis },
                { provide: activity_log_service_1.ActivityLogService, useValue: activityLog },
            ],
        }).compile();
        service = module.get(project_service_1.ProjectService);
    });
    describe('create', () => {
        it('should create project and add creator as OWNER', async () => {
            const result = await service.create({ name: '测试项目', description: '项目描述' }, 'user-1');
            expect(result.name).toBe('测试项目');
            expect(prisma.projectMember.create).toHaveBeenCalledWith({
                data: expect.objectContaining({
                    role: 'OWNER',
                    userId: 'user-1',
                }),
            });
        });
    });
    describe('findAll', () => {
        it('should return paginated projects', async () => {
            const result = await service.findAll({ page: 1, pageSize: 20 }, 'user-1');
            expect(result.items).toHaveLength(1);
            expect(result.total).toBe(1);
            expect(result.page).toBe(1);
        });
        it('should apply search filter', async () => {
            await service.findAll({ page: 1, pageSize: 20, search: '测试' }, 'user-1');
            expect(prisma.project.findMany).toHaveBeenCalledWith(expect.objectContaining({
                where: expect.objectContaining({
                    OR: expect.arrayContaining([
                        expect.objectContaining({ name: expect.objectContaining({ contains: '测试' }) }),
                    ]),
                }),
            }));
        });
    });
    describe('findOne', () => {
        it('should return project by id', async () => {
            const result = await service.findOne('proj-1');
            expect(result.id).toBe('proj-1');
        });
        it('should throw when not found', async () => {
            prisma.project.findUnique.mockResolvedValue(null);
            await expect(service.findOne('x')).rejects.toThrow(common_1.NotFoundException);
        });
    });
    describe('update', () => {
        it('should update project when user is OWNER', async () => {
            prisma.projectMember.findFirst.mockResolvedValue({ role: 'OWNER' });
            await service.update('proj-1', { name: '新名称' }, 'user-1');
            expect(prisma.project.update).toHaveBeenCalledWith({
                where: { id: 'proj-1' },
                data: { name: '新名称' },
            });
        });
        it('should throw when user is not OWNER', async () => {
            prisma.projectMember.findFirst.mockResolvedValue({ role: 'MEMBER' });
            await expect(service.update('proj-1', { name: '新' }, 'user-2')).rejects.toThrow(common_1.ForbiddenException);
        });
    });
    describe('archive', () => {
        it('should archive project', async () => {
            prisma.projectMember.findFirst.mockResolvedValue({ role: 'OWNER' });
            await service.archive('proj-1', 'user-1');
            expect(prisma.project.update).toHaveBeenCalledWith({
                where: { id: 'proj-1' },
                data: { status: 'ARCHIVED' },
            });
        });
    });
    describe('addMember', () => {
        it('should add a member', async () => {
            prisma.projectMember.findFirst.mockResolvedValue({ role: 'OWNER' });
            await service.addMember('proj-1', { userId: 'user-2', role: 'MEMBER' }, 'user-1');
            expect(prisma.projectMember.create).toHaveBeenCalledWith({
                data: expect.objectContaining({
                    userId: 'user-2',
                    role: 'MEMBER',
                }),
                include: expect.anything(),
            });
        });
        it('should throw when not OWNER', async () => {
            prisma.projectMember.findFirst.mockResolvedValue(null);
            await expect(service.addMember('proj-1', { userId: 'u', role: 'MEMBER' }, 'user-3')).rejects.toThrow(common_1.ForbiddenException);
        });
    });
    describe('removeMember', () => {
        it('should remove member', async () => {
            prisma.projectMember.findFirst
                .mockResolvedValueOnce({ role: 'OWNER' })
                .mockResolvedValueOnce({ id: 'pm-2', role: 'MEMBER', userId: 'user-2' });
            await service.removeMember('proj-1', 'user-2', 'user-1');
            expect(prisma.projectMember.delete).toHaveBeenCalled();
        });
        it('should throw when target is OWNER', async () => {
            prisma.projectMember.findFirst
                .mockResolvedValueOnce({ role: 'OWNER' })
                .mockResolvedValueOnce({ id: 'pm-1', role: 'OWNER' });
            await expect(service.removeMember('proj-1', 'user-1', 'user-1')).rejects.toThrow(common_1.ForbiddenException);
        });
        it('should throw when member not found', async () => {
            prisma.projectMember.findFirst
                .mockResolvedValueOnce({ role: 'OWNER' })
                .mockResolvedValueOnce(null);
            await expect(service.removeMember('proj-1', 'user-x', 'user-1')).rejects.toThrow(common_1.NotFoundException);
        });
    });
});
//# sourceMappingURL=project.service.spec.js.map