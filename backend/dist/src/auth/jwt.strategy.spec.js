"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const common_1 = require("@nestjs/common");
const jwt_strategy_1 = require("./jwt.strategy");
describe('JwtStrategy', () => {
    let strategy;
    let prisma;
    beforeEach(() => {
        prisma = {
            user: {
                findUnique: jest.fn(),
            },
        };
        const configService = {
            get: jest.fn().mockReturnValue('test-jwt-secret'),
        };
        strategy = new jwt_strategy_1.JwtStrategy(configService, prisma);
    });
    it('should return user for valid active user', async () => {
        const mockUser = { id: 'u1', email: 'a@b.com', name: '张三', role: 'USER', status: 'ACTIVE' };
        prisma.user.findUnique.mockResolvedValue(mockUser);
        const result = await strategy.validate({ sub: 'u1', email: 'a@b.com' });
        expect(result).toEqual(mockUser);
    });
    it('should throw for non-existent user', async () => {
        prisma.user.findUnique.mockResolvedValue(null);
        await expect(strategy.validate({ sub: 'nonexistent', email: 'a@b.com' })).rejects.toThrow(common_1.UnauthorizedException);
    });
    it('should throw for disabled user', async () => {
        prisma.user.findUnique.mockResolvedValue({
            id: 'u1', email: 'a@b.com', name: '张三', role: 'USER', status: 'DISABLED',
        });
        await expect(strategy.validate({ sub: 'u1', email: 'a@b.com' })).rejects.toThrow(common_1.UnauthorizedException);
    });
});
//# sourceMappingURL=jwt.strategy.spec.js.map