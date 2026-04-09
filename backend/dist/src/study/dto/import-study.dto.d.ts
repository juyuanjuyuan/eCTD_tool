export type ImportOnConflict = 'reject' | 'overwrite' | 'merge';
export declare class ImportStfXmlDto {
    xml: string;
    onConflict?: ImportOnConflict;
}
export declare class ImportAttachedFileDto {
    originalName: string;
    base64: string;
    md5?: string;
}
export declare class ImportStfBundleDto {
    xml: string;
    files: ImportAttachedFileDto[];
    onConflict?: ImportOnConflict;
}
