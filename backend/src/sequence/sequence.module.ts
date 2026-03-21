import { Module } from '@nestjs/common';
import { SequenceController } from './sequence.controller';
import { SequenceService } from './sequence.service';
import { ControlledVocabularyModule } from '../controlled-vocabulary/controlled-vocabulary.module';

@Module({
  imports: [ControlledVocabularyModule],
  controllers: [SequenceController],
  providers: [SequenceService],
  exports: [SequenceService],
})
export class SequenceModule {}
