export interface ComplianceIssue {
    ruleId: string;
    severity: 'error' | 'warning';
    message: string;
    detail?: string;
}
export interface ComplianceResult {
    isCompliant: boolean;
    errors: ComplianceIssue[];
    warnings: ComplianceIssue[];
    summary: {
        pdfVersion: string;
        pageCount: number;
        hasBookmarks: boolean;
        hasEncryption: boolean;
        fileSizeMB: number;
    };
}
export declare class PDFComplianceService {
    checkCompliance(pdfBuffer: Buffer): Promise<ComplianceResult>;
    private extractPDFVersion;
    private checkEncryption;
    private checkJavaScript;
    private checkExternalLinks;
    private checkMultimedia;
    private checkBookmarks;
    private checkBookmarkZoom;
    private checkAttachments;
    private checkFontEmbedding;
}
