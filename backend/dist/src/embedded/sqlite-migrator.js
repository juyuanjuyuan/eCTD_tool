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
exports.runSqliteMigrations = runSqliteMigrations;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const crypto = __importStar(require("crypto"));
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
function runSqliteMigrations(options) {
    const { migrationsDir, databaseFile } = options;
    const log = options.logger ?? {
        info: (m) => console.log(`[sqlite-migrator] ${m}`),
        warn: (m) => console.warn(`[sqlite-migrator] ${m}`),
    };
    if (!fs.existsSync(migrationsDir)) {
        throw new Error(`Migrations directory not found: ${migrationsDir}`);
    }
    fs.mkdirSync(path.dirname(databaseFile), { recursive: true });
    const db = new better_sqlite3_1.default(databaseFile);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    try {
        db.exec(`CREATE TABLE IF NOT EXISTS _app_migrations (
         name        TEXT PRIMARY KEY,
         checksum    TEXT NOT NULL,
         applied_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
       );`);
        const applied = new Map();
        for (const row of db.prepare('SELECT name, checksum FROM _app_migrations').iterate()) {
            applied.set(row.name, row.checksum);
        }
        const dirs = fs
            .readdirSync(migrationsDir, { withFileTypes: true })
            .filter((entry) => entry.isDirectory())
            .map((entry) => entry.name)
            .sort();
        const ranNow = [];
        for (const name of dirs) {
            const sqlFile = path.join(migrationsDir, name, 'migration.sql');
            if (!fs.existsSync(sqlFile))
                continue;
            const sql = fs.readFileSync(sqlFile, 'utf8');
            const checksum = sha256(sql);
            const previous = applied.get(name);
            if (previous) {
                if (previous !== checksum) {
                    throw new Error(`Migration "${name}" checksum drift: db has ${previous}, file is ${checksum}. Refusing to re-run.`);
                }
                continue;
            }
            const started = Date.now();
            const transactional = !sql.toLowerCase().includes('-- no-transaction');
            try {
                if (transactional) {
                    db.exec('BEGIN');
                    db.exec(sql);
                    db.prepare('INSERT INTO _app_migrations(name, checksum) VALUES (?, ?)').run(name, checksum);
                    db.exec('COMMIT');
                }
                else {
                    db.exec(sql);
                    db.prepare('INSERT INTO _app_migrations(name, checksum) VALUES (?, ?)').run(name, checksum);
                }
            }
            catch (err) {
                try {
                    db.exec('ROLLBACK');
                }
                catch {
                }
                throw new Error(`Migration "${name}" failed: ${err.message}`);
            }
            const durationMs = Date.now() - started;
            log.info(`applied ${name} in ${durationMs}ms`);
            ranNow.push({ name, durationMs });
        }
        if (ranNow.length === 0) {
            log.info(`no new migrations (${applied.size} already applied)`);
        }
        return ranNow;
    }
    finally {
        db.close();
    }
}
function sha256(value) {
    return crypto.createHash('sha256').update(value).digest('hex');
}
//# sourceMappingURL=sqlite-migrator.js.map