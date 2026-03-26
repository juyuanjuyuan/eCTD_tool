export declare const ALLOWED_EXTENSIONS: Set<string>;
export declare class FileNameNormalizerService {
    normalizeFileName(name: string): string;
    validateExtension(filename: string): void;
    validateFileSize(size: number, filename: string): void;
    buildEctdRelativePath(ctdSectionNumber: string, normalizedFileName: string): string;
    buildStoragePath(projectId: string, applicationNumber: string, sequenceNumber: string, ectdRelativePath: string): string;
    getSectionFolder(ctdSectionNumber: string): string;
    isCompliantFileName(name: string): boolean;
    validatePathSeparators(path: string): void;
    private getExtension;
}
