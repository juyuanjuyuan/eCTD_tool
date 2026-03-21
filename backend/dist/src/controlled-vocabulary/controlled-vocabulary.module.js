"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ControlledVocabularyModule = void 0;
const common_1 = require("@nestjs/common");
const controlled_vocabulary_controller_1 = require("./controlled-vocabulary.controller");
const controlled_vocabulary_service_1 = require("./controlled-vocabulary.service");
let ControlledVocabularyModule = class ControlledVocabularyModule {
};
exports.ControlledVocabularyModule = ControlledVocabularyModule;
exports.ControlledVocabularyModule = ControlledVocabularyModule = __decorate([
    (0, common_1.Module)({
        controllers: [controlled_vocabulary_controller_1.ControlledVocabularyController],
        providers: [controlled_vocabulary_service_1.ControlledVocabularyService],
        exports: [controlled_vocabulary_service_1.ControlledVocabularyService],
    })
], ControlledVocabularyModule);
//# sourceMappingURL=controlled-vocabulary.module.js.map