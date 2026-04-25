#!/usr/bin/env bash
set -euo pipefail

echo "[entrypoint] prisma migrate deploy"
npx --no-install prisma migrate deploy

echo "[entrypoint] seed default users (idempotent upsert)"
node dist/prisma/seed.js || echo "[entrypoint] seed.js failed, continuing"

echo "[entrypoint] seed CTD templates (skips if already populated)"
node dist/prisma/seed-ctd.js || echo "[entrypoint] seed-ctd.js failed, continuing"

echo "[entrypoint] launching nest app: $*"
exec "$@"
