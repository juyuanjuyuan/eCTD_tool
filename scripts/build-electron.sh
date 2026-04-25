#!/usr/bin/env bash
# Build the desktop installer end-to-end (software_upgrade / E8 stage).
#
# Steps:
#   1. backend: prisma generate (sqlite) + tsc + esbuild bundle
#   2. backend: produce first-run.db snapshot (full seed: CTD template + CV + STF)
#   3. frontend: vite production build
#   4. desktop: copy frontend dist into resources, copy reference into resources
#   5. desktop: tsc + electron-builder
#   6. produce SHA256SUMS.txt next to the installers
#
# Usage:
#   scripts/build-electron.sh mac        # both arm64 + x64 dmg
#   scripts/build-electron.sh mac:arm64
#   scripts/build-electron.sh mac:x64
#   scripts/build-electron.sh win        # x64 nsis
#   scripts/build-electron.sh all
#
# Pre-flight env (optional but recommended):
#   APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID — Mac notarization
#   WIN_CSC_LINK, WIN_CSC_KEY_PASSWORD — Win signing (PFX or PKCS#12)
set -euo pipefail

target="${1:-}"
if [[ -z "$target" ]]; then
  echo "Usage: $0 {mac|mac:arm64|mac:x64|win|all}" >&2
  exit 2
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "==> [1/6] backend: prisma generate + build:embed"
pushd backend > /dev/null
npm run prisma:sqlite:generate
npm run build:embed
popd > /dev/null

echo "==> [2/6] backend: produce first-run.db snapshot"
pushd backend > /dev/null
node scripts/build-firstrun-db.js
# Move snapshot next to the bundle so electron-builder picks it up via extraResources.
mv -f prisma/first-run.db dist-embed/first-run.db
popd > /dev/null

echo "==> [2.5/6] backend: install native modules for embed"
pushd backend/dist-embed > /dev/null
npm install --omit=dev
cp -R ../node_modules/.prisma ./node_modules/
popd > /dev/null

echo "==> [3/6] frontend: vite production build"
pushd frontend > /dev/null
npm run build
popd > /dev/null

echo "==> [4/6] desktop: stage resources"
pushd desktop > /dev/null
mkdir -p resources/reference
# frontend dist is consumed by Electron via the backend (loadURL hits backend),
# so we don't actually copy it into resources/. Backend serves the static SPA.
# (If you switch to file:// loading instead, copy frontend/dist here.)

# Copy the reference XML bundle so the desktop app can release it on first run.
if [[ -d "../reference/eCTD技术规范V1.1附件包" ]]; then
  rsync -a --delete "../reference/eCTD技术规范V1.1附件包/" "resources/reference/eCTD技术规范V1.1附件包/"
fi
if [[ -f "../reference/现行申报资料要求与eCTD目录元素、CTD目录层级对应表.xlsx" ]]; then
  cp "../reference/现行申报资料要求与eCTD目录元素、CTD目录层级对应表.xlsx" "resources/reference/"
fi

echo "==> [5/6] desktop: tsc + electron-builder ($target)"
case "$target" in
  mac)        npm run build:mac ;;
  mac:arm64)  npm run build:mac:arm64 ;;
  mac:x64)    npm run build:mac:x64 ;;
  win)        npm run build:win ;;
  all)        npm run build:all ;;
  *)
    echo "unknown target: $target" >&2
    exit 2 ;;
esac
popd > /dev/null

echo "==> [6/6] SHA256 sums"
RELEASE_DIR="$ROOT/desktop/release"
if [[ -d "$RELEASE_DIR" ]]; then
  pushd "$RELEASE_DIR" > /dev/null
  rm -f SHA256SUMS.txt
  # macOS uses shasum, Linux/Win usually has sha256sum
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum *.dmg *.exe *.AppImage 2>/dev/null > SHA256SUMS.txt || true
  else
    shasum -a 256 *.dmg *.exe *.AppImage 2>/dev/null > SHA256SUMS.txt || true
  fi
  echo "wrote $(wc -l < SHA256SUMS.txt | tr -d ' ') sums to $RELEASE_DIR/SHA256SUMS.txt"
  popd > /dev/null
fi

echo "==> done. installers in: $RELEASE_DIR"
ls -la "$RELEASE_DIR" 2>/dev/null || echo "(release dir empty)"
