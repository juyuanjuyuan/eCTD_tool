import { Logger } from '@nestjs/common';
import * as Minio from 'minio';
import { Readable, PassThrough } from 'stream';
import * as crypto from 'crypto';
import { IFileStorage } from './storage.interface';

export interface MinioStorageConfig {
  endpoint: string;
  port: number;
  useSSL?: boolean;
  accessKey: string;
  secretKey: string;
  bucket: string;
  /** Optional separate endpoint used to sign presigned URLs (so the browser host matches). */
  publicUrl?: string;
}

/**
 * MinIO/S3 storage backend. Plain class (not @Injectable); the {@link MinioService}
 * façade picks this impl when `STORAGE_PROVIDER=minio`.
 *
 * Lifted from the original `minio.service.ts` to live behind the {@link IFileStorage}
 * interface; behaviour is preserved 1:1 to keep existing callers working.
 */
export class MinioStorage implements IFileStorage {
  private readonly logger = new Logger(MinioStorage.name);
  private readonly client: Minio.Client;
  private readonly presignClient: Minio.Client;
  private readonly bucket: string;

  constructor(private readonly config: MinioStorageConfig) {
    this.bucket = config.bucket;

    this.client = new Minio.Client({
      endPoint: config.endpoint,
      port: config.port,
      useSSL: config.useSSL ?? false,
      accessKey: config.accessKey,
      secretKey: config.secretKey,
    });

    if (config.publicUrl) {
      const url = new URL(config.publicUrl);
      this.presignClient = new Minio.Client({
        endPoint: url.hostname,
        port: parseInt(url.port, 10) || (url.protocol === 'https:' ? 443 : 80),
        useSSL: url.protocol === 'https:',
        accessKey: config.accessKey,
        secretKey: config.secretKey,
      });
    } else {
      this.presignClient = this.client;
    }
  }

  async init(): Promise<void> {
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

  async uploadFile(key: string, buffer: Buffer, contentType?: string): Promise<string> {
    const md5 = crypto.createHash('md5').update(buffer).digest('hex');
    const metaData: Record<string, string> = {};
    if (contentType) metaData['Content-Type'] = contentType;

    await this.client.putObject(this.bucket, key, buffer, buffer.length, metaData);
    this.logger.log(`Uploaded: ${key} (${buffer.length} bytes, MD5: ${md5})`);
    return md5;
  }

  async uploadFileStream(
    key: string,
    stream: Readable,
    fileSize: number,
    contentType?: string,
  ): Promise<string> {
    const metaData: Record<string, string> = {};
    if (contentType) metaData['Content-Type'] = contentType;

    const passThrough = new PassThrough();
    const hash = crypto.createHash('md5');
    passThrough.on('data', (chunk: Buffer) => hash.update(chunk));

    stream.pipe(passThrough);
    await this.client.putObject(this.bucket, key, passThrough, fileSize, metaData);

    const md5 = hash.digest('hex');
    this.logger.log(`Uploaded (stream): ${key} (${fileSize} bytes, MD5: ${md5})`);
    return md5;
  }

  async getFile(key: string): Promise<Buffer> {
    const stream = await this.client.getObject(this.bucket, key);
    return this.streamToBuffer(stream);
  }

  async getFileStream(key: string): Promise<Readable> {
    return this.client.getObject(this.bucket, key);
  }

  async fileExists(key: string): Promise<boolean> {
    try {
      await this.client.statObject(this.bucket, key);
      return true;
    } catch {
      return false;
    }
  }

  async deleteFile(key: string): Promise<void> {
    await this.client.removeObject(this.bucket, key);
    this.logger.log(`Deleted: ${key}`);
  }

  async getPresignedDownloadUrl(key: string, expirySeconds = 3600): Promise<string> {
    return this.presignClient.presignedGetObject(this.bucket, key, expirySeconds);
  }

  async getPresignedPreviewUrl(key: string, expirySeconds = 3600): Promise<string> {
    return this.presignClient.presignedGetObject(this.bucket, key, expirySeconds, {
      'response-content-disposition': 'inline',
    });
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
