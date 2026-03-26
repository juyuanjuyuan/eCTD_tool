export declare class Md5Service {
    calculateMd5(buffer: Buffer): string;
    calculateMd5String(content: string): string;
    generateIndexMd5(files: {
        fileName: string;
        content: string;
    }[]): string;
    generateLeafId(): string;
}
