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
exports.ApplicationService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const controlled_vocabulary_service_1 = require("../controlled-vocabulary/controlled-vocabulary.service");
const create_application_dto_1 = require("./dto/create-application.dto");
let ApplicationService = class ApplicationService {
    prisma;
    cvService;
    constructor(prisma, cvService) {
        this.prisma = prisma;
        this.cvService = cvService;
    }
    async create(projectId, dto) {
        const project = await this.prisma.project.findUnique({
            where: { id: projectId },
        });
        if (!project)
            throw new common_1.NotFoundException(`项目 ${projectId} 不存在`);
        const appTypeVersion = await this.cvService.getCvVersion('application-type', dto.applicationTypeCode);
        const productTypeVersion = await this.cvService.getCvVersion('product-type', dto.productTypeCode);
        const applicationNumber = dto.applicationNumber ??
            this.generateApplicationNumber(dto.applicationTypeCode, dto.productTypeCode);
        if (!create_application_dto_1.APPLICATION_NUMBER_REGEX.test(applicationNumber)) {
            throw new common_1.BadRequestException(`申请编号格式错误: "${applicationNumber}" 不符合 NMPA V1.1 规范 ` +
                `(字母 x/y/l/s + 4位年份 + 5位流水号，共10个字符)`);
        }
        const existing = await this.prisma.application.findUnique({
            where: { applicationNumber },
        });
        if (existing) {
            throw new common_1.BadRequestException('申请编号已存在，请重试');
        }
        return this.prisma.application.create({
            data: {
                projectId,
                applicationNumber,
                applicationTypeCode: dto.applicationTypeCode,
                applicationTypeVersion: appTypeVersion,
                productTypeCode: dto.productTypeCode,
                productTypeVersion: productTypeVersion,
                productNumber: dto.productNumber,
            },
        });
    }
    async findAllByProject(projectId) {
        return this.prisma.application.findMany({
            where: { projectId },
            orderBy: { createdAt: 'desc' },
            include: {
                _count: { select: { regulatoryActivities: true } },
            },
        });
    }
    async findOne(id) {
        const app = await this.prisma.application.findUnique({
            where: { id },
            include: {
                project: { select: { id: true, name: true } },
                regulatoryActivities: {
                    orderBy: { createdAt: 'desc' },
                    include: { _count: { select: { sequences: true } } },
                },
            },
        });
        if (!app)
            throw new common_1.NotFoundException(`申请 ${id} 不存在`);
        return app;
    }
    async remove(id) {
        const app = await this.prisma.application.findUnique({
            where: { id },
            include: { _count: { select: { regulatoryActivities: true } } },
        });
        if (!app)
            throw new common_1.NotFoundException(`申请 ${id} 不存在`);
        if (app._count.regulatoryActivities > 0) {
            throw new common_1.ForbiddenException('申请下存在注册行为，无法删除');
        }
        return this.prisma.application.delete({ where: { id } });
    }
    generateApplicationNumber(appTypeCode, productTypeCode) {
        let prefix;
        if (appTypeCode === 'cnapt4') {
            prefix = 's';
        }
        else if (productTypeCode === 'cnprt2') {
            prefix = 'y';
        }
        else {
            prefix = 'x';
        }
        const year = new Date().getFullYear().toString();
        const serial = Math.floor(10000 + Math.random() * 90000).toString();
        return `${prefix}${year}${serial}`;
    }
};
exports.ApplicationService = ApplicationService;
exports.ApplicationService = ApplicationService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        controlled_vocabulary_service_1.ControlledVocabularyService])
], ApplicationService);
//# sourceMappingURL=application.service.js.map