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
exports.CreateStudyDto = exports.StudyDocumentDto = exports.StudyCategoryDto = void 0;
const class_validator_1 = require("class-validator");
const class_transformer_1 = require("class-transformer");
const client_1 = require("@prisma/client");
class StudyCategoryDto {
    name;
    value;
    infoType;
    sortOrder;
}
exports.StudyCategoryDto = StudyCategoryDto;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)({ message: 'category 名称不能为空' }),
    (0, class_validator_1.MaxLength)(60),
    __metadata("design:type", String)
], StudyCategoryDto.prototype, "name", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)({ message: 'category 值不能为空' }),
    (0, class_validator_1.MaxLength)(100),
    __metadata("design:type", String)
], StudyCategoryDto.prototype, "value", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(10),
    __metadata("design:type", String)
], StudyCategoryDto.prototype, "infoType", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], StudyCategoryDto.prototype, "sortOrder", void 0);
class StudyDocumentDto {
    fileAttachmentId;
    fileTag;
    fileTagInfoType;
    sortOrder;
}
exports.StudyDocumentDto = StudyDocumentDto;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)({ message: 'fileAttachmentId 不能为空' }),
    __metadata("design:type", String)
], StudyDocumentDto.prototype, "fileAttachmentId", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)({ message: 'file-tag 不能为空' }),
    (0, class_validator_1.MaxLength)(80),
    __metadata("design:type", String)
], StudyDocumentDto.prototype, "fileTag", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(10),
    __metadata("design:type", String)
], StudyDocumentDto.prototype, "fileTagInfoType", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], StudyDocumentDto.prototype, "sortOrder", void 0);
class CreateStudyDto {
    studyId;
    title;
    operation;
    modifiedFromId;
    categories;
    documents;
}
exports.CreateStudyDto = CreateStudyDto;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)({ message: '研究编号不能为空' }),
    (0, class_validator_1.MaxLength)(100),
    __metadata("design:type", String)
], CreateStudyDto.prototype, "studyId", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)({ message: '研究标题不能为空' }),
    (0, class_validator_1.MaxLength)(500),
    __metadata("design:type", String)
], CreateStudyDto.prototype, "title", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(client_1.LeafOperation, { message: 'operation 必须是 NEW/REPLACE/APPEND/DELETE' }),
    __metadata("design:type", String)
], CreateStudyDto.prototype, "operation", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateStudyDto.prototype, "modifiedFromId", void 0);
__decorate([
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ArrayMaxSize)(50),
    (0, class_validator_1.ValidateNested)({ each: true }),
    (0, class_transformer_1.Type)(() => StudyCategoryDto),
    __metadata("design:type", Array)
], CreateStudyDto.prototype, "categories", void 0);
__decorate([
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ArrayMaxSize)(50),
    (0, class_validator_1.ValidateNested)({ each: true }),
    (0, class_transformer_1.Type)(() => StudyDocumentDto),
    __metadata("design:type", Array)
], CreateStudyDto.prototype, "documents", void 0);
//# sourceMappingURL=create-study.dto.js.map