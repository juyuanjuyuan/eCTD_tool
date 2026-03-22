import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ExportService } from './export.service';
import { ExportSingleDto, ExportBatchDto } from './dto';

@Controller('api/v1/sequences/:seqId/export')
@UseGuards(JwtAuthGuard)
export class ExportController {
  constructor(private readonly exportService: ExportService) {}

  // ==================== Word Export ====================

  @Post('word')
  async exportWord(
    @Param('seqId') _seqId: string,
    @Body() dto: ExportSingleDto,
    @Res() res: any,
  ) {
    const result = await this.exportService.exportWordSingle(dto.nodeId, dto.headerText);

    if (!result.buffer) {
      return res.status(500).json({ message: '导出失败' });
    }

    res.setHeader('Content-Type', result.contentType!);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(result.fileName!)}`,
    );
    res.send(result.buffer);
  }

  @Post('word/batch')
  async exportWordBatch(
    @Param('seqId') seqId: string,
    @Body() dto: ExportBatchDto,
  ) {
    return this.exportService.exportWordBatch(seqId, dto.nodeIds, dto.headerText);
  }

  // ==================== PDF Export ====================

  @Post('pdf')
  async exportPdf(
    @Param('seqId') _seqId: string,
    @Body() dto: ExportSingleDto,
    @Res() res: any,
  ) {
    const result = await this.exportService.exportPdfSingle(dto.nodeId, dto.headerText);

    if (!result.buffer) {
      return res.status(500).json({ message: '导出失败' });
    }

    // If there are compliance errors, return them as JSON instead of file
    if (result.complianceResult && !result.complianceResult.isCompliant) {
      return res.json({
        status: 'compliance_error',
        message: 'PDF 未通过 eCTD 合规检查，无法导出',
        complianceResult: result.complianceResult,
        removedLinks: result.removedLinks,
      });
    }

    res.setHeader('Content-Type', result.contentType!);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(result.fileName!)}`,
    );
    res.send(result.buffer);
  }

  @Post('pdf/batch')
  async exportPdfBatch(
    @Param('seqId') seqId: string,
    @Body() dto: ExportBatchDto,
  ) {
    return this.exportService.exportPdfBatch(seqId, dto.nodeIds, dto.headerText);
  }

  // ==================== Task Status ====================

  @Get('status/:taskId')
  async getTaskStatus(@Param('taskId') taskId: string) {
    return this.exportService.getTaskStatus(taskId);
  }

  // ==================== Download ====================

  @Get('download/:taskId')
  async downloadResult(@Param('taskId') taskId: string) {
    return this.exportService.getDownloadUrl(taskId);
  }
}
