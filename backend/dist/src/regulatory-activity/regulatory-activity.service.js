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
exports.RegulatoryActivityService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const controlled_vocabulary_service_1 = require("../controlled-vocabulary/controlled-vocabulary.service");
let RegulatoryActivityService = class RegulatoryActivityService {
    prisma;
    cvService;
    constructor(prisma, cvService) {
        this.prisma = prisma;
        this.cvService = cvService;
    }
    async create(applicationId, dto) {
        const application = await this.prisma.application.findUnique({
            where: { id: applicationId },
        });
        if (!application) {
            throw new common_1.NotFoundException(`申请 ${applicationId} 不存在`);
        }
        const isValid = await this.cvService.validateDependency(application.applicationTypeCode, dto.regulatoryActivityTypeCode);
        if (!isValid) {
            throw new common_1.BadRequestException(`申请类型 ${application.applicationTypeCode} 不支持注册行为类型 ${dto.regulatoryActivityTypeCode}`);
        }
        const ratVersion = await this.cvService.getCvVersion('regulatory-activity-type', dto.regulatoryActivityTypeCode);
        const lastSequence = await this.prisma.sequence.findFirst({
            where: {
                regulatoryActivity: { applicationId },
            },
            orderBy: { sequenceNumber: 'desc' },
        });
        const nextNum = lastSequence ? parseInt(lastSequence.sequenceNumber) + 1 : 0;
        const relatedSequence = nextNum.toString().padStart(4, '0');
        return this.prisma.regulatoryActivity.create({
            data: {
                applicationId,
                regulatoryActivityTypeCode: dto.regulatoryActivityTypeCode,
                regulatoryActivityTypeVersion: ratVersion,
                relatedSequence,
            },
            include: { _count: { select: { sequences: true } } },
        });
    }
    async findAllByApplication(applicationId) {
        return this.prisma.regulatoryActivity.findMany({
            where: { applicationId },
            orderBy: { createdAt: 'desc' },
            include: {
                _count: { select: { sequences: true } },
            },
        });
    }
    async findOne(id) {
        const ra = await this.prisma.regulatoryActivity.findUnique({
            where: { id },
            include: {
                application: {
                    select: {
                        id: true,
                        applicationNumber: true,
                        applicationTypeCode: true,
                        productTypeCode: true,
                    },
                },
                sequences: { orderBy: { sequenceNumber: 'asc' } },
            },
        });
        if (!ra)
            throw new common_1.NotFoundException(`注册行为 ${id} 不存在`);
        return ra;
    }
};
exports.RegulatoryActivityService = RegulatoryActivityService;
exports.RegulatoryActivityService = RegulatoryActivityService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        controlled_vocabulary_service_1.ControlledVocabularyService])
], RegulatoryActivityService);
//# sourceMappingURL=regulatory-activity.service.js.map