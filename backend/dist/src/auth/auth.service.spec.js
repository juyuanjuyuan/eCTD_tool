"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const testing_1 = require("@nestjs/testing");
const auth_service_1 = require("./auth.service");
const prisma_service_1 = require("../prisma/prisma.service");
const jwt_1 = require("@nestjs/jwt");
const config_1 = require("@nestjs/config");
const common_1 = require("@nestjs/common");
const bcrypt = __importStar(require("bcrypt"));
jest.mock('bcrypt');
describe('AuthService', () => {
    let service;
    let prisma;
    let jwtService;
    let configService;
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
            get: jest.fn().mockImplementation((key) => {
                const map = {
                    JWT_SECRET: 'test-secret',
                    JWT_REFRESH_SECRET: 'test-refresh-secret',
                    JWT_EXPIRES_IN: '1h',
                    JWT_REFRESH_EXPIRES_IN: '7d',
                };
                return map[key];
            }),
        };
        const module = await testing_1.Test.createTestingModule({
            providers: [
                auth_service_1.AuthService,
                { provide: prisma_service_1.PrismaService, useValue: prisma },
                { provide: jwt_1.JwtService, useValue: jwtService },
                { provide: config_1.ConfigService, useValue: configService },
            ],
        }).compile();
        service = module.get(auth_service_1.AuthService);
    });
    describe('register', () => {
        it('should register a new user', async () => {
            prisma.user.findUnique.mockResolvedValue(null);
            bcrypt.hash.mockResolvedValue('$2b$10$hashedpassword');
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
            await expect(service.register({ email: 'test@example.com', password: '123456', name: '张三' })).rejects.toThrow(common_1.ConflictException);
        });
    });
    describe('login', () => {
        it('should login with correct credentials', async () => {
            prisma.user.findUnique.mockResolvedValue(mockUser);
            bcrypt.compare.mockResolvedValue(true);
            const result = await service.login({
                email: 'test@example.com',
                password: '123456',
            });
            expect(result.user.id).toBe('user-1');
            expect(result.accessToken).toBe('access-token');
        });
        it('should throw when user not found', async () => {
            prisma.user.findUnique.mockResolvedValue(null);
            await expect(service.login({ email: 'x@x.com', password: '123' })).rejects.toThrow(common_1.UnauthorizedException);
        });
        it('should throw when password is wrong', async () => {
            prisma.user.findUnique.mockResolvedValue(mockUser);
            bcrypt.compare.mockResolvedValue(false);
            await expect(service.login({ email: 'test@example.com', password: 'wrong' })).rejects.toThrow(common_1.UnauthorizedException);
        });
        it('should throw when user is disabled', async () => {
            prisma.user.findUnique.mockResolvedValue({ ...mockUser, status: 'DISABLED' });
            bcrypt.compare.mockResolvedValue(true);
            await expect(service.login({ email: 'test@example.com', password: '123456' })).rejects.toThrow(common_1.UnauthorizedException);
        });
    });
    describe('refreshToken', () => {
        it('should return new tokens with valid refresh token', async () => {
            jwtService.verify.mockReturnValue({ sub: 'user-1', email: 'test@example.com' });
            jwtService.signAsync = jest.fn()
                .mockResolvedValueOnce('new-access')
                .mockResolvedValueOnce('new-refresh');
            const result = await service.refreshToken('valid-refresh-token');
            expect(result.accessToken).toBe('new-access');
            expect(result.refreshToken).toBe('new-refresh');
        });
        it('should throw when refresh token is invalid', async () => {
            jwtService.verify.mockImplementation(() => { throw new Error('invalid'); });
            await expect(service.refreshToken('invalid')).rejects.toThrow(common_1.UnauthorizedException);
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
            expect(result.name).toBe('张三');
        });
    });
});
//# sourceMappingURL=auth.service.spec.js.map