import { Module } from '@nestjs/common';
import { RegulatoryActivityController } from './regulatory-activity.controller';
import { RegulatoryActivityService } from './regulatory-activity.service';
import { ControlledVocabularyModule } from '../controlled-vocabulary/controlled-vocabulary.module';

@Module({
  imports: [ControlledVocabularyModule],
  controllers: [RegulatoryActivityController],
  providers: [RegulatoryActivityService],
  exports: [RegulatoryActivityService],
})
export class RegulatoryActivityModule {}
