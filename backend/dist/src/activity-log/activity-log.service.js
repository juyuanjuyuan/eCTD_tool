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
exports.ActivityLogService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
let ActivityLogService = class ActivityLogService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async log(params) {
        return this.prisma.activityLog.create({
            data: {
                userId: params.userId,
                action: params.action,
                resource: params.resource,
                resourceId: params.resourceId,
                detail: params.detail || undefined,
            },
        });
    }
    async getBySequence(sequenceId, page = 1, pageSize = 20) {
        const nodes = await this.prisma.sequenceNode.findMany({
            where: { sequenceId },
            select: { id: true },
        });
        const nodeIds = nodes.map((n) => n.id);
        const where = {
            OR: [
                { resource: 'sequence', resourceId: sequenceId },
                { resource: 'node', resourceId: { in: nodeIds } },
                { resource: 'document', resourceId: { in: nodeIds } },
                { resource: 'file', resourceId: { in: nodeIds } },
                { resource: 'comment', resourceId: { in: nodeIds } },
            ],
        };
        const [items, total] = await Promise.all([
            this.prisma.activityLog.findMany({
                where,
                include: {
                    user: { select: { id: true, name: true } },
                },
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * pageSize,
                take: pageSize,
            }),
            this.prisma.activityLog.count({ where }),
        ]);
        return { items, total, page, pageSize };
    }
};
exports.ActivityLogService = ActivityLogService;
exports.ActivityLogService = ActivityLogService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], ActivityLogService);
//# sourceMappingURL=activity-log.service.js.map