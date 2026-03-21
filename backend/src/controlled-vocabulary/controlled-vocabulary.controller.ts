import { Controller, Get, Query } from '@nestjs/common';
import { ControlledVocabularyService } from './controlled-vocabulary.service';

@Controller('api/v1/cv')
export class ControlledVocabularyController {
  constructor(private readonly cvService: ControlledVocabularyService) {}

  @Get('application-types')
  getApplicationTypes() {
    return this.cvService.getApplicationTypes();
  }

  @Get('product-types')
  getProductTypes() {
    return this.cvService.getProductTypes();
  }

  @Get('regulatory-activity-types')
  getRegulatoryActivityTypes(@Query('appType') appType?: string) {
    return this.cvService.getRegulatoryActivityTypes(appType);
  }

  @Get('sequence-types')
  getSequenceTypes(
    @Query('appType') appType?: string,
    @Query('ratType') ratType?: string,
  ) {
    return this.cvService.getSequenceTypes(appType, ratType);
  }
}
