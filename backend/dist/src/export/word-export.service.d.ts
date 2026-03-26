interface ExportOptions {
    headerText?: string;
    sectionTitle?: string;
}
interface TipTapNode {
    type: string;
    attrs?: Record<string, any>;
    content?: TipTapNode[];
    marks?: Array<{
        type: string;
        attrs?: Record<string, any>;
    }>;
    text?: string;
}
export declare class WordExportService {
    exportDocument(contentJson: TipTapNode, options?: ExportOptions): Promise<Buffer>;
    private convertContent;
    private convertNode;
    private convertHeading;
    private convertParagraph;
    private convertList;
    private convertTable;
    private convertBlockquote;
    private convertHorizontalRule;
    private convertImagePlaceholder;
    private convertInlineContent;
    private getAlignment;
}
export {};
