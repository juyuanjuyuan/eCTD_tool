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
    //    Build-time seeding is HARD-required: missing reference at build time
    //    means a crippled snapshot ships, and the customer sees empty dropdowns
    //    that the runtime fallback can only sometimes recover (data-dir.ts
    //    release path is independent and may also fail). Fail the build red.
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

    const [
      userCnt,
      ctdNodeCnt,
      ruleCnt,
      cvTotalCnt,
      cvAptCnt,
      cvPrtCnt,
      cvRatCnt,
      cvSqtCnt,
      cvDepCnt,
      stfCatCnt,
      stfTagCnt,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.ctdTemplateNode.count(),
      prisma.ctdCompletenessRule.count(),
      prisma.controlledVocabulary.count(),
      prisma.controlledVocabulary.count({ where: { vocabularyName: 'application-type' } }),
      prisma.controlledVocabulary.count({ where: { vocabularyName: 'product-type' } }),
      prisma.controlledVocabulary.count({ where: { vocabularyName: 'regulatory-activity-type' } }),
      prisma.controlledVocabulary.count({ where: { vocabularyName: 'sequence-type' } }),
      prisma.cvDependency.count(),
      prisma.controlledVocabulary.count({ where: { vocabularyName: { startsWith: 'stf-category-' } } }),
      prisma.controlledVocabulary.count({ where: { vocabularyName: { startsWith: 'stf-file-tag-' } } }),
    ]);
    console.log(
      `[build-firstrun-db] done. counts: users=${userCnt} ctdNodes=${ctdNodeCnt} ` +
        `rules=${ruleCnt} cv=${cvTotalCnt} (apt=${cvAptCnt} prt=${cvPrtCnt} rat=${cvRatCnt} sqt=${cvSqtCnt}) ` +
        `cvDep=${cvDepCnt} stfCat=${stfCatCnt} stfTag=${stfTagCnt}`,
    );

    // Hard assertions — build red if snapshot is incomplete. Numbers are from
    // the eCTD V1.1 controlled vocabulary spec (cnapt1-4 / cnprt1-2 / cnrat1-9 /
    // cnsqt1-4) plus seed-ctd plan §0 (~229 template nodes, ≥196 completeness rules).
    const failures = [];
    if (userCnt < 1) failures.push(`users < 1 (got ${userCnt})`);
    if (ctdNodeCnt < 200) failures.push(`ctd_template_node < 200 (got ${ctdNodeCnt})`);
    if (ruleCnt < 100) failures.push(`ctd_completeness_rule < 100 (got ${ruleCnt})`);
    if (cvAptCnt !== 4) failures.push(`application-type expected 4, got ${cvAptCnt}`);
    if (cvPrtCnt !== 2) failures.push(`product-type expected 2, got ${cvPrtCnt}`);
    if (cvRatCnt !== 9) failures.push(`regulatory-activity-type expected 9, got ${cvRatCnt}`);
    if (cvSqtCnt !== 4) failures.push(`sequence-type expected 4, got ${cvSqtCnt}`);
    if (cvDepCnt < 1) failures.push(`cv_dependency < 1 (got ${cvDepCnt})`);
    if (stfCatCnt < 1) failures.push(`stf-category-* < 1 (got ${stfCatCnt})`);
    if (stfTagCnt < 1) failures.push(`stf-file-tag-* < 1 (got ${stfTagCnt})`);
    if (failures.length > 0) {
      throw new Error(
        `[build-firstrun-db] snapshot incomplete; refusing to ship. Failures:\n  - ` +
          failures.join('\n  - '),
      );
    }
    console.log(`[build-firstrun-db] snapshot at: ${OUT_DB}`);
  } finally {
    await prisma.$disconnect();
  }
}

// === Inline implementation of the runtime CV/STF seeders (kept here so the
// build-time path doesn't depend on instantiating the full Nest service graph,
// just to seed two tables). If the runtime parser changes, mirror it here.

function getReferenceXmlDir() {
  // Build-time path. Prefer REFERENCE_DIR override (e.g. CI-staged path), fall
  // back to <repo>/reference. Either MUST exist — silent skip is what shipped
  // a crippled first-run.db on Mac (E9-H7 hotfix).
  const envOverride = process.env.REFERENCE_DIR;
  if (envOverride) {
    return envOverride; // expected to be ".../eCTD技术规范V1.1附件包"
  }
  return path.resolve(ROOT, '..', 'reference', 'eCTD技术规范V1.1附件包');
}

async function seedControlledVocabularies(prisma) {
  const baseDir = getReferenceXmlDir();
  const xmlDir = path.join(baseDir, '附件1-2：受控词汇文件包');
  if (!fs.existsSync(xmlDir)) {
    throw new Error(
      `[build-firstrun-db] reference dir missing: ${xmlDir}\n` +
        `Set REFERENCE_DIR env or check that <repo>/reference/eCTD技术规范V1.1附件包/ is present.`,
    );
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
      throw new Error(`[build-firstrun-db] required CV file missing: ${fullPath}`);
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

  // Dependency table (apt-rat-sqt cascade). Same XML root, separate file.
  const depFile = path.join(xmlDir, 'depend-apt-rat-sqt.xml');
  if (!fs.existsSync(depFile)) {
    throw new Error(`[build-firstrun-db] required dependency file missing: ${depFile}`);
  }
  const depXml = fs.readFileSync(depFile, 'utf-8');
  const depParsed = parser.parse(depXml);
  const dependency = depParsed.dependency;
  const depVersionNumber = dependency.version['@_number'];
  const appCodes = Array.isArray(dependency.version.code)
    ? dependency.version.code
    : [dependency.version.code];
  for (const appCode of appCodes) {
    const ratCodes = Array.isArray(appCode.code) ? appCode.code : [appCode.code];
    for (const ratCode of ratCodes) {
      const sqtCodes = Array.isArray(ratCode.code) ? ratCode.code : [ratCode.code];
      for (const sqtCode of sqtCodes) {
        await prisma.cvDependency.create({
          data: {
            applicationTypeCode: appCode['@_name'],
            regulatoryActivityTypeCode: ratCode['@_name'],
            sequenceTypeCode: sqtCode['@_name'],
            version: depVersionNumber,
          },
        });
      }
    }
  }
}

async function seedStfVocabularies(prisma) {
  const baseDir = getReferenceXmlDir();
  const validValuesPath = path.join(baseDir, '附件2-6：STF标签值文件', 'valid-values.xml');
  if (!fs.existsSync(validValuesPath)) {
    throw new Error(
      `[build-firstrun-db] STF valid-values.xml missing: ${validValuesPath}`,
    );
  }
  const { XMLParser } = require(path.join(ROOT, 'node_modules', 'fast-xml-parser'));
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });

  const xml = fs.readFileSync(validValuesPath, 'utf-8');
  const parsed = parser.parse(xml);
  // Mirror runtime parser at backend/src/controlled-vocabulary/...service.ts
  // parseStfValidValuesFile(): root is <ectd:study-values>, values are in
  // @_value attributes (not text content), version is hardcoded since the
  // file only carries it as an XML comment.
  const root = parsed['ectd:study-values'];
  if (!root) {
    throw new Error(
      `[build-firstrun-db] invalid STF valid-values.xml: missing <ectd:study-values> root`,
    );
  }
  const versionNumber = '6.0';
  const validFrom = new Date('2023-11-01');

  const normaliseEntries = (raw) => {
    if (!raw) return [];
    const entries = Array.isArray(raw) ? raw : [raw];
    return entries
      .map((e) => ({
        value: String(e['@_value'] || ''),
        realm: String(e['@_realm'] || 'ich'),
      }))
      .filter((e) => e.value.length > 0);
  };

  // Categories: one or many <category name="..."> blocks
  const categoryNodes = collectArray(root.category);
  let stfCatRows = 0;
  for (const category of categoryNodes) {
    const vocabName = `stf-category-${category['@_name']}`;
    const entries = normaliseEntries(category['valid-value']);
    for (const e of entries) {
      await prisma.controlledVocabulary.create({
        data: {
          vocabularyName: vocabName,
          code: e.value,
          version: versionNumber,
          validFrom,
          descriptionZh: e.value,
          descriptionEn: `[${e.realm}] ${e.value}`,
        },
      });
      stfCatRows++;
    }
  }

  // file-tag block: shared across modules 4 and 5; mirror under both keys per Plan 12 §1.2.
  const fileTagEntries = normaliseEntries(root['file-tag']?.['valid-value']);
  let stfTagRows = 0;
  for (const moduleKey of ['m4', 'm5']) {
    const vocabName = `stf-file-tag-${moduleKey}`;
    for (const e of fileTagEntries) {
      await prisma.controlledVocabulary.create({
        data: {
          vocabularyName: vocabName,
          code: e.value,
          version: versionNumber,
          validFrom,
          descriptionZh: e.value,
          descriptionEn: `[${e.realm}] ${e.value}`,
        },
      });
      stfTagRows++;
    }
  }
  console.log(
    `  stf seeded: ${categoryNodes.length} categories (${stfCatRows} rows), ` +
      `${stfTagRows} file-tag rows (mirrored m4+m5)`,
  );
}

function collectArray(maybe) {
  if (maybe == null) return [];
  return Array.isArray(maybe) ? maybe : [maybe];
}

function parseDate(str) {
  if (!str) return new Date();
  // accepts yyyy-MM-dd or yyyy-M-d
  const parts = String(str).split('-');
  if (parts.length === 3) {
    return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
  }
  return new Date(str);
}

main().catch((err) => {
  console.error('[build-firstrun-db] failed:', err);
  process.exit(1);
});
