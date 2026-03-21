import { Module } from '@nestjs/common';
import { CtdTemplateController } from './ctd-template.controller';
import { CtdTemplateService } from './ctd-template.service';

@Module({
  controllers: [CtdTemplateController],
  providers: [CtdTemplateService],
  exports: [CtdTemplateService],
})
export class CtdTemplateModule {}
