"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@nestjs/core");
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const nest_winston_1 = require("nest-winston");
const winston = __importStar(require("winston"));
const app_module_1 = require("./app.module");
const transform_interceptor_1 = require("./common/interceptors/transform.interceptor");
const all_exceptions_filter_1 = require("./common/filters/all-exceptions.filter");
const sqlite_migrator_1 = require("./embedded/sqlite-migrator");
const auto_seed_1 = require("./embedded/auto-seed");
const embedded_paths_1 = require("./embedded/embedded-paths");
const prisma_service_1 = require("./prisma/prisma.service");
function createWinstonLogger() {
    const logLevel = process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug');
    const isProduction = process.env.NODE_ENV === 'production';
    const transports = [
        new winston.transports.Console({
            format: isProduction
                ? winston.format.combine(winston.format.timestamp(), winston.format.json())
                : winston.format.combine(winston.format.timestamp({ format: 'HH:mm:ss' }), winston.format.colorize(), winston.format.printf(({ timestamp, level, message, context, ...meta }) => {
                    const ctx = context ? `[${context}]` : '';
                    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
                    return `${timestamp} ${level} ${ctx} ${message}${metaStr}`;
                })),
        }),
    ];
    if (isProduction) {
        transports.push(new winston.transports.File({
            filename: 'logs/error.log',
            level: 'error',
            maxsize: 10 * 1024 * 1024,
            maxFiles: 5,
            format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
        }), new winston.transports.File({
            filename: 'logs/combined.log',
            maxsize: 10 * 1024 * 1024,
            maxFiles: 10,
            format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
        }));
    }
    return nest_winston_1.WinstonModule.createLogger({
        level: logLevel,
        transports,
    });
}
function isEmbedded() {
    return process.env.EMBEDDED === 'true';
}
function reportReady(port) {
    console.log(`READY ${port}`);
    if (typeof process.send === 'function') {
        try {
            process.send({ type: 'ready', port });
        }
        catch {
        }
    }
}
function reportError(err) {
    const msg = err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : String(err);
    console.error(`ERROR ${msg}`);
    if (typeof process.send === 'function') {
        try {
            process.send({ type: 'error', error: msg });
        }
        catch {
        }
    }
}
async function maybeRunMigrationsAndSeed() {
    const shouldMigrate = process.env.AUTO_MIGRATE === 'true' || (isEmbedded() && process.env.AUTO_MIGRATE !== 'false');
    if (!shouldMigrate)
        return;
    if (process.env.DB_PROVIDER !== 'sqlite') {
        common_1.Logger.log('AUTO_MIGRATE=true but DB_PROVIDER!=sqlite, skipping', 'Bootstrap');
        return;
    }
    const migrationsDir = (0, embedded_paths_1.resolveMigrationsDir)();
    const databaseFile = (0, embedded_paths_1.resolveDatabaseFile)();
    process.env.DATABASE_URL = `file:${databaseFile}`;
    common_1.Logger.log(`Running SQLite migrations from ${migrationsDir} → ${databaseFile}`, 'Bootstrap');
    (0, sqlite_migrator_1.runSqliteMigrations)({ migrationsDir, databaseFile });
}
async function maybeAutoSeed(app) {
    const shouldSeed = process.env.AUTO_SEED === 'true' || (isEmbedded() && process.env.AUTO_SEED !== 'false');
    if (!shouldSeed)
        return;
    const prisma = app.get(prisma_service_1.PrismaService);
    await (0, auto_seed_1.autoSeedIfEmpty)({ prisma });
}
async function bootstrap() {
    await maybeRunMigrationsAndSeed();
    const app = await core_1.NestFactory.create(app_module_1.AppModule, {
        logger: createWinstonLogger(),
    });
    app.enableShutdownHooks();
    const allowedOrigins = process.env.CORS_ORIGINS
        ? process.env.CORS_ORIGINS.split(',')
        : ['http://localhost:5173', 'http://localhost:3001'];
    app.enableCors({
        origin: allowedOrigins,
        credentials: true,
    });
    app.useGlobalPipes(new common_1.ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
    }));
    app.useGlobalInterceptors(new transform_interceptor_1.TransformInterceptor());
    app.useGlobalFilters(new all_exceptions_filter_1.AllExceptionsFilter());
    if (process.env.NODE_ENV !== 'production' || process.env.ENABLE_SWAGGER === 'true') {
        const config = new swagger_1.DocumentBuilder()
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
        const document = swagger_1.SwaggerModule.createDocument(app, config);
        swagger_1.SwaggerModule.setup('api/docs', app, document);
    }
    const portFromEnv = process.env.PORT;
    const requestedPort = portFromEnv !== undefined ? Number(portFromEnv) : isEmbedded() ? 0 : 3000;
    await app.listen(requestedPort);
    await maybeAutoSeed(app);
    const server = app.getHttpServer();
    const address = server.address();
    const actualPort = typeof address === 'object' && address ? address.port : Number(requestedPort);
    common_1.Logger.log(`Application running on port ${actualPort}`, 'Bootstrap');
    reportReady(actualPort);
    const shutdown = async (signal) => {
        common_1.Logger.log(`Received ${signal}, shutting down gracefully`, 'Bootstrap');
        try {
            await app.close();
        }
        catch (err) {
            common_1.Logger.error(`Error during shutdown: ${err}`, 'Bootstrap');
        }
        finally {
            process.exit(0);
        }
    };
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
}
bootstrap().catch((err) => {
    reportError(err);
    process.exit(1);
});
//# sourceMappingURL=main.js.map