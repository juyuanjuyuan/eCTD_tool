import { Injectable, NotFoundException, BadRequestException, Optional, Inject } from '@nestjs/common';
import type { IQueue } from '../common/queue/queue.interface';
import { PrismaService } from '../prisma/prisma.service';
import { WordExportService } from './word-export.service';
import { PDFExportService } from './pdf-export.service';
import { PDFComplianceService, ComplianceResult } from './pdf-compliance.service';
import { MinioService } from '../file/minio.service';

export interface ExportResult {
  taskId: string;
  status: 'completed' | 'failed' | 'compliance_warning';
  buffer?: Buffer;
  fileName?: string;
  contentType?: string;
  complianceResult?: ComplianceResult;
  removedLinks?: string[];
  error?: string;
}

@Injectable()
export class ExportService {
  constructor(
    private prisma: PrismaService,
    private wordExport: WordExportService,
    private pdfExport: PDFExportService,
    private pdfCompliance: PDFComplianceService,
    @Inject('EXPORT_QUEUE') private exportQueue: any,
    @Optional() @Inject(MinioService) private minioService?: MinioService,
  ) {}

  // ==================== Single Chapter Export ====================

  async exportWordSingle(nodeId: string, headerText?: string): Promise<ExportResult> {
    const { document, node } = await this.getDocumentForExport(nodeId);

    if (!document.contentJson) {
      throw new BadRequestException('文档内容为空，无法导出');
    }

    const buffer = await this.wordExport.exportDocument(document.contentJson as any, {
      headerText: headerText || `${node.ctdSectionNumber} ${node.title}`,
      sectionTitle: `${node.ctdSectionNumber} ${node.title}`,
    });

    const fileName = `${node.ctdSectionNumber.replace(/\./g, '-')}_${node.title}.docx`;

    return {
      taskId: `word-${nodeId}-${Date.now()}`,
      status: 'completed',
      buffer,
      fileName,
      contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    };
  }

  async exportPdfSingle(nodeId: string, headerText?: string): Promise<ExportResult> {
    const { document, node } = await this.getDocumentForExport(nodeId);

    if (!document.contentHtml) {
      throw new BadRequestException('文档内容为空，无法导出');
    }

    // Strip external links (eCTD requirement)
    const { html: cleanHtml, removedLinks } = this.pdfExport.stripExternalLinks(
      document.contentHtml,
    );

    // Generate PDF
    const pdfBuffer = await this.pdfExport.exportToPDF(cleanHtml, [], {
      headerText: headerText || `${node.ctdSectionNumber} ${node.title}`,
      sectionTitle: `${node.ctdSectionNumber} ${node.title}`,
    });

    // Run compliance check
    const complianceResult = await this.pdfCompliance.checkCompliance(pdfBuffer);

    const fileName = `${node.ctdSectionNumber.replace(/\./g, '-')}_${node.title}.pdf`;

    return {
      taskId: `pdf-${nodeId}-${Date.now()}`,
      status: complianceResult.isCompliant ? 'completed' : 'compliance_warning',
      buffer: pdfBuffer,
      fileName,
      contentType: 'application/pdf',
      complianceResult,
      removedLinks,
    };
  }

  // ==================== Batch Export (async via Bull Queue) ====================

  async exportWordBatch(
    sequenceId: string,
    nodeIds: string[],
    headerText?: string,
  ): Promise<{ taskId: string }> {
    const job = await this.exportQueue.add('word-batch', {
      sequenceId,
      nodeIds,
      headerText,
      format: 'word',
    });
    return { taskId: job.id.toString() };
  }

  async exportPdfBatch(
    sequenceId: string,
    nodeIds: string[],
    headerText?: string,
  ): Promise<{ taskId: string }> {
    const job = await this.exportQueue.add('pdf-batch', {
      sequenceId,
      nodeIds,
      headerText,
      format: 'pdf',
    });
    return { taskId: job.id.toString() };
  }

  // ==================== Task Status ====================

  async getTaskStatus(taskId: string): Promise<{
    status: string;
    progress: number;
    result?: any;
    error?: string;
  }> {
    const job = await this.exportQueue.getJob(taskId);
    if (!job) throw new NotFoundException(`导出任务 ${taskId} 不存在`);

    const state = await job.getState();
    const progress = job.progress() as number;

    return {
      status: state,
      progress: typeof progress === 'number' ? progress : 0,
      result: state === 'completed' ? job.returnvalue : undefined,
      error: state === 'failed' ? (job.failedReason || '未知错误') : undefined,
    };
  }

  // ==================== Download Batch Export Result ====================

  async getDownloadUrl(taskId: string): Promise<{ url: string }> {
    const job = await this.exportQueue.getJob(taskId);
    if (!job) throw new NotFoundException(`导出任务 ${taskId} 不存在`);

    const state = await job.getState();
    if (state !== 'completed') {
      throw new BadRequestException(`导出任务尚未完成，当前状态: ${state}`);
    }

    const result = job.returnvalue;
    if (!result?.downloadObjectName) {
      throw new NotFoundException('导出结果不可下载（未存储到文件系统）');
    }

    if (!this.minioService) {
      throw new BadRequestException('文件存储服务不可用');
    }

    const url = await this.minioService.getPresignedDownloadUrl(result.downloadObjectName);
    return { url };
  }

  // ==================== PDF Compliance Check (for user-uploaded PDFs) ====================

  async checkUploadedPdfCompliance(pdfBuffer: Buffer): Promise<ComplianceResult> {
    return this.pdfCompliance.checkCompliance(pdfBuffer);
  }

  // ==================== Helpers ====================

  private async getDocumentForExport(nodeId: string) {
    const node = await this.prisma.sequenceNode.findUnique({
      where: { id: nodeId },
    });
    if (!node) throw new NotFoundException('序列节点不存在');

    const document = await this.prisma.document.findUnique({
      where: { nodeId },
    });
    if (!document) throw new NotFoundException('文档不存在，请先在编辑器中输入内容');

    return { document, node };
  }
}
