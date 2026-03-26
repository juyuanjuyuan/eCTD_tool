# eCTD 在线文档撰写工具 — 部署文档

## 1. 系统要求

| 组件 | 最低要求 | 推荐配置 |
|------|----------|----------|
| CPU | 2 核 | 4 核+ |
| 内存 | 4 GB | 8 GB+ |
| 磁盘 | 40 GB | 100 GB+ (SSD) |
| OS | Linux (Ubuntu 22.04+/CentOS 8+) | Ubuntu 24.04 LTS |
| Docker | 24.0+ | 最新稳定版 |
| Docker Compose | v2.20+ | 最新稳定版 |

## 2. 快速部署（Docker Compose）

### 2.1 准备环境

```bash
# 安装 Docker & Docker Compose (Ubuntu)
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# 克隆仓库
git clone <repo-url> /opt/ectd-tool
cd /opt/ectd-tool
```

### 2.2 配置环境变量

```bash
cp .env.production.example .env.production
# 编辑 .env.production，修改以下必填项：
#   POSTGRES_PASSWORD — 强密码
#   JWT_SECRET — 64 字符随机字符串
#   JWT_REFRESH_SECRET — 另一个 64 字符随机字符串
#   REDIS_PASSWORD — Redis 密码
#   MINIO_ACCESS_KEY — MinIO 访问密钥
#   MINIO_SECRET_KEY — MinIO 密钥

# 生成随机密钥示例
openssl rand -hex 32  # 64 字符
```

### 2.3 准备 util 文件

```bash
# 将 DTD/Schema/XSL 从参考文件复制到后端
./scripts/prepare-util-files.sh
```

### 2.4 启动服务

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production up -d
```

### 2.5 初始化数据库

```bash
# 运行数据库迁移
docker exec ectd-backend npx prisma migrate deploy

# 创建管理员用户
docker exec ectd-backend npx ts-node prisma/seed-production.ts
```

### 2.6 验证部署

```bash
# 检查服务状态
docker compose -f docker-compose.prod.yml ps

# 检查健康状态
curl http://localhost/health
curl http://localhost/api/health

# 查看日志
docker compose -f docker-compose.prod.yml logs -f backend
```

## 3. HTTPS 配置

### 3.1 准备 SSL 证书

```bash
mkdir -p ssl/

# 方式一: Let's Encrypt (推荐)
# 使用 certbot 获取证书后复制到 ssl/
cp /etc/letsencrypt/live/your-domain.com/fullchain.pem ssl/cert.pem
cp /etc/letsencrypt/live/your-domain.com/privkey.pem ssl/key.pem

# 方式二: 自签名证书 (仅用于测试)
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout ssl/key.pem -out ssl/cert.pem \
  -subj "/CN=your-domain.com"
```

### 3.2 启用 HTTPS

1. 编辑 `frontend/nginx.conf`，取消 HTTPS server block 的注释
2. 将 `your-domain.com` 替换为实际域名
3. 重新构建并启动前端容器

```bash
docker compose -f docker-compose.prod.yml up -d --build frontend
```

## 4. 数据备份

### 4.1 自动备份

```bash
# 设置每日凌晨 2 点自动备份
crontab -e
# 添加以下行：
# 0 2 * * * /opt/ectd-tool/scripts/backup-db.sh >> /var/log/ectd-backup.log 2>&1
```

### 4.2 手动备份

```bash
./scripts/backup-db.sh
```

### 4.3 恢复数据库

```bash
# 解压备份
gunzip backups/ectd_20260323_020000.sql.gz

# 恢复到数据库
docker exec -i ectd-postgres psql -U ectd -d ectd < backups/ectd_20260323_020000.sql
```

### 4.4 MinIO 文件备份

```bash
# MinIO 数据持久化在 Docker volume: minio_data
# 手动备份 MinIO 数据
docker run --rm -v ectd-tool_minio_data:/data -v $(pwd)/backups:/backup \
  alpine tar czf /backup/minio_$(date +%Y%m%d).tar.gz -C /data .
```

## 5. 数据库维护

### 5.1 连接数据库

```bash
# 通过 Docker 进入 psql
docker exec -it ectd-postgres psql -U ectd -d ectd

# 或使用 Prisma Studio（开发环境）
cd backend && npx prisma studio
```

### 5.2 数据库迁移

```bash
# 查看迁移状态
docker exec ectd-backend npx prisma migrate status

# 应用迁移
docker exec ectd-backend npx prisma migrate deploy
```

### 5.3 连接池配置

通过环境变量调整数据库连接池（默认 10 连接）：

```env
DB_CONNECTION_LIMIT=20    # 最大连接数
DB_POOL_TIMEOUT=30        # 连接超时（秒）
```

### 5.4 常用维护查询

```sql
-- 查看表大小
SELECT relname, pg_size_pretty(pg_total_relation_size(relid))
FROM pg_catalog.pg_statio_user_tables ORDER BY pg_total_relation_size(relid) DESC;

-- 查看活跃连接
SELECT count(*) FROM pg_stat_activity WHERE state = 'active';

-- 清理受控词汇缓存（重新导入）
-- 重启后端服务即可自动重新导入
```

## 6. 监控与日志

### 6.1 查看日志

```bash
# 后端日志
docker logs -f ectd-backend --tail 100

# 全部服务日志
docker compose -f docker-compose.prod.yml logs -f

# Nginx 访问日志
docker exec ectd-frontend cat /var/log/nginx/access.log
```

### 6.2 健康检查

| 端点 | 用途 |
|------|------|
| `GET /health` | Nginx 前端健康检查 |
| `GET /api/health` | 后端应用 + 数据库健康检查 |

### 6.3 Redis 监控

```bash
docker exec ectd-redis redis-cli -a $REDIS_PASSWORD INFO memory
docker exec ectd-redis redis-cli -a $REDIS_PASSWORD INFO keyspace
```

## 7. 升级流程

```bash
# 1. 备份数据库
./scripts/backup-db.sh

# 2. 拉取最新代码
git pull origin main

# 3. 重新构建并启动
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build

# 4. 运行数据库迁移
docker exec ectd-backend npx prisma migrate deploy

# 5. 验证
curl http://localhost/api/health
```

## 8. 故障排除

| 问题 | 排查步骤 |
|------|----------|
| 后端启动失败 | `docker logs ectd-backend` 查看错误日志 |
| 数据库连接失败 | 确认 PostgreSQL 容器健康，检查 DATABASE_URL |
| Redis 连接失败 | 确认 Redis 容器健康，检查 REDIS_PASSWORD |
| MinIO 上传失败 | 确认 MinIO 健康，检查 MINIO_ACCESS_KEY/SECRET_KEY |
| 文件上传超时 | 检查 Nginx client_max_body_size 和 proxy 超时配置 |
| PDF 导出失败 | 确认 Puppeteer 依赖已安装（中文字体、Chromium） |
| 编辑锁无法释放 | MANAGER 可使用强制解锁功能 |
