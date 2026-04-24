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
exports.CtdTemplateController = void 0;
const common_1 = require("@nestjs/common");
const jwt_auth_guard_1 = require("../common/guards/jwt-auth.guard");
const ctd_template_service_1 = require("./ctd-template.service");
const dto_1 = require("./dto");
let CtdTemplateController = class CtdTemplateController {
    ctdTemplateService;
    constructor(ctdTemplateService) {
        this.ctdTemplateService = ctdTemplateService;
    }
    getTemplateTree(appType, ratType) {
        if (appType && ratType) {
            return this.ctdTemplateService.getTemplateTreeWithRules(appType, ratType);
        }
        return this.ctdTemplateService.getTemplateTree();
    }
    getExtensionOptions() {
        return this.ctdTemplateService.getExtensionNodeOptions();
    }
    initializeSequence(seqId) {
        return this.ctdTemplateService.initializeSequenceNodes(seqId);
    }
    previewRequired(seqId) {
        return this.ctdTemplateService.previewRequiredSections(seqId);
    }
    getSequenceNodeTree(seqId) {
        return this.ctdTemplateService.getSequenceNodeTree(seqId);
    }
    updateSequenceNode(seqId, nodeId, dto) {
        return this.ctdTemplateService.updateSequenceNode(seqId, nodeId, dto);
    }
    updateBackboneAttributes(seqId, nodeId, dto) {
        return this.ctdTemplateService.updateBackboneAttributes(seqId, nodeId, dto);
    }
    createExtensionNode(seqId, parentNodeId, dto) {
        return this.ctdTemplateService.createExtensionNode(seqId, parentNodeId, dto);
    }
    deleteExtensionNode(seqId, nodeId) {
        return this.ctdTemplateService.deleteExtensionNode(seqId, nodeId);
    }
    listInstances(seqId, templateNodeId) {
        return this.ctdTemplateService.listInstances(seqId, templateNodeId);
    }
    addInstance(seqId, templateNodeId, dto) {
        return this.ctdTemplateService.addInstance(seqId, templateNodeId, dto);
    }
    removeInstance(seqId, instanceRootNodeId) {
        return this.ctdTemplateService.removeInstance(seqId, instanceRootNodeId);
    }
    checkCompleteness(seqId) {
        return this.ctdTemplateService.checkCompleteness(seqId);
    }
};
exports.CtdTemplateController = CtdTemplateController;
__decorate([
    (0, common_1.Get)('ctd-templates/tree'),
    __param(0, (0, common_1.Query)('appType')),
    __param(1, (0, common_1.Query)('ratType')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], CtdTemplateController.prototype, "getTemplateTree", null);
__decorate([
    (0, common_1.Get)('ctd-templates/extension-options'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], CtdTemplateController.prototype, "getExtensionOptions", null);
__decorate([
    (0, common_1.Post)('sequences/:seqId/initialize'),
    __param(0, (0, common_1.Param)('seqId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], CtdTemplateController.prototype, "initializeSequence", null);
__decorate([
    (0, common_1.Get)('sequences/:seqId/preview-required'),
    __param(0, (0, common_1.Param)('seqId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], CtdTemplateController.prototype, "previewRequired", null);
__decorate([
    (0, common_1.Get)('sequences/:seqId/nodes/tree'),
    __param(0, (0, common_1.Param)('seqId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], CtdTemplateController.prototype, "getSequenceNodeTree", null);
__decorate([
    (0, common_1.Patch)('sequences/:seqId/nodes/:nodeId'),
    __param(0, (0, common_1.Param)('seqId')),
    __param(1, (0, common_1.Param)('nodeId')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, dto_1.UpdateSequenceNodeDto]),
    __metadata("design:returntype", void 0)
], CtdTemplateController.prototype, "updateSequenceNode", null);
__decorate([
    (0, common_1.Patch)('sequences/:seqId/nodes/:nodeId/attributes'),
    __param(0, (0, common_1.Param)('seqId')),
    __param(1, (0, common_1.Param)('nodeId')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, dto_1.UpdateBackboneAttributesDto]),
    __metadata("design:returntype", void 0)
], CtdTemplateController.prototype, "updateBackboneAttributes", null);
__decorate([
    (0, common_1.Post)('sequences/:seqId/nodes/:parentNodeId/extensions'),
    __param(0, (0, common_1.Param)('seqId')),
    __param(1, (0, common_1.Param)('parentNodeId')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, dto_1.CreateExtensionNodeDto]),
    __metadata("design:returntype", void 0)
], CtdTemplateController.prototype, "createExtensionNode", null);
__decorate([
    (0, common_1.Delete)('sequences/:seqId/nodes/:nodeId/extension'),
    __param(0, (0, common_1.Param)('seqId')),
    __param(1, (0, common_1.Param)('nodeId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], CtdTemplateController.prototype, "deleteExtensionNode", null);
__decorate([
    (0, common_1.Get)('sequences/:seqId/template-nodes/:templateNodeId/instances'),
    __param(0, (0, common_1.Param)('seqId')),
    __param(1, (0, common_1.Param)('templateNodeId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], CtdTemplateController.prototype, "listInstances", null);
__decorate([
    (0, common_1.Post)('sequences/:seqId/template-nodes/:templateNodeId/instances'),
    __param(0, (0, common_1.Param)('seqId')),
    __param(1, (0, common_1.Param)('templateNodeId')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, dto_1.AddInstanceDto]),
    __metadata("design:returntype", void 0)
], CtdTemplateController.prototype, "addInstance", null);
__decorate([
    (0, common_1.Delete)('sequences/:seqId/instances/:instanceRootNodeId'),
    __param(0, (0, common_1.Param)('seqId')),
    __param(1, (0, common_1.Param)('instanceRootNodeId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], CtdTemplateController.prototype, "removeInstance", null);
__decorate([
    (0, common_1.Get)('sequences/:seqId/completeness'),
    __param(0, (0, common_1.Param)('seqId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], CtdTemplateController.prototype, "checkCompleteness", null);
exports.CtdTemplateController = CtdTemplateController = __decorate([
    (0, common_1.Controller)('api/v1'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __metadata("design:paramtypes", [ctd_template_service_1.CtdTemplateService])
], CtdTemplateController);
//# sourceMappingURL=ctd-template.controller.js.map