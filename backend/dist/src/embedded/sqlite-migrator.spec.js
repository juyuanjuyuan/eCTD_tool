"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const sqlite_migrator_1 = require("./sqlite-migrator");
describe('sqlite-migrator', () => {
    let tmp;
    let migrationsDir;
    let dbFile;
    const silent = { info: () => { }, warn: () => { } };
    beforeEach(() => {
        tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sqlite-migrator-'));
        migrationsDir = path.join(tmp, 'migrations');
        dbFile = path.join(tmp, 'test.db');
        fs.mkdirSync(migrationsDir, { recursive: true });
    });
    afterEach(() => {
        fs.rmSync(tmp, { recursive: true, force: true });
    });
    function writeMigration(name, sql) {
        fs.mkdirSync(path.join(migrationsDir, name), { recursive: true });
        fs.writeFileSync(path.join(migrationsDir, name, 'migration.sql'), sql);
    }
    it('applies migrations in lexical order', () => {
        writeMigration('20260101_init', 'CREATE TABLE t(x INTEGER);');
        writeMigration('20260102_add_y', 'ALTER TABLE t ADD COLUMN y TEXT;');
        const applied = (0, sqlite_migrator_1.runSqliteMigrations)({ migrationsDir, databaseFile: dbFile, logger: silent });
        expect(applied.map((a) => a.name)).toEqual(['20260101_init', '20260102_add_y']);
        const db = new better_sqlite3_1.default(dbFile);
        const cols = db.prepare('PRAGMA table_info(t)').all();
        expect(cols.map((c) => c.name).sort()).toEqual(['x', 'y']);
        db.close();
    });
    it('is idempotent on re-run', () => {
        writeMigration('20260101_init', 'CREATE TABLE t(x INTEGER);');
        const first = (0, sqlite_migrator_1.runSqliteMigrations)({ migrationsDir, databaseFile: dbFile, logger: silent });
        const second = (0, sqlite_migrator_1.runSqliteMigrations)({ migrationsDir, databaseFile: dbFile, logger: silent });
        expect(first.length).toBe(1);
        expect(second.length).toBe(0);
    });
    it('detects checksum drift and refuses to re-run', () => {
        writeMigration('20260101_init', 'CREATE TABLE t(x INTEGER);');
        (0, sqlite_migrator_1.runSqliteMigrations)({ migrationsDir, databaseFile: dbFile, logger: silent });
        fs.writeFileSync(path.join(migrationsDir, '20260101_init', 'migration.sql'), 'CREATE TABLE t(x INTEGER); -- changed');
        expect(() => (0, sqlite_migrator_1.runSqliteMigrations)({ migrationsDir, databaseFile: dbFile, logger: silent })).toThrow(/checksum drift/i);
    });
    it('rolls back on failure and leaves table untouched', () => {
        writeMigration('20260101_ok', 'CREATE TABLE t(x INTEGER);');
        writeMigration('20260102_bad', 'CREATE TABLE u(y INTEGER); SELECT this_is_not_valid;');
        expect(() => (0, sqlite_migrator_1.runSqliteMigrations)({ migrationsDir, databaseFile: dbFile, logger: silent })).toThrow(/20260102_bad/);
        const db = new better_sqlite3_1.default(dbFile);
        const tables = db
            .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE '\\_%' ESCAPE '\\'")
            .all();
        expect(tables.map((t) => t.name).sort()).toEqual(['t']);
        db.close();
    });
    it('throws when migrations directory missing', () => {
        expect(() => (0, sqlite_migrator_1.runSqliteMigrations)({
            migrationsDir: path.join(tmp, 'nope'),
            databaseFile: dbFile,
            logger: silent,
        })).toThrow(/Migrations directory not found/);
    });
    it('runs against the real software_upgrade migrations', () => {
        const realDir = path.resolve(__dirname, '../../prisma/migrations.sqlite');
        if (!fs.existsSync(realDir)) {
            return;
        }
        const out = (0, sqlite_migrator_1.runSqliteMigrations)({
            migrationsDir: realDir,
            databaseFile: dbFile,
            logger: silent,
        });
        expect(out.length).toBeGreaterThanOrEqual(2);
        const db = new better_sqlite3_1.default(dbFile);
        const tables = db
            .prepare("SELECT name FROM sqlite_master WHERE type='table'")
            .all();
        const tableNames = tables.map((t) => t.name);
        expect(tableNames).toContain('user');
        expect(tableNames).toContain('license');
        db.close();
    });
});
//# sourceMappingURL=sqlite-migrator.spec.js.map