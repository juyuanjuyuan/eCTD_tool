"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const prisma_module_1 = require("./prisma/prisma.module");
const auth_module_1 = require("./auth/auth.module");
const user_module_1 = require("./user/user.module");
const project_module_1 = require("./project/project.module");
const application_module_1 = require("./application/application.module");
const regulatory_activity_module_1 = require("./regulatory-activity/regulatory-activity.module");
const sequence_module_1 = require("./sequence/sequence.module");
const controlled_vocabulary_module_1 = require("./controlled-vocabulary/controlled-vocabulary.module");
const ctd_template_module_1 = require("./ctd-template/ctd-template.module");
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            config_1.ConfigModule.forRoot({ isGlobal: true }),
            prisma_module_1.PrismaModule,
            auth_module_1.AuthModule,
            user_module_1.UserModule,
            project_module_1.ProjectModule,
            application_module_1.ApplicationModule,
            regulatory_activity_module_1.RegulatoryActivityModule,
            sequence_module_1.SequenceModule,
            controlled_vocabulary_module_1.ControlledVocabularyModule,
            ctd_template_module_1.CtdTemplateModule,
        ],
    })
], AppModule);
//# sourceMappingURL=app.module.js.map