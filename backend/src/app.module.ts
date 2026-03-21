import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UserModule } from './user/user.module';
import { ProjectModule } from './project/project.module';
import { ApplicationModule } from './application/application.module';
import { RegulatoryActivityModule } from './regulatory-activity/regulatory-activity.module';
import { SequenceModule } from './sequence/sequence.module';
import { ControlledVocabularyModule } from './controlled-vocabulary/controlled-vocabulary.module';
import { CtdTemplateModule } from './ctd-template/ctd-template.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    UserModule,
    ProjectModule,
    ApplicationModule,
    RegulatoryActivityModule,
    SequenceModule,
    ControlledVocabularyModule,
    CtdTemplateModule,
  ],
})
export class AppModule {}
