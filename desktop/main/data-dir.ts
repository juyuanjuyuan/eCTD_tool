import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import log from 'electron-log/main';

/**
 * Initialise the user data directory on first launch.
 *
 * Layout:
 *   <userData>/
 *     data.db                 ← SQLite database (copied from first-run.db on first launch)
 *     files/                  ← LocalStorage root for uploaded files
 *     logs/                   ← electron-log rolling files
 *     reference/              ← reference XML extracted from app resources (sentinel: cv-application-type.xml)
 *     machine-id.txt          ← cached fingerprint
 *     secrets.json            ← JWT secrets (chmod 600)
 *
 * Idempotency: every check uses presence of a known artifact (data.db,
 * cv-application-type.xml) — never an empty directory or marker file. This
 * dodges the failure mode where a crashed subprocess creates the directory
 * but no contents, fooling later runs into thinking init was done.
 */
export interface DataDirPaths {
  userData: string;
  dbFile: string;
  filesDir: string;
  logsDir: string;
  referenceDir: string;
}

export function initDataDir(): DataDirPaths {
  const userData = app.getPath('userData');
  const dbFile = path.join(userData, 'data.db');
  const filesDir = path.join(userData, 'files');
  const logsDir = path.join(userData, 'logs');
  const referenceDir = path.join(userData, 'reference');

  for (const dir of [userData, filesDir, logsDir, referenceDir]) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // 1) Copy first-run.db snapshot if data.db doesn't exist yet.
  //    The snapshot was produced at build time by `backend/scripts/build-firstrun-db.js`
  //    and bundled under resources/backend/first-run.db.
  if (!fs.existsSync(dbFile)) {
    const snapshot = resolveResource('backend', 'first-run.db');
    if (snapshot && fs.existsSync(snapshot)) {
      fs.copyFileSync(snapshot, dbFile);
      log.info(`first-run.db copied: ${snapshot} → ${dbFile}`);
    } else {
      log.warn(
        `first-run.db not found in resources; backend will start with empty DB and ` +
          `auto-migrate will create empty tables. CTD template + controlled vocabulary ` +
          `will be missing — run "npm run seed:ctd" with REFERENCE_DIR pointing at the ` +
          `reference XMLs to populate.`,
      );
    }
  }

  // 2) Release reference XMLs if not already done. Sentinel: a *real file* the
  //    seed code expects, not the directory itself (a crashed extract might
  //    leave the dir empty).
  const referenceSentinel = path.join(
    referenceDir,
    '附件1-2：受控词汇文件包',
    'cv-application-type.xml',
  );
  if (!fs.existsSync(referenceSentinel)) {
    const bundled = resolveResource('reference');
    if (bundled && fs.existsSync(bundled)) {
      copyDir(bundled, referenceDir);
      log.info(`reference released: ${bundled} → ${referenceDir}`);
    } else {
      // Loud, not info: with no reference released and no first-run.db
      // pre-seed of CV (which is also possible if build-firstrun-db.js ran
      // without REFERENCE_DIR access), the customer sees empty dropdowns
      // for application-type / regulatory-activity-type / etc. (E9-H7).
      log.error(
        `reference bundle not found at ${bundled ?? '(resourcesPath/reference)'}. ` +
          `Backend will not be able to seed controlled vocabulary from XML at runtime. ` +
          `If first-run.db is also missing CV rows, all CV-dependent dropdowns will be empty. ` +
          `Verify electron-builder.yml extraResources stages reference/ correctly.`,
      );
    }
  }

  return { userData, dbFile, filesDir, logsDir, referenceDir };
}

function resolveResource(...parts: string[]): string | null {
  // process.resourcesPath in production points to <app>/Contents/Resources/.
  // In dev it points at electron's resources dir, which doesn't have our files,
  // so we probe the project root as a fallback.
  const prod = (process as any).resourcesPath as string | undefined;
  if (prod) {
    const candidate = path.join(prod, ...parts);
    if (fs.existsSync(candidate)) return candidate;
  }
  // Dev fallback: <repo>/{parts}
  const devRepo = path.resolve(__dirname, '..', '..', '..');
  const dev = path.join(devRepo, ...parts);
  return fs.existsSync(dev) ? dev : null;
}

function copyDir(src: string, dest: string) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(s, d);
    } else {
      fs.copyFileSync(s, d);
    }
  }
}
