"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.StudyModule = void 0;
const common_1 = require("@nestjs/common");
const study_controller_1 = require("./study.controller");
const study_service_1 = require("./study.service");
const study_tagging_file_import_service_1 = require("./study-tagging-file-import.service");
const controlled_vocabulary_module_1 = require("../controlled-vocabulary/controlled-vocabulary.module");
const ectd_module_1 = require("../ectd/ectd.module");
const file_module_1 = require("../file/file.module");
let StudyModule = class StudyModule {
};
exports.StudyModule = StudyModule;
exports.StudyModule = StudyModule = __decorate([
    (0, common_1.Module)({
        imports: [controlled_vocabulary_module_1.ControlledVocabularyModule, ectd_module_1.EctdModule, file_module_1.FileModule],
        controllers: [study_controller_1.StudyController],
        providers: [study_service_1.StudyService, study_tagging_file_import_service_1.StudyTaggingFileImportService],
        exports: [study_service_1.StudyService, study_tagging_file_import_service_1.StudyTaggingFileImportService],
    })
], StudyModule);
//# sourceMappingURL=study.module.js.map