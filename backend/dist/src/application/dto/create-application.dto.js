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
exports.CreateApplicationDto = exports.APPLICATION_NUMBER_REGEX = void 0;
const class_validator_1 = require("class-validator");
exports.APPLICATION_NUMBER_REGEX = /^[xyls]\d{4}\d{5}$/;
class CreateApplicationDto {
    applicationTypeCode;
    productTypeCode;
    productNumber;
    applicationNumber;
}
exports.CreateApplicationDto = CreateApplicationDto;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)({ message: '申请类型不能为空' }),
    (0, class_validator_1.Matches)(/^cnapt[1-4]$/, { message: '申请类型代码无效' }),
    __metadata("design:type", String)
], CreateApplicationDto.prototype, "applicationTypeCode", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)({ message: '产品类型不能为空' }),
    (0, class_validator_1.Matches)(/^cnprt[1-2]$/, { message: '产品类型代码无效' }),
    __metadata("design:type", String)
], CreateApplicationDto.prototype, "productTypeCode", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)({ message: '原始编号不能为空' }),
    (0, class_validator_1.Matches)(/^\d{10}$/, { message: '原始编号必须为10位数字' }),
    __metadata("design:type", String)
], CreateApplicationDto.prototype, "productNumber", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(15, { message: '申请编号长度不能超过 15 个字符' }),
    (0, class_validator_1.Matches)(exports.APPLICATION_NUMBER_REGEX, {
        message: '申请编号格式错误：必须为字母(x/y/l/s) + 4位年份 + 5位流水号，共10个字符，例如 x202600001',
    }),
    __metadata("design:type", String)
], CreateApplicationDto.prototype, "applicationNumber", void 0);
//# sourceMappingURL=create-application.dto.js.map