import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Readable } from 'stream';
import * as crypto from 'crypto';
import { IFileStorage } from './storage.interface';
import { LocalStorage } from './local-storage';
import { MinioStorage } from './minio-storage';

/**
 * Storage façade. Historically this class was named `MinioService` and tightly
 * coupled to MinIO; software_upgrade / E3 stage added a backend abstraction
 * (`IFileStorage`) and a local-FS implementation for the desktop / Electron build.
 *
 * Selected via `STORAGE_PROVIDER` (`minio` | `local`). Default is `local` to match
 * the desktop delivery target. Existing callers keep injecting `MinioService` —
 * the name is preserved as a back-compat anchor; the inner delegate does the work.
 */
@Injectable()
export class MinioService implements OnModuleInit, IFileStorage {
  private readonly logger = new Logger(MinioService.name);
  private readonly delegate: IFileStorage;
  private readonly providerName: 'minio' | 'local';

  constructor(private readonly config: ConfigService) {
    const provider = (process.env.STORAGE_PROVIDER || 'local').toLowerCase();
    if (provider === 'minio') {
      this.providerName = 'minio';
      this.delegate = new MinioStorage({
        endpoint: this.config.get<string>('MINIO_ENDPOINT', 'localhost'),
        port: this.config.get<number>('MINIO_PORT', 9000),
        accessKey: this.config.get<string>('MINIO_ACCESS_KEY', 'ectd_minio'),
        secretKey: this.config.get<string>('MINIO_SECRET_KEY', 'ectd_minio_password'),
        bucket: this.config.get<string>('MINIO_BUCKET', 'ectd-files'),
        publicUrl: this.config.get<string>('MINIO_PUBLIC_URL', ''),
      });
    } else {
      this.providerName = 'local';
      const dataDir = process.env.DATA_DIR || this.config.get<string>('DATA_DIR') || '';
      if (!dataDir) {
        throw new Error(
          'STORAGE_PROVIDER=local requires DATA_DIR (Electron main injects this).',
        );
      }
      const presignSecret =
        process.env.STORAGE_PRESIGN_SECRET ||
        this.config.get<string>('STORAGE_PRESIGN_SECRET') ||
        process.env.JWT_SECRET ||
        this.config.get<string>('JWT_SECRET') ||
        '';
      if (!presignSecret) {
        throw new Error(
          'STORAGE_PROVIDER=local requires STORAGE_PRESIGN_SECRET or JWT_SECRET.',
        );
      }
      this.delegate = new LocalStorage({
        dataDir,
        publicBaseUrl: process.env.PUBLIC_BASE_URL ||
          this.config.get<string>('PUBLIC_BASE_URL', ''),
        presignSecret,
      });
    }
    this.logger.log(`Storage provider: ${this.providerName}`);
  }

  async onModuleInit() {
    if (this.providerName === 'minio' && 'init' in this.delegate) {
      await (this.delegate as MinioStorage).init();
    }
  }

  /** Internal access for the file-serve controller (LocalStorage path resolution). */
  getDelegate(): IFileStorage {
    return this.delegate;
  }

  isLocal(): boolean {
    return this.providerName === 'local';
  }

  uploadFile(key: string, buffer: Buffer, contentType?: string): Promise<string> {
    return this.delegate.uploadFile(key, buffer, contentType);
  }

  uploadFileStream(
    key: string,
    stream: Readable,
    fileSize: number,
    contentType?: string,
  ): Promise<string> {
    return this.delegate.uploadFileStream(key, stream, fileSize, contentType);
  }

  getFile(key: string): Promise<Buffer> {
    return this.delegate.getFile(key);
  }

  getFileStream(key: string): Promise<Readable> {
    return this.delegate.getFileStream(key);
  }

  fileExists(key: string): Promise<boolean> {
    return this.delegate.fileExists(key);
  }

  deleteFile(key: string): Promise<void> {
    return this.delegate.deleteFile(key);
  }

  getPresignedDownloadUrl(key: string, expirySeconds = 3600): Promise<string> {
    return this.delegate.getPresignedDownloadUrl(key, expirySeconds);
  }

  getPresignedPreviewUrl(key: string, expirySeconds = 3600): Promise<string> {
    return this.delegate.getPresignedPreviewUrl(key, expirySeconds);
  }

  calculateMd5(buffer: Buffer): string {
    return crypto.createHash('md5').update(buffer).digest('hex');
  }
}
