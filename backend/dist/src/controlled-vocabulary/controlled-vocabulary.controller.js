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
exports.ControlledVocabularyController = void 0;
const common_1 = require("@nestjs/common");
const controlled_vocabulary_service_1 = require("./controlled-vocabulary.service");
let ControlledVocabularyController = class ControlledVocabularyController {
    cvService;
    constructor(cvService) {
        this.cvService = cvService;
    }
    getApplicationTypes() {
        return this.cvService.getApplicationTypes();
    }
    getProductTypes() {
        return this.cvService.getProductTypes();
    }
    getRegulatoryActivityTypes(appType) {
        return this.cvService.getRegulatoryActivityTypes(appType);
    }
    getSequenceTypes(appType, ratType) {
        return this.cvService.getSequenceTypes(appType, ratType);
    }
    getStfCategories() {
        return this.cvService.getStfCategories();
    }
    getStfCategoryValues(name) {
        return this.cvService.getStfCategoryValues(name);
    }
    getStfFileTags(module) {
        if (module !== 'm4' && module !== 'm5') {
            throw new common_1.BadRequestException("Query parameter 'module' must be either 'm4' or 'm5'");
        }
        return this.cvService.getStfFileTags(module);
    }
};
exports.ControlledVocabularyController = ControlledVocabularyController;
__decorate([
    (0, common_1.Get)('application-types'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], ControlledVocabularyController.prototype, "getApplicationTypes", null);
__decorate([
    (0, common_1.Get)('product-types'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], ControlledVocabularyController.prototype, "getProductTypes", null);
__decorate([
    (0, common_1.Get)('regulatory-activity-types'),
    __param(0, (0, common_1.Query)('appType')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], ControlledVocabularyController.prototype, "getRegulatoryActivityTypes", null);
__decorate([
    (0, common_1.Get)('sequence-types'),
    __param(0, (0, common_1.Query)('appType')),
    __param(1, (0, common_1.Query)('ratType')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], ControlledVocabularyController.prototype, "getSequenceTypes", null);
__decorate([
    (0, common_1.Get)('stf/categories'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], ControlledVocabularyController.prototype, "getStfCategories", null);
__decorate([
    (0, common_1.Get)('stf/categories/:name'),
    __param(0, (0, common_1.Param)('name')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], ControlledVocabularyController.prototype, "getStfCategoryValues", null);
__decorate([
    (0, common_1.Get)('stf/file-tags'),
    __param(0, (0, common_1.Query)('module')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], ControlledVocabularyController.prototype, "getStfFileTags", null);
exports.ControlledVocabularyController = ControlledVocabularyController = __decorate([
    (0, common_1.Controller)('api/v1/cv'),
    __metadata("design:paramtypes", [controlled_vocabulary_service_1.ControlledVocabularyService])
], ControlledVocabularyController);
//# sourceMappingURL=controlled-vocabulary.controller.js.map