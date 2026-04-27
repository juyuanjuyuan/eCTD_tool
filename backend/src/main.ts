import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { WinstonModule } from 'nest-winston';
import * as winston from 'winston';
import * as path from 'path';
import * as fs from 'fs';
import { AppModule } from './app.module';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { runSqliteMigrations } from './embedded/sqlite-migrator';
import { autoSeedIfEmpty } from './embedded/auto-seed';
import { resolveDatabaseFile, resolveMigrationsDir } from './embedded/embedded-paths';
import { PrismaService } from './prisma/prisma.service';

function createWinstonLogger() {
  const logLevel = process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug');
  const isProduction = process.env.NODE_ENV === 'production';

  const transports: winston.transport[] = [
    new winston.transports.Console({
      format: isProduction
        ? winston.format.combine(
            winston.format.timestamp(),
            winston.format.json(),
          )
        : winston.format.combine(
            winston.format.timestamp({ format: 'HH:mm:ss' }),
            winston.format.colorize(),
            winston.format.printf(({ timestamp, level, message, context, ...meta }) => {
              const ctx = context ? `[${context}]` : '';
              const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
              return `${timestamp} ${level} ${ctx} ${message}${metaStr}`;
            }),
          ),
    }),
  ];

  // File transport in production. In embedded/desktop mode the process cwd
  // may be the .app bundle (read-only), so anchor logs under DATA_DIR when set.
  if (isProduction) {
    const logDir = process.env.DATA_DIR
      ? path.join(process.env.DATA_DIR, 'backend-logs')
      : 'logs';
    fs.mkdirSync(logDir, { recursive: true });
    transports.push(
      new winston.transports.File({
        filename: path.join(logDir, 'error.log'),
        level: 'error',
        maxsize: 10 * 1024 * 1024, // 10MB
        maxFiles: 5,
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.json(),
        ),
      }),
      new winston.transports.File({
        filename: path.join(logDir, 'combined.log'),
        maxsize: 10 * 1024 * 1024,
        maxFiles: 10,
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.json(),
        ),
      }),
    );
  }

  return WinstonModule.createLogger({
    level: logLevel,
    transports,
  });
}

/** Embedded mode: backend is forked by Electron main; report ready via IPC + stdout. */
function isEmbedded(): boolean {
  return process.env.EMBEDDED === 'true';
}

/**
 * Build a Prisma-safe `file:` URL from an absolute path.
 *
 * On Windows Prisma SQLite accepts `file:C:/Users/...` but rejects the
 * standards-style `file:///C:/Users/...` with SQLite error 14.
 */
function toFileUrl(absPath: string): string {
  if (process.platform === 'win32') {
    const fwd = absPath.replace(/\\/g, '/');
    // Drive letter path -> file:C:/...
    if (/^[A-Za-z]:\//.test(fwd)) return `file:${fwd}`;
    // UNC path \\server\share → file:////server/share
    if (fwd.startsWith('//')) return `file:${fwd}`;
    return `file:${fwd}`;
  }
  return `file:${absPath}`;
}

function reportReady(port: number) {
  // Always print a stdout line — works even without an IPC channel (tests / standalone exec)
  console.log(`READY ${port}`);
  if (typeof process.send === 'function') {
    try {
      process.send({ type: 'ready', port });
    } catch {
      // ignore
    }
  }
}

function reportError(err: unknown) {
  const msg = err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : String(err);
  console.error(`ERROR ${msg}`);
  if (typeof process.send === 'function') {
    try {
      process.send({ type: 'error', error: msg });
    } catch {
      // ignore
    }
  }
}

async function maybeRunMigrationsAndSeed() {
  // Auto-migrate is the default in embedded mode. In dev we expect the user to
  // run `prisma migrate dev` manually, so we only enable when explicitly asked.
  const shouldMigrate =
    process.env.AUTO_MIGRATE === 'true' || (isEmbedded() && process.env.AUTO_MIGRATE !== 'false');

  if (!shouldMigrate) return;
  if (process.env.DB_PROVIDER !== 'sqlite') {
    Logger.log('AUTO_MIGRATE=true but DB_PROVIDER!=sqlite, skipping', 'Bootstrap');
    return;
  }

  const migrationsDir = resolveMigrationsDir();
  const databaseFile = resolveDatabaseFile();

  // Prisma resolves a relative file: URL against the schema file's directory.
  // After `build:embed`, the schema lives in dist-embed/generated/prisma-sqlite/,
  // which is NOT where the customer's data file lives. Force an absolute URL so
  // both the migrator and the Prisma client point to the same place.
  process.env.DATABASE_URL = toFileUrl(databaseFile);

  Logger.log(`Running SQLite migrations from ${migrationsDir} → ${databaseFile}`, 'Bootstrap');
  runSqliteMigrations({ migrationsDir, databaseFile });
}

async function maybeAutoSeed(app: any) {
  const shouldSeed =
    process.env.AUTO_SEED === 'true' || (isEmbedded() && process.env.AUTO_SEED !== 'false');
  if (!shouldSeed) return;

  const prisma = app.get(PrismaService);
  await autoSeedIfEmpty({ prisma });
}

async function bootstrap() {
  await maybeRunMigrationsAndSeed();

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: createWinstonLogger(),
  });

  // Graceful shutdown — Nest hooks into SIGTERM/SIGINT once enableShutdownHooks() is called.
  app.enableShutdownHooks();

  // Static SPA. Resolution differs between dev (tsc → backend/dist/src/main.js)
  // and embedded (esbuild → dist-embed/backend.bundle.js) — esbuild does NOT
  // rewrite __dirname, so a single `../public` would point to two different
  // directories. EMBEDDED is set by the Electron main process when forking.
  const publicDir =
    process.env.STATIC_DIR ||
    (process.env.EMBEDDED === 'true'
      ? path.join(__dirname, 'public')           // dist-embed/public/
      : path.join(__dirname, '..', 'public'));   // backend/dist/public/
  if (fs.existsSync(path.join(publicDir, 'index.html'))) {
    // index:false so GET / falls through to SpaController instead of being
    // served the static index.html via redirect — keeps the catch-all in one
    // place (and lets us 503 cleanly when assets are partial).
    app.useStaticAssets(publicDir, { index: false });
    process.env.__PUBLIC_DIR__ = publicDir;
    Logger.log(`Serving SPA from ${publicDir}`, 'Bootstrap');
  } else {
    Logger.warn(
      `SPA assets not found at ${publicDir} — root URL will return 503`,
      'Bootstrap',
    );
  }

  // CORS
  const allowedOrigins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',')
    : ['http://localhost:5173', 'http://localhost:3001'];
  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
  });

  // Validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.useGlobalInterceptors(new TransformInterceptor());
  app.useGlobalFilters(new AllExceptionsFilter());

  // Swagger API documentation (non-production only, or enable via env)
  if (process.env.NODE_ENV !== 'production' || process.env.ENABLE_SWAGGER === 'true') {
    const config = new DocumentBuilder()
      .setTitle('eCTD Tool API')
      .setDescription('eCTD 在线文档撰写工具 API — 面向药企注册申报团队')
      .setVersion('1.0')
      .addBearerAuth()
      .addTag('auth', '认证与授权')
      .addTag('projects', '项目管理')
      .addTag('applications', '申请管理')
      .addTag('regulatory-activities', '注册行为管理')
      .addTag('sequences', '序列管理')
      .addTag('ctd-template', 'CTD 模板与目录结构')
      .addTag('documents', '文档编辑')
      .addTag('export', '文档导出 (Word/PDF)')
      .addTag('ectd', 'eCTD 骨架文件、验证与导出')
      .addTag('files', '文件管理')
      .addTag('approval', '审批流程')
      .addTag('comments', '评论')
      .addTag('health', '健康检查')
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);
  }

  // Port: default 3000 in dev, 0 (random) when embedded so multiple installs don't conflict.
  const portFromEnv = process.env.PORT;
  const requestedPort =
    portFromEnv !== undefined ? Number(portFromEnv) : isEmbedded() ? 0 : 3000;

  await app.listen(requestedPort);

  await maybeAutoSeed(app);

  const server = app.getHttpServer();
  const address = server.address();
  const actualPort =
    typeof address === 'object' && address ? address.port : Number(requestedPort);

  Logger.log(`Application running on port ${actualPort}`, 'Bootstrap');
  reportReady(actualPort);

  const shutdown = async (signal: string) => {
    Logger.log(`Received ${signal}, shutting down gracefully`, 'Bootstrap');
    try {
      await app.close();
    } catch (err) {
      Logger.error(`Error during shutdown: ${err}`, 'Bootstrap');
    } finally {
      process.exit(0);
    }
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  // SIGBREAK is Windows-only (Ctrl+Break). On Windows `child.kill('SIGTERM')`
  // is implemented as TerminateProcess and does NOT trigger the SIGTERM
  // handler — so the IPC `{type:'shutdown'}` path below is the *only* way the
  // desktop shell can ask the backend to flush gracefully on Windows.
  process.on('SIGBREAK' as NodeJS.Signals, () => shutdown('SIGBREAK'));
  if (typeof process.on === 'function') {
    process.on('message', (msg: any) => {
      if (msg && msg.type === 'shutdown') void shutdown('IPC');
    });
  }
}

bootstrap().catch((err) => {
  reportError(err);
  process.exit(1);
});
