import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import Database from 'better-sqlite3';

/**
 * Lightweight SQLite migration runner used by the embedded (Electron) build.
 *
 * Why not `prisma migrate deploy`?
 *   - Prisma CLI looks for migrations at `<schemaDir>/migrations/`, but we keep
 *     SQLite migrations under `<schemaDir>/migrations.sqlite/` to coexist with the
 *     PostgreSQL migration history. Telling Prisma about a custom path is fragile
 *     across versions and would require shipping the CLI inside the desktop app.
 *   - We don't want a Node + npx + Prisma CLI dependency at customer first-run.
 *
 * This runner:
 *   - Reads `<dir>/<sortedName>/migration.sql` files in lexical order
 *   - Tracks applied migrations in `_app_migrations(name, checksum, applied_at)`
 *   - Is idempotent: skips already-applied names; aborts if checksum drifts
 *   - Wraps each migration's SQL in a transaction
 */
export interface RunMigrationsOptions {
  /** Path to a directory holding `<sortedName>/migration.sql` subdirs. */
  migrationsDir: string;
  /** Path to the SQLite DB file (the directory is created if missing). */
  databaseFile: string;
  /** Optional logger; defaults to `console`. */
  logger?: { info: (msg: string) => void; warn: (msg: string) => void };
}

export interface MigrationApplied {
  name: string;
  durationMs: number;
}

export function runSqliteMigrations(options: RunMigrationsOptions): MigrationApplied[] {
  const { migrationsDir, databaseFile } = options;
  const log = options.logger ?? {
    info: (m) => console.log(`[sqlite-migrator] ${m}`),
    warn: (m) => console.warn(`[sqlite-migrator] ${m}`),
  };

  if (!fs.existsSync(migrationsDir)) {
    throw new Error(`Migrations directory not found: ${migrationsDir}`);
  }

  fs.mkdirSync(path.dirname(databaseFile), { recursive: true });
  const db = new Database(databaseFile);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  try {
    db.exec(
      `CREATE TABLE IF NOT EXISTS _app_migrations (
         name        TEXT PRIMARY KEY,
         checksum    TEXT NOT NULL,
         applied_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
       );`,
    );

    const applied = new Map<string, string>();
    for (const row of db.prepare('SELECT name, checksum FROM _app_migrations').iterate() as Iterable<{ name: string; checksum: string }>) {
      applied.set(row.name, row.checksum);
    }

    const dirs = fs
      .readdirSync(migrationsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();

    const ranNow: MigrationApplied[] = [];

    for (const name of dirs) {
      const sqlFile = path.join(migrationsDir, name, 'migration.sql');
      if (!fs.existsSync(sqlFile)) continue;

      const sql = fs.readFileSync(sqlFile, 'utf8');
      const checksum = sha256(sql);

      const previous = applied.get(name);
      if (previous) {
        if (previous !== checksum) {
          throw new Error(
            `Migration "${name}" checksum drift: db has ${previous}, file is ${checksum}. Refusing to re-run.`,
          );
        }
        continue;
      }

      const started = Date.now();
      const transactional = !sql.toLowerCase().includes('-- no-transaction');
      try {
        if (transactional) {
          db.exec('BEGIN');
          db.exec(sql);
          db.prepare('INSERT INTO _app_migrations(name, checksum) VALUES (?, ?)').run(
            name,
            checksum,
          );
          db.exec('COMMIT');
        } else {
          db.exec(sql);
          db.prepare('INSERT INTO _app_migrations(name, checksum) VALUES (?, ?)').run(
            name,
            checksum,
          );
        }
      } catch (err) {
        try {
          db.exec('ROLLBACK');
        } catch {
          // ignore rollback failure
        }
        throw new Error(`Migration "${name}" failed: ${(err as Error).message}`);
      }
      const durationMs = Date.now() - started;
      log.info(`applied ${name} in ${durationMs}ms`);
      ranNow.push({ name, durationMs });
    }

    if (ranNow.length === 0) {
      log.info(`no new migrations (${applied.size} already applied)`);
    }

    return ranNow;
  } finally {
    db.close();
  }
}

function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}
