"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SequenceModule = void 0;
const common_1 = require("@nestjs/common");
const sequence_controller_1 = require("./sequence.controller");
const sequence_service_1 = require("./sequence.service");
const controlled_vocabulary_module_1 = require("../controlled-vocabulary/controlled-vocabulary.module");
let SequenceModule = class SequenceModule {
};
exports.SequenceModule = SequenceModule;
exports.SequenceModule = SequenceModule = __decorate([
    (0, common_1.Module)({
        imports: [controlled_vocabulary_module_1.ControlledVocabularyModule],
        controllers: [sequence_controller_1.SequenceController],
        providers: [sequence_service_1.SequenceService],
        exports: [sequence_service_1.SequenceService],
    })
], SequenceModule);
//# sourceMappingURL=sequence.module.js.map