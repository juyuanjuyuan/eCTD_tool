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

echo "==> [1/6] frontend: vite production build"
# MUST run before [2/6] build:embed — `shipFrontendDist` inside build:embed
# copies frontend/dist into dist-embed/public/. If vite build runs *after*
# build:embed, edits to frontend/src never reach the dmg until the next build.
pushd frontend > /dev/null
npm run build
popd > /dev/null
if [[ ! -f frontend/dist/index.html ]]; then
  echo "FATAL: frontend/dist/index.html missing after vite build" >&2
  exit 1
fi

echo "==> [2/6] backend: prisma generate + build:embed (ships frontend dist)"
# Ensure backend/node_modules native binaries match the system Node ABI before
# firstrun-db runs in [3/6]. A previous run of @electron/rebuild may have left
# Electron-ABI prebuilds here, which breaks node-side scripts. This rebuild is
# fast (uses prebuild-install cache) and is a no-op if already correct.
pushd backend > /dev/null
npm rebuild better-sqlite3 bcrypt 2>&1 | tail -10 || true
popd > /dev/null
pushd backend > /dev/null
# Both clients need to be regenerated on the build host so cross-platform
# query engine .node binaries (darwin / darwin-arm64 / windows) end up in
# node_modules/.prisma/client/ and src/generated/prisma-sqlite/.
# Without this, binaryTargets changes in schema.*.prisma have no effect on
# what gets shipped — only the engine for the build host platform is present.
npx prisma generate
npm run prisma:sqlite:generate
npm run build:embed
popd > /dev/null
# Sanity: confirm shipFrontendDist actually placed the freshly-built SPA into
# dist-embed/public/. If absent, electron-builder would silently pack a stale
# bundle with stale frontend chunks.
if [[ ! -f backend/dist-embed/public/index.html ]]; then
  echo "FATAL: backend/dist-embed/public/index.html missing — shipFrontendDist failed" >&2
  exit 1
fi

echo "==> [3/6] backend: produce first-run.db snapshot"
pushd backend > /dev/null
node scripts/build-firstrun-db.js
# Move snapshot next to the bundle so electron-builder picks it up via extraResources.
mv -f prisma/first-run.db dist-embed/first-run.db
popd > /dev/null

echo "==> [3.5/6] rebuild native modules against Electron ABI"
# Pick the arch the dmg/installer is being built for. Native .node files
# compiled against system Node (NODE_MODULE_VERSION 127) won't load inside
# Electron's child_process.fork (which uses Electron's Node ABI, currently
# NODE_MODULE_VERSION 125 for Electron 31). @electron/rebuild compiles
# better-sqlite3 / bcrypt against the right ABI for the target arch.
case "$target" in
  mac:arm64)  rebuild_arch=arm64 ;;
  mac:x64)    rebuild_arch=x64   ;;
  win)        rebuild_arch=x64   ;;
  mac|all)
    echo "target=$target rebuilds only host arch; multi-arch not supported in single pass" >&2
    rebuild_arch="$(uname -m)"
    [[ "$rebuild_arch" == "x86_64" ]] && rebuild_arch=x64
    ;;
  *) rebuild_arch="$(uname -m)"; [[ "$rebuild_arch" == "x86_64" ]] && rebuild_arch=x64 ;;
esac
electron_version=$(node -p "require('$ROOT/desktop/node_modules/electron/package.json').version")
echo "    rebuilding for electron=$electron_version arch=$rebuild_arch"
"$ROOT/desktop/node_modules/.bin/electron-rebuild" \
  --module-dir "$ROOT/backend/dist-embed" \
  --version "$electron_version" \
  --arch "$rebuild_arch" \
  --only better-sqlite3,bcrypt \
  --force

echo "==> [4/6] desktop: stage resources"
pushd desktop > /dev/null
mkdir -p resources/reference
# frontend dist is consumed by Electron via the backend (loadURL hits backend),
# so we don't actually copy it into resources/. Backend serves the static SPA.
# (If you switch to file:// loading instead, copy frontend/dist here.)

# Copy the reference XML bundle so the desktop app can release it on first run.
# This is HARD-required: missing reference here means data-dir.ts at runtime
# has nothing to release to <userData>/reference/, and combined with an empty
# first-run.db the app ships with empty CV dropdowns (see E9-H7).
if [[ ! -d "../reference/eCTD技术规范V1.1附件包" ]]; then
  echo "FATAL: <repo>/reference/eCTD-tech-spec-V1.1-bundle (eCTD技术规范V1.1附件包) missing -- cannot stage" >&2
  exit 1
fi
rsync -a --delete "../reference/eCTD技术规范V1.1附件包/" "resources/reference/eCTD技术规范V1.1附件包/"
if [[ -f "../reference/现行申报资料要求与eCTD目录元素、CTD目录层级对应表.xlsx" ]]; then
  cp "../reference/现行申报资料要求与eCTD目录元素、CTD目录层级对应表.xlsx" "resources/reference/"
fi

# Stage-time sanity: assert the four CV files + STF valid-values are actually
# in the staged resources before electron-builder packs the dmg/exe. Catches
# disk full / partial rsync / wrong locale path before [5/6].
required_xmls=(
  "resources/reference/eCTD技术规范V1.1附件包/附件1-2：受控词汇文件包/cv-application-type.xml"
  "resources/reference/eCTD技术规范V1.1附件包/附件1-2：受控词汇文件包/cv-product-type.xml"
  "resources/reference/eCTD技术规范V1.1附件包/附件1-2：受控词汇文件包/cv-regulatory-activity-type.xml"
  "resources/reference/eCTD技术规范V1.1附件包/附件1-2：受控词汇文件包/cv-sequence-type.xml"
  "resources/reference/eCTD技术规范V1.1附件包/附件1-2：受控词汇文件包/depend-apt-rat-sqt.xml"
  "resources/reference/eCTD技术规范V1.1附件包/附件2-6：STF标签值文件/valid-values.xml"
)
for f in "${required_xmls[@]}"; do
  if [[ ! -f "$f" ]]; then
    echo "FATAL: required reference XML missing after staging: $f" >&2
    exit 1
  fi
done
echo "    [4/6] reference XMLs staged: ${#required_xmls[@]} files OK"

# Puppeteer Chromium pre-staging. Build host's bundled chromium has the
# WRONG binary format on cross-platform builds (Linux build host → Windows
# installer ships a Linux chromium). Two ways to handle:
#   (a) Skip and let puppeteer download on first PDF export (current default).
#       Customer experience: first PDF is slow + needs internet.
#   (b) Set PUPPETEER_DOWNLOAD_PATH at build and pre-fetch the platform binary.
# We log a clear warning so the build engineer knows what they're shipping.
case "$target" in
  win)
    if [[ ! -d "$ROOT/backend/node_modules/puppeteer/.local-chromium/win64-"* ]] 2>/dev/null \
       && [[ ! -d "$ROOT/backend/node_modules/puppeteer/chrome/win"* ]] 2>/dev/null; then
      echo "    [warn] puppeteer Win64 chromium NOT pre-staged in backend/node_modules." >&2
      echo "    [warn] First-time PDF export on customer machine will download ~150MB and" >&2
      echo "    [warn] requires internet. To pre-stage: set PUPPETEER_DOWNLOAD_PATH and" >&2
      echo "    [warn] run \"npx puppeteer browsers install chrome --platform win64\" before this script." >&2
    fi
    ;;
esac

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

RELEASE_DIR="$ROOT/desktop/release"

echo "==> [5.5/6] post-build verify"
bash "$ROOT/scripts/postbuild-verify.sh" "$RELEASE_DIR"

echo "==> [6/6] SHA256 sums"
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
