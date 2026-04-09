"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EctdModule = void 0;
const common_1 = require("@nestjs/common");
const prisma_module_1 = require("../prisma/prisma.module");
const file_module_1 = require("../file/file.module");
const ectd_controller_1 = require("./ectd.controller");
const cn_regional_xml_service_1 = require("./services/cn-regional-xml.service");
const index_xml_service_1 = require("./services/index-xml.service");
const lifecycle_service_1 = require("./services/lifecycle.service");
const validator_service_1 = require("./services/validator.service");
const package_assembler_service_1 = require("./services/package-assembler.service");
const md5_service_1 = require("./services/md5.service");
const study_tagging_file_service_1 = require("./services/study-tagging-file.service");
let EctdModule = class EctdModule {
};
exports.EctdModule = EctdModule;
exports.EctdModule = EctdModule = __decorate([
    (0, common_1.Module)({
        imports: [prisma_module_1.PrismaModule, file_module_1.FileModule],
        controllers: [ectd_controller_1.EctdController],
        providers: [
            cn_regional_xml_service_1.CnRegionalXmlService,
            index_xml_service_1.IndexXmlService,
            lifecycle_service_1.LifecycleService,
            validator_service_1.ValidatorService,
            package_assembler_service_1.PackageAssemblerService,
            md5_service_1.Md5Service,
            study_tagging_file_service_1.StudyTaggingFileService,
        ],
        exports: [
            cn_regional_xml_service_1.CnRegionalXmlService,
            index_xml_service_1.IndexXmlService,
            lifecycle_service_1.LifecycleService,
            validator_service_1.ValidatorService,
            package_assembler_service_1.PackageAssemblerService,
            md5_service_1.Md5Service,
            study_tagging_file_service_1.StudyTaggingFileService,
        ],
    })
], EctdModule);
//# sourceMappingURL=ectd.module.js.map