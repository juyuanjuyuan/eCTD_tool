import { Module } from '@nestjs/common';
import { ApplicationController } from './application.controller';
import { ApplicationService } from './application.service';
import { ControlledVocabularyModule } from '../controlled-vocabulary/controlled-vocabulary.module';
import { SequenceModule } from '../sequence/sequence.module';

@Module({
  imports: [ControlledVocabularyModule, SequenceModule],
  controllers: [ApplicationController],
  providers: [ApplicationService],
  exports: [ApplicationService],
})
export class ApplicationModule {}
