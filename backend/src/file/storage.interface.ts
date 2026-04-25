import { Readable } from 'stream';

/**
 * File storage abstraction (software_upgrade / E3 stage).
 *
 * Two implementations:
 *   - {@link MinioStorage} — uses the existing MinIO client; default in PG/web deploy
 *   - {@link LocalStorage} — writes under `<DATA_DIR>/files/`; default in desktop/Electron build
 *
 * Selected by the `STORAGE_PROVIDER` env var (`minio` | `local`, default `local`).
 *
 * The interface intentionally mirrors the legacy `MinioService` surface so existing
 * callers do not need to change. Keys are caller-controlled relative paths
 * (e.g. `documents/<uuid>.pdf`); the local impl prefixes with `<DATA_DIR>/files/`,
 * the minio impl drops them straight into the bucket.
 */
export interface IFileStorage {
  uploadFile(key: string, buffer: Buffer, contentType?: string): Promise<string>;
  uploadFileStream(
    key: string,
    stream: Readable,
    fileSize: number,
    contentType?: string,
  ): Promise<string>;

  getFile(key: string): Promise<Buffer>;
  getFileStream(key: string): Promise<Readable>;

  fileExists(key: string): Promise<boolean>;
  deleteFile(key: string): Promise<void>;

  /**
   * Time-limited URL for browsers to fetch the file directly.
   * MinIO impl uses presigned S3 URLs against the public endpoint.
   * Local impl signs a short-lived JWT and points to `/api/v1/files/serve/:token`.
   */
  getPresignedDownloadUrl(key: string, expirySeconds?: number): Promise<string>;
  getPresignedPreviewUrl(key: string, expirySeconds?: number): Promise<string>;
}
