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
var StudyService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.StudyService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const prisma_service_1 = require("../prisma/prisma.service");
const controlled_vocabulary_service_1 = require("../controlled-vocabulary/controlled-vocabulary.service");
const study_tagging_file_service_1 = require("../ectd/services/study-tagging-file.service");
let StudyService = StudyService_1 = class StudyService {
    prisma;
    cvService;
    stfXml;
    logger = new common_1.Logger(StudyService_1.name);
    constructor(prisma, cvService, stfXml) {
        this.prisma = prisma;
        this.cvService = cvService;
        this.stfXml = stfXml;
    }
    async listBySequence(sequenceId) {
        return this.prisma.study.findMany({
            where: { sequenceId },
            include: {
                categories: { orderBy: { sortOrder: 'asc' } },
                documents: {
                    orderBy: { sortOrder: 'asc' },
                    include: { fileAttachment: true },
                },
            },
            orderBy: [{ ctdSectionNumber: 'asc' }, { studyId: 'asc' }],
        });
    }
    async listByNode(sequenceNodeId) {
        return this.prisma.study.findMany({
            where: { sequenceNodeId },
            include: {
                categories: { orderBy: { sortOrder: 'asc' } },
                documents: {
                    orderBy: { sortOrder: 'asc' },
                    include: { fileAttachment: true },
                },
            },
            orderBy: { studyId: 'asc' },
        });
    }
    async getById(id) {
        const study = await this.prisma.study.findUnique({
            where: { id },
            include: {
                categories: { orderBy: { sortOrder: 'asc' } },
                documents: {
                    orderBy: { sortOrder: 'asc' },
                    include: { fileAttachment: true },
                },
                sequenceNode: { select: { id: true, ctdSectionNumber: true, title: true } },
            },
        });
        if (!study)
            throw new common_1.NotFoundException(`研究 ${id} 不存在`);
        return study;
    }
    async create(sequenceNodeId, dto) {
        const node = await this.loadNode(sequenceNodeId);
        this.assertStfAllowed(node);
        const existing = await this.prisma.study.findUnique({
            where: {
                sequenceNodeId_studyId: { sequenceNodeId, studyId: dto.studyId },
            },
        });
        if (existing) {
            throw new common_1.ConflictException(`节点 ${node.ctdSectionNumber} 已存在研究编号为 ${dto.studyId} 的研究`);
        }
        const operation = dto.operation ?? client_1.LeafOperation.NEW;
        const validation = await this.validateMetadata(node.ctdSectionNumber, dto);
        if (!validation.valid) {
            throw new common_1.BadRequestException({
                message: '研究元数据校验失败',
                errors: validation.errors,
                warnings: validation.warnings,
            });
        }
        const modifiedFromId = await this.resolveModifiedFromId(sequenceNodeId, dto.studyId, operation, dto.modifiedFromId);
        const fileAttachments = await this.loadFileAttachments(dto.documents.map((d) => d.fileAttachmentId));
        return this.prisma.$transaction(async (tx) => {
            const created = await tx.study.create({
                data: {
                    sequenceId: node.sequenceId,
                    sequenceNodeId,
                    ctdSectionNumber: node.ctdSectionNumber,
                    studyId: dto.studyId,
                    title: dto.title,
                    operation,
                    modifiedFromId: modifiedFromId ?? null,
                    categories: {
                        create: dto.categories.map((c, idx) => ({
                            name: c.name,
                            value: c.value,
                            infoType: c.infoType ?? 'ich',
                            sortOrder: c.sortOrder ?? idx,
                        })),
                    },
                    documents: {
                        create: dto.documents.map((d, idx) => ({
                            fileAttachmentId: d.fileAttachmentId,
                            fileTag: d.fileTag,
                            fileTagInfoType: d.fileTagInfoType ?? 'ich',
                            sortOrder: d.sortOrder ?? idx,
                        })),
                    },
                },
                include: {
                    categories: { orderBy: { sortOrder: 'asc' } },
                    documents: {
                        orderBy: { sortOrder: 'asc' },
                        include: { fileAttachment: true },
                    },
                },
            });
            const xml = this.buildStfXmlForStudy(created, fileAttachments);
            const checksum = this.stfXml.computeStfChecksum(xml);
            return tx.study.update({
                where: { id: created.id },
                data: { stfXmlContent: xml, stfChecksum: checksum },
                include: {
                    categories: { orderBy: { sortOrder: 'asc' } },
                    documents: {
                        orderBy: { sortOrder: 'asc' },
                        include: { fileAttachment: true },
                    },
                },
            });
        });
    }
    async update(id, dto) {
        const existing = await this.getById(id);
        const merged = {
            studyId: dto.studyId ?? existing.studyId,
            title: dto.title ?? existing.title,
            operation: dto.operation ?? existing.operation,
            categories: dto.categories ??
                existing.categories.map((c) => ({
                    name: c.name,
                    value: c.value,
                    infoType: c.infoType,
                    sortOrder: c.sortOrder,
                })),
            documents: dto.documents ??
                existing.documents.map((d) => ({
                    fileAttachmentId: d.fileAttachmentId,
                    fileTag: d.fileTag,
                    fileTagInfoType: d.fileTagInfoType,
                    sortOrder: d.sortOrder,
                })),
        };
        const validation = await this.validateMetadata(existing.ctdSectionNumber, merged);
        if (!validation.valid) {
            throw new common_1.BadRequestException({
                message: '研究元数据校验失败',
                errors: validation.errors,
                warnings: validation.warnings,
            });
        }
        const modifiedFromId = dto.modifiedFromId !== undefined
            ? dto.modifiedFromId
            : await this.resolveModifiedFromId(existing.sequenceNodeId, merged.studyId, merged.operation, existing.modifiedFromId ?? undefined);
        const fileAttachments = await this.loadFileAttachments(merged.documents.map((d) => d.fileAttachmentId));
        return this.prisma.$transaction(async (tx) => {
            if (dto.categories !== undefined) {
                await tx.studyCategory.deleteMany({ where: { studyId: id } });
            }
            if (dto.documents !== undefined) {
                await tx.studyDocument.deleteMany({ where: { studyId: id } });
            }
            const updated = await tx.study.update({
                where: { id },
                data: {
                    studyId: merged.studyId,
                    title: merged.title,
                    operation: merged.operation,
                    modifiedFromId,
                    ...(dto.categories !== undefined
                        ? {
                            categories: {
                                create: merged.categories.map((c, idx) => ({
                                    name: c.name,
                                    value: c.value,
                                    infoType: c.infoType ?? 'ich',
                                    sortOrder: c.sortOrder ?? idx,
                                })),
                            },
                        }
                        : {}),
                    ...(dto.documents !== undefined
                        ? {
                            documents: {
                                create: merged.documents.map((d, idx) => ({
                                    fileAttachmentId: d.fileAttachmentId,
                                    fileTag: d.fileTag,
                                    fileTagInfoType: d.fileTagInfoType ?? 'ich',
                                    sortOrder: d.sortOrder ?? idx,
                                })),
                            },
                        }
                        : {}),
                },
                include: {
                    categories: { orderBy: { sortOrder: 'asc' } },
                    documents: {
                        orderBy: { sortOrder: 'asc' },
                        include: { fileAttachment: true },
                    },
                },
            });
            const xml = this.buildStfXmlForStudy(updated, fileAttachments);
            const checksum = this.stfXml.computeStfChecksum(xml);
            return tx.study.update({
                where: { id: updated.id },
                data: { stfXmlContent: xml, stfChecksum: checksum },
                include: {
                    categories: { orderBy: { sortOrder: 'asc' } },
                    documents: {
                        orderBy: { sortOrder: 'asc' },
                        include: { fileAttachment: true },
                    },
                },
            });
        });
    }
    async delete(id) {
        const existing = await this.prisma.study.findUnique({ where: { id } });
        if (!existing)
            throw new common_1.NotFoundException(`研究 ${id} 不存在`);
        await this.prisma.study.delete({ where: { id } });
        return { id, deleted: true };
    }
    async regenerateXml(id) {
        const existing = await this.getById(id);
        const fileAttachments = await this.loadFileAttachments(existing.documents.map((d) => d.fileAttachmentId));
        const xml = this.buildStfXmlForStudy(existing, fileAttachments);
        const checksum = this.stfXml.computeStfChecksum(xml);
        return this.prisma.study.update({
            where: { id },
            data: { stfXmlContent: xml, stfChecksum: checksum },
            include: {
                categories: { orderBy: { sortOrder: 'asc' } },
                documents: {
                    orderBy: { sortOrder: 'asc' },
                    include: { fileAttachment: true },
                },
            },
        });
    }
    async validateMetadata(ctdSectionNumber, payload) {
        const errors = [];
        const warnings = [];
        if (!payload.studyId?.trim())
            errors.push('studyId 不能为空');
        if (!payload.title?.trim())
            errors.push('title 不能为空');
        const categoryNames = new Set();
        const cvCategories = await this.cvService.getStfCategories();
        const cvCategoryMap = new Map(cvCategories.map((c) => [c.name, new Set(c.values.map((v) => v.value))]));
        for (const cat of payload.categories ?? []) {
            if (!cvCategoryMap.has(cat.name)) {
                errors.push(`category 名称 "${cat.name}" 不在受控词汇表内`);
                continue;
            }
            if (!cvCategoryMap.get(cat.name).has(cat.value)) {
                errors.push(`category "${cat.name}" 的值 "${cat.value}" 不在受控词汇表内`);
            }
            if (categoryNames.has(cat.name)) {
                errors.push(`category "${cat.name}" 重复，每个 study 同名 category 只能出现一次`);
            }
            categoryNames.add(cat.name);
        }
        const moduleKey = ctdSectionNumber.startsWith('4.')
            ? 'm4'
            : 'm5';
        const cvFileTagsRaw = await this.cvService.getStfFileTags(moduleKey);
        const cvFileTagSet = new Set(cvFileTagsRaw.map((t) => t.value));
        for (const doc of payload.documents ?? []) {
            if (!cvFileTagSet.has(doc.fileTag)) {
                errors.push(`file-tag "${doc.fileTag}" 不在 ${moduleKey} 的受控词汇表内`);
            }
        }
        const node = await this.prisma.ctdTemplateNode.findFirst({
            where: { ctdSectionNumber },
            select: { defaultStfCategories: true },
        });
        const defaults = node?.defaultStfCategories;
        if (Array.isArray(defaults)) {
            for (const def of defaults) {
                if (def.required && !categoryNames.has(def.name)) {
                    warnings.push(`章节 ${ctdSectionNumber} 建议提供 category "${def.name}"`);
                }
            }
        }
        return { valid: errors.length === 0, errors, warnings };
    }
    async resolveModifiedFromId(sequenceNodeId, studyId, operation, explicitId) {
        if (operation === client_1.LeafOperation.NEW)
            return null;
        if (explicitId)
            return explicitId;
        const node = await this.prisma.sequenceNode.findUnique({
            where: { id: sequenceNodeId },
            select: {
                templateNodeId: true,
                sequence: {
                    select: {
                        applicationId: true,
                        sequenceNumber: true,
                    },
                },
            },
        });
        if (!node) {
            throw new common_1.NotFoundException(`节点 ${sequenceNodeId} 不存在`);
        }
        const candidates = await this.prisma.study.findMany({
            where: {
                studyId,
                sequenceNode: { templateNodeId: node.templateNodeId },
                sequence: {
                    applicationId: node.sequence.applicationId,
                    sequenceNumber: { lt: node.sequence.sequenceNumber },
                },
            },
            orderBy: { sequence: { sequenceNumber: 'desc' } },
            take: 1,
        });
        if (candidates.length === 0) {
            throw new common_1.BadRequestException(`操作 ${operation} 需要存在前序研究，但在本申请中未找到 studyId="${studyId}" 的前序记录`);
        }
        return candidates[0].id;
    }
    buildStfXmlForStudy(study, _fileAttachments) {
        const docs = study.documents.map((d, idx) => {
            const baseName = this.basename(d.fileAttachment.ectdRelativePath);
            return {
                leafId: `${this.normalizeLeafIdPart(study.studyId)}-${idx}`,
                href: baseName,
                title: d.fileTag,
                checksum: d.fileAttachment.md5Checksum,
                fileTag: d.fileTag,
                fileTagInfoType: d.fileTagInfoType,
                xmlLang: d.fileAttachment.xmlLang || undefined,
            };
        });
        const input = {
            id: study.id,
            studyId: study.studyId,
            title: study.title,
            operation: study.operation,
            categories: study.categories.map((c) => ({
                name: c.name,
                value: c.value,
                infoType: c.infoType,
            })),
            documents: docs,
        };
        return this.stfXml.generateStfXml(input);
    }
    async loadNode(sequenceNodeId) {
        const node = await this.prisma.sequenceNode.findUnique({
            where: { id: sequenceNodeId },
            select: {
                id: true,
                sequenceId: true,
                ctdSectionNumber: true,
                title: true,
                templateNode: { select: { requiresStf: true, module: true } },
            },
        });
        if (!node) {
            throw new common_1.NotFoundException(`节点 ${sequenceNodeId} 不存在`);
        }
        return node;
    }
    assertStfAllowed(node) {
        if (!node.templateNode.requiresStf) {
            throw new common_1.BadRequestException(`章节 ${node.ctdSectionNumber} 不允许创建研究标签文件 (STF)`);
        }
    }
    async loadFileAttachments(ids) {
        if (ids.length === 0)
            return new Map();
        const rows = await this.prisma.fileAttachment.findMany({
            where: { id: { in: ids } },
            select: { id: true, ectdRelativePath: true },
        });
        if (rows.length !== ids.length) {
            const missing = ids.filter((id) => !rows.some((r) => r.id === id));
            throw new common_1.BadRequestException(`以下文件不存在: ${missing.join(', ')}`);
        }
        return new Map(rows.map((r) => [r.id, { ectdRelativePath: r.ectdRelativePath }]));
    }
    basename(p) {
        const idx = p.lastIndexOf('/');
        return idx >= 0 ? p.substring(idx + 1) : p;
    }
    normalizeLeafIdPart(id) {
        return id
            .toLowerCase()
            .replace(/[^a-z0-9_-]+/g, '-')
            .replace(/^-+|-+$/g, '');
    }
};
exports.StudyService = StudyService;
exports.StudyService = StudyService = StudyService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        controlled_vocabulary_service_1.ControlledVocabularyService,
        study_tagging_file_service_1.StudyTaggingFileService])
], StudyService);
//# sourceMappingURL=study.service.js.map