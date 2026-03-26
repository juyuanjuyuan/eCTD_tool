import { OnModuleDestroy } from '@nestjs/common';
interface PDFExportOptions {
    headerText?: string;
    sectionTitle?: string;
}
interface HeadingInfo {
    text: string;
    level: number;
    pageIndex: number;
}
export declare class PDFExportService implements OnModuleDestroy {
    private browser;
    private readonly pagePool;
    private readonly maxPoolSize;
    private readonly pageWaiters;
    onModuleDestroy(): Promise<void>;
    private acquirePage;
    private releasePage;
    exportToPDF(contentHtml: string, headings: HeadingInfo[], options?: PDFExportOptions): Promise<Buffer>;
    private extractHeadingsFromPage;
    private postProcessPDF;
    private addBookmarks;
    private wrapWithEctdCss;
    stripExternalLinks(html: string): {
        html: string;
        removedLinks: string[];
    };
}
export {};
