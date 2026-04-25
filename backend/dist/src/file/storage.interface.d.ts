import { Readable } from 'stream';
export interface IFileStorage {
    uploadFile(key: string, buffer: Buffer, contentType?: string): Promise<string>;
    uploadFileStream(key: string, stream: Readable, fileSize: number, contentType?: string): Promise<string>;
    getFile(key: string): Promise<Buffer>;
    getFileStream(key: string): Promise<Readable>;
    fileExists(key: string): Promise<boolean>;
    deleteFile(key: string): Promise<void>;
    getPresignedDownloadUrl(key: string, expirySeconds?: number): Promise<string>;
    getPresignedPreviewUrl(key: string, expirySeconds?: number): Promise<string>;
}
