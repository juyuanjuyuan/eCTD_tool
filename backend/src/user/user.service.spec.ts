import { Test, TestingModule } from '@nestjs/testing';
import { UserService } from './user.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotFoundException } from '@nestjs/common';

describe('UserService', () => {
  let service: UserService;
  let prisma: Record<string, any>;

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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<UserService>(UserService);
  });

  describe('findAll', () => {
    it('should return paginated users', async () => {
      const result = await service.findAll({ page: 1, pageSize: 20 });
      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
    });

    it('should apply search filter', async () => {
      await service.findAll({ page: 1, pageSize: 10, search: '张' });
      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              expect.objectContaining({ name: expect.objectContaining({ contains: '张' }) }),
            ]),
          }),
        }),
      );
    });

    it('should filter by role', async () => {
      await service.findAll({ page: 1, pageSize: 10, role: 'ADMIN' as any });
      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ role: 'ADMIN' }),
        }),
      );
    });
  });

  describe('findOne', () => {
    it('should return user', async () => {
      const result = await service.findOne('user-1');
      expect(result.id).toBe('user-1');
    });

    it('should throw when not found', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.findOne('x')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('should update user', async () => {
      await service.update('user-1', { name: '新名' } as any);
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
