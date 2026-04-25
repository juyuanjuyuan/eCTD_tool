"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FileModule = void 0;
const common_1 = require("@nestjs/common");
const prisma_module_1 = require("../prisma/prisma.module");
const file_controller_1 = require("./file.controller");
const file_serve_controller_1 = require("./file-serve.controller");
const file_service_1 = require("./file.service");
const minio_service_1 = require("./minio.service");
const file_name_normalizer_service_1 = require("./file-name-normalizer.service");
const pdf_compliance_service_1 = require("../export/pdf-compliance.service");
let FileModule = class FileModule {
};
exports.FileModule = FileModule;
exports.FileModule = FileModule = __decorate([
    (0, common_1.Module)({
        imports: [prisma_module_1.PrismaModule],
        controllers: [file_controller_1.FileController, file_serve_controller_1.FileServeController],
        providers: [
            file_service_1.FileService,
            minio_service_1.MinioService,
            file_name_normalizer_service_1.FileNameNormalizerService,
            pdf_compliance_service_1.PDFComplianceService,
        ],
        exports: [
            file_service_1.FileService,
            minio_service_1.MinioService,
            file_name_normalizer_service_1.FileNameNormalizerService,
        ],
    })
], FileModule);
//# sourceMappingURL=file.module.js.map