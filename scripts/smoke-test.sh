#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# 冷装烟雾测试（构建后必跑，业务主链路验证）
# ============================================================
# 前置：scripts/build-mac.sh 已产出包；本脚本会在 /tmp/ectd-smoke
# 起一个隔离的 stack，跑完业务主链路再清理。
# 任何一步失败立即退出非零，build-mac.sh 据此判断是否阻塞出包。
# ============================================================

PKG_DIR="${1:-}"
if [[ -z "$PKG_DIR" || ! -d "$PKG_DIR" ]]; then
  echo "Usage: $0 <package-dir>   (e.g. /tmp/ectd-release/eCTDTool-mac-v0.4.0)" >&2
  exit 1
fi

DATA_DIR="/tmp/ectd-smoke-data"
ENV_FILE="$DATA_DIR/.env"
COMPOSE="$PKG_DIR/docker-compose.desktop.yml"

cleanup() {
  echo "[smoke] cleanup..."
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE" down -v 2>/dev/null || true
  rm -rf "$DATA_DIR" 2>/dev/null || true
}
trap cleanup EXIT

# ----- prepare -----
rm -rf "$DATA_DIR"
mkdir -p "$DATA_DIR"/{postgres,redis,minio,reference,logs/backend,license}
cp -R "$PKG_DIR/reference/"* "$DATA_DIR/reference/"

cat > "$ENV_FILE" <<ENV
POSTGRES_PASSWORD=smoke_pg
REDIS_PASSWORD=
MINIO_ACCESS_KEY=smoke_minio
MINIO_SECRET_KEY=smoke_minio_pass
JWT_SECRET=smoke_jwt
JWT_REFRESH_SECRET=smoke_refresh
JWT_EXPIRES_IN=7d
JWT_REFRESH_EXPIRES_IN=30d
DATA_DIR=$DATA_DIR
APP_PORT=18099
BACKEND_PORT=13099
BACKEND_IMAGE=ectd-backend:latest
FRONTEND_IMAGE=ectd-frontend:latest
ENV

# ----- step 1: stack up -----
echo "[smoke] step 1/6: stack up"
docker compose --env-file "$ENV_FILE" -f "$COMPOSE" up -d
sleep 15
for i in $(seq 1 24); do
  unhealthy=$(docker compose --env-file "$ENV_FILE" -f "$COMPOSE" ps --format json 2>/dev/null \
    | grep -c '"Health":"unhealthy"\|"State":"restarting"\|"State":"exited"' || true)
  ready=$(docker compose --env-file "$ENV_FILE" -f "$COMPOSE" ps --format json 2>/dev/null | wc -l)
  if [[ "$unhealthy" == "0" && "$ready" -ge "5" ]]; then break; fi
  sleep 5
done
running=$(docker ps --filter name=ectd-desktop --format '{{.Names}}' | wc -l)
[[ "$running" -ge 5 ]] || { docker compose --env-file "$ENV_FILE" -f "$COMPOSE" ps; echo "FAIL step1: only $running containers running" >&2; exit 1; }

# ----- step 2: /health 200 -----
echo "[smoke] step 2/6: backend /health"
for i in $(seq 1 24); do
  curl -sSf "http://localhost:13099/health" >/dev/null 2>&1 && break
  sleep 5
done
curl -sSf "http://localhost:13099/health" >/dev/null || { echo "FAIL step2: /health did not return 200" >&2; exit 1; }

# ----- step 3: env vars present in backend container -----
echo "[smoke] step 3/6: backend env vars"
required_env=(JWT_SECRET JWT_REFRESH_SECRET JWT_EXPIRES_IN JWT_REFRESH_EXPIRES_IN DATABASE_URL REDIS_HOST MINIO_ENDPOINT MINIO_ACCESS_KEY MINIO_BUCKET)
for v in "${required_env[@]}"; do
  if ! docker exec ectd-desktop-backend env | grep -q "^${v}="; then
    echo "FAIL step3: env $v missing in backend container" >&2; exit 1
  fi
done

# ----- step 4: reference sentinel mounted -----
echo "[smoke] step 4/6: reference sentinel"
docker exec ectd-desktop-backend test -f "/reference/eCTD技术规范V1.1附件包/附件1-2：受控词汇文件包/cv-application-type.xml" \
  || { echo "FAIL step4: cv-application-type.xml missing in /reference" >&2; exit 1; }

# ----- step 5: login & get JWT -----
echo "[smoke] step 5/6: login admin@ectd.com"
login_resp=$(curl -sS -X POST "http://localhost:13099/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@ectd.com","password":"admin123"}')
echo "$login_resp" | grep -q '"accessToken"' \
  || { echo "FAIL step5: login did not return accessToken: $login_resp" >&2; exit 1; }
token=$(echo "$login_resp" | sed -n 's/.*"accessToken":"\([^"]*\)".*/\1/p')

# ----- step 6: authenticated business endpoint -----
echo "[smoke] step 6/6: GET /api/v1/projects with JWT"
curl -sSf "http://localhost:13099/api/v1/projects" -H "Authorization: Bearer $token" >/dev/null \
  || { echo "FAIL step6: /api/v1/projects unauthorized or failed" >&2; exit 1; }

echo "[smoke] ALL 6 STEPS PASS"
