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
var FileService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.FileService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const minio_service_1 = require("./minio.service");
const file_name_normalizer_service_1 = require("./file-name-normalizer.service");
const pdf_compliance_service_1 = require("../export/pdf-compliance.service");
const CONTENT_TYPE_MAP = {
    '.pdf': 'application/pdf',
    '.xml': 'application/xml',
    '.xpt': 'application/octet-stream',
    '.txt': 'text/plain',
    '.xsl': 'application/xml',
};
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.svg']);
let FileService = FileService_1 = class FileService {
    prisma;
    minio;
    normalizer;
    pdfCompliance;
    logger = new common_1.Logger(FileService_1.name);
    chunkStore = new Map();
    constructor(prisma, minio, normalizer, pdfCompliance) {
        this.prisma = prisma;
        this.minio = minio;
        this.normalizer = normalizer;
        this.pdfCompliance = pdfCompliance;
    }
    async handleChunk(nodeId, params) {
        const { uploadId, chunkIndex, totalChunks, fileName, chunkBuffer, userId } = params;
        if (!this.chunkStore.has(uploadId)) {
            this.chunkStore.set(uploadId, { chunks: new Map(), totalChunks, fileName });
        }
        const entry = this.chunkStore.get(uploadId);
        entry.chunks.set(chunkIndex, chunkBuffer);
        this.logger.log(`Chunk ${chunkIndex + 1}/${totalChunks} received for upload ${uploadId}`);
        if (entry.chunks.size === totalChunks) {
            const buffers = [];
            for (let i = 0; i < totalChunks; i++) {
                const chunk = entry.chunks.get(i);
                if (!chunk) {
                    this.chunkStore.delete(uploadId);
                    throw new common_1.BadRequestException(`分片 ${i} 缺失`);
                }
                buffers.push(chunk);
            }
            const fullBuffer = Buffer.concat(buffers);
            this.chunkStore.delete(uploadId);
            const assembledFile = {
                originalname: fileName,
                buffer: fullBuffer,
                size: fullBuffer.length,
                mimetype: 'application/octet-stream',
            };
            return this.uploadFile(nodeId, assembledFile, userId);
        }
        return {
            status: 'chunk_received',
            chunkIndex,
            receivedChunks: entry.chunks.size,
            totalChunks,
        };
    }
    async uploadFile(nodeId, file, uploadedBy) {
        this.normalizer.validateExtension(file.originalname);
        this.normalizer.validateFileSize(file.size, file.originalname);
        const node = await this.prisma.sequenceNode.findUnique({
            where: { id: nodeId },
            include: {
                sequence: {
                    include: {
                        regulatoryActivity: {
                            include: {
                                application: {
                                    include: { project: { select: { id: true } } },
                                },
                            },
                        },
                    },
                },
            },
        });
        if (!node)
            throw new common_1.NotFoundException('节点不存在');
        const sequence = node.sequence;
        const application = sequence.regulatoryActivity.application;
        const projectId = application.project.id;
        const normalizedName = this.normalizer.normalizeFileName(file.originalname);
        const ectdRelativePath = this.normalizer.buildEctdRelativePath(node.ctdSectionNumber, normalizedName);
        const storagePath = this.normalizer.buildStoragePath(projectId, application.applicationNumber, sequence.sequenceNumber, ectdRelativePath);
        const ext = file.originalname.substring(file.originalname.lastIndexOf('.')).toLowerCase();
        const contentType = CONTENT_TYPE_MAP[ext] || 'application/octet-stream';
        const md5 = await this.minio.uploadFile(storagePath, file.buffer, contentType);
        const attachment = await this.prisma.fileAttachment.create({
            data: {
                sequenceNodeId: nodeId,
                originalName: file.originalname,
                storedName: normalizedName,
                storagePath,
                ectdRelativePath,
                fileType: ext,
                fileSize: BigInt(file.size),
                md5Checksum: md5,
                xmlLang: 'zh',
                isReference: false,
                uploadedBy: uploadedBy || null,
            },
        });
        let pdfAnalysis = null;
        if (ext === '.pdf') {
            pdfAnalysis = await this.analyzePdf(attachment.id, file.buffer);
        }
        if (node.status === 'EMPTY') {
            await this.prisma.sequenceNode.update({
                where: { id: nodeId },
                data: { status: 'EDITING' },
            });
        }
        return {
            ...this.serializeAttachment(attachment),
            pdfAnalysis,
        };
    }
    async uploadFiles(nodeId, files, uploadedBy) {
        const results = [];
        for (const file of files) {
            const result = await this.uploadFile(nodeId, file, uploadedBy);
            results.push(result);
        }
        return results;
    }
    async listFiles(nodeId) {
        const files = await this.prisma.fileAttachment.findMany({
            where: { sequenceNodeId: nodeId },
            include: { pdfAnalysis: true },
            orderBy: { createdAt: 'desc' },
        });
        return files.map((f) => this.serializeAttachment(f));
    }
    async getFile(nodeId, fileId) {
        const file = await this.prisma.fileAttachment.findFirst({
            where: { id: fileId, sequenceNodeId: nodeId },
            include: { pdfAnalysis: true },
        });
        if (!file)
            throw new common_1.NotFoundException('文件不存在');
        return this.serializeAttachment(file);
    }
    async deleteFile(nodeId, fileId) {
        const file = await this.prisma.fileAttachment.findFirst({
            where: { id: fileId, sequenceNodeId: nodeId },
        });
        if (!file)
            throw new common_1.NotFoundException('文件不存在');
        const refs = await this.prisma.fileAttachment.count({
            where: { referenceFileId: fileId },
        });
        if (refs > 0) {
            throw new common_1.BadRequestException(`该文件被 ${refs} 个引用使用，无法删除。请先移除引用。`);
        }
        if (!file.isReference && file.storagePath) {
            try {
                await this.minio.deleteFile(file.storagePath);
            }
            catch (err) {
                this.logger.warn(`MinIO delete failed for ${file.storagePath}: ${err}`);
            }
        }
        await this.prisma.filePdfAnalysis.deleteMany({
            where: { fileAttachmentId: fileId },
        });
        await this.prisma.fileAttachment.delete({ where: { id: fileId } });
        return { success: true };
    }
    async getDownloadUrl(nodeId, fileId) {
        const file = await this.prisma.fileAttachment.findFirst({
            where: { id: fileId, sequenceNodeId: nodeId },
        });
        if (!file)
            throw new common_1.NotFoundException('文件不存在');
        const storagePath = file.isReference && file.referenceFileId
            ? (await this.getOriginalStoragePath(file.referenceFileId))
            : file.storagePath;
        const url = await this.minio.getPresignedDownloadUrl(storagePath);
        return { url, originalName: file.originalName };
    }
    async getPreviewUrl(nodeId, fileId) {
        const file = await this.prisma.fileAttachment.findFirst({
            where: { id: fileId, sequenceNodeId: nodeId },
        });
        if (!file)
            throw new common_1.NotFoundException('文件不存在');
        const storagePath = file.isReference && file.referenceFileId
            ? (await this.getOriginalStoragePath(file.referenceFileId))
            : file.storagePath;
        const url = await this.minio.getPresignedPreviewUrl(storagePath);
        return { url };
    }
    async createFileReference(nodeId, sourceFileId, uploadedBy) {
        const sourceFile = await this.prisma.fileAttachment.findUnique({
            where: { id: sourceFileId },
            include: {
                sequenceNode: {
                    include: {
                        sequence: {
                            include: {
                                regulatoryActivity: {
                                    include: { application: true },
                                },
                            },
                        },
                    },
                },
            },
        });
        if (!sourceFile)
            throw new common_1.NotFoundException('源文件不存在');
        const targetNode = await this.prisma.sequenceNode.findUnique({
            where: { id: nodeId },
            include: {
                sequence: {
                    include: {
                        regulatoryActivity: {
                            include: { application: true },
                        },
                    },
                },
            },
        });
        if (!targetNode)
            throw new common_1.NotFoundException('目标节点不存在');
        const sourceAppId = sourceFile.sequenceNode.sequence.regulatoryActivity.application.id;
        const targetAppId = targetNode.sequence.regulatoryActivity.application.id;
        if (sourceAppId !== targetAppId) {
            throw new common_1.BadRequestException('不允许跨申请引用文件');
        }
        const sourceSeqStatus = sourceFile.sequenceNode.sequence.status;
        if (sourceSeqStatus === 'DRAFT') {
            throw new common_1.BadRequestException('不能引用草稿状态序列中的文件');
        }
        const sourceSeqNum = sourceFile.sequenceNode.sequence.sequenceNumber;
        const targetSeqNum = targetNode.sequence.sequenceNumber;
        if (sourceSeqNum >= targetSeqNum) {
            throw new common_1.BadRequestException('只能引用前序序列（序列号更小）中的文件');
        }
        const refEctdPath = sourceFile.ectdRelativePath;
        const ref = await this.prisma.fileAttachment.create({
            data: {
                sequenceNodeId: nodeId,
                originalName: sourceFile.originalName,
                storedName: sourceFile.storedName,
                storagePath: sourceFile.storagePath,
                ectdRelativePath: refEctdPath,
                fileType: sourceFile.fileType,
                fileSize: sourceFile.fileSize,
                md5Checksum: sourceFile.md5Checksum,
                xmlLang: sourceFile.xmlLang,
                isReference: true,
                referenceFileId: sourceFileId,
                uploadedBy: uploadedBy || null,
            },
        });
        return this.serializeAttachment(ref);
    }
    async listReferenceableFiles(nodeId) {
        const node = await this.prisma.sequenceNode.findUnique({
            where: { id: nodeId },
            include: {
                sequence: {
                    include: {
                        regulatoryActivity: {
                            include: {
                                application: {
                                    include: {
                                        regulatoryActivities: {
                                            include: {
                                                sequences: {
                                                    select: { id: true, sequenceNumber: true, status: true },
                                                },
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            },
        });
        if (!node)
            throw new common_1.NotFoundException('节点不存在');
        const currentSeqNum = node.sequence.sequenceNumber;
        const application = node.sequence.regulatoryActivity.application;
        const priorSequenceIds = [];
        for (const ra of application.regulatoryActivities) {
            for (const seq of ra.sequences) {
                if (seq.sequenceNumber < currentSeqNum && seq.status !== 'DRAFT') {
                    priorSequenceIds.push(seq.id);
                }
            }
        }
        if (priorSequenceIds.length === 0)
            return [];
        const files = await this.prisma.fileAttachment.findMany({
            where: {
                isReference: false,
                sequenceNode: {
                    sequenceId: { in: priorSequenceIds },
                },
            },
            include: {
                sequenceNode: {
                    select: {
                        ctdSectionNumber: true,
                        title: true,
                        sequence: { select: { sequenceNumber: true } },
                    },
                },
            },
            orderBy: { createdAt: 'desc' },
        });
        return files.map((f) => ({
            ...this.serializeAttachment(f),
            sectionNumber: f.sequenceNode.ctdSectionNumber,
            sectionTitle: f.sequenceNode.title,
            sequenceNumber: f.sequenceNode.sequence.sequenceNumber,
        }));
    }
    async uploadEditorImage(sequenceId, file) {
        const ext = file.originalname.substring(file.originalname.lastIndexOf('.')).toLowerCase();
        if (!IMAGE_EXTENSIONS.has(ext)) {
            throw new common_1.BadRequestException(`不支持的图片格式 ${ext}。支持: ${[...IMAGE_EXTENSIONS].join(', ')}`);
        }
        const normalizedName = this.normalizer.normalizeFileName(file.originalname);
        const storagePath = `editor-images/${sequenceId}/${Date.now()}-${normalizedName}`;
        const contentType = this.getImageContentType(ext);
        await this.minio.uploadFile(storagePath, file.buffer, contentType);
        const url = await this.minio.getPresignedPreviewUrl(storagePath, 86400);
        return { url };
    }
    async analyzePdf(fileAttachmentId, buffer) {
        const result = await this.pdfCompliance.checkCompliance(buffer);
        let status = 'PASS';
        if (result.errors.length > 0)
            status = 'ERROR';
        else if (result.warnings.length > 0)
            status = 'WARNING';
        const analysis = await this.prisma.filePdfAnalysis.create({
            data: {
                fileAttachmentId,
                pdfVersion: result.summary.pdfVersion,
                pageCount: result.summary.pageCount,
                hasBookmarks: result.summary.hasBookmarks,
                bookmarkZoomInherit: !result.errors.some((e) => e.ruleId === '6.23'),
                isEncrypted: result.summary.hasEncryption,
                hasJavascript: result.errors.some((e) => e.ruleId === '6.20'),
                hasExternalLinks: result.errors.some((e) => e.ruleId === '6.21'),
                hasAttachments: result.errors.some((e) => e.ruleId === '6.24'),
                hasMultimedia: result.errors.some((e) => e.ruleId === '6.22'),
                fontsEmbedded: !result.warnings.some((w) => w.ruleId === '6.W2'),
                complianceStatus: status,
                complianceDetails: JSON.parse(JSON.stringify({
                    errors: result.errors,
                    warnings: result.warnings,
                })),
            },
        });
        return analysis;
    }
    async getOriginalStoragePath(fileId) {
        const file = await this.prisma.fileAttachment.findUnique({
            where: { id: fileId },
            select: { storagePath: true, isReference: true, referenceFileId: true },
        });
        if (!file)
            throw new common_1.NotFoundException('引用的源文件不存在');
        if (file.isReference && file.referenceFileId) {
            return this.getOriginalStoragePath(file.referenceFileId);
        }
        return file.storagePath;
    }
    serializeAttachment(attachment) {
        const { fileSize, pdfAnalysis, ...rest } = attachment;
        return {
            ...rest,
            fileSize: fileSize?.toString() || '0',
            pdfAnalysis: pdfAnalysis || undefined,
        };
    }
    getImageContentType(ext) {
        const map = {
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.gif': 'image/gif',
            '.svg': 'image/svg+xml',
        };
        return map[ext] || 'application/octet-stream';
    }
};
exports.FileService = FileService;
exports.FileService = FileService = FileService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        minio_service_1.MinioService,
        file_name_normalizer_service_1.FileNameNormalizerService,
        pdf_compliance_service_1.PDFComplianceService])
], FileService);
//# sourceMappingURL=file.service.js.map