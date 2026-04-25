#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# eCTDTool 桌面单机版 (Mac) 打包脚本
# ============================================================
# 产物：$OUT_DIR/eCTDTool-mac-[arch-]v{VERSION}.tar.gz (+ .sha256)
# 默认架构：arm64 (Apple Silicon)；--arch amd64 / both 可切换
# ============================================================

VERSION="${VERSION:-1.0.0}"
OUT_DIR="${OUT_DIR:-dist/mac}"
APP_NAME="eCTDTool"
SKIP_DOCKER="${SKIP_DOCKER:-0}"
PUBLIC_KEY_FILE="${PUBLIC_KEY_FILE:-}"
ARCH="arm64"  # arm64 | amd64 | both

while [[ $# -gt 0 ]]; do
  case "$1" in
    --version)     VERSION="$2"; shift 2 ;;
    --out-dir)     OUT_DIR="$2"; shift 2 ;;
    --skip-docker) SKIP_DOCKER=1; shift ;;
    --public-key)  PUBLIC_KEY_FILE="$2"; shift 2 ;;
    --arch)        ARCH="$2"; shift 2 ;;
    *)             echo "Unknown arg: $1" >&2; exit 1 ;;
  esac
done

case "$ARCH" in
  arm64|amd64|both) ;;
  *) echo "ERR: --arch must be arm64 | amd64 | both (got: $ARCH)" >&2; exit 1 ;;
esac

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

# ============================================================
# 预检（对应 §1.9 A5）
# ============================================================
require_image() {
  local img="$1"
  if ! docker image inspect "$img" >/dev/null 2>&1; then
    echo "ERR: docker image not found locally: $img" >&2
    echo "     先在本机 docker build / docker pull 后再打包。" >&2
    exit 1
  fi
}

if [[ "$SKIP_DOCKER" -eq 0 ]]; then
  command -v docker >/dev/null 2>&1 || { echo "ERR: docker not found" >&2; exit 1; }
  echo "[precheck] verifying all 5 images exist locally..."
  require_image "ectd-backend:latest"
  require_image "ectd-frontend:latest"
  require_image "postgres:16-alpine"
  require_image "redis:7-alpine"
  require_image "minio/minio:latest"
  echo "[precheck] ok"
fi

REFERENCE_SRC="$ROOT_DIR/reference"
REFERENCE_ATTACHMENT="$REFERENCE_SRC/eCTD技术规范V1.1附件包"
REFERENCE_XLSX="$REFERENCE_SRC/现行申报资料要求与eCTD目录元素、CTD目录层级对应表.xlsx"
if [[ ! -d "$REFERENCE_ATTACHMENT" ]]; then
  echo "ERR: reference attachment package missing: $REFERENCE_ATTACHMENT" >&2
  exit 1
fi
if [[ ! -f "$REFERENCE_XLSX" ]]; then
  echo "ERR: reference xlsx missing: $REFERENCE_XLSX" >&2
  exit 1
fi

# ============================================================
# 为单一架构打出一个完整包
# ============================================================
build_single_arch() {
  local target_arch="$1"
  local arch_suffix=""
  [[ "$ARCH" == "both" ]] && arch_suffix="-${target_arch}"
  local work_dir="$OUT_DIR/${APP_NAME}-mac${arch_suffix}-v${VERSION}"
  local images_dir="$work_dir/images"
  local runtime_dir="$work_dir/runtime"
  local reference_dir="$work_dir/reference"

  rm -rf "$work_dir"
  mkdir -p "$images_dir" "$runtime_dir" "$reference_dir"

  cp "$ROOT_DIR/docker-compose.desktop.yml" "$work_dir/docker-compose.desktop.yml"
  cp "$ROOT_DIR/tools/runtime/verify-license.js" "$runtime_dir/verify-license.js"
  cp "$ROOT_DIR/tools/runtime/get-machine-id.js" "$runtime_dir/get-machine-id.js"

  # reference 子集：只带附件包 + CTD 对应表 xlsx，不带 PDF 规范文件
  cp -R "$REFERENCE_ATTACHMENT" "$reference_dir/"
  cp "$REFERENCE_XLSX" "$reference_dir/"

  if [[ -n "$PUBLIC_KEY_FILE" ]]; then
    cp "$PUBLIC_KEY_FILE" "$work_dir/public.pem"
  fi

  cat > "$work_dir/.env.template" <<'ENV'
# Fill secrets before first launch
POSTGRES_PASSWORD=ectd_desktop_password
REDIS_PASSWORD=
MINIO_ACCESS_KEY=ectd_minio
MINIO_SECRET_KEY=ectd_minio_password
JWT_SECRET=replace_me_jwt_secret
JWT_REFRESH_SECRET=replace_me_refresh_secret
JWT_EXPIRES_IN=7d
JWT_REFRESH_EXPIRES_IN=30d
DATA_DIR="/Users/REPLACE_ME/Library/Application Support/eCTDTool"
APP_PORT=18080
BACKEND_PORT=13000
BACKEND_IMAGE=ectd-backend:latest
FRONTEND_IMAGE=ectd-frontend:latest
ENV

  cat > "$work_dir/Start.command" <<'SCRIPT'
#!/usr/bin/env bash
set -euo pipefail
BASE_DIR="$(cd "$(dirname "$0")" && pwd)"
RUNTIME_DIR="$BASE_DIR/runtime"
IMAGES_DIR="$BASE_DIR/images"
PUBLIC_KEY_FILE="$BASE_DIR/public.pem"
ENV_FILE="$BASE_DIR/.env"

DATA_ROOT="$HOME/Library/Application Support/eCTDTool"
LICENSE_FILE="$DATA_ROOT/license/license.txt"
LOAD_MARK_FILE="$DATA_ROOT/.images_loaded"

mkdir -p "$DATA_ROOT/license"

# 1) .env 首启生成
if [[ ! -f "$ENV_FILE" ]]; then
  echo "[START] .env not found, copying from .env.template"
  cp "$BASE_DIR/.env.template" "$ENV_FILE"
  # 把模板里的占位符替换成真实 HOME
  sed -i '' "s#/Users/REPLACE_ME/Library/Application Support/eCTDTool#${DATA_ROOT}#g" "$ENV_FILE"
fi

# 2) license 必须存在
if [[ ! -f "$LICENSE_FILE" ]]; then
  echo "[START] license file missing: $LICENSE_FILE"
  echo "请把激活码保存到上述路径后重试。"
  exit 1
fi

# 3) 签名校验
node "$RUNTIME_DIR/verify-license.js" "$LICENSE_FILE" "$PUBLIC_KEY_FILE"

# 4) 读 .env 并 export 给子进程（docker compose 自己也会读 compose 同目录 .env）
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

# 5) reference 首启拷贝（ctd-template / CV / 验证服务都要读 /reference）
# 用关键文件存在性而非目录存在性做判断 —— docker bind mount 会把不存在的
# host 路径自动创建为空目录，仅判 -d 会被这层副作用骗过去。
REF_SENTINEL="$DATA_ROOT/reference/eCTD技术规范V1.1附件包/附件1-2：受控词汇文件包/cv-application-type.xml"
if [[ ! -f "$REF_SENTINEL" ]]; then
  echo "[START] (re)copying reference package to $DATA_ROOT/reference"
  mkdir -p "$DATA_ROOT/reference"
  cp -R "$BASE_DIR/reference/"* "$DATA_ROOT/reference/"
fi

# 6) 端口占用自适应（从 APP_PORT 起递增最多 10 次）
if command -v lsof >/dev/null 2>&1; then
  p="${APP_PORT:-18080}"
  for i in 0 1 2 3 4 5 6 7 8 9; do
    if lsof -iTCP:"$p" -sTCP:LISTEN >/dev/null 2>&1; then
      p=$((p+1))
    else
      break
    fi
  done
  if [[ "$p" != "${APP_PORT:-18080}" ]]; then
    echo "[START] port ${APP_PORT:-18080} busy, switched to $p"
    APP_PORT="$p"
    export APP_PORT
    echo "APP_PORT=$p" >> "$DATA_ROOT/port.txt"
  fi
fi

# 7) 首启加载镜像
# 用"本地镜像是否真的存在"判断而非标记文件 —— 避免用户清 docker images 后
# 标记文件还在导致 compose 试图从 hub 拉镜像（P0-11 教训）
need_load=0
for img in ectd-backend:latest ectd-frontend:latest postgres:16-alpine redis:7-alpine minio/minio:latest; do
  if ! docker image inspect "$img" >/dev/null 2>&1; then
    need_load=1; break
  fi
done
if [[ "$need_load" == "1" && -d "$IMAGES_DIR" ]]; then
  shopt -s nullglob
  image_archives=("$IMAGES_DIR"/*.tar.gz)
  shopt -u nullglob
  if [[ ${#image_archives[@]} -gt 0 ]]; then
    echo "[START] some images missing, loading from $IMAGES_DIR ..."
    for archive in "${image_archives[@]}"; do
      echo "  - docker load < $archive"
      gzip -cd "$archive" | docker load
    done
    date > "$LOAD_MARK_FILE"
    echo "[START] image loading complete"
  fi
fi

# 8) 启动 stack（显式 --env-file，不依赖 compose 默认查找行为）
docker compose --env-file "$ENV_FILE" -f "$BASE_DIR/docker-compose.desktop.yml" up -d

# 9) 等 backend healthcheck 就绪，最多 120s
echo "[START] waiting for backend health..."
for i in $(seq 1 24); do
  if curl -sSf "http://localhost:${BACKEND_PORT:-13000}/health" >/dev/null 2>&1; then
    echo "[START] backend ready"
    break
  fi
  sleep 5
done

open "http://localhost:${APP_PORT:-18080}"
SCRIPT
  chmod +x "$work_dir/Start.command"

  cat > "$work_dir/README.txt" <<'TXT'
首次使用：
1) 把 public.pem 放到本目录（由你方提供）。
2) 确保 Docker Desktop 已安装并启动过一次。
3) 获取机器码： node runtime/get-machine-id.js
4) 把我方签发的激活码保存到：
   ~/Library/Application Support/eCTDTool/license/license.txt
5) 若系统弹 "无法验证开发者"，执行一次：
   xattr -dr com.apple.quarantine ./
6) 双击 Start.command 启动（首次会较慢，需加载镜像）。
7) 浏览器打开 http://localhost:18080
TXT

  # ================================================
  # docker save （按架构）
  # ================================================
  if [[ "$SKIP_DOCKER" -eq 0 ]]; then
    echo "[build] exporting docker images (arch=$target_arch)..."
    # 本机镜像直接 save；multi-arch 构建留给有 buildx 的构建机处理
    # （当前构建机只有本机架构镜像；--arch both 场景需要外部 buildx 流水线
    # 预先把两种架构的镜像 load 进本机 docker）
    docker save ectd-backend:latest   | gzip > "$images_dir/ectd-backend-latest.tar.gz"
    docker save ectd-frontend:latest  | gzip > "$images_dir/ectd-frontend-latest.tar.gz"
    docker save postgres:16-alpine    | gzip > "$images_dir/postgres-16-alpine.tar.gz"
    docker save redis:7-alpine        | gzip > "$images_dir/redis-7-alpine.tar.gz"
    docker save minio/minio:latest    | gzip > "$images_dir/minio-latest.tar.gz"
  fi

  # ================================================
  # 打 tar.gz + SHA256
  # ================================================
  local tarball="$OUT_DIR/${APP_NAME}-mac${arch_suffix}-v${VERSION}.tar.gz"
  mkdir -p "$OUT_DIR"
  tar -czf "$tarball" -C "$OUT_DIR" "$(basename "$work_dir")"
  (cd "$OUT_DIR" && shasum -a 256 "$(basename "$tarball")" > "$(basename "$tarball").sha256" 2>/dev/null \
      || sha256sum "$(basename "$tarball")" > "$(basename "$tarball").sha256")

  echo "[ok] package: $tarball"
  echo "[ok] sha256:  $tarball.sha256"

  # dmg 可选
  if command -v create-dmg >/dev/null 2>&1; then
    local dmg_path="$OUT_DIR/${APP_NAME}-Installer${arch_suffix}-v${VERSION}.dmg"
    create-dmg "$dmg_path" "$work_dir" || echo "[warn] create-dmg failed, keeping tar.gz only"
  else
    echo "[info] create-dmg not found, skipping dmg"
  fi
}

# ============================================================
# 主流程
# ============================================================
mkdir -p "$OUT_DIR"

case "$ARCH" in
  arm64|amd64) build_single_arch "$ARCH" ;;
  both)        build_single_arch "arm64"; build_single_arch "amd64" ;;
esac

# ============================================================
# 烟雾测试（Release Gate）— 必跑
# ============================================================
SKIP_SMOKE="${SKIP_SMOKE:-0}"
if [[ "$SKIP_DOCKER" -eq 0 && "$SKIP_SMOKE" -eq 0 ]]; then
  if [[ "$ARCH" == "both" ]]; then
    smoke_target="$OUT_DIR/${APP_NAME}-mac-arm64-v${VERSION}"
  else
    smoke_target="$OUT_DIR/${APP_NAME}-mac-v${VERSION}"
  fi
  echo "[gate] running smoke test against $smoke_target"
  bash "$ROOT_DIR/scripts/smoke-test.sh" "$smoke_target" \
    || { echo "[gate] SMOKE TEST FAILED — package NOT released" >&2; exit 1; }
  echo "[gate] smoke test PASS"
fi

echo "[done] build-mac.sh: arch=$ARCH version=$VERSION out=$OUT_DIR"
