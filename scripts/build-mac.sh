#!/usr/bin/env bash
set -euo pipefail

VERSION="${VERSION:-1.0.0}"
OUT_DIR="${OUT_DIR:-dist/mac}"
APP_NAME="eCTDTool"
SKIP_DOCKER="${SKIP_DOCKER:-0}"
PUBLIC_KEY_FILE="${PUBLIC_KEY_FILE:-}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --version)
      VERSION="$2"; shift 2 ;;
    --out-dir)
      OUT_DIR="$2"; shift 2 ;;
    --skip-docker)
      SKIP_DOCKER=1; shift ;;
    --public-key)
      PUBLIC_KEY_FILE="$2"; shift 2 ;;
    *)
      echo "Unknown arg: $1" >&2; exit 1 ;;
  esac
done

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
WORK_DIR="$OUT_DIR/${APP_NAME}-mac-v${VERSION}"
IMAGES_DIR="$WORK_DIR/images"
RUNTIME_DIR="$WORK_DIR/runtime"

mkdir -p "$IMAGES_DIR" "$RUNTIME_DIR"

cp "$ROOT_DIR/docker-compose.desktop.yml" "$WORK_DIR/docker-compose.desktop.yml"
cp "$ROOT_DIR/tools/runtime/verify-license.js" "$RUNTIME_DIR/verify-license.js"
cp "$ROOT_DIR/tools/runtime/get-machine-id.js" "$RUNTIME_DIR/get-machine-id.js"

if [[ -n "$PUBLIC_KEY_FILE" ]]; then
  cp "$PUBLIC_KEY_FILE" "$WORK_DIR/public.pem"
fi

cat > "$WORK_DIR/.env.template" <<'ENV'
# Fill secrets before first launch
POSTGRES_PASSWORD=ectd_desktop_password
REDIS_PASSWORD=
MINIO_ACCESS_KEY=ectd_minio
MINIO_SECRET_KEY=ectd_minio_password
JWT_SECRET=replace_me_jwt_secret
JWT_REFRESH_SECRET=replace_me_refresh_secret
DATA_DIR="$HOME/Library/Application Support/eCTDTool"
APP_PORT=18080
BACKEND_PORT=13000
BACKEND_IMAGE=ectd-backend:latest
FRONTEND_IMAGE=ectd-frontend:latest
ENV

cat > "$WORK_DIR/Start.command" <<'SCRIPT'
#!/usr/bin/env bash
set -euo pipefail
BASE_DIR="$(cd "$(dirname "$0")" && pwd)"
RUNTIME_DIR="$BASE_DIR/runtime"
LICENSE_FILE="$HOME/Library/Application Support/eCTDTool/license/license.txt"
PUBLIC_KEY_FILE="$BASE_DIR/public.pem"
ENV_FILE="$BASE_DIR/.env"
IMAGES_DIR="$BASE_DIR/images"
LOAD_MARK_FILE="$HOME/Library/Application Support/eCTDTool/.images_loaded"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "[START] .env not found, copying from .env.template"
  cp "$BASE_DIR/.env.template" "$ENV_FILE"
fi

mkdir -p "$HOME/Library/Application Support/eCTDTool/license"

if [[ ! -f "$LICENSE_FILE" ]]; then
  echo "[START] license file missing: $LICENSE_FILE"
  echo "请把激活码保存到上述路径后重试。"
  exit 1
fi

node "$RUNTIME_DIR/verify-license.js" "$LICENSE_FILE" "$PUBLIC_KEY_FILE"

# shellcheck disable=SC1090
source "$ENV_FILE"

if [[ ! -f "$LOAD_MARK_FILE" && -d "$IMAGES_DIR" ]]; then
  shopt -s nullglob
  image_archives=("$IMAGES_DIR"/*.tar.gz)
  shopt -u nullglob
  if [[ ${#image_archives[@]} -gt 0 ]]; then
    echo "[START] loading docker images from $IMAGES_DIR ..."
    for archive in "${image_archives[@]}"; do
      echo "  - docker load < $archive"
      gzip -cd "$archive" | docker load
    done
    mkdir -p "$(dirname "$LOAD_MARK_FILE")"
    date > "$LOAD_MARK_FILE"
    echo "[START] image loading complete"
  fi
fi

docker compose -f "$BASE_DIR/docker-compose.desktop.yml" up -d
open "http://localhost:${APP_PORT:-18080}"
SCRIPT
chmod +x "$WORK_DIR/Start.command"

cat > "$WORK_DIR/README.txt" <<'TXT'
1) 将 public.pem 放到本目录。
2) 复制 .env.template 为 .env 并修改密钥。
3) 把激活码保存到 ~/Library/Application Support/eCTDTool/license/license.txt
4) 双击 Start.command 启动。
TXT

if [[ "$SKIP_DOCKER" -eq 0 ]]; then
  command -v docker >/dev/null 2>&1 || { echo "docker not found. use --skip-docker in CI/non-docker env" >&2; exit 1; }
  echo "[BUILD] exporting docker images..."
  docker save ectd-backend:latest | gzip > "$IMAGES_DIR/ectd-backend-latest.tar.gz"
  docker save ectd-frontend:latest | gzip > "$IMAGES_DIR/ectd-frontend-latest.tar.gz"
  docker save postgres:16-alpine | gzip > "$IMAGES_DIR/postgres-16-alpine.tar.gz"
  docker save redis:7-alpine | gzip > "$IMAGES_DIR/redis-7-alpine.tar.gz"
  docker save minio/minio:latest | gzip > "$IMAGES_DIR/minio-latest.tar.gz"
fi

TARBALL="$OUT_DIR/${APP_NAME}-mac-v${VERSION}.tar.gz"
mkdir -p "$OUT_DIR"

tar -czf "$TARBALL" -C "$OUT_DIR" "${APP_NAME}-mac-v${VERSION}"

echo "[OK] mac package generated: $TARBALL"
if command -v create-dmg >/dev/null 2>&1; then
  DMG_PATH="$OUT_DIR/${APP_NAME}-Installer-v${VERSION}.dmg"
  create-dmg "$DMG_PATH" "$WORK_DIR"
  echo "[OK] dmg generated: $DMG_PATH"
else
  echo "[INFO] create-dmg not found, skipped dmg generation"
fi
