import { Module } from '@nestjs/common';
import { ApplicationController } from './application.controller';
import { ApplicationService } from './application.service';
import { ControlledVocabularyModule } from '../controlled-vocabulary/controlled-vocabulary.module';

@Module({
  imports: [ControlledVocabularyModule],
  controllers: [ApplicationController],
  providers: [ApplicationService],
  exports: [ApplicationService],
})
export class ApplicationModule {}
