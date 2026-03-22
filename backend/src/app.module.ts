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

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    BullModule.forRoot({
      redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379', 10),
      },
    }),
    PrismaModule,
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
  ],
})
export class AppModule {}
