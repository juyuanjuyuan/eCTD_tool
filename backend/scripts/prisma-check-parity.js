const fs = require('fs');
const path = require('path');

function parseModels(schemaText) {
  const modelRegex = /^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm;
  const models = new Map();
  let match;

  while ((match = modelRegex.exec(schemaText)) !== null) {
    const modelName = match[1];
    const body = match[2];
    const fields = [];

    for (const rawLine of body.split('\n')) {
      const line = rawLine.trim();
      if (!line || line.startsWith('//') || line.startsWith('@@')) continue;
      const parts = line.split(/\s+/);
      const fieldName = parts[0];
      if (!fieldName || fieldName.startsWith('@')) continue;
      fields.push(fieldName);
    }

    models.set(modelName, new Set(fields));
  }

  return models;
}

function diffSchemas(pgModels, sqliteModels) {
  const errors = [];
  const allModelNames = new Set([...pgModels.keys(), ...sqliteModels.keys()]);

  for (const modelName of Array.from(allModelNames).sort()) {
    if (!pgModels.has(modelName)) {
      errors.push(`Model missing in PostgreSQL schema: ${modelName}`);
      continue;
    }
    if (!sqliteModels.has(modelName)) {
      errors.push(`Model missing in SQLite schema: ${modelName}`);
      continue;
    }

    const pgFields = pgModels.get(modelName);
    const sqliteFields = sqliteModels.get(modelName);
    const allFields = new Set([...pgFields, ...sqliteFields]);

    for (const field of Array.from(allFields).sort()) {
      if (!pgFields.has(field)) {
        errors.push(`${modelName}.${field} missing in PostgreSQL schema`);
      }
      if (!sqliteFields.has(field)) {
        errors.push(`${modelName}.${field} missing in SQLite schema`);
      }
    }
  }

  return errors;
}

const pgSchemaPath = path.join(__dirname, '..', 'prisma', 'schema.prisma');
const sqliteSchemaPath = path.join(__dirname, '..', 'prisma', 'schema.sqlite.prisma');

const pgSchema = fs.readFileSync(pgSchemaPath, 'utf8');
const sqliteSchema = fs.readFileSync(sqliteSchemaPath, 'utf8');

const pgModels = parseModels(pgSchema);
const sqliteModels = parseModels(sqliteSchema);

const errors = diffSchemas(pgModels, sqliteModels);

if (errors.length > 0) {
  console.error('Prisma schema parity check failed:\n');
  for (const err of errors) {
    console.error(`- ${err}`);
  }
  process.exit(1);
}

console.log('Prisma schema parity check passed.');
