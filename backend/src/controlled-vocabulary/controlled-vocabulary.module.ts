import { Module } from '@nestjs/common';
import { ControlledVocabularyController } from './controlled-vocabulary.controller';
import { ControlledVocabularyService } from './controlled-vocabulary.service';

@Module({
  controllers: [ControlledVocabularyController],
  providers: [ControlledVocabularyService],
  exports: [ControlledVocabularyService],
})
export class ControlledVocabularyModule {}
