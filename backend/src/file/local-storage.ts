import { Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { Readable, PassThrough } from 'stream';
import { promisify } from 'util';
import * as jwt from 'jsonwebtoken';
import { IFileStorage } from './storage.interface';

const pipeline = promisify(require('stream').pipeline);

export interface LocalStorageConfig {
  /** Base data directory; final files land in `<dataDir>/files/`. */
  dataDir: string;
  /** Base URL prefix used for presigned URLs. Defaults to relative `''` (same-origin). */
  publicBaseUrl?: string;
  /** Secret used to sign presigned-URL JWTs. */
  presignSecret: string;
}

interface PresignTokenPayload {
  key: string;
  mode: 'download' | 'preview';
}

/**
 * File system storage backend used by the desktop / Electron build.
 * Pure class (not @Injectable); the {@link MinioService} façade instantiates it directly.
 */
export class LocalStorage implements IFileStorage {
  private readonly logger = new Logger(LocalStorage.name);
  private readonly filesRoot: string;

  constructor(private readonly config: LocalStorageConfig) {
    if (!config.dataDir) {
      throw new Error('LocalStorage: dataDir is required');
    }
    if (!config.presignSecret) {
      throw new Error('LocalStorage: presignSecret is required');
    }
    this.filesRoot = path.join(config.dataDir, 'files');
    fs.mkdirSync(this.filesRoot, { recursive: true });
    this.logger.log(`LocalStorage ready at ${this.filesRoot}`);
  }

  async uploadFile(key: string, buffer: Buffer, _contentType?: string): Promise<string> {
    const target = this.resolveSafe(key);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, buffer);
    const md5 = crypto.createHash('md5').update(buffer).digest('hex');
    this.logger.log(`Uploaded: ${key} (${buffer.length} bytes, MD5: ${md5})`);
    return md5;
  }

  async uploadFileStream(
    key: string,
    stream: Readable,
    fileSize: number,
    _contentType?: string,
  ): Promise<string> {
    const target = this.resolveSafe(key);
    fs.mkdirSync(path.dirname(target), { recursive: true });

    const hash = crypto.createHash('md5');
    const passThrough = new PassThrough();
    passThrough.on('data', (chunk: Buffer) => hash.update(chunk));

    const writeStream = fs.createWriteStream(target);
    await pipeline(stream, passThrough, writeStream);

    const md5 = hash.digest('hex');
    this.logger.log(`Uploaded (stream): ${key} (${fileSize} bytes, MD5: ${md5})`);
    return md5;
  }

  async getFile(key: string): Promise<Buffer> {
    const target = this.resolveSafe(key);
    return fs.promises.readFile(target);
  }

  async getFileStream(key: string): Promise<Readable> {
    const target = this.resolveSafe(key);
    if (!fs.existsSync(target)) {
      throw new Error(`File not found: ${key}`);
    }
    return fs.createReadStream(target);
  }

  async fileExists(key: string): Promise<boolean> {
    const target = this.resolveSafe(key);
    return fs.promises
      .stat(target)
      .then((s) => s.isFile())
      .catch(() => false);
  }

  async deleteFile(key: string): Promise<void> {
    const target = this.resolveSafe(key);
    await fs.promises.rm(target, { force: true });
    this.logger.log(`Deleted: ${key}`);
  }

  async getPresignedDownloadUrl(key: string, expirySeconds = 3600): Promise<string> {
    return this.signUrl(key, 'download', expirySeconds);
  }

  async getPresignedPreviewUrl(key: string, expirySeconds = 3600): Promise<string> {
    return this.signUrl(key, 'preview', expirySeconds);
  }

  /** Verifies a presign token; throws if invalid. Returns the validated payload. */
  verifyPresignToken(token: string): PresignTokenPayload {
    const decoded = jwt.verify(token, this.config.presignSecret) as PresignTokenPayload & {
      exp?: number;
    };
    if (!decoded || typeof decoded.key !== 'string' || !decoded.mode) {
      throw new Error('Invalid presign token');
    }
    return { key: decoded.key, mode: decoded.mode };
  }

  /** Resolve a key to an absolute path under filesRoot. Rejects path traversal. */
  resolveSafe(key: string): string {
    const normalized = path.normalize(key).replace(/^[/\\]+/, '');
    const target = path.resolve(this.filesRoot, normalized);
    const root = path.resolve(this.filesRoot);
    if (target !== root && !target.startsWith(root + path.sep)) {
      throw new Error(`LocalStorage: refused traversal outside data dir: ${key}`);
    }
    return target;
  }

  private signUrl(key: string, mode: 'download' | 'preview', expirySeconds: number): string {
    const token = jwt.sign({ key, mode }, this.config.presignSecret, {
      expiresIn: expirySeconds,
    });
    const base = (this.config.publicBaseUrl ?? '').replace(/\/$/, '');
    return `${base}/api/v1/files/serve/${token}`;
  }
}
