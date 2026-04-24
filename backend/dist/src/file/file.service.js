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
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
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
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
const CONTENT_TYPE_MAP = {
    '.pdf': 'application/pdf',
    '.xml': 'application/xml',
    '.xpt': 'application/octet-stream',
    '.txt': 'text/plain',
    '.xsl': 'application/xml',
};
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.svg']);
const CHUNK_UPLOAD_TIMEOUT_MS = 30 * 60 * 1000;
let FileService = FileService_1 = class FileService {
    prisma;
    minio;
    normalizer;
    pdfCompliance;
    logger = new common_1.Logger(FileService_1.name);
    chunkStore = new Map();
    cleanupTimer = null;
    constructor(prisma, minio, normalizer, pdfCompliance) {
        this.prisma = prisma;
        this.minio = minio;
        this.normalizer = normalizer;
        this.pdfCompliance = pdfCompliance;
        this.cleanupTimer = setInterval(() => this.cleanupAbandonedUploads(), 10 * 60 * 1000);
    }
    onModuleDestroy() {
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
        }
    }
    async handleChunk(nodeId, params) {
        const { uploadId, chunkIndex, totalChunks, fileName, chunkBuffer, userId } = params;
        if (!this.chunkStore.has(uploadId)) {
            const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `ectd-upload-${uploadId}-`));
            this.chunkStore.set(uploadId, {
                tempDir,
                totalChunks,
                receivedChunks: new Set(),
                fileName,
                lastActivity: Date.now(),
            });
        }
        const entry = this.chunkStore.get(uploadId);
        entry.lastActivity = Date.now();
        const chunkPath = path.join(entry.tempDir, `chunk-${String(chunkIndex).padStart(6, '0')}`);
        fs.writeFileSync(chunkPath, chunkBuffer);
        entry.receivedChunks.add(chunkIndex);
        this.logger.log(`Chunk ${chunkIndex + 1}/${totalChunks} received for upload ${uploadId}`);
        if (entry.receivedChunks.size === totalChunks) {
            try {
                for (let i = 0; i < totalChunks; i++) {
                    if (!entry.receivedChunks.has(i)) {
                        throw new common_1.BadRequestException(`分片 ${i} 缺失`);
                    }
                }
                const assembledPath = path.join(entry.tempDir, 'assembled');
                const writeStream = fs.createWriteStream(assembledPath);
                for (let i = 0; i < totalChunks; i++) {
                    const cp = path.join(entry.tempDir, `chunk-${String(i).padStart(6, '0')}`);
                    const data = fs.readFileSync(cp);
                    writeStream.write(data);
                }
                await new Promise((resolve, reject) => {
                    writeStream.end(() => resolve());
                    writeStream.on('error', reject);
                });
                const fileSize = fs.statSync(assembledPath).size;
                const result = await this.uploadFileFromDisk(nodeId, assembledPath, fileName, fileSize, userId);
                return result;
            }
            finally {
                this.cleanupTempDir(entry.tempDir);
                this.chunkStore.delete(uploadId);
            }
        }
        return {
            status: 'chunk_received',
            chunkIndex,
            receivedChunks: entry.receivedChunks.size,
            totalChunks,
        };
    }
    async uploadFileFromDisk(nodeId, filePath, originalName, fileSize, uploadedBy) {
        this.normalizer.validateExtension(originalName);
        this.normalizer.validateFileSize(fileSize, originalName);
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
        const normalizedName = this.normalizer.normalizeFileName(originalName);
        const ectdRelativePath = this.normalizer.buildEctdRelativePath(node.ctdSectionNumber, normalizedName, node.instanceIndex ?? 0);
        const storagePath = this.normalizer.buildStoragePath(projectId, application.applicationNumber, sequence.sequenceNumber, ectdRelativePath);
        const ext = originalName.substring(originalName.lastIndexOf('.')).toLowerCase();
        const contentType = CONTENT_TYPE_MAP[ext] || 'application/octet-stream';
        const readStream = fs.createReadStream(filePath);
        const md5 = await this.minio.uploadFileStream(storagePath, readStream, fileSize, contentType);
        const attachment = await this.prisma.fileAttachment.create({
            data: {
                sequenceNodeId: nodeId,
                originalName: originalName,
                storedName: normalizedName,
                storagePath,
                ectdRelativePath,
                fileType: ext,
                fileSize: BigInt(fileSize),
                md5Checksum: md5,
                xmlLang: 'zh',
                isReference: false,
                uploadedBy: uploadedBy || null,
            },
        });
        let pdfAnalysis = null;
        if (ext === '.pdf') {
            const pdfBuffer = fs.readFileSync(filePath);
            pdfAnalysis = await this.analyzePdf(attachment.id, pdfBuffer);
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
    cleanupAbandonedUploads() {
        const now = Date.now();
        for (const [uploadId, entry] of this.chunkStore.entries()) {
            if (now - entry.lastActivity > CHUNK_UPLOAD_TIMEOUT_MS) {
                this.logger.warn(`Cleaning up abandoned upload ${uploadId}`);
                this.cleanupTempDir(entry.tempDir);
                this.chunkStore.delete(uploadId);
            }
        }
    }
    cleanupTempDir(dirPath) {
        try {
            fs.rmSync(dirPath, { recursive: true, force: true });
        }
        catch (err) {
            this.logger.warn(`Failed to clean up temp dir ${dirPath}: ${err}`);
        }
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
        const ectdRelativePath = this.normalizer.buildEctdRelativePath(node.ctdSectionNumber, normalizedName, node.instanceIndex ?? 0);
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
    async updateExportName(nodeId, fileId, exportName) {
        const file = await this.prisma.fileAttachment.findFirst({
            where: { id: fileId, sequenceNodeId: nodeId },
            include: { sequenceNode: { select: { ctdSectionNumber: true } } },
        });
        if (!file)
            throw new common_1.NotFoundException('文件不存在');
        if (file.isReference) {
            throw new common_1.BadRequestException('引用前序序列的文件不允许修改导出名');
        }
        const trimmed = typeof exportName === 'string' ? exportName.trim() : '';
        const nextExportName = trimmed === '' ? null : trimmed;
        const ext = file.fileType;
        if (nextExportName !== null) {
            if (!/^[a-z0-9\-_]+$/.test(nextExportName)) {
                throw new common_1.BadRequestException('导出名仅允许小写字母、数字、连字符(-)和下划线(_)');
            }
            if (nextExportName.length + ext.length > 64) {
                throw new common_1.BadRequestException(`导出名加扩展名总长度不能超过 64 字符`);
            }
        }
        const newEffective = nextExportName ? `${nextExportName}${ext}` : file.storedName;
        const siblings = await this.prisma.fileAttachment.findMany({
            where: { sequenceNodeId: nodeId, id: { not: fileId } },
            select: { exportName: true, storedName: true, fileType: true },
        });
        const collision = siblings.find((s) => {
            const siblingEffective = s.exportName ? `${s.exportName}${s.fileType}` : s.storedName;
            return siblingEffective === newEffective;
        });
        if (collision) {
            throw new common_1.BadRequestException(`同章节内已有文件使用文件名 "${newEffective}"`);
        }
        const newRelativePath = this.normalizer.buildEctdRelativePath(file.sequenceNode.ctdSectionNumber, newEffective, file.sequenceNode.instanceIndex ?? 0);
        const updated = await this.prisma.fileAttachment.update({
            where: { id: fileId },
            data: {
                exportName: nextExportName,
                ectdRelativePath: newRelativePath,
            },
            include: { pdfAnalysis: true },
        });
        return this.serializeAttachment(updated);
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