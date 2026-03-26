import { OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Readable } from 'stream';
export declare class MinioService implements OnModuleInit {
    private config;
    private readonly logger;
    private client;
    private bucket;
    constructor(config: ConfigService);
    onModuleInit(): Promise<void>;
    uploadFile(objectName: string, buffer: Buffer, contentType?: string): Promise<string>;
    getFile(objectName: string): Promise<Buffer>;
    getFileStream(objectName: string): Promise<Readable>;
    fileExists(objectName: string): Promise<boolean>;
    deleteFile(objectName: string): Promise<void>;
    getPresignedDownloadUrl(objectName: string, expirySeconds?: number): Promise<string>;
    getPresignedPreviewUrl(objectName: string, expirySeconds?: number): Promise<string>;
    calculateMd5(buffer: Buffer): string;
    private streamToBuffer;
}
