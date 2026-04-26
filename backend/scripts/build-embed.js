#!/usr/bin/env node
/**
 * Build the embedded backend bundle for the desktop / Electron build
 * (software_upgrade / E4 stage).
 *
 * Output layout under `backend/dist-embed/`:
 *
 *   backend.bundle.js           ← single-file ESM bundle of NestJS + business code
 *   prisma/
 *     migrations.sqlite/        ← copied from prisma/migrations.sqlite/
 *     generated/prisma-sqlite/  ← copied from src/generated/prisma-sqlite/
 *   package.json                ← minimal manifest with native deps for asar unpack
 *
 * Native modules (better-sqlite3, bcrypt, @prisma/client engines) are NOT bundled;
 * they remain `external` and are loaded from the sibling `node_modules/` in the
 * Electron app package. electron-builder's `asarUnpack` keeps their `.node` binaries
 * outside the asar archive so dlopen can find them.
 *
 * Usage:
 *   node scripts/build-embed.js
 */
const path = require('path');
const fs = require('fs');
const esbuild = require('esbuild');

const ROOT = path.resolve(__dirname, '..');
const TSC_OUT = path.join(ROOT, 'dist');
const SRC_ENTRY = path.join(TSC_OUT, 'src', 'main.js');
const OUT_DIR = path.join(ROOT, 'dist-embed');
const OUT_BUNDLE = path.join(OUT_DIR, 'backend.bundle.js');

const NATIVE_EXTERNALS = [
  'better-sqlite3',
  'bcrypt',
  '@prisma/client',
  '@prisma/engines',
  // NestJS optional peer deps that pull native or class-validator-style features at runtime
  '@nestjs/microservices',
  '@nestjs/websockets',
  'class-transformer',
  'class-validator',
  'minio', // dynamic require of platform modules
  'fast-xml-parser',
  'puppeteer',
  'puppeteer-core',
  // @nestjs/terminus dynamically requires ORM-specific health indicators we don't use.
  '@mikro-orm/core',
  '@nestjs/mongoose',
  '@nestjs/sequelize',
  '@nestjs/sequelize/dist/common/sequelize.utils',
  '@nestjs/typeorm',
  '@nestjs/typeorm/dist/common/typeorm.utils',
];

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  // Step 1 — compile with tsc so decorator metadata (reflect-metadata) is emitted.
  // esbuild does not implement `emitDecoratorMetadata`, and NestJS DI relies on it.
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
    // No TS transform here — entry is already JS produced by tsc with
    // emitDecoratorMetadata. esbuild only does the bundling step.
  });

  fs.writeFileSync(
    path.join(OUT_DIR, 'metafile.json'),
    JSON.stringify(result.metafile, null, 2),
  );

  copyDir(
    path.join(ROOT, 'prisma', 'migrations.sqlite'),
    path.join(OUT_DIR, 'prisma', 'migrations.sqlite'),
  );

  // Place the generated SQLite client where the bundled require() can find it.
  // PrismaService probes `./generated/prisma-sqlite` relative to bundle location.
  const generated = path.join(ROOT, 'src', 'generated', 'prisma-sqlite');
  if (fs.existsSync(generated)) {
    copyDir(generated, path.join(OUT_DIR, 'generated', 'prisma-sqlite'), {
      filter: shouldCopyPrismaFile,
    });
  } else {
    console.warn(
      `[build-embed] warning: ${generated} missing — run "npm run prisma:sqlite:generate" first`,
    );
  }

  // Ship `@prisma/client` and the postgres-side generated `.prisma/client` into
  // dist-embed/node_modules/. The esbuild bundle keeps `@prisma/client` external,
  // so at runtime Node resolves `require("@prisma/client")` against this folder.
  // The whole codebase (32 files) imports enums like Role/LeafOperation from
  // @prisma/client as runtime values, so this is a hard dependency even when
  // the active provider is SQLite.
  copyPrismaPackage(
    path.join(ROOT, 'node_modules', '@prisma', 'client'),
    path.join(OUT_DIR, 'node_modules', '@prisma', 'client'),
    '@prisma/client',
  );
  copyPrismaPackage(
    path.join(ROOT, 'node_modules', '.prisma', 'client'),
    path.join(OUT_DIR, 'node_modules', '.prisma', 'client'),
    '.prisma/client',
  );

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
          'Generated by scripts/build-embed.js. Native deps remain external; ' +
          'install/copy them into the Electron app package.',
      },
      null,
      2,
    ),
  );

  console.log('[build-embed] done.');
}

function copyDir(src, dest, options = {}) {
  if (!fs.existsSync(src)) {
    throw new Error(`copyDir: source missing ${src}`);
  }
  const filter = options.filter || (() => true);
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      if (!filter(s, entry)) continue;
      copyDir(s, d, options);
    } else {
      if (!filter(s, entry)) continue;
      fs.copyFileSync(s, d);
    }
  }
}

// Skip files that are not needed at runtime to keep the desktop bundle small.
// We must keep: *.js, package.json, *.node (engine binaries), *.wasm (wasm engine).
function shouldCopyPrismaFile(absPath, dirent) {
  const name = dirent.name;
  if (dirent.isDirectory()) {
    // Skip nested junk dirs that some package versions ship.
    if (name === '__tests__' || name === 'test' || name === 'tests') return false;
    return true;
  }
  // Drop sourcemaps, type defs, ESM duplicates, docs.
  if (name.endsWith('.map')) return false;
  if (name.endsWith('.d.ts') || name.endsWith('.d.mts') || name.endsWith('.d.cts')) return false;
  if (name.endsWith('.mjs')) return false; // CJS bundle never imports the ESM build
  if (/^(README|LICENSE|CHANGELOG)(\.|$)/i.test(name)) return false;
  // Edge / browser / react-native variants are never loaded by Node main process.
  if (name === 'edge.js' || name === 'edge-esm.js') return false;
  if (name === 'index-browser.js') return false;
  if (name === 'react-native.js') return false;
  if (name === 'wasm-edge-light-loader.mjs' || name === 'wasm-worker-loader.mjs') return false;
  return true;
}

function copyPrismaPackage(src, dest, label) {
  if (!fs.existsSync(src)) {
    throw new Error(
      `[build-embed] required package missing: ${label} at ${src}. ` +
        `Run "npm install" and "npx prisma generate" in backend/ first.`,
    );
  }
  // Wipe an existing dest so removed-from-source files don't linger across builds.
  fs.rmSync(dest, { recursive: true, force: true });
  copyDir(src, dest, { filter: shouldCopyPrismaFile });
  console.log(`[build-embed] shipped ${label} → ${path.relative(ROOT, dest)}`);
}

main().catch((err) => {
  console.error('[build-embed] failed:', err);
  process.exit(1);
});
