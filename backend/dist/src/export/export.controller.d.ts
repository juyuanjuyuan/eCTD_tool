import { ExportService } from './export.service';
import { ExportSingleDto, ExportBatchDto } from './dto';
export declare class ExportController {
    private readonly exportService;
    constructor(exportService: ExportService);
    exportWord(_seqId: string, dto: ExportSingleDto, res: any): Promise<any>;
    exportWordBatch(seqId: string, dto: ExportBatchDto): Promise<{
        taskId: string;
    }>;
    exportPdf(_seqId: string, dto: ExportSingleDto, res: any): Promise<any>;
    exportPdfBatch(seqId: string, dto: ExportBatchDto): Promise<{
        taskId: string;
    }>;
    getTaskStatus(taskId: string): Promise<{
        status: string;
        progress: number;
        result?: any;
        error?: string;
    }>;
    downloadResult(taskId: string): Promise<{
        url: string;
    }>;
}
