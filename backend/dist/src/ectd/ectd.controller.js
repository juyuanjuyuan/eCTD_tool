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
exports.EctdController = void 0;
const common_1 = require("@nestjs/common");
const jwt_auth_guard_1 = require("../common/guards/jwt-auth.guard");
const cn_regional_xml_service_1 = require("./services/cn-regional-xml.service");
const index_xml_service_1 = require("./services/index-xml.service");
const lifecycle_service_1 = require("./services/lifecycle.service");
const validator_service_1 = require("./services/validator.service");
const package_assembler_service_1 = require("./services/package-assembler.service");
const md5_service_1 = require("./services/md5.service");
const dto_1 = require("./dto");
let EctdController = class EctdController {
    cnRegionalXml;
    indexXml;
    lifecycle;
    validator;
    packageAssembler;
    md5Service;
    constructor(cnRegionalXml, indexXml, lifecycle, validator, packageAssembler, md5Service) {
        this.cnRegionalXml = cnRegionalXml;
        this.indexXml = indexXml;
        this.lifecycle = lifecycle;
        this.validator = validator;
        this.packageAssembler = packageAssembler;
        this.md5Service = md5Service;
    }
    async previewCnRegionalXml(seqId) {
        const xml = await this.cnRegionalXml.generateCnRegionalXml(seqId);
        return { xml };
    }
    async previewIndexXml(seqId) {
        const xml = await this.indexXml.generateIndexXml(seqId);
        return { xml };
    }
    async validateOperation(seqId, nodeId, dto) {
        const operation = dto.operation.toUpperCase();
        return this.lifecycle.validateOperation(seqId, nodeId, operation);
    }
    async checkParallelConflicts(seqId) {
        return this.lifecycle.checkParallelConflicts(seqId);
    }
    async previewWithdraw(seqId) {
        return this.lifecycle.generateWithdrawOperations(seqId);
    }
    async runValidation(seqId) {
        return this.validator.validate(seqId);
    }
    async getLatestReport(seqId) {
        return this.validator.getLatestReport(seqId);
    }
    async getReport(reportId) {
        return this.validator.getReport(reportId);
    }
    async previewPackage(seqId) {
        const paths = await this.packageAssembler.previewStructure(seqId);
        return { paths };
    }
    async exportPackage(seqId, res) {
        const { stream, fileName } = await this.packageAssembler.assemblePackageStream(seqId);
        res.set({
            'Content-Type': 'application/zip',
            'Content-Disposition': `attachment; filename="${encodeURIComponent(fileName)}"`,
            'Transfer-Encoding': 'chunked',
        });
        stream.pipe(res);
    }
};
exports.EctdController = EctdController;
__decorate([
    (0, common_1.Get)('sequences/:seqId/xml/cn-regional'),
    __param(0, (0, common_1.Param)('seqId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], EctdController.prototype, "previewCnRegionalXml", null);
__decorate([
    (0, common_1.Get)('sequences/:seqId/xml/index'),
    __param(0, (0, common_1.Param)('seqId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], EctdController.prototype, "previewIndexXml", null);
__decorate([
    (0, common_1.Post)('sequences/:seqId/nodes/:nodeId/validate-operation'),
    __param(0, (0, common_1.Param)('seqId')),
    __param(1, (0, common_1.Param)('nodeId')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, dto_1.ValidateOperationDto]),
    __metadata("design:returntype", Promise)
], EctdController.prototype, "validateOperation", null);
__decorate([
    (0, common_1.Get)('sequences/:seqId/parallel-conflicts'),
    __param(0, (0, common_1.Param)('seqId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], EctdController.prototype, "checkParallelConflicts", null);
__decorate([
    (0, common_1.Post)('sequences/:seqId/withdraw-preview'),
    __param(0, (0, common_1.Param)('seqId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], EctdController.prototype, "previewWithdraw", null);
__decorate([
    (0, common_1.Post)('sequences/:seqId/validate'),
    __param(0, (0, common_1.Param)('seqId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], EctdController.prototype, "runValidation", null);
__decorate([
    (0, common_1.Get)('sequences/:seqId/validate/latest'),
    __param(0, (0, common_1.Param)('seqId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], EctdController.prototype, "getLatestReport", null);
__decorate([
    (0, common_1.Get)('sequences/:seqId/validate/report/:reportId'),
    __param(0, (0, common_1.Param)('reportId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], EctdController.prototype, "getReport", null);
__decorate([
    (0, common_1.Get)('sequences/:seqId/export/ectd-preview'),
    __param(0, (0, common_1.Param)('seqId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], EctdController.prototype, "previewPackage", null);
__decorate([
    (0, common_1.Post)('sequences/:seqId/export/ectd-package'),
    __param(0, (0, common_1.Param)('seqId')),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], EctdController.prototype, "exportPackage", null);
exports.EctdController = EctdController = __decorate([
    (0, common_1.Controller)('api/v1'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __metadata("design:paramtypes", [cn_regional_xml_service_1.CnRegionalXmlService,
        index_xml_service_1.IndexXmlService,
        lifecycle_service_1.LifecycleService,
        validator_service_1.ValidatorService,
        package_assembler_service_1.PackageAssemblerService,
        md5_service_1.Md5Service])
], EctdController);
//# sourceMappingURL=ectd.controller.js.map