import { FileService } from './file.service';
import { CreateFileReferenceDto } from './dto';
export declare class FileController {
    private fileService;
    constructor(fileService: FileService);
    uploadFile(nodeId: string, file: Express.Multer.File, req: any): Promise<any>;
    uploadFiles(nodeId: string, files: Express.Multer.File[], req: any): Promise<any[]>;
    uploadChunk(nodeId: string, chunk: Express.Multer.File, uploadId: string, chunkIndex: string, totalChunks: string, fileName: string, req: any): Promise<any>;
    listFiles(nodeId: string): Promise<any[]>;
    getFile(nodeId: string, id: string): Promise<any>;
    deleteFile(nodeId: string, id: string): Promise<{
        success: boolean;
    }>;
    downloadFile(nodeId: string, id: string): Promise<{
        url: string;
        originalName: string;
    }>;
    previewFile(nodeId: string, id: string): Promise<{
        url: string;
    }>;
    createReference(nodeId: string, dto: CreateFileReferenceDto, req: any): Promise<any>;
    listReferenceableFiles(nodeId: string): Promise<any[]>;
    uploadEditorImage(seqId: string, file: Express.Multer.File): Promise<{
        url: string;
    }>;
}
