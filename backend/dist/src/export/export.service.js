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
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExportService = void 0;
const common_1 = require("@nestjs/common");
const bull_1 = require("@nestjs/bull");
const prisma_service_1 = require("../prisma/prisma.service");
const word_export_service_1 = require("./word-export.service");
const pdf_export_service_1 = require("./pdf-export.service");
const pdf_compliance_service_1 = require("./pdf-compliance.service");
const minio_service_1 = require("../file/minio.service");
let ExportService = class ExportService {
    prisma;
    wordExport;
    pdfExport;
    pdfCompliance;
    exportQueue;
    minioService;
    constructor(prisma, wordExport, pdfExport, pdfCompliance, exportQueue, minioService) {
        this.prisma = prisma;
        this.wordExport = wordExport;
        this.pdfExport = pdfExport;
        this.pdfCompliance = pdfCompliance;
        this.exportQueue = exportQueue;
        this.minioService = minioService;
    }
    async exportWordSingle(nodeId, headerText) {
        const { document, node } = await this.getDocumentForExport(nodeId);
        if (!document.contentJson) {
            throw new common_1.BadRequestException('文档内容为空，无法导出');
        }
        const buffer = await this.wordExport.exportDocument(document.contentJson, {
            headerText: headerText || `${node.ctdSectionNumber} ${node.title}`,
            sectionTitle: `${node.ctdSectionNumber} ${node.title}`,
        });
        const fileName = `${node.ctdSectionNumber.replace(/\./g, '-')}_${node.title}.docx`;
        return {
            taskId: `word-${nodeId}-${Date.now()}`,
            status: 'completed',
            buffer,
            fileName,
            contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        };
    }
    async exportPdfSingle(nodeId, headerText) {
        const { document, node } = await this.getDocumentForExport(nodeId);
        if (!document.contentHtml) {
            throw new common_1.BadRequestException('文档内容为空，无法导出');
        }
        const { html: cleanHtml, removedLinks } = this.pdfExport.stripExternalLinks(document.contentHtml);
        const pdfBuffer = await this.pdfExport.exportToPDF(cleanHtml, [], {
            headerText: headerText || `${node.ctdSectionNumber} ${node.title}`,
            sectionTitle: `${node.ctdSectionNumber} ${node.title}`,
        });
        const complianceResult = await this.pdfCompliance.checkCompliance(pdfBuffer);
        const fileName = `${node.ctdSectionNumber.replace(/\./g, '-')}_${node.title}.pdf`;
        return {
            taskId: `pdf-${nodeId}-${Date.now()}`,
            status: complianceResult.isCompliant ? 'completed' : 'compliance_warning',
            buffer: pdfBuffer,
            fileName,
            contentType: 'application/pdf',
            complianceResult,
            removedLinks,
        };
    }
    async exportWordBatch(sequenceId, nodeIds, headerText) {
        const job = await this.exportQueue.add('word-batch', {
            sequenceId,
            nodeIds,
            headerText,
            format: 'word',
        });
        return { taskId: job.id.toString() };
    }
    async exportPdfBatch(sequenceId, nodeIds, headerText) {
        const job = await this.exportQueue.add('pdf-batch', {
            sequenceId,
            nodeIds,
            headerText,
            format: 'pdf',
        });
        return { taskId: job.id.toString() };
    }
    async getTaskStatus(taskId) {
        const job = await this.exportQueue.getJob(taskId);
        if (!job)
            throw new common_1.NotFoundException(`导出任务 ${taskId} 不存在`);
        const state = await job.getState();
        const progress = job.progress();
        return {
            status: state,
            progress: typeof progress === 'number' ? progress : 0,
            result: state === 'completed' ? job.returnvalue : undefined,
            error: state === 'failed' ? (job.failedReason || '未知错误') : undefined,
        };
    }
    async getDownloadUrl(taskId) {
        const job = await this.exportQueue.getJob(taskId);
        if (!job)
            throw new common_1.NotFoundException(`导出任务 ${taskId} 不存在`);
        const state = await job.getState();
        if (state !== 'completed') {
            throw new common_1.BadRequestException(`导出任务尚未完成，当前状态: ${state}`);
        }
        const result = job.returnvalue;
        if (!result?.downloadObjectName) {
            throw new common_1.NotFoundException('导出结果不可下载（未存储到文件系统）');
        }
        if (!this.minioService) {
            throw new common_1.BadRequestException('文件存储服务不可用');
        }
        const url = await this.minioService.getPresignedDownloadUrl(result.downloadObjectName);
        return { url };
    }
    async checkUploadedPdfCompliance(pdfBuffer) {
        return this.pdfCompliance.checkCompliance(pdfBuffer);
    }
    async getDocumentForExport(nodeId) {
        const node = await this.prisma.sequenceNode.findUnique({
            where: { id: nodeId },
        });
        if (!node)
            throw new common_1.NotFoundException('序列节点不存在');
        const document = await this.prisma.document.findUnique({
            where: { nodeId },
        });
        if (!document)
            throw new common_1.NotFoundException('文档不存在，请先在编辑器中输入内容');
        return { document, node };
    }
};
exports.ExportService = ExportService;
exports.ExportService = ExportService = __decorate([
    (0, common_1.Injectable)(),
    __param(4, (0, bull_1.InjectQueue)('export')),
    __param(5, (0, common_1.Optional)()),
    __param(5, (0, common_1.Inject)(minio_service_1.MinioService)),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        word_export_service_1.WordExportService,
        pdf_export_service_1.PDFExportService,
        pdf_compliance_service_1.PDFComplianceService, Object, minio_service_1.MinioService])
], ExportService);
//# sourceMappingURL=export.service.js.map