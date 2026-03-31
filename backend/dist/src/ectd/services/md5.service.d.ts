export declare class Md5Service {
    calculateMd5(buffer: Buffer): string;
    calculateMd5String(content: string): string;
    generateIndexMd5(files: Array<{
        fileName: string;
        content?: string;
        md5?: string;
    }>): string;
    generateLeafId(): string;
    generateDeterministicLeafId(sequenceId: string, nodeId: string, fileIndex?: number): string;
}
