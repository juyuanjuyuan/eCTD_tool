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
exports.ExportController = void 0;
const common_1 = require("@nestjs/common");
const jwt_auth_guard_1 = require("../common/guards/jwt-auth.guard");
const export_service_1 = require("./export.service");
const dto_1 = require("./dto");
let ExportController = class ExportController {
    exportService;
    constructor(exportService) {
        this.exportService = exportService;
    }
    async exportWord(_seqId, dto, res) {
        const result = await this.exportService.exportWordSingle(dto.nodeId, dto.headerText);
        if (!result.buffer) {
            return res.status(500).json({ message: '导出失败' });
        }
        res.setHeader('Content-Type', result.contentType);
        res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(result.fileName)}`);
        res.send(result.buffer);
    }
    async exportWordBatch(seqId, dto) {
        return this.exportService.exportWordBatch(seqId, dto.nodeIds, dto.headerText);
    }
    async exportPdf(_seqId, dto, res) {
        const result = await this.exportService.exportPdfSingle(dto.nodeId, dto.headerText);
        if (!result.buffer) {
            return res.status(500).json({ message: '导出失败' });
        }
        if (result.complianceResult && !result.complianceResult.isCompliant) {
            return res.json({
                status: 'compliance_error',
                message: 'PDF 未通过 eCTD 合规检查，无法导出',
                complianceResult: result.complianceResult,
                removedLinks: result.removedLinks,
            });
        }
        res.setHeader('Content-Type', result.contentType);
        res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(result.fileName)}`);
        res.send(result.buffer);
    }
    async exportPdfBatch(seqId, dto) {
        return this.exportService.exportPdfBatch(seqId, dto.nodeIds, dto.headerText);
    }
    async getTaskStatus(taskId) {
        return this.exportService.getTaskStatus(taskId);
    }
    async downloadResult(taskId) {
        return this.exportService.getDownloadUrl(taskId);
    }
};
exports.ExportController = ExportController;
__decorate([
    (0, common_1.Post)('word'),
    __param(0, (0, common_1.Param)('seqId')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, dto_1.ExportSingleDto, Object]),
    __metadata("design:returntype", Promise)
], ExportController.prototype, "exportWord", null);
__decorate([
    (0, common_1.Post)('word/batch'),
    __param(0, (0, common_1.Param)('seqId')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, dto_1.ExportBatchDto]),
    __metadata("design:returntype", Promise)
], ExportController.prototype, "exportWordBatch", null);
__decorate([
    (0, common_1.Post)('pdf'),
    __param(0, (0, common_1.Param)('seqId')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, dto_1.ExportSingleDto, Object]),
    __metadata("design:returntype", Promise)
], ExportController.prototype, "exportPdf", null);
__decorate([
    (0, common_1.Post)('pdf/batch'),
    __param(0, (0, common_1.Param)('seqId')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, dto_1.ExportBatchDto]),
    __metadata("design:returntype", Promise)
], ExportController.prototype, "exportPdfBatch", null);
__decorate([
    (0, common_1.Get)('status/:taskId'),
    __param(0, (0, common_1.Param)('taskId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], ExportController.prototype, "getTaskStatus", null);
__decorate([
    (0, common_1.Get)('download/:taskId'),
    __param(0, (0, common_1.Param)('taskId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], ExportController.prototype, "downloadResult", null);
exports.ExportController = ExportController = __decorate([
    (0, common_1.Controller)('api/v1/sequences/:seqId/export'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __metadata("design:paramtypes", [export_service_1.ExportService])
], ExportController);
//# sourceMappingURL=export.controller.js.map