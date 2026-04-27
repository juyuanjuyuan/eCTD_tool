import * as path from 'path';
import { resolveDatabaseFile } from './embedded-paths';

describe('embedded-paths', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('parses absolute file URLs without preserving URL slashes as path slashes', () => {
    process.env.DATABASE_URL = 'file:///C:/Users/linus/AppData/Roaming/ectd-desktop/data.db';

    const databaseFile = resolveDatabaseFile();

    if (process.platform === 'win32') {
      expect(databaseFile).toBe('C:\\Users\\linus\\AppData\\Roaming\\ectd-desktop\\data.db');
    } else {
      expect(databaseFile).toBe('/C:/Users/linus/AppData/Roaming/ectd-desktop/data.db');
    }
    expect(databaseFile).not.toMatch(/^[/\\]{2,}C:/);
  });

  it('parses Prisma-compatible Windows drive file URLs', () => {
    process.env.DATABASE_URL = 'file:C:/Users/linus/AppData/Roaming/ectd-desktop/data.db';

    const databaseFile = resolveDatabaseFile();

    if (process.platform === 'win32') {
      expect(databaseFile).toBe('C:\\Users\\linus\\AppData\\Roaming\\ectd-desktop\\data.db');
    } else {
      expect(databaseFile).toBe('/C:/Users/linus/AppData/Roaming/ectd-desktop/data.db');
    }
  });

  it('resolves relative file URLs under DATA_DIR', () => {
    process.env.DATA_DIR = path.join('tmp', 'ectd-data');
    process.env.DATABASE_URL = 'file:./dev.db';

    expect(resolveDatabaseFile()).toBe(path.resolve(process.env.DATA_DIR, 'dev.db'));
  });

  it('rejects non-file database URLs', () => {
    process.env.DATABASE_URL = 'postgresql://example';

    expect(() => resolveDatabaseFile()).toThrow(/requires DATABASE_URL=file:/);
  });
});
