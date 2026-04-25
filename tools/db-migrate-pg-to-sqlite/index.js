/* eslint-disable no-console */
const { PrismaClient: PgPrismaClient } = require('../../backend/node_modules/@prisma/client');
const { PrismaClient: SqlitePrismaClient } = require('../../backend/src/generated/prisma-sqlite');

const MODEL_ORDER = [
  { model: 'user' },
  { model: 'project' },
  { model: 'projectMember' },
  { model: 'application' },
  { model: 'regulatoryActivity' },
  { model: 'sequence' },
  { model: 'ctdTemplateNode', jsonFields: ['instanceKeyFields', 'defaultStfCategories'] },
  { model: 'ctdCompletenessRule', jsonFields: ['sequenceTypeCodes', 'productTypeCodes'] },
  { model: 'sequenceNode' },
  { model: 'document', jsonFields: ['contentJson'] },
  { model: 'documentVersion', jsonFields: ['contentJson'] },
  { model: 'controlledVocabulary' },
  { model: 'cvDependency' },
  { model: 'fileAttachment', jsonFields: ['complianceDetails'] },
  { model: 'study' },
  { model: 'studyCategory' },
  { model: 'studyDocument' },
  { model: 'validationReport' },
  { model: 'validationItem' },
  { model: 'comment', jsonFields: ['mentions'] },
  { model: 'activityLog', jsonFields: ['detail'] },
  { model: 'projectInvitation' },
  { model: 'nodeAssignment' },
  { model: 'notification' },
  { model: 'license' },
];

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function printUsage() {
  console.log('Usage: node tools/db-migrate-pg-to-sqlite/index.js [--dry-run] [--help]');
  console.log('Env required:');
  console.log('  PG_DATABASE_URL=postgres://... (or DATABASE_URL)');
  console.log('  SQLITE_DATABASE_URL=file:./dev.db');
}

function normalizeRecord(record, jsonFields = []) {
  const out = { ...record };

  for (const field of jsonFields) {
    const value = out[field];
    if (value === undefined) continue;
    if (value === null) {
      out[field] = null;
      continue;
    }
    if (typeof value === 'string') {
      out[field] = value;
      continue;
    }
    out[field] = JSON.stringify(value);
  }

  return out;
}

async function migrateModel(pg, sqlite, config, dryRun) {
  const modelName = config.model;
  const pgDelegate = pg[modelName];
  const sqliteDelegate = sqlite[modelName];

  if (!pgDelegate || !sqliteDelegate) {
    console.warn(`[skip] ${modelName}: delegate not found`);
    return;
  }

  const rows = await pgDelegate.findMany();
  const normalized = rows.map((row) => normalizeRecord(row, config.jsonFields));

  if (dryRun) {
    console.log(`[dry-run] ${modelName}: ${normalized.length} row(s)`);
    return;
  }

  if (normalized.length === 0) {
    console.log(`[ok] ${modelName}: 0 row`);
    return;
  }

  await sqliteDelegate.createMany({
    data: normalized,
    skipDuplicates: true,
  });

  console.log(`[ok] ${modelName}: ${normalized.length} row(s)`);
}

async function main() {
  if (hasFlag('--help') || hasFlag('-h')) {
    printUsage();
    return;
  }

  const dryRun = hasFlag('--dry-run');

  const pgUrl = process.env.PG_DATABASE_URL || process.env.DATABASE_URL;
  const sqliteUrl = process.env.SQLITE_DATABASE_URL || 'file:./dev.db';

  if (!pgUrl) {
    throw new Error('Missing PG_DATABASE_URL (or DATABASE_URL)');
  }

  const pg = new PgPrismaClient({
    datasources: { db: { url: pgUrl } },
    log: ['error', 'warn'],
  });

  const sqlite = new SqlitePrismaClient({
    datasources: { db: { url: sqliteUrl } },
    log: ['error', 'warn'],
  });

  try {
    await pg.$connect();
    await sqlite.$connect();

    for (const config of MODEL_ORDER) {
      await migrateModel(pg, sqlite, config, dryRun);
    }

    console.log('Migration completed.');
  } finally {
    await sqlite.$disconnect();
    await pg.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
