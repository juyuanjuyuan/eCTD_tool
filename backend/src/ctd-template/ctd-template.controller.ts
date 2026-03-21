import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CtdTemplateService } from './ctd-template.service';
import {
  UpdateSequenceNodeDto,
  UpdateBackboneAttributesDto,
  CreateExtensionNodeDto,
} from './dto';

@Controller('api/v1')
@UseGuards(JwtAuthGuard)
export class CtdTemplateController {
  constructor(private readonly ctdTemplateService: CtdTemplateService) {}

  // ==================== Template Tree ====================

  @Get('ctd-templates/tree')
  getTemplateTree(
    @Query('appType') appType?: string,
    @Query('ratType') ratType?: string,
  ) {
    if (appType && ratType) {
      return this.ctdTemplateService.getTemplateTreeWithRules(appType, ratType);
    }
    return this.ctdTemplateService.getTemplateTree();
  }

  @Get('ctd-templates/extension-options')
  getExtensionOptions() {
    return this.ctdTemplateService.getExtensionNodeOptions();
  }

  // ==================== Sequence Node Operations ====================

  @Post('sequences/:seqId/initialize')
  initializeSequence(@Param('seqId') seqId: string) {
    return this.ctdTemplateService.initializeSequenceNodes(seqId);
  }

  @Get('sequences/:seqId/nodes/tree')
  getSequenceNodeTree(@Param('seqId') seqId: string) {
    return this.ctdTemplateService.getSequenceNodeTree(seqId);
  }

  @Patch('sequences/:seqId/nodes/:nodeId')
  updateSequenceNode(
    @Param('seqId') seqId: string,
    @Param('nodeId') nodeId: string,
    @Body() dto: UpdateSequenceNodeDto,
  ) {
    return this.ctdTemplateService.updateSequenceNode(seqId, nodeId, dto);
  }

  @Patch('sequences/:seqId/nodes/:nodeId/attributes')
  updateBackboneAttributes(
    @Param('seqId') seqId: string,
    @Param('nodeId') nodeId: string,
    @Body() dto: UpdateBackboneAttributesDto,
  ) {
    return this.ctdTemplateService.updateBackboneAttributes(seqId, nodeId, dto);
  }

  // ==================== Extension Nodes ====================

  @Post('sequences/:seqId/nodes/:parentNodeId/extensions')
  createExtensionNode(
    @Param('seqId') seqId: string,
    @Param('parentNodeId') parentNodeId: string,
    @Body() dto: CreateExtensionNodeDto,
  ) {
    return this.ctdTemplateService.createExtensionNode(seqId, parentNodeId, dto);
  }

  @Delete('sequences/:seqId/nodes/:nodeId/extension')
  deleteExtensionNode(
    @Param('seqId') seqId: string,
    @Param('nodeId') nodeId: string,
  ) {
    return this.ctdTemplateService.deleteExtensionNode(seqId, nodeId);
  }

  // ==================== Completeness Check ====================

  @Get('sequences/:seqId/completeness')
  checkCompleteness(@Param('seqId') seqId: string) {
    return this.ctdTemplateService.checkCompleteness(seqId);
  }
}
