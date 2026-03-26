"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExportModule = void 0;
const common_1 = require("@nestjs/common");
const bull_1 = require("@nestjs/bull");
const export_controller_1 = require("./export.controller");
const export_service_1 = require("./export.service");
const export_processor_1 = require("./export.processor");
const word_export_service_1 = require("./word-export.service");
const pdf_export_service_1 = require("./pdf-export.service");
const pdf_compliance_service_1 = require("./pdf-compliance.service");
const file_module_1 = require("../file/file.module");
let ExportModule = class ExportModule {
};
exports.ExportModule = ExportModule;
exports.ExportModule = ExportModule = __decorate([
    (0, common_1.Module)({
        imports: [
            bull_1.BullModule.registerQueue({
                name: 'export',
                defaultJobOptions: {
                    removeOnComplete: 100,
                    removeOnFail: 50,
                    attempts: 1,
                },
            }),
            file_module_1.FileModule,
        ],
        controllers: [export_controller_1.ExportController],
        providers: [
            export_service_1.ExportService,
            export_processor_1.ExportProcessor,
            word_export_service_1.WordExportService,
            pdf_export_service_1.PDFExportService,
            pdf_compliance_service_1.PDFComplianceService,
        ],
        exports: [export_service_1.ExportService, pdf_compliance_service_1.PDFComplianceService],
    })
], ExportModule);
//# sourceMappingURL=export.module.js.map