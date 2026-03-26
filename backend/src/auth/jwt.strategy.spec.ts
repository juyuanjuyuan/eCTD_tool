import { UnauthorizedException } from '@nestjs/common';
import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;
  let prisma: Record<string, any>;

  beforeEach(() => {
    prisma = {
      user: {
        findUnique: jest.fn(),
      },
    };

    const configService = {
      get: jest.fn().mockReturnValue('test-jwt-secret'),
    };

    strategy = new JwtStrategy(configService as any, prisma as any);
  });

  it('should return user for valid active user', async () => {
    const mockUser = { id: 'u1', email: 'a@b.com', name: '张三', role: 'USER', status: 'ACTIVE' };
    prisma.user.findUnique.mockResolvedValue(mockUser);

    const result = await strategy.validate({ sub: 'u1', email: 'a@b.com' });

    expect(result).toEqual(mockUser);
  });

  it('should throw for non-existent user', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(
      strategy.validate({ sub: 'nonexistent', email: 'a@b.com' }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('should throw for disabled user', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'u1', email: 'a@b.com', name: '张三', role: 'USER', status: 'DISABLED',
    });

    await expect(
      strategy.validate({ sub: 'u1', email: 'a@b.com' }),
    ).rejects.toThrow(UnauthorizedException);
  });
});
