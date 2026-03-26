export declare enum ExportFormat {
    WORD = "word",
    PDF = "pdf"
}
export declare class ExportSingleDto {
    nodeId: string;
    headerText?: string;
}
export declare class ExportBatchDto {
    nodeIds: string[];
    headerText?: string;
}
export declare class ExportTaskResultDto {
    taskId: string;
    status: 'pending' | 'processing' | 'completed' | 'failed';
    progress?: number;
    downloadUrl?: string;
    error?: string;
    complianceResults?: any;
}
