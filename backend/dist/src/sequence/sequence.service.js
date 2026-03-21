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
exports.SequenceService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const controlled_vocabulary_service_1 = require("../controlled-vocabulary/controlled-vocabulary.service");
let SequenceService = class SequenceService {
    prisma;
    cvService;
    constructor(prisma, cvService) {
        this.prisma = prisma;
        this.cvService = cvService;
    }
    async create(regulatoryActivityId, dto) {
        const ra = await this.prisma.regulatoryActivity.findUnique({
            where: { id: regulatoryActivityId },
            include: {
                application: {
                    select: { applicationTypeCode: true },
                },
            },
        });
        if (!ra) {
            throw new common_1.NotFoundException(`注册行为 ${regulatoryActivityId} 不存在`);
        }
        const isValid = await this.cvService.validateDependency(ra.application.applicationTypeCode, ra.regulatoryActivityTypeCode, dto.sequenceTypeCode);
        if (!isValid) {
            throw new common_1.BadRequestException(`当前申请类型和注册行为类型组合不支持序列类型 ${dto.sequenceTypeCode}`);
        }
        const sqtVersion = await this.cvService.getCvVersion('sequence-type', dto.sequenceTypeCode);
        const lastSeq = await this.prisma.sequence.findFirst({
            where: { regulatoryActivityId },
            orderBy: { sequenceNumber: 'desc' },
        });
        let nextNum;
        if (!lastSeq) {
            nextNum = 0;
        }
        else {
            nextNum = parseInt(lastSeq.sequenceNumber) + 1;
        }
        const sequenceNumber = nextNum.toString().padStart(4, '0');
        if (sequenceNumber === '0000' && dto.sequenceTypeCode !== 'cnsqt1') {
            throw new common_1.BadRequestException('首个序列的序列类型必须为 cnsqt1（首次提交）');
        }
        return this.prisma.sequence.create({
            data: {
                regulatoryActivityId,
                sequenceNumber,
                sequenceTypeCode: dto.sequenceTypeCode,
                sequenceTypeVersion: sqtVersion,
                description: dto.description,
                contactName: dto.contactName,
                contactPhone: dto.contactPhone,
                contactEmail: dto.contactEmail,
            },
        });
    }
    async findAllByRegulatoryActivity(regulatoryActivityId) {
        return this.prisma.sequence.findMany({
            where: { regulatoryActivityId },
            orderBy: { sequenceNumber: 'asc' },
        });
    }
    async findOne(id) {
        const seq = await this.prisma.sequence.findUnique({
            where: { id },
            include: {
                regulatoryActivity: {
                    include: {
                        application: {
                            select: {
                                id: true,
                                applicationNumber: true,
                                applicationTypeCode: true,
                                productTypeCode: true,
                                productNumber: true,
                                project: { select: { id: true, name: true } },
                            },
                        },
                    },
                },
            },
        });
        if (!seq)
            throw new common_1.NotFoundException(`序列 ${id} 不存在`);
        return seq;
    }
    async update(id, dto) {
        const seq = await this.findOne(id);
        if (seq.status === 'SUBMITTED') {
            throw new common_1.ForbiddenException('已提交的序列不可修改');
        }
        return this.prisma.sequence.update({
            where: { id },
            data: dto,
        });
    }
    async remove(id) {
        const seq = await this.findOne(id);
        if (seq.status !== 'DRAFT') {
            throw new common_1.ForbiddenException('仅草稿状态的序列可以删除');
        }
        const laterSeq = await this.prisma.sequence.findFirst({
            where: {
                regulatoryActivityId: seq.regulatoryActivityId,
                sequenceNumber: { gt: seq.sequenceNumber },
            },
        });
        if (laterSeq) {
            throw new common_1.ForbiddenException('存在后续序列，不能删除此序列（会导致序列号不连续）');
        }
        return this.prisma.sequence.delete({ where: { id } });
    }
};
exports.SequenceService = SequenceService;
exports.SequenceService = SequenceService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        controlled_vocabulary_service_1.ControlledVocabularyService])
], SequenceService);
//# sourceMappingURL=sequence.service.js.map