import { PrismaService } from '../prisma/prisma.service';
import { WordExportService } from './word-export.service';
import { PDFExportService } from './pdf-export.service';
import { PDFComplianceService, ComplianceResult } from './pdf-compliance.service';
import { MinioService } from '../file/minio.service';
interface BatchResult {
    format: string;
    totalNodes: number;
    successCount: number;
    failCount: number;
    downloadObjectName?: string;
    files: Array<{
        nodeId: string;
        fileName: string;
        sizeBytes: number;
        complianceResult?: ComplianceResult;
        error?: string;
    }>;
}
export declare class ExportProcessor {
    private prisma;
    private wordExport;
    private pdfExport;
    private pdfCompliance;
    private minioService?;
    constructor(prisma: PrismaService, wordExport: WordExportService, pdfExport: PDFExportService, pdfCompliance: PDFComplianceService, minioService?: MinioService | undefined);
    handleWordBatch(job: any): Promise<BatchResult>;
    handlePdfBatch(job: any): Promise<BatchResult>;
    private uploadZipToMinio;
}
export {};
