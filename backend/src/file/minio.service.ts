import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as Minio from 'minio';
import { Readable } from 'stream';
import * as crypto from 'crypto';

@Injectable()
export class MinioService implements OnModuleInit {
  private readonly logger = new Logger(MinioService.name);
  private client: Minio.Client;
  private presignClient: Minio.Client;
  private bucket: string;

  constructor(private config: ConfigService) {
    this.bucket = this.config.get<string>('MINIO_BUCKET', 'ectd-files');
    const endpoint = this.config.get<string>('MINIO_ENDPOINT', 'localhost');
    const port = this.config.get<number>('MINIO_PORT', 9000);
    const accessKey = this.config.get<string>('MINIO_ACCESS_KEY', 'ectd_minio');
    const secretKey = this.config.get<string>('MINIO_SECRET_KEY', 'ectd_minio_password');

    // Internal client for actual file operations (upload/download/delete)
    this.client = new Minio.Client({
      endPoint: endpoint,
      port,
      useSSL: false,
      accessKey,
      secretKey,
    });

    // Public client for generating presigned URLs with the correct public host
    // so the signature matches when the browser accesses the URL
    const publicUrl = this.config.get<string>('MINIO_PUBLIC_URL', '');
    if (publicUrl) {
      const url = new URL(publicUrl);
      this.presignClient = new Minio.Client({
        endPoint: url.hostname,
        port: parseInt(url.port, 10) || (url.protocol === 'https:' ? 443 : 80),
        useSSL: url.protocol === 'https:',
        accessKey,
        secretKey,
      });
    } else {
      this.presignClient = this.client;
    }
  }

  async onModuleInit() {
    try {
      const exists = await this.client.bucketExists(this.bucket);
      if (!exists) {
        await this.client.makeBucket(this.bucket);
        this.logger.log(`Bucket "${this.bucket}" created`);
      } else {
        this.logger.log(`Bucket "${this.bucket}" ready`);
      }
    } catch (err) {
      this.logger.error(`MinIO initialization failed: ${err}`);
    }
  }

  /**
   * Upload a file buffer to MinIO.
   * Returns the MD5 checksum of the uploaded file.
   */
  async uploadFile(
    objectName: string,
    buffer: Buffer,
    contentType?: string,
  ): Promise<string> {
    // Calculate MD5
    const md5 = crypto.createHash('md5').update(buffer).digest('hex');

    const metaData: Record<string, string> = {};
    if (contentType) {
      metaData['Content-Type'] = contentType;
    }

    await this.client.putObject(
      this.bucket,
      objectName,
      buffer,
      buffer.length,
      metaData,
    );

    this.logger.log(`Uploaded: ${objectName} (${buffer.length} bytes, MD5: ${md5})`);
    return md5;
  }

  /**
   * Get a file from MinIO as a Buffer.
   */
  async getFile(objectName: string): Promise<Buffer> {
    const stream = await this.client.getObject(this.bucket, objectName);
    return this.streamToBuffer(stream);
  }

  /**
   * Get a file from MinIO as a Readable stream.
   */
  async getFileStream(objectName: string): Promise<Readable> {
    return this.client.getObject(this.bucket, objectName);
  }

  /**
   * Check if a file exists in MinIO.
   */
  async fileExists(objectName: string): Promise<boolean> {
    try {
      await this.client.statObject(this.bucket, objectName);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Delete a file from MinIO.
   */
  async deleteFile(objectName: string): Promise<void> {
    await this.client.removeObject(this.bucket, objectName);
    this.logger.log(`Deleted: ${objectName}`);
  }

  /**
   * Generate a presigned URL for download (1h expiry).
   */
  async getPresignedDownloadUrl(
    objectName: string,
    expirySeconds = 3600,
  ): Promise<string> {
    return this.presignClient.presignedGetObject(
      this.bucket,
      objectName,
      expirySeconds,
    );
  }

  /**
   * Generate a presigned URL for preview (1h expiry, inline disposition).
   */
  async getPresignedPreviewUrl(
    objectName: string,
    expirySeconds = 3600,
  ): Promise<string> {
    return this.presignClient.presignedGetObject(
      this.bucket,
      objectName,
      expirySeconds,
      { 'response-content-disposition': 'inline' },
    );
  }

  /**
   * Calculate MD5 checksum of a buffer.
   */
  calculateMd5(buffer: Buffer): string {
    return crypto.createHash('md5').update(buffer).digest('hex');
  }

  private streamToBuffer(stream: Readable): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      stream.on('data', (chunk) => chunks.push(chunk));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      stream.on('error', reject);
    });
  }
}
