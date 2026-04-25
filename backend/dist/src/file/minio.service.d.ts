import { OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Readable } from 'stream';
import { IFileStorage } from './storage.interface';
export declare class MinioService implements OnModuleInit, IFileStorage {
    private readonly config;
    private readonly logger;
    private readonly delegate;
    private readonly providerName;
    constructor(config: ConfigService);
    onModuleInit(): Promise<void>;
    getDelegate(): IFileStorage;
    isLocal(): boolean;
    uploadFile(key: string, buffer: Buffer, contentType?: string): Promise<string>;
    uploadFileStream(key: string, stream: Readable, fileSize: number, contentType?: string): Promise<string>;
    getFile(key: string): Promise<Buffer>;
    getFileStream(key: string): Promise<Readable>;
    fileExists(key: string): Promise<boolean>;
    deleteFile(key: string): Promise<void>;
    getPresignedDownloadUrl(key: string, expirySeconds?: number): Promise<string>;
    getPresignedPreviewUrl(key: string, expirySeconds?: number): Promise<string>;
    calculateMd5(buffer: Buffer): string;
}
