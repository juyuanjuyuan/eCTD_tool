"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
let UserService = class UserService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async findAll(query) {
        const { page = 1, pageSize = 20, search, role } = query;
        const where = {
            ...(role && { role }),
            ...(search && {
                OR: [
                    { name: { contains: search, mode: 'insensitive' } },
                    { email: { contains: search, mode: 'insensitive' } },
                ],
            }),
        };
        const [items, total] = await Promise.all([
            this.prisma.user.findMany({
                where,
                skip: (page - 1) * pageSize,
                take: pageSize,
                orderBy: { createdAt: 'desc' },
                select: {
                    id: true,
                    email: true,
                    name: true,
                    phone: true,
                    role: true,
                    status: true,
                    createdAt: true,
                },
            }),
            this.prisma.user.count({ where }),
        ]);
        return { items, total, page, pageSize };
    }
    async findOne(id) {
        const user = await this.prisma.user.findUnique({
            where: { id },
            select: {
                id: true,
                email: true,
                name: true,
                phone: true,
                role: true,
                status: true,
                createdAt: true,
                updatedAt: true,
            },
        });
        if (!user)
            throw new common_1.NotFoundException(`用户 ${id} 不存在`);
        return user;
    }
    async update(id, dto) {
        await this.findOne(id);
        return this.prisma.user.update({
            where: { id },
            data: dto,
            select: {
                id: true,
                email: true,
                name: true,
                phone: true,
                role: true,
                status: true,
            },
        });
    }
    async disable(id) {
        await this.findOne(id);
        return this.prisma.user.update({
            where: { id },
            data: { status: 'DISABLED' },
            select: { id: true, email: true, name: true, status: true },
        });
    }
};
exports.UserService = UserService;
exports.UserService = UserService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], UserService);
//# sourceMappingURL=user.service.js.map