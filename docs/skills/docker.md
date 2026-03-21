# Docker 容器化部署

## 1. docker-compose.yml (开发环境)

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:16-alpine
    container_name: ectd-postgres
    ports:
      - "5432:5432"
    environment:
      POSTGRES_USER: ectd
      POSTGRES_PASSWORD: ectd_dev_2026
      POSTGRES_DB: ectd_tool
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ectd"]
      interval: 5s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    container_name: ectd-redis
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 5s
      retries: 5

  minio:
    image: minio/minio:latest
    container_name: ectd-minio
    ports:
      - "9000:9000"
      - "9001:9001"
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin
    volumes:
      - minio_data:/data
    command: server /data --console-address ":9001"
    healthcheck:
      test: ["CMD", "mc", "ready", "local"]
      interval: 5s
      timeout: 5s
      retries: 5

volumes:
  postgres_data:
  redis_data:
  minio_data:
```

## 2. 后端 Dockerfile

```dockerfile
# backend/Dockerfile
FROM node:20-alpine AS base
WORKDIR /app

# 开发阶段
FROM base AS development
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx prisma generate
CMD ["npm", "run", "start:dev"]

# 构建阶段
FROM base AS build
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx prisma generate
RUN npm run build

# 生产阶段
FROM base AS production
COPY package*.json ./
RUN npm ci --only=production
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY prisma ./prisma
EXPOSE 3000
CMD ["node", "dist/main.js"]
```

## 3. 前端 Dockerfile

```dockerfile
# frontend/Dockerfile

# 构建阶段
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# 生产阶段
FROM nginx:alpine AS production
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

## 4. Nginx 配置

```nginx
# frontend/nginx.conf
server {
    listen 80;
    server_name localhost;
    root /usr/share/nginx/html;

    # 前端 SPA 路由
    location / {
        try_files $uri $uri/ /index.html;
    }

    # API 代理
    location /api/ {
        proxy_pass http://backend:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # 大文件上传
        client_max_body_size 200M;
        proxy_read_timeout 300s;
    }

    # MinIO 代理 (文件预览)
    location /files/ {
        proxy_pass http://minio:9000;
    }
}
```

## 5. 环境变量文件

```env
# .env (开发环境)
DATABASE_URL=postgresql://ectd:ectd_dev_2026@localhost:5432/ectd_tool
REDIS_URL=redis://localhost:6379

JWT_SECRET=your-jwt-secret-key-change-in-production
JWT_EXPIRES_IN=2h
JWT_REFRESH_EXPIRES_IN=7d

MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_USE_SSL=false
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_BUCKET=ectd-files

PORT=3000
```

## 6. .dockerignore

```
node_modules
dist
.git
.env.local
*.md
```

## 7. 启动命令

```bash
# 启动开发环境（数据库 + Redis + MinIO）
docker-compose up -d

# 查看服务状态
docker-compose ps

# 查看日志
docker-compose logs -f postgres

# 停止服务
docker-compose down

# 停止并删除数据
docker-compose down -v
```
