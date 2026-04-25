import { Readable } from 'stream';
import { IFileStorage } from './storage.interface';
export interface MinioStorageConfig {
    endpoint: string;
    port: number;
    useSSL?: boolean;
    accessKey: string;
    secretKey: string;
    bucket: string;
    publicUrl?: string;
}
export declare class MinioStorage implements IFileStorage {
    private readonly config;
    private readonly logger;
    private readonly client;
    private readonly presignClient;
    private readonly bucket;
    constructor(config: MinioStorageConfig);
    init(): Promise<void>;
    uploadFile(key: string, buffer: Buffer, contentType?: string): Promise<string>;
    uploadFileStream(key: string, stream: Readable, fileSize: number, contentType?: string): Promise<string>;
    getFile(key: string): Promise<Buffer>;
    getFileStream(key: string): Promise<Readable>;
    fileExists(key: string): Promise<boolean>;
    deleteFile(key: string): Promise<void>;
    getPresignedDownloadUrl(key: string, expirySeconds?: number): Promise<string>;
    getPresignedPreviewUrl(key: string, expirySeconds?: number): Promise<string>;
    private streamToBuffer;
}
