#!/usr/bin/env node
/**
 * Build a fully-seeded SQLite database snapshot at build time
 * (software_upgrade / E4 + E8 stage).
 *
 * The customer-side desktop app does NOT ship the reference XML files at
 * runtime (they're released separately on first launch from electron resources).
 * Without them, the backend's `ControlledVocabularyService` and CTD template
 * seed would have nothing to read, leaving the app unusable on first run.
 *
 * This script runs once on the build machine, where the full `reference/`
 * directory IS available. It produces `prisma/first-run.db`, which the
 * Electron main copies to `<userData>/data.db` on first launch.
 *
 * What it does:
 *   1. Delete any old first-run.db
 *   2. Apply all SQLite migrations to a fresh DB
 *   3. Seed CTD template + completeness rules (via prisma/seed-ctd.ts)
 *   4. Seed controlled vocabularies (via the same XML files used at runtime)
 *   5. Disconnect, leaving a self-contained .db file ready to ship
 *
 * Usage:
 *   cd backend
 *   npm run prisma:sqlite:generate    # one-time
 *   node scripts/build-firstrun-db.js
 */
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const OUT_DB = path.join(ROOT, 'prisma', 'first-run.db');
const MIGRATIONS_DIR = path.join(ROOT, 'prisma', 'migrations.sqlite');
const SQLITE_CLIENT_DIR = path.join(ROOT, 'src', 'generated', 'prisma-sqlite');

async function main() {
  // 1) Clean previous snapshot
  if (fs.existsSync(OUT_DB)) {
    fs.unlinkSync(OUT_DB);
    console.log(`[build-firstrun-db] removed stale ${OUT_DB}`);
  }

  // 2) Migrate (use our better-sqlite3-based runner so we don't depend on
  //    Prisma CLI being able to find a custom migrations dir)
  process.env.DB_PROVIDER = 'sqlite';
  process.env.DATABASE_URL = `file:${OUT_DB}`;

  // tsc must have compiled src/embedded/sqlite-migrator.ts to dist/src/embedded/...
  // before this script runs. The npm script orders this correctly.
  let sqliteMigratorPath = path.join(ROOT, 'dist', 'src', 'embedded', 'sqlite-migrator.js');
  if (!fs.existsSync(sqliteMigratorPath)) {
    console.log('[build-firstrun-db] dist/src/embedded/sqlite-migrator.js missing; running tsc...');
    execSync('npx tsc -p tsconfig.json', { cwd: ROOT, stdio: 'inherit' });
  }
  const { runSqliteMigrations } = require(sqliteMigratorPath);
  runSqliteMigrations({ migrationsDir: MIGRATIONS_DIR, databaseFile: OUT_DB });

  // 3) Verify SQLite Prisma client is generated
  if (!fs.existsSync(SQLITE_CLIENT_DIR)) {
    console.error(
      `[build-firstrun-db] SQLite client missing at ${SQLITE_CLIENT_DIR}. ` +
        `Run "npm run prisma:sqlite:generate" first.`,
    );
    process.exit(1);
  }

  const { PrismaClient } = require(SQLITE_CLIENT_DIR);
  const prisma = new PrismaClient({
    datasources: { db: { url: `file:${OUT_DB}` } },
    log: ['warn', 'error'],
  });
  await prisma.$connect();

  try {
    // 4) CTD template + completeness rules (XML at ../reference/...)
    console.log('[build-firstrun-db] seeding CTD template...');
    // Compiled path of seed-ctd
    const seedCtdJs = path.join(ROOT, 'dist', 'prisma', 'seed-ctd.js');
    if (!fs.existsSync(seedCtdJs)) {
      execSync('npx tsc -p tsconfig.json', { cwd: ROOT, stdio: 'inherit' });
    }
    const { runCtdSeed } = require(seedCtdJs);
    await runCtdSeed(prisma);

    // 5) Controlled Vocabulary + STF — invoke the same parser the runtime uses,
    //    so the snapshot exactly matches what the runtime would produce.
    console.log('[build-firstrun-db] seeding controlled vocabularies...');
    await seedControlledVocabularies(prisma);
    await seedStfVocabularies(prisma);

    // 6) Default admin user (matches auto-seed.ts behavior; avoids first launch
    //    needing to write the user table before the user even logs in)
    console.log('[build-firstrun-db] seeding default admin...');
    const bcrypt = require(path.join(ROOT, 'node_modules', 'bcrypt'));
    const userCount = await prisma.user.count();
    if (userCount === 0) {
      const passwordHash = await bcrypt.hash('admin123', 10);
      await prisma.user.create({
        data: {
          email: 'admin@ectd.com',
          passwordHash,
          name: '系统管理员',
          role: 'ADMIN',
        },
      });
    }

    const counts = await Promise.all([
      prisma.user.count(),
      prisma.ctdTemplateNode.count(),
      prisma.ctdCompletenessRule.count(),
      prisma.controlledVocabulary.count(),
    ]);
    console.log(
      `[build-firstrun-db] done. counts: users=${counts[0]} ctdNodes=${counts[1]} ` +
        `rules=${counts[2]} cv=${counts[3]}`,
    );
    console.log(`[build-firstrun-db] snapshot at: ${OUT_DB}`);
  } finally {
    await prisma.$disconnect();
  }
}

// === Inline implementation of the runtime CV/STF seeders (kept here so the
// build-time path doesn't depend on instantiating the full Nest service graph,
// just to seed two tables). If the runtime parser changes, mirror it here.

async function seedControlledVocabularies(prisma) {
  const xmlDir = path.resolve(
    ROOT,
    '..',
    'reference',
    'eCTD技术规范V1.1附件包',
    '附件1-2：受控词汇文件包',
  );
  if (!fs.existsSync(xmlDir)) {
    console.warn(`[build-firstrun-db] reference dir missing: ${xmlDir} — skipping CV seed`);
    return;
  }
  const { XMLParser } = require(path.join(ROOT, 'node_modules', 'fast-xml-parser'));
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });

  const cvFiles = [
    { file: 'cv-application-type.xml', vocabName: 'application-type' },
    { file: 'cv-product-type.xml', vocabName: 'product-type' },
    { file: 'cv-regulatory-activity-type.xml', vocabName: 'regulatory-activity-type' },
    { file: 'cv-sequence-type.xml', vocabName: 'sequence-type' },
  ];
  for (const { file, vocabName } of cvFiles) {
    const fullPath = path.join(xmlDir, file);
    if (!fs.existsSync(fullPath)) {
      console.warn(`  skip ${file} (missing)`);
      continue;
    }
    const xml = fs.readFileSync(fullPath, 'utf-8');
    const parsed = parser.parse(xml);
    const cv = parsed['controlled-vocabulary'];
    const version = cv.version;
    const versionNumber = version['@_number'];
    const validFrom = parseDate(version['@_valid-from']);

    const codes = Array.isArray(version.code) ? version.code : [version.code];
    for (const code of codes) {
      const descriptions = Array.isArray(code.description) ? code.description : [code.description];
      const zhDesc = descriptions.find((d) => d['@_xml:lang'] === 'zh');
      const enDesc = descriptions.find((d) => d['@_xml:lang'] === 'en');

      await prisma.controlledVocabulary.create({
        data: {
          vocabularyName: vocabName,
          code: code['@_name'],
          version: versionNumber,
          validFrom,
          descriptionZh: zhDesc?.['#text'] || '',
          descriptionEn: enDesc?.['#text'] || '',
        },
      });
    }
  }
}

async function seedStfVocabularies(prisma) {
  const validValuesPath = path.resolve(
    ROOT,
    '..',
    'reference',
    'eCTD技术规范V1.1附件包',
    '附件2-6：STF标签值文件',
    'valid-values.xml',
  );
  if (!fs.existsSync(validValuesPath)) {
    console.warn(`[build-firstrun-db] STF valid-values.xml missing — skipping STF seed`);
    return;
  }
  // Dynamic import of the runtime service is heavy (full Nest graph), so we
  // just leave STF un-seeded in the snapshot — the runtime seeder will pick
  // it up on first boot from <userData>/reference/ which is always shipped.
  console.log(`  STF vocabularies will be seeded at runtime first boot from <userData>/reference/`);
}

function parseDate(str) {
  if (!str) return new Date();
  // accepts yyyy-MM-dd
  return new Date(str);
}

main().catch((err) => {
  console.error('[build-firstrun-db] failed:', err);
  process.exit(1);
});
