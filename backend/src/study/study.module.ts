import { Module } from '@nestjs/common';
import { StudyController } from './study.controller';
import { StudyService } from './study.service';
import { StudyTaggingFileImportService } from './study-tagging-file-import.service';
import { ControlledVocabularyModule } from '../controlled-vocabulary/controlled-vocabulary.module';
import { EctdModule } from '../ectd/ectd.module';
import { FileModule } from '../file/file.module';

/**
 * StudyModule — Plan 12 v2 STF orchestration. Reuses StudyTaggingFileService
 * (a pure XML in/out service) exported from EctdModule, the CV table exposed
 * by ControlledVocabularyModule, and MinioService (for bundle-mode STF
 * import) exposed by FileModule.
 */
@Module({
  imports: [ControlledVocabularyModule, EctdModule, FileModule],
  controllers: [StudyController],
  providers: [StudyService, StudyTaggingFileImportService],
  exports: [StudyService, StudyTaggingFileImportService],
})
export class StudyModule {}
