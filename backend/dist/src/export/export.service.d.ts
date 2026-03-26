import type { Queue } from 'bull';
import { PrismaService } from '../prisma/prisma.service';
import { WordExportService } from './word-export.service';
import { PDFExportService } from './pdf-export.service';
import { PDFComplianceService, ComplianceResult } from './pdf-compliance.service';
import { MinioService } from '../file/minio.service';
export interface ExportResult {
    taskId: string;
    status: 'completed' | 'failed';
    buffer?: Buffer;
    fileName?: string;
    contentType?: string;
    complianceResult?: ComplianceResult;
    removedLinks?: string[];
    error?: string;
}
export declare class ExportService {
    private prisma;
    private wordExport;
    private pdfExport;
    private pdfCompliance;
    private exportQueue;
    private minioService?;
    constructor(prisma: PrismaService, wordExport: WordExportService, pdfExport: PDFExportService, pdfCompliance: PDFComplianceService, exportQueue: Queue, minioService?: MinioService | undefined);
    exportWordSingle(nodeId: string, headerText?: string): Promise<ExportResult>;
    exportPdfSingle(nodeId: string, headerText?: string): Promise<ExportResult>;
    exportWordBatch(sequenceId: string, nodeIds: string[], headerText?: string): Promise<{
        taskId: string;
    }>;
    exportPdfBatch(sequenceId: string, nodeIds: string[], headerText?: string): Promise<{
        taskId: string;
    }>;
    getTaskStatus(taskId: string): Promise<{
        status: string;
        progress: number;
        result?: any;
        error?: string;
    }>;
    getDownloadUrl(taskId: string): Promise<{
        url: string;
    }>;
    checkUploadedPdfCompliance(pdfBuffer: Buffer): Promise<ComplianceResult>;
    private getDocumentForExport;
}
