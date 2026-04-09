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
const bull_1 = require("@nestjs/bull");
const prisma_module_1 = require("./prisma/prisma.module");
const auth_module_1 = require("./auth/auth.module");
const user_module_1 = require("./user/user.module");
const project_module_1 = require("./project/project.module");
const application_module_1 = require("./application/application.module");
const regulatory_activity_module_1 = require("./regulatory-activity/regulatory-activity.module");
const sequence_module_1 = require("./sequence/sequence.module");
const controlled_vocabulary_module_1 = require("./controlled-vocabulary/controlled-vocabulary.module");
const ctd_template_module_1 = require("./ctd-template/ctd-template.module");
const document_module_1 = require("./document/document.module");
const export_module_1 = require("./export/export.module");
const ectd_module_1 = require("./ectd/ectd.module");
const study_module_1 = require("./study/study.module");
const file_module_1 = require("./file/file.module");
const edit_lock_module_1 = require("./edit-lock/edit-lock.module");
const approval_module_1 = require("./approval/approval.module");
const comment_module_1 = require("./comment/comment.module");
const activity_log_module_1 = require("./activity-log/activity-log.module");
const assignment_module_1 = require("./assignment/assignment.module");
const notification_module_1 = require("./notification/notification.module");
const collaboration_module_1 = require("./collaboration/collaboration.module");
const dashboard_module_1 = require("./dashboard/dashboard.module");
const health_module_1 = require("./health/health.module");
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            config_1.ConfigModule.forRoot({ isGlobal: true }),
            bull_1.BullModule.forRoot({
                redis: {
                    host: process.env.REDIS_HOST || 'localhost',
                    port: parseInt(process.env.REDIS_PORT || '6379', 10),
                    password: process.env.REDIS_PASSWORD || undefined,
                },
            }),
            prisma_module_1.PrismaModule,
            health_module_1.HealthModule,
            auth_module_1.AuthModule,
            user_module_1.UserModule,
            project_module_1.ProjectModule,
            application_module_1.ApplicationModule,
            regulatory_activity_module_1.RegulatoryActivityModule,
            sequence_module_1.SequenceModule,
            controlled_vocabulary_module_1.ControlledVocabularyModule,
            ctd_template_module_1.CtdTemplateModule,
            document_module_1.DocumentModule,
            export_module_1.ExportModule,
            ectd_module_1.EctdModule,
            study_module_1.StudyModule,
            file_module_1.FileModule,
            edit_lock_module_1.EditLockModule,
            approval_module_1.ApprovalModule,
            comment_module_1.CommentModule,
            activity_log_module_1.ActivityLogModule,
            assignment_module_1.AssignmentModule,
            notification_module_1.NotificationModule,
            collaboration_module_1.CollaborationModule,
            dashboard_module_1.DashboardModule,
        ],
    })
], AppModule);
//# sourceMappingURL=app.module.js.map