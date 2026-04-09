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
Object.defineProperty(exports, "__esModule", { value: true });
exports.ImportStfBundleDto = exports.ImportAttachedFileDto = exports.ImportStfXmlDto = void 0;
const class_validator_1 = require("class-validator");
const class_transformer_1 = require("class-transformer");
class ImportStfXmlDto {
    xml;
    onConflict;
}
exports.ImportStfXmlDto = ImportStfXmlDto;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)({ message: 'xml 不能为空' }),
    __metadata("design:type", String)
], ImportStfXmlDto.prototype, "xml", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(['reject', 'overwrite', 'merge'], {
        message: 'onConflict 必须是 reject / overwrite / merge',
    }),
    __metadata("design:type", String)
], ImportStfXmlDto.prototype, "onConflict", void 0);
class ImportAttachedFileDto {
    originalName;
    base64;
    md5;
}
exports.ImportAttachedFileDto = ImportAttachedFileDto;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)({ message: 'originalName 不能为空' }),
    __metadata("design:type", String)
], ImportAttachedFileDto.prototype, "originalName", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)({ message: 'base64 不能为空' }),
    __metadata("design:type", String)
], ImportAttachedFileDto.prototype, "base64", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ImportAttachedFileDto.prototype, "md5", void 0);
class ImportStfBundleDto {
    xml;
    files;
    onConflict;
}
exports.ImportStfBundleDto = ImportStfBundleDto;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)({ message: 'xml 不能为空' }),
    __metadata("design:type", String)
], ImportStfBundleDto.prototype, "xml", void 0);
__decorate([
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ValidateNested)({ each: true }),
    (0, class_transformer_1.Type)(() => ImportAttachedFileDto),
    __metadata("design:type", Array)
], ImportStfBundleDto.prototype, "files", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(['reject', 'overwrite', 'merge'], {
        message: 'onConflict 必须是 reject / overwrite / merge',
    }),
    __metadata("design:type", String)
], ImportStfBundleDto.prototype, "onConflict", void 0);
//# sourceMappingURL=import-study.dto.js.map