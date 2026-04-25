import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import Database from 'better-sqlite3';
import { runSqliteMigrations } from './sqlite-migrator';

describe('sqlite-migrator', () => {
  let tmp: string;
  let migrationsDir: string;
  let dbFile: string;
  const silent = { info: () => {}, warn: () => {} };

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sqlite-migrator-'));
    migrationsDir = path.join(tmp, 'migrations');
    dbFile = path.join(tmp, 'test.db');
    fs.mkdirSync(migrationsDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  function writeMigration(name: string, sql: string) {
    fs.mkdirSync(path.join(migrationsDir, name), { recursive: true });
    fs.writeFileSync(path.join(migrationsDir, name, 'migration.sql'), sql);
  }

  it('applies migrations in lexical order', () => {
    writeMigration('20260101_init', 'CREATE TABLE t(x INTEGER);');
    writeMigration('20260102_add_y', 'ALTER TABLE t ADD COLUMN y TEXT;');

    const applied = runSqliteMigrations({ migrationsDir, databaseFile: dbFile, logger: silent });
    expect(applied.map((a) => a.name)).toEqual(['20260101_init', '20260102_add_y']);

    const db = new Database(dbFile);
    const cols = db.prepare('PRAGMA table_info(t)').all() as Array<{ name: string }>;
    expect(cols.map((c) => c.name).sort()).toEqual(['x', 'y']);
    db.close();
  });

  it('is idempotent on re-run', () => {
    writeMigration('20260101_init', 'CREATE TABLE t(x INTEGER);');

    const first = runSqliteMigrations({ migrationsDir, databaseFile: dbFile, logger: silent });
    const second = runSqliteMigrations({ migrationsDir, databaseFile: dbFile, logger: silent });

    expect(first.length).toBe(1);
    expect(second.length).toBe(0);
  });

  it('detects checksum drift and refuses to re-run', () => {
    writeMigration('20260101_init', 'CREATE TABLE t(x INTEGER);');
    runSqliteMigrations({ migrationsDir, databaseFile: dbFile, logger: silent });

    // tamper with the file post-apply
    fs.writeFileSync(
      path.join(migrationsDir, '20260101_init', 'migration.sql'),
      'CREATE TABLE t(x INTEGER); -- changed',
    );

    expect(() =>
      runSqliteMigrations({ migrationsDir, databaseFile: dbFile, logger: silent }),
    ).toThrow(/checksum drift/i);
  });

  it('rolls back on failure and leaves table untouched', () => {
    writeMigration('20260101_ok', 'CREATE TABLE t(x INTEGER);');
    writeMigration('20260102_bad', 'CREATE TABLE u(y INTEGER); SELECT this_is_not_valid;');

    expect(() =>
      runSqliteMigrations({ migrationsDir, databaseFile: dbFile, logger: silent }),
    ).toThrow(/20260102_bad/);

    const db = new Database(dbFile);
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE '\\_%' ESCAPE '\\'")
      .all() as Array<{ name: string }>;
    expect(tables.map((t) => t.name).sort()).toEqual(['t']); // u must NOT exist
    db.close();
  });

  it('throws when migrations directory missing', () => {
    expect(() =>
      runSqliteMigrations({
        migrationsDir: path.join(tmp, 'nope'),
        databaseFile: dbFile,
        logger: silent,
      }),
    ).toThrow(/Migrations directory not found/);
  });

  it('runs against the real software_upgrade migrations', () => {
    const realDir = path.resolve(__dirname, '../../prisma/migrations.sqlite');
    if (!fs.existsSync(realDir)) {
      // Bail gracefully if the layout changes
      return;
    }
    const out = runSqliteMigrations({
      migrationsDir: realDir,
      databaseFile: dbFile,
      logger: silent,
    });
    expect(out.length).toBeGreaterThanOrEqual(2); // init + add_license at minimum

    const db = new Database(dbFile);
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all() as Array<{ name: string }>;
    const tableNames = tables.map((t) => t.name);
    expect(tableNames).toContain('user');
    expect(tableNames).toContain('license');
    db.close();
  });
});
