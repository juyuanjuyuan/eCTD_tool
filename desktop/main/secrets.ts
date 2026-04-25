import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Per-install secrets, generated on first run and persisted under
 * `<userData>/secrets.json`. Re-using the same JWT_SECRET across launches
 * is required so issued access/refresh tokens survive a restart.
 */
export interface AppSecrets {
  jwtSecret: string;
  jwtRefreshSecret: string;
  storagePresignSecret: string;
}

export function loadOrCreateSecrets(userDataDir: string): AppSecrets {
  const file = path.join(userDataDir, 'secrets.json');
  if (fs.existsSync(file)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (parsed.jwtSecret && parsed.jwtRefreshSecret && parsed.storagePresignSecret) {
        return parsed;
      }
    } catch {
      // fall through and regenerate
    }
  }

  const secrets: AppSecrets = {
    jwtSecret: crypto.randomBytes(32).toString('hex'),
    jwtRefreshSecret: crypto.randomBytes(32).toString('hex'),
    storagePresignSecret: crypto.randomBytes(32).toString('hex'),
  };
  fs.mkdirSync(userDataDir, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(secrets, null, 2), { mode: 0o600 });
  return secrets;
}
