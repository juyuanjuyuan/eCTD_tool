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
  "$RES/public/index.html"
)

# reference/ is mounted at <APP>/Contents/Resources/reference/ (sibling of backend/),
# released to <userData>/reference/ on first launch by data-dir.ts. Missing here
# means CV dropdowns will be empty unless first-run.db pre-populated everything.
REF_ROOT="$APP/Contents/Resources/reference/eCTD技术规范V1.1附件包"
required+=(
  "$REF_ROOT/附件1-2：受控词汇文件包/cv-application-type.xml"
  "$REF_ROOT/附件1-2：受控词汇文件包/cv-product-type.xml"
  "$REF_ROOT/附件1-2：受控词汇文件包/cv-regulatory-activity-type.xml"
  "$REF_ROOT/附件1-2：受控词汇文件包/cv-sequence-type.xml"
  "$REF_ROOT/附件1-2：受控词汇文件包/depend-apt-rat-sqt.xml"
  "$REF_ROOT/附件2-6：STF标签值文件/valid-values.xml"
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

# Vite emits hashed JS bundles into public/assets/. A missing/empty assets dir
# means the SPA will load index.html but fail to fetch the actual app code.
if [[ ! -d "$RES/public/assets" ]]; then
  echo "MISSING: $RES/public/assets (vite assets directory)" >&2
  fail=1
else
  js_count=$(find "$RES/public/assets" -maxdepth 1 -name "*.js" | wc -l | tr -d ' ')
  if [[ "$js_count" -lt 1 ]]; then
    echo "EMPTY: $RES/public/assets contains no .js files" >&2
    fail=1
  fi
fi

# first-run.db content assertions. The DB is pre-seeded at build time with
# every CV the customer needs; if any vocabulary is short, the dropdowns will
# be empty even if the runtime release path also fails. Catches build pipeline
# regressions before they ship (E9-H7).
if [[ -f "$RES/first-run.db" ]] && command -v sqlite3 >/dev/null 2>&1; then
  q() { sqlite3 -readonly "$RES/first-run.db" "$1" 2>/dev/null || echo 0; }
  cv_apt=$(q "SELECT COUNT(*) FROM controlled_vocabulary WHERE vocabulary_name='application-type';")
  cv_prt=$(q "SELECT COUNT(*) FROM controlled_vocabulary WHERE vocabulary_name='product-type';")
  cv_rat=$(q "SELECT COUNT(*) FROM controlled_vocabulary WHERE vocabulary_name='regulatory-activity-type';")
  cv_sqt=$(q "SELECT COUNT(*) FROM controlled_vocabulary WHERE vocabulary_name='sequence-type';")
  cv_dep=$(q "SELECT COUNT(*) FROM cv_dependency;")
  cv_stf_cat=$(q "SELECT COUNT(*) FROM controlled_vocabulary WHERE vocabulary_name LIKE 'stf-category-%';")
  cv_stf_tag=$(q "SELECT COUNT(*) FROM controlled_vocabulary WHERE vocabulary_name LIKE 'stf-file-tag-%';")
  ctd_nodes=$(q "SELECT COUNT(*) FROM ctd_template_node;")
  ctd_rules=$(q "SELECT COUNT(*) FROM ctd_completeness_rule;")

  echo "  first-run.db counts: apt=$cv_apt prt=$cv_prt rat=$cv_rat sqt=$cv_sqt dep=$cv_dep stfCat=$cv_stf_cat stfTag=$cv_stf_tag ctdNodes=$ctd_nodes ctdRules=$ctd_rules"

  [[ "$cv_apt" -ne 4 ]]    && { echo "BAD: application-type expected 4, got $cv_apt" >&2; fail=1; }
  [[ "$cv_prt" -ne 2 ]]    && { echo "BAD: product-type expected 2, got $cv_prt" >&2; fail=1; }
  [[ "$cv_rat" -ne 9 ]]    && { echo "BAD: regulatory-activity-type expected 9, got $cv_rat" >&2; fail=1; }
  [[ "$cv_sqt" -ne 4 ]]    && { echo "BAD: sequence-type expected 4, got $cv_sqt" >&2; fail=1; }
  [[ "$cv_dep" -lt 1 ]]    && { echo "BAD: cv_dependency < 1, got $cv_dep" >&2; fail=1; }
  [[ "$cv_stf_cat" -lt 1 ]] && { echo "BAD: stf-category-* < 1, got $cv_stf_cat" >&2; fail=1; }
  [[ "$cv_stf_tag" -lt 1 ]] && { echo "BAD: stf-file-tag-* < 1, got $cv_stf_tag" >&2; fail=1; }
  [[ "$ctd_nodes" -lt 200 ]] && { echo "BAD: ctd_template_node < 200, got $ctd_nodes" >&2; fail=1; }
  [[ "$ctd_rules" -lt 100 ]] && { echo "BAD: ctd_completeness_rule < 100, got $ctd_rules" >&2; fail=1; }
elif [[ ! -f "$RES/first-run.db" ]]; then
  : # already reported above
elif ! command -v sqlite3 >/dev/null 2>&1; then
  echo "WARN: sqlite3 CLI not found — skipping first-run.db content assertions" >&2
fi

if [[ $fail -ne 0 ]]; then
  echo "postbuild-verify FAILED — do not ship this dmg" >&2
  exit 1
fi

echo "postbuild-verify OK: $APP"
echo "  prisma engine: $ARCH_ENGINE"
