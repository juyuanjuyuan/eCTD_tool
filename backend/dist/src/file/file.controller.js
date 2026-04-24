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
exports.FileController = void 0;
const common_1 = require("@nestjs/common");
const platform_express_1 = require("@nestjs/platform-express");
const jwt_auth_guard_1 = require("../common/guards/jwt-auth.guard");
const file_service_1 = require("./file.service");
const dto_1 = require("./dto");
let FileController = class FileController {
    fileService;
    constructor(fileService) {
        this.fileService = fileService;
    }
    async uploadFile(nodeId, file, req) {
        if (!file)
            throw new common_1.BadRequestException('未上传文件');
        return this.fileService.uploadFile(nodeId, file, req.user?.id);
    }
    async uploadFiles(nodeId, files, req) {
        if (!files || files.length === 0)
            throw new common_1.BadRequestException('未上传文件');
        return this.fileService.uploadFiles(nodeId, files, req.user?.id);
    }
    async uploadChunk(nodeId, chunk, uploadId, chunkIndex, totalChunks, fileName, req) {
        if (!chunk)
            throw new common_1.BadRequestException('未上传分片');
        return this.fileService.handleChunk(nodeId, {
            uploadId,
            chunkIndex: parseInt(chunkIndex, 10),
            totalChunks: parseInt(totalChunks, 10),
            fileName,
            chunkBuffer: chunk.buffer,
            userId: req.user?.id,
        });
    }
    async listFiles(nodeId) {
        return this.fileService.listFiles(nodeId);
    }
    async getFile(nodeId, id) {
        return this.fileService.getFile(nodeId, id);
    }
    async updateExportName(nodeId, id, dto) {
        return this.fileService.updateExportName(nodeId, id, dto.exportName ?? null);
    }
    async deleteFile(nodeId, id) {
        return this.fileService.deleteFile(nodeId, id);
    }
    async downloadFile(nodeId, id) {
        return this.fileService.getDownloadUrl(nodeId, id);
    }
    async previewFile(nodeId, id) {
        return this.fileService.getPreviewUrl(nodeId, id);
    }
    async createReference(nodeId, dto, req) {
        return this.fileService.createFileReference(nodeId, dto.sourceFileId, req.user?.id);
    }
    async listReferenceableFiles(nodeId) {
        return this.fileService.listReferenceableFiles(nodeId);
    }
    async uploadEditorImage(seqId, file) {
        if (!file)
            throw new common_1.BadRequestException('未上传图片');
        return this.fileService.uploadEditorImage(seqId, file);
    }
};
exports.FileController = FileController;
__decorate([
    (0, common_1.Post)('nodes/:nodeId/files/upload'),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileInterceptor)('file', {
        limits: { fileSize: 4 * 1024 * 1024 * 1024 },
    })),
    __param(0, (0, common_1.Param)('nodeId')),
    __param(1, (0, common_1.UploadedFile)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], FileController.prototype, "uploadFile", null);
__decorate([
    (0, common_1.Post)('nodes/:nodeId/files/upload-batch'),
    (0, common_1.UseInterceptors)((0, platform_express_1.FilesInterceptor)('files', 20, {
        limits: { fileSize: 4 * 1024 * 1024 * 1024 },
    })),
    __param(0, (0, common_1.Param)('nodeId')),
    __param(1, (0, common_1.UploadedFiles)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Array, Object]),
    __metadata("design:returntype", Promise)
], FileController.prototype, "uploadFiles", null);
__decorate([
    (0, common_1.Post)('nodes/:nodeId/files/chunk'),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileInterceptor)('chunk', {
        limits: { fileSize: 10 * 1024 * 1024 },
    })),
    __param(0, (0, common_1.Param)('nodeId')),
    __param(1, (0, common_1.UploadedFile)()),
    __param(2, (0, common_1.Body)('uploadId')),
    __param(3, (0, common_1.Body)('chunkIndex')),
    __param(4, (0, common_1.Body)('totalChunks')),
    __param(5, (0, common_1.Body)('fileName')),
    __param(6, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, String, String, String, String, Object]),
    __metadata("design:returntype", Promise)
], FileController.prototype, "uploadChunk", null);
__decorate([
    (0, common_1.Get)('nodes/:nodeId/files'),
    __param(0, (0, common_1.Param)('nodeId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], FileController.prototype, "listFiles", null);
__decorate([
    (0, common_1.Get)('nodes/:nodeId/files/:id'),
    __param(0, (0, common_1.Param)('nodeId')),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], FileController.prototype, "getFile", null);
__decorate([
    (0, common_1.Patch)('nodes/:nodeId/files/:id/export-name'),
    __param(0, (0, common_1.Param)('nodeId')),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, dto_1.UpdateExportNameDto]),
    __metadata("design:returntype", Promise)
], FileController.prototype, "updateExportName", null);
__decorate([
    (0, common_1.Delete)('nodes/:nodeId/files/:id'),
    __param(0, (0, common_1.Param)('nodeId')),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], FileController.prototype, "deleteFile", null);
__decorate([
    (0, common_1.Get)('nodes/:nodeId/files/:id/download'),
    __param(0, (0, common_1.Param)('nodeId')),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], FileController.prototype, "downloadFile", null);
__decorate([
    (0, common_1.Get)('nodes/:nodeId/files/:id/preview'),
    __param(0, (0, common_1.Param)('nodeId')),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], FileController.prototype, "previewFile", null);
__decorate([
    (0, common_1.Post)('nodes/:nodeId/files/reference'),
    __param(0, (0, common_1.Param)('nodeId')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, dto_1.CreateFileReferenceDto, Object]),
    __metadata("design:returntype", Promise)
], FileController.prototype, "createReference", null);
__decorate([
    (0, common_1.Get)('nodes/:nodeId/files/referenceable'),
    __param(0, (0, common_1.Param)('nodeId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], FileController.prototype, "listReferenceableFiles", null);
__decorate([
    (0, common_1.Post)('sequences/:seqId/editor/upload-image'),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileInterceptor)('image', {
        limits: { fileSize: 10 * 1024 * 1024 },
    })),
    __param(0, (0, common_1.Param)('seqId')),
    __param(1, (0, common_1.UploadedFile)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], FileController.prototype, "uploadEditorImage", null);
exports.FileController = FileController = __decorate([
    (0, common_1.Controller)('api/v1'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __metadata("design:paramtypes", [file_service_1.FileService])
], FileController);
//# sourceMappingURL=file.controller.js.map