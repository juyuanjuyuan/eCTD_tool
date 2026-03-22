import { Process, Processor } from '@nestjs/bull';
import type { Job } from 'bull';
import { PrismaService } from '../prisma/prisma.service';
import { WordExportService } from './word-export.service';
import { PDFExportService } from './pdf-export.service';
import { PDFComplianceService, ComplianceResult } from './pdf-compliance.service';

interface BatchJobData {
  sequenceId: string;
  nodeIds: string[];
  headerText?: string;
  format: 'word' | 'pdf';
}

interface BatchResult {
  format: string;
  totalNodes: number;
  successCount: number;
  failCount: number;
  files: Array<{
    nodeId: string;
    fileName: string;
    sizeBytes: number;
    complianceResult?: ComplianceResult;
    error?: string;
  }>;
}

@Processor('export')
export class ExportProcessor {
  constructor(
    private prisma: PrismaService,
    private wordExport: WordExportService,
    private pdfExport: PDFExportService,
    private pdfCompliance: PDFComplianceService,
  ) {}

  @Process('word-batch')
  async handleWordBatch(job: any): Promise<BatchResult> {
    const { nodeIds, headerText } = job.data;
    const result: BatchResult = {
      format: 'word',
      totalNodes: nodeIds.length,
      successCount: 0,
      failCount: 0,
      files: [],
    };

    for (let i = 0; i < nodeIds.length; i++) {
      const nodeId = nodeIds[i];
      try {
        const node = await this.prisma.sequenceNode.findUnique({ where: { id: nodeId } });
        const document = await this.prisma.document.findUnique({ where: { nodeId } });

        if (!node || !document?.contentJson) {
          result.failCount++;
          result.files.push({
            nodeId,
            fileName: '',
            sizeBytes: 0,
            error: '文档不存在或内容为空',
          });
          continue;
        }

        const buffer = await this.wordExport.exportDocument(document.contentJson as any, {
          headerText: headerText || `${node.ctdSectionNumber} ${node.title}`,
          sectionTitle: `${node.ctdSectionNumber} ${node.title}`,
        });

        const fileName = `${node.ctdSectionNumber.replace(/\./g, '-')}_${node.title}.docx`;
        result.successCount++;
        result.files.push({ nodeId, fileName, sizeBytes: buffer.length });
      } catch (err: any) {
        result.failCount++;
        result.files.push({
          nodeId,
          fileName: '',
          sizeBytes: 0,
          error: err.message,
        });
      }

      await job.progress(Math.round(((i + 1) / nodeIds.length) * 100));
    }

    return result;
  }

  @Process('pdf-batch')
  async handlePdfBatch(job: any): Promise<BatchResult> {
    const { nodeIds, headerText } = job.data;
    const result: BatchResult = {
      format: 'pdf',
      totalNodes: nodeIds.length,
      successCount: 0,
      failCount: 0,
      files: [],
    };

    for (let i = 0; i < nodeIds.length; i++) {
      const nodeId = nodeIds[i];
      try {
        const node = await this.prisma.sequenceNode.findUnique({ where: { id: nodeId } });
        const document = await this.prisma.document.findUnique({ where: { nodeId } });

        if (!node || !document?.contentHtml) {
          result.failCount++;
          result.files.push({
            nodeId,
            fileName: '',
            sizeBytes: 0,
            error: '文档不存在或内容为空',
          });
          continue;
        }

        // Strip external links
        const { html: cleanHtml } = this.pdfExport.stripExternalLinks(document.contentHtml);

        // Generate PDF
        const pdfBuffer = await this.pdfExport.exportToPDF(cleanHtml, [], {
          headerText: headerText || `${node.ctdSectionNumber} ${node.title}`,
          sectionTitle: `${node.ctdSectionNumber} ${node.title}`,
        });

        // Compliance check
        const complianceResult = await this.pdfCompliance.checkCompliance(pdfBuffer);

        const fileName = `${node.ctdSectionNumber.replace(/\./g, '-')}_${node.title}.pdf`;
        result.successCount++;
        result.files.push({
          nodeId,
          fileName,
          sizeBytes: pdfBuffer.length,
          complianceResult,
        });
      } catch (err: any) {
        result.failCount++;
        result.files.push({
          nodeId,
          fileName: '',
          sizeBytes: 0,
          error: err.message,
        });
      }

      await job.progress(Math.round(((i + 1) / nodeIds.length) * 100));
    }

    return result;
  }
}
