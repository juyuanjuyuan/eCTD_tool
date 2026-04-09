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
exports.StudyController = void 0;
const common_1 = require("@nestjs/common");
const platform_express_1 = require("@nestjs/platform-express");
const client_1 = require("@prisma/client");
const study_service_1 = require("./study.service");
const study_tagging_file_import_service_1 = require("./study-tagging-file-import.service");
const dto_1 = require("./dto");
const jwt_auth_guard_1 = require("../common/guards/jwt-auth.guard");
const roles_guard_1 = require("../common/guards/roles.guard");
const roles_decorator_1 = require("../common/decorators/roles.decorator");
let StudyController = class StudyController {
    studyService;
    importService;
    constructor(studyService, importService) {
        this.studyService = studyService;
        this.importService = importService;
    }
    listBySequence(seqId) {
        return this.studyService.listBySequence(seqId);
    }
    listByNode(nodeId) {
        return this.studyService.listByNode(nodeId);
    }
    getOne(id) {
        return this.studyService.getById(id);
    }
    create(nodeId, dto) {
        return this.studyService.create(nodeId, dto);
    }
    update(id, dto) {
        return this.studyService.update(id, dto);
    }
    remove(id) {
        return this.studyService.delete(id);
    }
    regenerateXml(id) {
        return this.studyService.regenerateXml(id);
    }
    importStfXml(nodeId, dto) {
        return this.importService.importStfXml(nodeId, dto.xml, {
            onConflict: dto.onConflict,
        });
    }
    importStfBundleJson(nodeId, dto) {
        const attached = (dto.files ?? []).map((f) => ({
            originalName: f.originalName,
            buffer: Buffer.from(f.base64, 'base64'),
            md5: f.md5,
        }));
        return this.importService.importStfBundle(nodeId, {
            xmlString: dto.xml,
            attachedFiles: attached,
            onConflict: dto.onConflict,
        });
    }
    async importStfBundleMultipart(nodeId, uploaded, onConflict) {
        const xmlFile = uploaded?.xml?.[0];
        if (!xmlFile) {
            throw new common_1.BadRequestException('缺少 xml 字段（STF XML 文件）');
        }
        const xmlString = xmlFile.buffer.toString('utf8');
        const attached = (uploaded?.files ?? []).map((f) => ({
            originalName: f.originalname,
            buffer: f.buffer,
        }));
        return this.importService.importStfBundle(nodeId, {
            xmlString,
            attachedFiles: attached,
            onConflict,
        });
    }
};
exports.StudyController = StudyController;
__decorate([
    (0, common_1.Get)('sequences/:seqId/studies'),
    __param(0, (0, common_1.Param)('seqId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], StudyController.prototype, "listBySequence", null);
__decorate([
    (0, common_1.Get)('sequence-nodes/:nodeId/studies'),
    __param(0, (0, common_1.Param)('nodeId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], StudyController.prototype, "listByNode", null);
__decorate([
    (0, common_1.Get)('studies/:id'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], StudyController.prototype, "getOne", null);
__decorate([
    (0, common_1.Post)('sequence-nodes/:nodeId/studies'),
    (0, roles_decorator_1.Roles)(client_1.Role.ADMIN, client_1.Role.MANAGER, client_1.Role.EDITOR),
    __param(0, (0, common_1.Param)('nodeId')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, dto_1.CreateStudyDto]),
    __metadata("design:returntype", void 0)
], StudyController.prototype, "create", null);
__decorate([
    (0, common_1.Patch)('studies/:id'),
    (0, roles_decorator_1.Roles)(client_1.Role.ADMIN, client_1.Role.MANAGER, client_1.Role.EDITOR),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, dto_1.UpdateStudyDto]),
    __metadata("design:returntype", void 0)
], StudyController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)('studies/:id'),
    (0, roles_decorator_1.Roles)(client_1.Role.ADMIN, client_1.Role.MANAGER, client_1.Role.EDITOR),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], StudyController.prototype, "remove", null);
__decorate([
    (0, common_1.Post)('studies/:id/regenerate-xml'),
    (0, roles_decorator_1.Roles)(client_1.Role.ADMIN, client_1.Role.MANAGER, client_1.Role.EDITOR),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], StudyController.prototype, "regenerateXml", null);
__decorate([
    (0, common_1.Post)('sequence-nodes/:nodeId/studies/import-xml'),
    (0, roles_decorator_1.Roles)(client_1.Role.ADMIN, client_1.Role.MANAGER, client_1.Role.EDITOR),
    __param(0, (0, common_1.Param)('nodeId')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, dto_1.ImportStfXmlDto]),
    __metadata("design:returntype", void 0)
], StudyController.prototype, "importStfXml", null);
__decorate([
    (0, common_1.Post)('sequence-nodes/:nodeId/studies/import-bundle'),
    (0, roles_decorator_1.Roles)(client_1.Role.ADMIN, client_1.Role.MANAGER, client_1.Role.EDITOR),
    __param(0, (0, common_1.Param)('nodeId')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, dto_1.ImportStfBundleDto]),
    __metadata("design:returntype", void 0)
], StudyController.prototype, "importStfBundleJson", null);
__decorate([
    (0, common_1.Post)('sequence-nodes/:nodeId/studies/import-bundle-multipart'),
    (0, roles_decorator_1.Roles)(client_1.Role.ADMIN, client_1.Role.MANAGER, client_1.Role.EDITOR),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileFieldsInterceptor)([
        { name: 'xml', maxCount: 1 },
        { name: 'files', maxCount: 50 },
    ], {
        limits: { fileSize: 512 * 1024 * 1024 },
    })),
    __param(0, (0, common_1.Param)('nodeId')),
    __param(1, (0, common_1.UploadedFiles)()),
    __param(2, (0, common_1.Body)('onConflict')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, String]),
    __metadata("design:returntype", Promise)
], StudyController.prototype, "importStfBundleMultipart", null);
exports.StudyController = StudyController = __decorate([
    (0, common_1.Controller)('api/v1'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    __metadata("design:paramtypes", [study_service_1.StudyService,
        study_tagging_file_import_service_1.StudyTaggingFileImportService])
], StudyController);
//# sourceMappingURL=study.controller.js.map