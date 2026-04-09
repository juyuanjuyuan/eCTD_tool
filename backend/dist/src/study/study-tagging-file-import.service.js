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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var StudyTaggingFileImportService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.StudyTaggingFileImportService = void 0;
const common_1 = require("@nestjs/common");
const crypto_1 = require("crypto");
const client_1 = require("@prisma/client");
const prisma_service_1 = require("../prisma/prisma.service");
const controlled_vocabulary_service_1 = require("../controlled-vocabulary/controlled-vocabulary.service");
const study_tagging_file_service_1 = require("../ectd/services/study-tagging-file.service");
const minio_service_1 = require("../file/minio.service");
let StudyTaggingFileImportService = StudyTaggingFileImportService_1 = class StudyTaggingFileImportService {
    prisma;
    stfXml;
    cvService;
    minioService;
    logger = new common_1.Logger(StudyTaggingFileImportService_1.name);
    constructor(prisma, stfXml, cvService, minioService) {
        this.prisma = prisma;
        this.stfXml = stfXml;
        this.cvService = cvService;
        this.minioService = minioService;
    }
    async importStfXml(sequenceNodeId, xmlString, options) {
        return this.importInternal(sequenceNodeId, xmlString, [], options?.onConflict);
    }
    async importStfBundle(sequenceNodeId, params) {
        return this.importInternal(sequenceNodeId, params.xmlString, params.attachedFiles, params.onConflict);
    }
    async importInternal(sequenceNodeId, xmlString, attachedFiles, onConflict = 'reject') {
        const warnings = [];
        const parsed = this.stfXml.parseStfXml(xmlString);
        if (!parsed.studyId?.trim()) {
            throw new common_1.BadRequestException('STF XML 中 <study-id> 不能为空');
        }
        if (!parsed.title?.trim()) {
            throw new common_1.BadRequestException('STF XML 中 <title> 不能为空');
        }
        const node = await this.prisma.sequenceNode.findUnique({
            where: { id: sequenceNodeId },
            select: {
                id: true,
                sequenceId: true,
                ctdSectionNumber: true,
                templateNodeId: true,
                templateNode: { select: { requiresStf: true, module: true } },
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
        if (!node.templateNode.requiresStf) {
            throw new common_1.BadRequestException(`章节 ${node.ctdSectionNumber} 不允许创建研究标签文件 (STF)`);
        }
        const cvCategories = await this.cvService.getStfCategories();
        const cvCategoryNames = new Set(cvCategories.map((c) => c.name));
        const unknownCategoryNames = Array.from(new Set(parsed.categories
            .map((c) => c.name)
            .filter((name) => !cvCategoryNames.has(name))));
        if (unknownCategoryNames.length > 0) {
            throw new common_1.BadRequestException({
                message: 'STF XML 中存在未知的 category 名称',
                unknownCategories: unknownCategoryNames,
            });
        }
        const cvCategoryValueMap = new Map(cvCategories.map((c) => [
            c.name,
            new Set(c.values.map((v) => v.value)),
        ]));
        const invalidCategoryValues = [];
        for (const cat of parsed.categories) {
            const valueSet = cvCategoryValueMap.get(cat.name);
            if (valueSet && !valueSet.has(cat.value)) {
                invalidCategoryValues.push(`${cat.name}="${cat.value}"`);
            }
        }
        if (invalidCategoryValues.length > 0) {
            throw new common_1.BadRequestException({
                message: 'STF XML 中存在受控词汇表外的 category 取值',
                invalidCategoryValues,
            });
        }
        const moduleKey = node.ctdSectionNumber.startsWith('4.')
            ? 'm4'
            : 'm5';
        const cvFileTagsRaw = await this.cvService.getStfFileTags(moduleKey);
        const cvFileTagSet = new Set(cvFileTagsRaw.map((t) => t.value));
        const unknownFileTags = Array.from(new Set(parsed.documents
            .map((d) => d.fileTag)
            .filter((tag) => tag && !cvFileTagSet.has(tag))));
        if (unknownFileTags.length > 0) {
            throw new common_1.BadRequestException({
                message: `STF XML 中存在 ${moduleKey} 受控词汇表外的 file-tag`,
                unknownFileTags,
            });
        }
        const existingAttachments = await this.prisma.fileAttachment.findMany({
            where: { sequenceNodeId },
            select: {
                id: true,
                originalName: true,
                storedName: true,
                ectdRelativePath: true,
                md5Checksum: true,
                xmlLang: true,
            },
        });
        const attachedByName = new Map();
        for (const file of attachedFiles) {
            attachedByName.set(this.basename(file.originalName), file);
        }
        const resolvedDocs = [];
        for (const doc of parsed.documents) {
            const hrefBase = this.basename(doc.href);
            if (!hrefBase) {
                warnings.push(`doc-content ID="${doc.leafId}" 的 xlink:href 为空，跳过`);
                continue;
            }
            const attached = attachedByName.get(hrefBase);
            if (attached) {
                const actualMd5 = attached.md5 ?? this.md5Buffer(attached.buffer);
                if (doc.checksum && actualMd5.toLowerCase() !== doc.checksum.toLowerCase()) {
                    warnings.push(`文件 "${hrefBase}" 的 MD5 (${actualMd5}) 与 STF XML 中的 checksum (${doc.checksum}) 不一致，已使用实际 MD5`);
                }
                resolvedDocs.push({
                    parsedDoc: doc,
                    fileAttachmentId: '',
                    create: {
                        buffer: attached.buffer,
                        md5: actualMd5,
                        originalName: attached.originalName,
                    },
                });
                continue;
            }
            const match = existingAttachments.find((a) => this.basename(a.ectdRelativePath) === hrefBase);
            if (!match) {
                warnings.push(`未能在节点 ${node.ctdSectionNumber} 下找到名为 "${hrefBase}" 的文件，已跳过该文档`);
                continue;
            }
            resolvedDocs.push({
                parsedDoc: doc,
                fileAttachmentId: match.id,
            });
        }
        const modifiedFromId = await this.resolveModifiedFromStudy(node, parsed, warnings);
        const existingStudy = await this.prisma.study.findUnique({
            where: {
                sequenceNodeId_studyId: {
                    sequenceNodeId,
                    studyId: parsed.studyId,
                },
            },
            select: { id: true },
        });
        if (existingStudy && onConflict === 'reject') {
            throw new common_1.ConflictException(`节点 ${node.ctdSectionNumber} 已存在研究编号为 "${parsed.studyId}" 的研究，` +
                `如需覆盖请传 onConflict=overwrite 或 onConflict=merge`);
        }
        const studyOperation = this.deriveStudyOperation(parsed, warnings);
        const studyPk = await this.prisma.$transaction(async (tx) => {
            for (const doc of resolvedDocs) {
                if (!doc.create)
                    continue;
                const att = await this.uploadAndCreateAttachment(tx, node, doc.create);
                doc.fileAttachmentId = att.id;
            }
            const attachedDocs = resolvedDocs.filter((d) => d.fileAttachmentId);
            if (existingStudy && onConflict === 'overwrite') {
                await tx.study.delete({ where: { id: existingStudy.id } });
            }
            let studyRow;
            if (existingStudy && onConflict === 'merge') {
                await tx.studyCategory.deleteMany({
                    where: { studyId: existingStudy.id },
                });
                await tx.studyDocument.deleteMany({
                    where: { studyId: existingStudy.id },
                });
                studyRow = await tx.study.update({
                    where: { id: existingStudy.id },
                    data: {
                        ctdSectionNumber: node.ctdSectionNumber,
                        title: parsed.title,
                        operation: studyOperation,
                        modifiedFromId,
                        categories: {
                            create: parsed.categories.map((c, idx) => ({
                                name: c.name,
                                value: c.value,
                                infoType: c.infoType || 'ich',
                                sortOrder: idx,
                            })),
                        },
                        documents: {
                            create: attachedDocs.map((d, idx) => ({
                                fileAttachmentId: d.fileAttachmentId,
                                fileTag: d.parsedDoc.fileTag,
                                fileTagInfoType: d.parsedDoc.fileTagInfoType || 'ich',
                                sortOrder: idx,
                            })),
                        },
                    },
                    select: { id: true },
                });
            }
            else {
                const created = await tx.study.create({
                    data: {
                        sequenceId: node.sequenceId,
                        sequenceNodeId,
                        ctdSectionNumber: node.ctdSectionNumber,
                        studyId: parsed.studyId,
                        title: parsed.title,
                        operation: studyOperation,
                        modifiedFromId,
                        categories: {
                            create: parsed.categories.map((c, idx) => ({
                                name: c.name,
                                value: c.value,
                                infoType: c.infoType || 'ich',
                                sortOrder: idx,
                            })),
                        },
                        documents: {
                            create: attachedDocs.map((d, idx) => ({
                                fileAttachmentId: d.fileAttachmentId,
                                fileTag: d.parsedDoc.fileTag,
                                fileTagInfoType: d.parsedDoc.fileTagInfoType || 'ich',
                                sortOrder: idx,
                            })),
                        },
                    },
                    select: { id: true },
                });
                studyRow = created;
            }
            const full = await tx.study.findUnique({
                where: { id: studyRow.id },
                include: {
                    categories: { orderBy: { sortOrder: 'asc' } },
                    documents: {
                        orderBy: { sortOrder: 'asc' },
                        include: { fileAttachment: true },
                    },
                },
            });
            if (!full) {
                throw new Error('无法在事务中重新加载刚创建的 Study');
            }
            const regenXml = this.buildStfXmlForStudy(full);
            const regenChecksum = this.stfXml.computeStfChecksum(regenXml);
            await tx.study.update({
                where: { id: studyRow.id },
                data: { stfXmlContent: regenXml, stfChecksum: regenChecksum },
            });
            return studyRow.id;
        });
        return {
            studyId: studyPk,
            created: true,
            warnings,
        };
    }
    async resolveModifiedFromStudy(node, parsed, warnings) {
        const hasModifiedFile = parsed.documents.some((d) => d.modifiedFromHref);
        if (!hasModifiedFile)
            return null;
        const prior = await this.prisma.study.findFirst({
            where: {
                studyId: parsed.studyId,
                sequenceNode: { templateNodeId: node.templateNodeId },
                sequence: {
                    applicationId: node.sequence.applicationId,
                    sequenceNumber: { lt: node.sequence.sequenceNumber },
                },
            },
            orderBy: { sequence: { sequenceNumber: 'desc' } },
            select: { id: true },
        });
        if (!prior) {
            warnings.push(`STF 中存在 modified-file 引用，但未找到前序 Study (studyId=${parsed.studyId})，生命周期链断裂`);
            return null;
        }
        return prior.id;
    }
    deriveStudyOperation(parsed, warnings) {
        const ops = parsed.documents
            .map((d) => (d.operation ?? '').toLowerCase())
            .filter((op) => op.length > 0);
        if (ops.length === 0)
            return client_1.LeafOperation.NEW;
        const unique = Array.from(new Set(ops));
        if (unique.length > 1) {
            warnings.push(`STF XML 中不同 doc-content 的 operation 不一致 (${unique.join(', ')})，已回退为 NEW`);
            return client_1.LeafOperation.NEW;
        }
        switch (unique[0]) {
            case 'new':
                return client_1.LeafOperation.NEW;
            case 'replace':
                return client_1.LeafOperation.REPLACE;
            case 'append':
                return client_1.LeafOperation.APPEND;
            case 'delete':
                return client_1.LeafOperation.DELETE;
            default:
                warnings.push(`STF XML 中 operation="${unique[0]}" 不在允许集内，已回退为 NEW`);
                return client_1.LeafOperation.NEW;
        }
    }
    async uploadAndCreateAttachment(tx, node, create) {
        const ext = this.extname(create.originalName);
        const normalizedName = create.originalName.toLowerCase().replace(/\s+/g, '-');
        const ectdRelativePath = this.buildEctdRelativePath(node.ctdSectionNumber, normalizedName);
        const storagePath = [
            node.sequence.applicationId,
            node.sequence.sequenceNumber,
            ectdRelativePath,
        ].join('/');
        if (this.minioService) {
            try {
                const contentType = ext === '.pdf' ? 'application/pdf' : 'application/octet-stream';
                await this.minioService.uploadFile(storagePath, create.buffer, contentType);
            }
            catch (err) {
                this.logger.warn(`MinIO 上传失败 (objectName=${storagePath}): ${err instanceof Error ? err.message : String(err)}; 继续创建 FileAttachment 记录`);
            }
        }
        else {
            this.logger.warn('MinioService 未注入，跳过实际上传，只创建 FileAttachment 元数据记录');
        }
        const attachment = await tx.fileAttachment.create({
            data: {
                sequenceNodeId: node.id,
                originalName: create.originalName,
                storedName: normalizedName,
                storagePath,
                ectdRelativePath,
                fileType: ext,
                fileSize: BigInt(create.buffer.length),
                md5Checksum: create.md5,
                xmlLang: 'zh',
                isReference: false,
            },
            select: { id: true },
        });
        return attachment;
    }
    buildStfXmlForStudy(study) {
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
    basename(p) {
        if (!p)
            return '';
        const idx = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'));
        return idx >= 0 ? p.substring(idx + 1) : p;
    }
    extname(p) {
        const base = this.basename(p);
        const idx = base.lastIndexOf('.');
        return idx >= 0 ? base.substring(idx).toLowerCase() : '';
    }
    md5Buffer(buffer) {
        return (0, crypto_1.createHash)('md5').update(buffer).digest('hex');
    }
    normalizeLeafIdPart(id) {
        return id
            .toLowerCase()
            .replace(/[^a-z0-9_-]+/g, '-')
            .replace(/^-+|-+$/g, '');
    }
    buildEctdRelativePath(ctdSectionNumber, normalizedName) {
        const moduleDigit = ctdSectionNumber.split('.')[0];
        return `m${moduleDigit}/${ctdSectionNumber}/${normalizedName}`;
    }
};
exports.StudyTaggingFileImportService = StudyTaggingFileImportService;
exports.StudyTaggingFileImportService = StudyTaggingFileImportService = StudyTaggingFileImportService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(3, (0, common_1.Optional)()),
    __param(3, (0, common_1.Inject)(minio_service_1.MinioService)),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        study_tagging_file_service_1.StudyTaggingFileService,
        controlled_vocabulary_service_1.ControlledVocabularyService,
        minio_service_1.MinioService])
], StudyTaggingFileImportService);
//# sourceMappingURL=study-tagging-file-import.service.js.map