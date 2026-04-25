import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bull';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UserModule } from './user/user.module';
import { ProjectModule } from './project/project.module';
import { ApplicationModule } from './application/application.module';
import { RegulatoryActivityModule } from './regulatory-activity/regulatory-activity.module';
import { SequenceModule } from './sequence/sequence.module';
import { ControlledVocabularyModule } from './controlled-vocabulary/controlled-vocabulary.module';
import { CtdTemplateModule } from './ctd-template/ctd-template.module';
import { DocumentModule } from './document/document.module';
import { ExportModule } from './export/export.module';
import { EctdModule } from './ectd/ectd.module';
import { StudyModule } from './study/study.module';
import { FileModule } from './file/file.module';
import { EditLockModule } from './edit-lock/edit-lock.module';
import { ApprovalModule } from './approval/approval.module';
import { CommentModule } from './comment/comment.module';
import { ActivityLogModule } from './activity-log/activity-log.module';
import { AssignmentModule } from './assignment/assignment.module';
import { NotificationModule } from './notification/notification.module';
import { CollaborationModule } from './collaboration/collaboration.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { HealthModule } from './health/health.module';
import { LicenseModule } from './license/license.module';

const queueProvider = process.env.QUEUE_PROVIDER || 'sync';
const bullRootImports =
  queueProvider === 'bull'
    ? [
        BullModule.forRoot({
          redis: {
            host: process.env.REDIS_HOST || 'localhost',
            port: parseInt(process.env.REDIS_PORT || '6379', 10),
            password: process.env.REDIS_PASSWORD || undefined,
          },
        }),
      ]
    : [];

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ...bullRootImports,
    PrismaModule,
    HealthModule,
    LicenseModule,
    AuthModule,
    UserModule,
    ProjectModule,
    ApplicationModule,
    RegulatoryActivityModule,
    SequenceModule,
    ControlledVocabularyModule,
    CtdTemplateModule,
    DocumentModule,
    ExportModule,
    EctdModule,
    StudyModule,
    FileModule,
    EditLockModule,
    ApprovalModule,
    CommentModule,
    ActivityLogModule,
    AssignmentModule,
    NotificationModule,
    CollaborationModule,
    DashboardModule,
  ],
})
export class AppModule {}
