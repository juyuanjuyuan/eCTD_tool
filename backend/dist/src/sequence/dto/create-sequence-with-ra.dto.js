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
exports.CreateSequenceWithRaDto = void 0;
const class_validator_1 = require("class-validator");
class CreateSequenceWithRaDto {
    regulatoryActivityTypeCode;
    sequenceTypeCode;
    description;
    contactName;
    contactPhone;
    contactEmail;
}
exports.CreateSequenceWithRaDto = CreateSequenceWithRaDto;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)({ message: '注册行为类型不能为空' }),
    (0, class_validator_1.Matches)(/^cnrat[1-9]$/, { message: '注册行为类型代码无效' }),
    __metadata("design:type", String)
], CreateSequenceWithRaDto.prototype, "regulatoryActivityTypeCode", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)({ message: '序列类型不能为空' }),
    (0, class_validator_1.Matches)(/^cnsqt[1-4]$/, { message: '序列类型代码无效' }),
    __metadata("design:type", String)
], CreateSequenceWithRaDto.prototype, "sequenceTypeCode", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)({ message: '序列描述不能为空' }),
    (0, class_validator_1.MaxLength)(500),
    __metadata("design:type", String)
], CreateSequenceWithRaDto.prototype, "description", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)({ message: '联系人姓名不能为空' }),
    (0, class_validator_1.MaxLength)(100),
    __metadata("design:type", String)
], CreateSequenceWithRaDto.prototype, "contactName", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)({ message: '联系人电话不能为空' }),
    (0, class_validator_1.MaxLength)(20),
    __metadata("design:type", String)
], CreateSequenceWithRaDto.prototype, "contactPhone", void 0);
__decorate([
    (0, class_validator_1.IsEmail)({}, { message: '联系人邮箱格式不正确' }),
    (0, class_validator_1.IsNotEmpty)({ message: '联系人邮箱不能为空' }),
    __metadata("design:type", String)
], CreateSequenceWithRaDto.prototype, "contactEmail", void 0);
//# sourceMappingURL=create-sequence-with-ra.dto.js.map