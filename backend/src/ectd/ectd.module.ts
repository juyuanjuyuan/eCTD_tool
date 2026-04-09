import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { FileModule } from '../file/file.module';
import { EctdController } from './ectd.controller';
import { CnRegionalXmlService } from './services/cn-regional-xml.service';
import { IndexXmlService } from './services/index-xml.service';
import { LifecycleService } from './services/lifecycle.service';
import { ValidatorService } from './services/validator.service';
import { PackageAssemblerService } from './services/package-assembler.service';
import { Md5Service } from './services/md5.service';
import { StudyTaggingFileService } from './services/study-tagging-file.service';

// NOTE: Plan 12 — v1 StfService removed. v2 study services live under
// `backend/src/study/` (added in P3) and are wired via StudyModule.
// StudyTaggingFileService (v2) is a pure XML-in/XML-out service added by
// Plan 12 P2; it stays in the ectd module because every consumer of it
// (package-assembler, validator, study.service in P3) is downstream of ectd.

@Module({
  imports: [PrismaModule, FileModule],
  controllers: [EctdController],
  providers: [
    CnRegionalXmlService,
    IndexXmlService,
    LifecycleService,
    ValidatorService,
    PackageAssemblerService,
    Md5Service,
    StudyTaggingFileService,
  ],
  exports: [
    CnRegionalXmlService,
    IndexXmlService,
    LifecycleService,
    ValidatorService,
    PackageAssemblerService,
    Md5Service,
    StudyTaggingFileService,
  ],
})
export class EctdModule {}
