import * as fs from 'fs';
import * as path from 'path';

/**
 * Resolve the SQLite migrations directory depending on how the backend is being
 * run:
 *
 *   - dev (`npm run start:dev`): __dirname is `src/embedded/`, sibling is `src/`,
 *     migrations live at `<repo>/backend/prisma/migrations.sqlite/`.
 *   - bundled (esbuild → `dist-embed/backend.bundle.js`): the build script copies
 *     migrations to `dist-embed/prisma/migrations.sqlite/`.
 *   - Electron resources (production): Electron main exports `MIGRATIONS_DIR`
 *     pointing to `process.resourcesPath/backend/prisma/migrations.sqlite/`.
 *
 * If `process.env.MIGRATIONS_DIR` is set we honour it. Otherwise probe the two
 * relative locations.
 */
export function resolveMigrationsDir(): string {
  const fromEnv = process.env.MIGRATIONS_DIR;
  if (fromEnv) return fromEnv;

  const candidates = [
    path.resolve(__dirname, '..', '..', 'prisma', 'migrations.sqlite'),
    path.resolve(__dirname, '..', '..', '..', 'prisma', 'migrations.sqlite'),
    path.resolve(__dirname, 'prisma', 'migrations.sqlite'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  throw new Error(
    `Could not locate migrations.sqlite directory. Tried: ${candidates.join(', ')}. ` +
      `Set MIGRATIONS_DIR explicitly.`,
  );
}

/**
 * Resolve the SQLite database file. Reads `DATABASE_URL` (`file:./dev.db`),
 * normalises to an absolute path under DATA_DIR if relative.
 */
export function resolveDatabaseFile(): string {
  const url = process.env.DATABASE_URL || '';
  if (!url.startsWith('file:')) {
    throw new Error(
      `resolveDatabaseFile: DB_PROVIDER=sqlite requires DATABASE_URL=file:..., got ${url || '(empty)'}`,
    );
  }
  let raw = url.slice('file:'.length);
  if (path.isAbsolute(raw)) return raw;

  const dataDir = process.env.DATA_DIR;
  if (dataDir) {
    return path.resolve(dataDir, raw.replace(/^\.\//, ''));
  }
  return path.resolve(process.cwd(), raw);
}
