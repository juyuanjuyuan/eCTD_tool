#!/usr/bin/env bash
# Post-build sanity check: fail loudly if the produced .app is missing any of
# the runtime files we know are required for the backend to start. Builds that
# fail this check must NOT be shipped to the test machine.
set -euo pipefail

RELEASE_DIR="${1:-desktop/release}"
APP=$(find "$RELEASE_DIR" -maxdepth 3 -name "eCTDTool.app" -type d | head -1)
if [[ -z "${APP:-}" || ! -d "$APP" ]]; then
  echo "postbuild-verify: no eCTDTool.app under $RELEASE_DIR" >&2
  exit 1
fi
RES="$APP/Contents/Resources/backend"

# darwin-arm64 / darwin-x64 engines have different names; pick whichever exists.
ARCH_ENGINE=""
for cand in \
  "$RES/node_modules/.prisma/client/libquery_engine-darwin-arm64.dylib.node" \
  "$RES/node_modules/.prisma/client/libquery_engine-darwin.dylib.node"
do
  if [[ -e "$cand" ]]; then
    ARCH_ENGINE="$cand"
    break
  fi
done

fail=0
required=(
  "$RES/backend.bundle.js"
  "$RES/node_modules/@prisma/client/package.json"
  "$RES/node_modules/@prisma/client/runtime/library.js"
  "$RES/node_modules/@prisma/client/default.js"
  "$RES/node_modules/.prisma/client/index.js"
  "$RES/node_modules/better-sqlite3/build/Release/better_sqlite3.node"
  "$RES/generated/prisma-sqlite/index.js"
  "$RES/prisma/migrations.sqlite/migration_lock.toml"
  "$RES/first-run.db"
)

for f in "${required[@]}"; do
  if [[ ! -e "$f" ]]; then
    echo "MISSING: $f" >&2
    fail=1
  fi
done

if [[ -z "$ARCH_ENGINE" ]]; then
  echo "MISSING: $RES/node_modules/.prisma/client/libquery_engine-darwin*.dylib.node" >&2
  fail=1
fi

if [[ $fail -ne 0 ]]; then
  echo "postbuild-verify FAILED — do not ship this dmg" >&2
  exit 1
fi

echo "postbuild-verify OK: $APP"
echo "  prisma engine: $ARCH_ENGINE"
