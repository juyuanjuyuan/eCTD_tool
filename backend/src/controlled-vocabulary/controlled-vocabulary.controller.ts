import { BadRequestException, Controller, Get, Param, Query } from '@nestjs/common';
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

  // ==================== STF controlled vocabulary ====================

  @Get('stf/categories')
  getStfCategories() {
    return this.cvService.getStfCategories();
  }

  @Get('stf/categories/:name')
  getStfCategoryValues(@Param('name') name: string) {
    return this.cvService.getStfCategoryValues(name);
  }

  @Get('stf/file-tags')
  getStfFileTags(@Query('module') module?: string) {
    if (module !== 'm4' && module !== 'm5') {
      throw new BadRequestException(
        "Query parameter 'module' must be either 'm4' or 'm5'",
      );
    }
    return this.cvService.getStfFileTags(module);
  }
}
