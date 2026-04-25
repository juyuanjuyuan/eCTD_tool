import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Readable } from 'stream';
import { LocalStorage } from './local-storage';

describe('LocalStorage', () => {
  let dataDir: string;
  let storage: LocalStorage;

  beforeEach(() => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'localstorage-spec-'));
    storage = new LocalStorage({
      dataDir,
      presignSecret: 'test-presign-secret-must-be-long-enough',
      publicBaseUrl: 'http://127.0.0.1:3000',
    });
  });

  afterEach(() => {
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  it('uploadFile + getFile round-trip preserves bytes', async () => {
    const buf = Buffer.from('hello world', 'utf8');
    const md5 = await storage.uploadFile('docs/hello.txt', buf, 'text/plain');
    expect(md5).toMatch(/^[a-f0-9]{32}$/);

    const back = await storage.getFile('docs/hello.txt');
    expect(back.toString('utf8')).toBe('hello world');
  });

  it('uploadFileStream computes md5 on the fly', async () => {
    const payload = Buffer.from('streaming-content-' + 'x'.repeat(1000));
    const stream = Readable.from([payload]);
    const md5 = await storage.uploadFileStream('docs/stream.bin', stream, payload.length);
    expect(md5).toMatch(/^[a-f0-9]{32}$/);

    const back = await storage.getFile('docs/stream.bin');
    expect(back.equals(payload)).toBe(true);
  });

  it('fileExists reflects state', async () => {
    expect(await storage.fileExists('docs/ghost.txt')).toBe(false);
    await storage.uploadFile('docs/ghost.txt', Buffer.from('x'));
    expect(await storage.fileExists('docs/ghost.txt')).toBe(true);
  });

  it('deleteFile removes the file (idempotent on missing)', async () => {
    await storage.uploadFile('docs/junk.txt', Buffer.from('x'));
    await storage.deleteFile('docs/junk.txt');
    expect(await storage.fileExists('docs/junk.txt')).toBe(false);
    // second delete must not throw
    await storage.deleteFile('docs/junk.txt');
  });

  it('rejects path traversal', () => {
    expect(() => storage.resolveSafe('../../etc/passwd')).toThrow(/refused traversal/i);
  });

  it('presigned URL contains JWT and points at /api/v1/files/serve/', async () => {
    await storage.uploadFile('docs/hi.pdf', Buffer.from('pdf-bytes'));
    const url = await storage.getPresignedDownloadUrl('docs/hi.pdf', 60);
    expect(url).toMatch(/^http:\/\/127\.0\.0\.1:3000\/api\/v1\/files\/serve\/[\w-]+\.[\w-]+\.[\w-]+$/);

    const token = url.split('/').pop()!;
    const payload = storage.verifyPresignToken(token);
    expect(payload.key).toBe('docs/hi.pdf');
    expect(payload.mode).toBe('download');
  });

  it('verifyPresignToken rejects tampered tokens', () => {
    expect(() => storage.verifyPresignToken('garbage.token.here')).toThrow();
  });

  it('preview URL signs mode=preview', async () => {
    const url = await storage.getPresignedPreviewUrl('docs/preview.pdf', 60);
    const token = url.split('/').pop()!;
    const payload = storage.verifyPresignToken(token);
    expect(payload.mode).toBe('preview');
  });
});
