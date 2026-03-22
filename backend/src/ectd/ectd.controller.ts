import {
  Controller,
  Post,
  Get,
  Put,
  Param,
  Body,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CnRegionalXmlService } from './services/cn-regional-xml.service';
import { IndexXmlService } from './services/index-xml.service';
import { StfService } from './services/stf.service';
import { LifecycleService } from './services/lifecycle.service';
import { ValidatorService } from './services/validator.service';
import { PackageAssemblerService } from './services/package-assembler.service';
import { Md5Service } from './services/md5.service';
import { SaveStfDto, ValidateOperationDto } from './dto';
import { LeafOperation } from '@prisma/client';

@Controller('api/v1')
@UseGuards(JwtAuthGuard)
export class EctdController {
  constructor(
    private cnRegionalXml: CnRegionalXmlService,
    private indexXml: IndexXmlService,
    private stfService: StfService,
    private lifecycle: LifecycleService,
    private validator: ValidatorService,
    private packageAssembler: PackageAssemblerService,
    private md5Service: Md5Service,
  ) {}

  // ==================== XML Preview ====================

  @Get('sequences/:seqId/xml/cn-regional')
  async previewCnRegionalXml(@Param('seqId') seqId: string) {
    const xml = await this.cnRegionalXml.generateCnRegionalXml(seqId);
    return { xml };
  }

  @Get('sequences/:seqId/xml/index')
  async previewIndexXml(@Param('seqId') seqId: string) {
    const xml = await this.indexXml.generateIndexXml(seqId);
    return { xml };
  }

  // ==================== STF Management ====================

  @Get('nodes/:nodeId/stf')
  async getStf(@Param('nodeId') nodeId: string) {
    return this.stfService.getStf(nodeId);
  }

  @Put('nodes/:nodeId/stf')
  async saveStf(@Param('nodeId') nodeId: string, @Body() dto: SaveStfDto) {
    return this.stfService.saveStf(nodeId, dto);
  }

  @Get('stf/categories')
  getStfCategories() {
    return this.stfService.getCategories();
  }

  @Get('stf/file-tags')
  getStfFileTags() {
    return this.stfService.getFileTags();
  }

  // ==================== Lifecycle Operations ====================

  @Post('sequences/:seqId/nodes/:nodeId/validate-operation')
  async validateOperation(
    @Param('seqId') seqId: string,
    @Param('nodeId') nodeId: string,
    @Body() dto: ValidateOperationDto,
  ) {
    const operation = dto.operation.toUpperCase() as LeafOperation;
    return this.lifecycle.validateOperation(seqId, nodeId, operation);
  }

  @Get('sequences/:seqId/parallel-conflicts')
  async checkParallelConflicts(@Param('seqId') seqId: string) {
    return this.lifecycle.checkParallelConflicts(seqId);
  }

  @Post('sequences/:seqId/withdraw-preview')
  async previewWithdraw(@Param('seqId') seqId: string) {
    return this.lifecycle.generateWithdrawOperations(seqId);
  }

  // ==================== Validation ====================

  @Post('sequences/:seqId/validate')
  async runValidation(@Param('seqId') seqId: string) {
    return this.validator.validate(seqId);
  }

  @Get('sequences/:seqId/validate/latest')
  async getLatestReport(@Param('seqId') seqId: string) {
    return this.validator.getLatestReport(seqId);
  }

  @Get('sequences/:seqId/validate/report/:reportId')
  async getReport(@Param('reportId') reportId: string) {
    return this.validator.getReport(reportId);
  }

  // ==================== Package Assembly ====================

  @Get('sequences/:seqId/export/ectd-preview')
  async previewPackage(@Param('seqId') seqId: string) {
    const paths = await this.packageAssembler.previewStructure(seqId);
    return { paths };
  }

  @Post('sequences/:seqId/export/ectd-package')
  async exportPackage(@Param('seqId') seqId: string, @Res() res: Response) {
    const { buffer, fileName } = await this.packageAssembler.assemblePackage(seqId);

    res.set({
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(fileName)}"`,
      'Content-Length': buffer.length.toString(),
    });
    res.send(buffer);
  }
}
