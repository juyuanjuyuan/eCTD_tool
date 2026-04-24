import { PrismaService } from '../prisma/prisma.service';
import { MinioService } from './minio.service';
import { FileNameNormalizerService } from './file-name-normalizer.service';
import { PDFComplianceService } from '../export/pdf-compliance.service';
export declare class FileService {
    private prisma;
    private minio;
    private normalizer;
    private pdfCompliance;
    private readonly logger;
    private readonly chunkStore;
    private cleanupTimer;
    constructor(prisma: PrismaService, minio: MinioService, normalizer: FileNameNormalizerService, pdfCompliance: PDFComplianceService);
    onModuleDestroy(): void;
    handleChunk(nodeId: string, params: {
        uploadId: string;
        chunkIndex: number;
        totalChunks: number;
        fileName: string;
        chunkBuffer: Buffer;
        userId?: string;
    }): Promise<any>;
    private uploadFileFromDisk;
    private cleanupAbandonedUploads;
    private cleanupTempDir;
    uploadFile(nodeId: string, file: Express.Multer.File, uploadedBy?: string): Promise<any>;
    uploadFiles(nodeId: string, files: Express.Multer.File[], uploadedBy?: string): Promise<any[]>;
    listFiles(nodeId: string): Promise<any[]>;
    getFile(nodeId: string, fileId: string): Promise<any>;
    updateExportName(nodeId: string, fileId: string, exportName: string | null | undefined): Promise<any>;
    deleteFile(nodeId: string, fileId: string): Promise<{
        success: boolean;
    }>;
    getDownloadUrl(nodeId: string, fileId: string): Promise<{
        url: string;
        originalName: string;
    }>;
    getPreviewUrl(nodeId: string, fileId: string): Promise<{
        url: string;
    }>;
    createFileReference(nodeId: string, sourceFileId: string, uploadedBy?: string): Promise<any>;
    listReferenceableFiles(nodeId: string): Promise<any[]>;
    uploadEditorImage(sequenceId: string, file: Express.Multer.File): Promise<{
        url: string;
    }>;
    private analyzePdf;
    private getOriginalStoragePath;
    private serializeAttachment;
    private getImageContentType;
}
