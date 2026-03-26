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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExportProcessor = void 0;
const bull_1 = require("@nestjs/bull");
const common_1 = require("@nestjs/common");
const archiver = __importStar(require("archiver"));
const prisma_service_1 = require("../prisma/prisma.service");
const word_export_service_1 = require("./word-export.service");
const pdf_export_service_1 = require("./pdf-export.service");
const pdf_compliance_service_1 = require("./pdf-compliance.service");
const minio_service_1 = require("../file/minio.service");
let ExportProcessor = class ExportProcessor {
    prisma;
    wordExport;
    pdfExport;
    pdfCompliance;
    minioService;
    constructor(prisma, wordExport, pdfExport, pdfCompliance, minioService) {
        this.prisma = prisma;
        this.wordExport = wordExport;
        this.pdfExport = pdfExport;
        this.pdfCompliance = pdfCompliance;
        this.minioService = minioService;
    }
    async handleWordBatch(job) {
        const { nodeIds, headerText } = job.data;
        const result = {
            format: 'word',
            totalNodes: nodeIds.length,
            successCount: 0,
            failCount: 0,
            files: [],
        };
        const exportedFiles = [];
        for (let i = 0; i < nodeIds.length; i++) {
            const nodeId = nodeIds[i];
            try {
                const node = await this.prisma.sequenceNode.findUnique({ where: { id: nodeId } });
                const document = await this.prisma.document.findUnique({ where: { nodeId } });
                if (!node || !document?.contentJson) {
                    result.failCount++;
                    result.files.push({
                        nodeId,
                        fileName: '',
                        sizeBytes: 0,
                        error: '文档不存在或内容为空',
                    });
                    continue;
                }
                const buffer = await this.wordExport.exportDocument(document.contentJson, {
                    headerText: headerText || `${node.ctdSectionNumber} ${node.title}`,
                    sectionTitle: `${node.ctdSectionNumber} ${node.title}`,
                });
                const fileName = `${node.ctdSectionNumber.replace(/\./g, '-')}_${node.title}.docx`;
                result.successCount++;
                result.files.push({ nodeId, fileName, sizeBytes: buffer.length });
                exportedFiles.push({ fileName, buffer });
            }
            catch (err) {
                result.failCount++;
                result.files.push({
                    nodeId,
                    fileName: '',
                    sizeBytes: 0,
                    error: err.message,
                });
            }
            await job.progress(Math.round(((i + 1) / nodeIds.length) * 100));
        }
        if (this.minioService && exportedFiles.length > 0) {
            result.downloadObjectName = await this.uploadZipToMinio(`export-word-${job.id}`, exportedFiles);
        }
        return result;
    }
    async handlePdfBatch(job) {
        const { nodeIds, headerText } = job.data;
        const result = {
            format: 'pdf',
            totalNodes: nodeIds.length,
            successCount: 0,
            failCount: 0,
            files: [],
        };
        const exportedFiles = [];
        for (let i = 0; i < nodeIds.length; i++) {
            const nodeId = nodeIds[i];
            try {
                const node = await this.prisma.sequenceNode.findUnique({ where: { id: nodeId } });
                const document = await this.prisma.document.findUnique({ where: { nodeId } });
                if (!node || !document?.contentHtml) {
                    result.failCount++;
                    result.files.push({
                        nodeId,
                        fileName: '',
                        sizeBytes: 0,
                        error: '文档不存在或内容为空',
                    });
                    continue;
                }
                const { html: cleanHtml } = this.pdfExport.stripExternalLinks(document.contentHtml);
                const pdfBuffer = await this.pdfExport.exportToPDF(cleanHtml, [], {
                    headerText: headerText || `${node.ctdSectionNumber} ${node.title}`,
                    sectionTitle: `${node.ctdSectionNumber} ${node.title}`,
                });
                const complianceResult = await this.pdfCompliance.checkCompliance(pdfBuffer);
                const fileName = `${node.ctdSectionNumber.replace(/\./g, '-')}_${node.title}.pdf`;
                result.successCount++;
                result.files.push({
                    nodeId,
                    fileName,
                    sizeBytes: pdfBuffer.length,
                    complianceResult,
                });
                exportedFiles.push({ fileName, buffer: pdfBuffer });
            }
            catch (err) {
                result.failCount++;
                result.files.push({
                    nodeId,
                    fileName: '',
                    sizeBytes: 0,
                    error: err.message,
                });
            }
            await job.progress(Math.round(((i + 1) / nodeIds.length) * 100));
        }
        if (this.minioService && exportedFiles.length > 0) {
            result.downloadObjectName = await this.uploadZipToMinio(`export-pdf-${job.id}`, exportedFiles);
        }
        return result;
    }
    async uploadZipToMinio(prefix, files) {
        return new Promise((resolve, reject) => {
            const chunks = [];
            const archive = archiver.default('zip', { zlib: { level: 6 } });
            archive.on('data', (chunk) => chunks.push(chunk));
            archive.on('end', async () => {
                try {
                    const zipBuffer = Buffer.concat(chunks);
                    const objectName = `exports/${prefix}.zip`;
                    await this.minioService.uploadFile(objectName, zipBuffer, 'application/zip');
                    resolve(objectName);
                }
                catch (err) {
                    reject(err);
                }
            });
            archive.on('error', reject);
            for (const file of files) {
                archive.append(file.buffer, { name: file.fileName });
            }
            archive.finalize();
        });
    }
};
exports.ExportProcessor = ExportProcessor;
__decorate([
    (0, bull_1.Process)('word-batch'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], ExportProcessor.prototype, "handleWordBatch", null);
__decorate([
    (0, bull_1.Process)('pdf-batch'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], ExportProcessor.prototype, "handlePdfBatch", null);
exports.ExportProcessor = ExportProcessor = __decorate([
    (0, bull_1.Processor)('export'),
    __param(4, (0, common_1.Optional)()),
    __param(4, (0, common_1.Inject)(minio_service_1.MinioService)),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        word_export_service_1.WordExportService,
        pdf_export_service_1.PDFExportService,
        pdf_compliance_service_1.PDFComplianceService,
        minio_service_1.MinioService])
], ExportProcessor);
//# sourceMappingURL=export.processor.js.map