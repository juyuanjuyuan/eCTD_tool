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

# Copy reference files needed at runtime (CV XMLs, DTDs, etc.)
# These are accessed by services via process.cwd()/../reference/
COPY --from=builder /app/../reference /reference 2>/dev/null || true

# Set ownership
RUN chown -R ectd:ectd /app

USER ectd

EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

# Production mode
CMD ["node", "dist/main.js"]
