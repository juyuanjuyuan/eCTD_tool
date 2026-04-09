import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException, ConflictException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';

jest.mock('bcrypt');

describe('AuthService', () => {
  let service: AuthService;
  let prisma: Record<string, any>;
  let jwtService: Record<string, any>;
  let configService: Record<string, any>;

  const mockUser = {
    id: 'user-1',
    email: 'test@example.com',
    name: '张三',
    passwordHash: '$2b$10$hashedpassword',
    phone: '13800000000',
    role: 'USER',
    status: 'ACTIVE',
    createdAt: new Date(),
  };

  beforeEach(async () => {
    prisma = {
      user: {
        findUnique: jest.fn(),
        create: jest.fn(),
      },
    };

    jwtService = {
      signAsync: jest.fn()
        .mockResolvedValueOnce('access-token')
        .mockResolvedValueOnce('refresh-token'),
      verify: jest.fn(),
    };

    configService = {
      get: jest.fn().mockImplementation((key: string) => {
        const map: Record<string, string> = {
          JWT_SECRET: 'test-secret',
          JWT_REFRESH_SECRET: 'test-refresh-secret',
          JWT_EXPIRES_IN: '1h',
          JWT_REFRESH_EXPIRES_IN: '7d',
        };
        return map[key];
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwtService },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  describe('register', () => {
    it('should register a new user', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      (bcrypt.hash as jest.Mock).mockResolvedValue('$2b$10$hashedpassword');
      prisma.user.create.mockResolvedValue({
        id: 'user-1',
        email: 'test@example.com',
        name: '张三',
        role: 'USER',
      });

      const result = await service.register({
        email: 'test@example.com',
        password: '123456',
        name: '张三',
      });

      expect(result.user.email).toBe('test@example.com');
      expect(result.accessToken).toBe('access-token');
      expect(result.refreshToken).toBe('refresh-token');
    });

    it('should throw when email already exists', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser);

      await expect(
        service.register({ email: 'test@example.com', password: '123456', name: '张三' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('login', () => {
    it('should login with correct credentials', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await service.login({
        email: 'test@example.com',
        password: '123456',
      });

      expect(result.user.id).toBe('user-1');
      expect(result.accessToken).toBe('access-token');
    });

    it('should throw when user not found', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.login({ email: 'x@x.com', password: '123' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw when password is wrong', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        service.login({ email: 'test@example.com', password: 'wrong' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw when user is disabled', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...mockUser, status: 'DISABLED' });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      await expect(
        service.login({ email: 'test@example.com', password: '123456' }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('refreshToken', () => {
    it('should return new tokens with valid refresh token', async () => {
      jwtService.verify.mockReturnValue({ sub: 'user-1', email: 'test@example.com' });
      // Reset signAsync mock for this test
      jwtService.signAsync = jest.fn()
        .mockResolvedValueOnce('new-access')
        .mockResolvedValueOnce('new-refresh');

      const result = await service.refreshToken('valid-refresh-token');

      expect(result.accessToken).toBe('new-access');
      expect(result.refreshToken).toBe('new-refresh');
    });

    it('should throw when refresh token is invalid', async () => {
      jwtService.verify.mockImplementation(() => { throw new Error('invalid'); });

      await expect(service.refreshToken('invalid')).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('getProfile', () => {
    it('should return user profile', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'test@example.com',
        name: '张三',
        role: 'USER',
      });

      const result = await service.getProfile('user-1');

      expect(result).not.toBeNull();
      expect(result!.name).toBe('张三');
    });
  });
});
