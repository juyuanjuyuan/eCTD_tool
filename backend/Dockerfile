# ============================================================
# Stage 1: Build
# ============================================================
FROM node:20-slim AS builder

WORKDIR /app

# Copy package files and install dependencies
COPY package.json package-lock.json ./
RUN npm ci

# Copy prisma schema and generate client
COPY prisma ./prisma/
RUN npx prisma generate

# Copy source code and build
COPY . .
RUN npm run build

# Remove dev dependencies for smaller production image
RUN npm prune --production && npx prisma generate

# ============================================================
# Stage 2: Production
# ============================================================
FROM node:20-slim AS production

# Install runtime dependencies for Puppeteer (Chromium) and Chinese fonts
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    xdg-utils \
    wget \
    fonts-wqy-zenhei \
    fonts-wqy-microhei \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user for security
RUN groupadd -r ectd && useradd -r -g ectd -m ectd

WORKDIR /app

# Copy built artifacts and production dependencies from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package.json ./

# Reference files (CV XMLs, DTDs, XSLs, etc.) live outside the build context
# (sibling ../reference/). They are bind-mounted into /reference at runtime by
# docker-compose; services read them via process.cwd()/../reference/ → /reference.

# Set ownership
RUN chown -R ectd:ectd /app

USER ectd

EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

# Production mode — prisma/*.ts is compiled alongside src/, so tsc uses the
# project root as rootDir and src/main.ts lands at dist/src/main.js
CMD ["node", "dist/src/main.js"]
