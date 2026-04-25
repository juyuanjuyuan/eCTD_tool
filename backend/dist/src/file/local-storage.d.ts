import { Readable } from 'stream';
import { IFileStorage } from './storage.interface';
export interface LocalStorageConfig {
    dataDir: string;
    publicBaseUrl?: string;
    presignSecret: string;
}
interface PresignTokenPayload {
    key: string;
    mode: 'download' | 'preview';
}
export declare class LocalStorage implements IFileStorage {
    private readonly config;
    private readonly logger;
    private readonly filesRoot;
    constructor(config: LocalStorageConfig);
    uploadFile(key: string, buffer: Buffer, _contentType?: string): Promise<string>;
    uploadFileStream(key: string, stream: Readable, fileSize: number, _contentType?: string): Promise<string>;
    getFile(key: string): Promise<Buffer>;
    getFileStream(key: string): Promise<Readable>;
    fileExists(key: string): Promise<boolean>;
    deleteFile(key: string): Promise<void>;
    getPresignedDownloadUrl(key: string, expirySeconds?: number): Promise<string>;
    getPresignedPreviewUrl(key: string, expirySeconds?: number): Promise<string>;
    verifyPresignToken(token: string): PresignTokenPayload;
    resolveSafe(key: string): string;
    private signUrl;
}
export {};
