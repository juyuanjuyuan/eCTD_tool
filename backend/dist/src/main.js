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
async function bootstrap() {
    const app = await core_1.NestFactory.create(app_module_1.AppModule, {
        logger: createWinstonLogger(),
    });
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
    const port = process.env.PORT ?? 3000;
    await app.listen(port);
    common_1.Logger.log(`Application running on port ${port}`, 'Bootstrap');
}
bootstrap();
//# sourceMappingURL=main.js.map