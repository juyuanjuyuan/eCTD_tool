#!/usr/bin/env node
/**
 * Build the embedded backend bundle for the desktop / Electron build
 * (software_upgrade / E4 stage).
 *
 * Output layout under `backend/dist-embed/`:
 *
 *   backend.bundle.js           ← single-file CJS bundle of NestJS + business code
 *   prisma/
 *     migrations.sqlite/        ← copied from prisma/migrations.sqlite/
 *   generated/
 *     prisma-sqlite/            ← copied from src/generated/prisma-sqlite/
 *   node_modules/               ← full copy of backend/node_modules/ minus dev-only deps
 *   package.json                ← minimal manifest (main: backend.bundle.js)
 *
 * Native modules (better-sqlite3, bcrypt, prisma engines, etc.) remain `external`
 * for esbuild and are loaded from `dist-embed/node_modules/` at runtime.
 */
const path = require('path');
const fs = require('fs');
const esbuild = require('esbuild');

const ROOT = path.resolve(__dirname, '..');
const TSC_OUT = path.join(ROOT, 'dist');
const SRC_ENTRY = path.join(TSC_OUT, 'src', 'main.js');
const OUT_DIR = path.join(ROOT, 'dist-embed');
const OUT_BUNDLE = path.join(OUT_DIR, 'backend.bundle.js');
const OUT_NM = path.join(OUT_DIR, 'node_modules');
const SRC_NM = path.join(ROOT, 'node_modules');

const NATIVE_EXTERNALS = [
  'better-sqlite3',
  'bcrypt',
  '@prisma/client',
  '@prisma/engines',
  '@nestjs/microservices',
  '@nestjs/websockets',
  'class-transformer',
  'class-validator',
  'minio',
  'fast-xml-parser',
  'puppeteer',
  'puppeteer-core',
  '@mikro-orm/core',
  '@nestjs/mongoose',
  '@nestjs/sequelize',
  '@nestjs/sequelize/dist/common/sequelize.utils',
  '@nestjs/typeorm',
  '@nestjs/typeorm/dist/common/typeorm.utils',
];

// Top-level directory names under node_modules/ to delete after the full copy.
// Anything matching exactly is removed.
const PRUNE_TOPLEVEL_EXACT = new Set([
  'esbuild',
  'jest',
  'ts-jest',
  'ts-node',
  'prettier',
  'prisma',                // CLI package — runtime only needs @prisma/client + @prisma/engines
  'typescript',
  'supertest',
  'tsconfig-paths',
  'source-map-support',
  'ts-loader',
  'globals',
  'typescript-eslint',
]);

// Top-level directory names matching any of these prefixes are removed.
// (Catches eslint, eslint-config-prettier, eslint-plugin-prettier, etc.)
const PRUNE_TOPLEVEL_PREFIX = ['eslint'];

// Whole scope directories to wipe under node_modules/.
const PRUNE_SCOPES_FULL = new Set([
  '@types',
  '@typescript-eslint',
  '@eslint',
  '@eslint-community',
  '@humanfs',
  '@humanwhocodes',
]);

// Specific packages under a scope to delete (scope itself is preserved).
const PRUNE_SCOPED = {
  '@nestjs': new Set(['cli', 'schematics', 'testing']),
};

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  // Step 1 — compile with tsc so decorator metadata (reflect-metadata) is emitted.
  if (!fs.existsSync(SRC_ENTRY) || process.env.SKIP_TSC !== 'true') {
    console.log('[build-embed] running tsc...');
    const { execSync } = require('child_process');
    execSync('npx tsc -p tsconfig.json', { cwd: ROOT, stdio: 'inherit' });
  }
  if (!fs.existsSync(SRC_ENTRY)) {
    throw new Error(`tsc output missing: ${SRC_ENTRY}`);
  }

  console.log(`[build-embed] entry: ${SRC_ENTRY}`);
  console.log(`[build-embed] out:   ${OUT_BUNDLE}`);

  const result = await esbuild.build({
    entryPoints: [SRC_ENTRY],
    outfile: OUT_BUNDLE,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node20',
    sourcemap: true,
    legalComments: 'none',
    minify: false,
    external: NATIVE_EXTERNALS,
    metafile: true,
    logLevel: 'info',
  });

  fs.writeFileSync(
    path.join(OUT_DIR, 'metafile.json'),
    JSON.stringify(result.metafile, null, 2),
  );

  copyDir(
    path.join(ROOT, 'prisma', 'migrations.sqlite'),
    path.join(OUT_DIR, 'prisma', 'migrations.sqlite'),
  );

  // PrismaService probes `./generated/prisma-sqlite` relative to the bundle.
  const generated = path.join(ROOT, 'src', 'generated', 'prisma-sqlite');
  if (fs.existsSync(generated)) {
    fs.rmSync(path.join(OUT_DIR, 'generated', 'prisma-sqlite'), { recursive: true, force: true });
    copyDir(generated, path.join(OUT_DIR, 'generated', 'prisma-sqlite'));
  } else {
    console.warn(
      `[build-embed] warning: ${generated} missing — run "npm run prisma:sqlite:generate" first`,
    );
  }

  shipNodeModules();

  // `dependencies` listing is required so @electron/rebuild can discover
  // native modules to rebuild against Electron's Node ABI.
  // Pin to "*" because the actual versions are whatever was copied from
  // backend/node_modules/ — we are NOT going to npm install in dist-embed.
  fs.writeFileSync(
    path.join(OUT_DIR, 'package.json'),
    JSON.stringify(
      {
        name: 'ectd-backend-embed',
        version: require(path.join(ROOT, 'package.json')).version,
        private: true,
        main: 'backend.bundle.js',
        dependencies: NATIVE_EXTERNALS.reduce((acc, name) => {
          if (name.includes('/dist/')) return acc;
          acc[name] = '*';
          return acc;
        }, {}),
        comment:
          'Generated by scripts/build-embed.js. node_modules/ is a pruned copy ' +
          'of backend/node_modules/. Do not run npm install against this folder; ' +
          'dependencies listing is here only so @electron/rebuild can walk the tree.',
      },
      null,
      2,
    ),
  );

  console.log('[build-embed] done.');
}

function copyDir(src, dest) {
  if (!fs.existsSync(src)) {
    throw new Error(`copyDir: source missing ${src}`);
  }
  fs.cpSync(src, dest, { recursive: true, dereference: false });
}

// Full-copy backend/node_modules/ → dist-embed/node_modules/ then prune dev-only.
// Strategy chosen over an explicit allow-list because transitive deps are too
// numerous and easy to miss; over-shipping is preferable to a runtime crash.
function shipNodeModules() {
  if (!fs.existsSync(SRC_NM)) {
    throw new Error(
      `[build-embed] missing ${SRC_NM} — run "npm install" in backend/ first.`,
    );
  }
  console.log(`[build-embed] copying node_modules (this can take a minute)…`);
  fs.rmSync(OUT_NM, { recursive: true, force: true });
  copyDir(SRC_NM, OUT_NM);

  let pruned = 0;
  for (const entry of fs.readdirSync(OUT_NM, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const name = entry.name;
    const abs = path.join(OUT_NM, name);

    if (name.startsWith('@')) {
      if (PRUNE_SCOPES_FULL.has(name)) {
        fs.rmSync(abs, { recursive: true, force: true });
        pruned++;
        continue;
      }
      const scoped = PRUNE_SCOPED[name];
      if (scoped) {
        for (const sub of fs.readdirSync(abs)) {
          if (scoped.has(sub)) {
            fs.rmSync(path.join(abs, sub), { recursive: true, force: true });
            pruned++;
          }
        }
      }
      continue;
    }

    if (PRUNE_TOPLEVEL_EXACT.has(name)) {
      fs.rmSync(abs, { recursive: true, force: true });
      pruned++;
      continue;
    }
    if (PRUNE_TOPLEVEL_PREFIX.some((p) => name.startsWith(p))) {
      fs.rmSync(abs, { recursive: true, force: true });
      pruned++;
      continue;
    }
  }

  // Sanity: critical runtime modules must still be present.
  const required = [
    '@prisma/client/package.json',
    '@prisma/client/runtime/library.js',
    '@prisma/client/default.js',
    '.prisma/client/index.js',
    '@prisma/engines/package.json',
    'better-sqlite3/package.json',
    'bcrypt/package.json',
    '@nestjs/core/package.json',
    'class-validator/package.json',
    'class-transformer/package.json',
  ];
  const missing = required.filter((rel) => !fs.existsSync(path.join(OUT_NM, rel)));
  if (missing.length) {
    throw new Error(
      `[build-embed] runtime modules missing after prune: ${missing.join(', ')}`,
    );
  }

  console.log(`[build-embed] node_modules ready (${pruned} dev-only entries pruned)`);
}

main().catch((err) => {
  console.error('[build-embed] failed:', err);
  process.exit(1);
});
