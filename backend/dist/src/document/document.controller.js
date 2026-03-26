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
exports.DocumentController = void 0;
const common_1 = require("@nestjs/common");
const jwt_auth_guard_1 = require("../common/guards/jwt-auth.guard");
const current_user_decorator_1 = require("../common/decorators/current-user.decorator");
const document_service_1 = require("./document.service");
const dto_1 = require("./dto");
let DocumentController = class DocumentController {
    documentService;
    constructor(documentService) {
        this.documentService = documentService;
    }
    getDocument(nodeId) {
        return this.documentService.getDocument(nodeId);
    }
    saveDocument(nodeId, dto, userId) {
        return this.documentService.saveDocument(nodeId, dto, userId);
    }
    getVersions(nodeId) {
        return this.documentService.getVersions(nodeId);
    }
    getVersion(nodeId, v) {
        return this.documentService.getVersion(nodeId, v);
    }
    createVersionSnapshot(nodeId, userId) {
        return this.documentService.createVersionSnapshot(nodeId, userId);
    }
    restoreVersion(nodeId, v, userId) {
        return this.documentService.restoreVersion(nodeId, v, userId);
    }
};
exports.DocumentController = DocumentController;
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, common_1.Param)('nodeId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], DocumentController.prototype, "getDocument", null);
__decorate([
    (0, common_1.Put)(),
    __param(0, (0, common_1.Param)('nodeId')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, dto_1.SaveDocumentDto, String]),
    __metadata("design:returntype", void 0)
], DocumentController.prototype, "saveDocument", null);
__decorate([
    (0, common_1.Get)('versions'),
    __param(0, (0, common_1.Param)('nodeId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], DocumentController.prototype, "getVersions", null);
__decorate([
    (0, common_1.Get)('versions/:v'),
    __param(0, (0, common_1.Param)('nodeId')),
    __param(1, (0, common_1.Param)('v', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Number]),
    __metadata("design:returntype", void 0)
], DocumentController.prototype, "getVersion", null);
__decorate([
    (0, common_1.Post)('versions'),
    __param(0, (0, common_1.Param)('nodeId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], DocumentController.prototype, "createVersionSnapshot", null);
__decorate([
    (0, common_1.Post)('restore/:v'),
    __param(0, (0, common_1.Param)('nodeId')),
    __param(1, (0, common_1.Param)('v', common_1.ParseIntPipe)),
    __param(2, (0, current_user_decorator_1.CurrentUser)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Number, String]),
    __metadata("design:returntype", void 0)
], DocumentController.prototype, "restoreVersion", null);
exports.DocumentController = DocumentController = __decorate([
    (0, common_1.Controller)('api/v1/nodes/:nodeId/document'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __metadata("design:paramtypes", [document_service_1.DocumentService])
], DocumentController);
//# sourceMappingURL=document.controller.js.map