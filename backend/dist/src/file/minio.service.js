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
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
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
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var MinioService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.MinioService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const Minio = __importStar(require("minio"));
const crypto = __importStar(require("crypto"));
let MinioService = MinioService_1 = class MinioService {
    config;
    logger = new common_1.Logger(MinioService_1.name);
    client;
    presignClient;
    bucket;
    constructor(config) {
        this.config = config;
        this.bucket = this.config.get('MINIO_BUCKET', 'ectd-files');
        const endpoint = this.config.get('MINIO_ENDPOINT', 'localhost');
        const port = this.config.get('MINIO_PORT', 9000);
        const accessKey = this.config.get('MINIO_ACCESS_KEY', 'ectd_minio');
        const secretKey = this.config.get('MINIO_SECRET_KEY', 'ectd_minio_password');
        this.client = new Minio.Client({
            endPoint: endpoint,
            port,
            useSSL: false,
            accessKey,
            secretKey,
        });
        const publicUrl = this.config.get('MINIO_PUBLIC_URL', '');
        if (publicUrl) {
            const url = new URL(publicUrl);
            this.presignClient = new Minio.Client({
                endPoint: url.hostname,
                port: parseInt(url.port, 10) || (url.protocol === 'https:' ? 443 : 80),
                useSSL: url.protocol === 'https:',
                accessKey,
                secretKey,
            });
        }
        else {
            this.presignClient = this.client;
        }
    }
    async onModuleInit() {
        try {
            const exists = await this.client.bucketExists(this.bucket);
            if (!exists) {
                await this.client.makeBucket(this.bucket);
                this.logger.log(`Bucket "${this.bucket}" created`);
            }
            else {
                this.logger.log(`Bucket "${this.bucket}" ready`);
            }
        }
        catch (err) {
            this.logger.error(`MinIO initialization failed: ${err}`);
        }
    }
    async uploadFile(objectName, buffer, contentType) {
        const md5 = crypto.createHash('md5').update(buffer).digest('hex');
        const metaData = {};
        if (contentType) {
            metaData['Content-Type'] = contentType;
        }
        await this.client.putObject(this.bucket, objectName, buffer, buffer.length, metaData);
        this.logger.log(`Uploaded: ${objectName} (${buffer.length} bytes, MD5: ${md5})`);
        return md5;
    }
    async getFile(objectName) {
        const stream = await this.client.getObject(this.bucket, objectName);
        return this.streamToBuffer(stream);
    }
    async getFileStream(objectName) {
        return this.client.getObject(this.bucket, objectName);
    }
    async fileExists(objectName) {
        try {
            await this.client.statObject(this.bucket, objectName);
            return true;
        }
        catch {
            return false;
        }
    }
    async deleteFile(objectName) {
        await this.client.removeObject(this.bucket, objectName);
        this.logger.log(`Deleted: ${objectName}`);
    }
    async getPresignedDownloadUrl(objectName, expirySeconds = 3600) {
        return this.presignClient.presignedGetObject(this.bucket, objectName, expirySeconds);
    }
    async getPresignedPreviewUrl(objectName, expirySeconds = 3600) {
        return this.presignClient.presignedGetObject(this.bucket, objectName, expirySeconds, { 'response-content-disposition': 'inline' });
    }
    calculateMd5(buffer) {
        return crypto.createHash('md5').update(buffer).digest('hex');
    }
    streamToBuffer(stream) {
        return new Promise((resolve, reject) => {
            const chunks = [];
            stream.on('data', (chunk) => chunks.push(chunk));
            stream.on('end', () => resolve(Buffer.concat(chunks)));
            stream.on('error', reject);
        });
    }
};
exports.MinioService = MinioService;
exports.MinioService = MinioService = MinioService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], MinioService);
//# sourceMappingURL=minio.service.js.map