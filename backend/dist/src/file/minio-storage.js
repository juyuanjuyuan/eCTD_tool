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
exports.MinioStorage = void 0;
const common_1 = require("@nestjs/common");
const Minio = __importStar(require("minio"));
const stream_1 = require("stream");
const crypto = __importStar(require("crypto"));
class MinioStorage {
    config;
    logger = new common_1.Logger(MinioStorage.name);
    client;
    presignClient;
    bucket;
    constructor(config) {
        this.config = config;
        this.bucket = config.bucket;
        this.client = new Minio.Client({
            endPoint: config.endpoint,
            port: config.port,
            useSSL: config.useSSL ?? false,
            accessKey: config.accessKey,
            secretKey: config.secretKey,
        });
        if (config.publicUrl) {
            const url = new URL(config.publicUrl);
            this.presignClient = new Minio.Client({
                endPoint: url.hostname,
                port: parseInt(url.port, 10) || (url.protocol === 'https:' ? 443 : 80),
                useSSL: url.protocol === 'https:',
                accessKey: config.accessKey,
                secretKey: config.secretKey,
            });
        }
        else {
            this.presignClient = this.client;
        }
    }
    async init() {
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
    async uploadFile(key, buffer, contentType) {
        const md5 = crypto.createHash('md5').update(buffer).digest('hex');
        const metaData = {};
        if (contentType)
            metaData['Content-Type'] = contentType;
        await this.client.putObject(this.bucket, key, buffer, buffer.length, metaData);
        this.logger.log(`Uploaded: ${key} (${buffer.length} bytes, MD5: ${md5})`);
        return md5;
    }
    async uploadFileStream(key, stream, fileSize, contentType) {
        const metaData = {};
        if (contentType)
            metaData['Content-Type'] = contentType;
        const passThrough = new stream_1.PassThrough();
        const hash = crypto.createHash('md5');
        passThrough.on('data', (chunk) => hash.update(chunk));
        stream.pipe(passThrough);
        await this.client.putObject(this.bucket, key, passThrough, fileSize, metaData);
        const md5 = hash.digest('hex');
        this.logger.log(`Uploaded (stream): ${key} (${fileSize} bytes, MD5: ${md5})`);
        return md5;
    }
    async getFile(key) {
        const stream = await this.client.getObject(this.bucket, key);
        return this.streamToBuffer(stream);
    }
    async getFileStream(key) {
        return this.client.getObject(this.bucket, key);
    }
    async fileExists(key) {
        try {
            await this.client.statObject(this.bucket, key);
            return true;
        }
        catch {
            return false;
        }
    }
    async deleteFile(key) {
        await this.client.removeObject(this.bucket, key);
        this.logger.log(`Deleted: ${key}`);
    }
    async getPresignedDownloadUrl(key, expirySeconds = 3600) {
        return this.presignClient.presignedGetObject(this.bucket, key, expirySeconds);
    }
    async getPresignedPreviewUrl(key, expirySeconds = 3600) {
        return this.presignClient.presignedGetObject(this.bucket, key, expirySeconds, {
            'response-content-disposition': 'inline',
        });
    }
    streamToBuffer(stream) {
        return new Promise((resolve, reject) => {
            const chunks = [];
            stream.on('data', (chunk) => chunks.push(chunk));
            stream.on('end', () => resolve(Buffer.concat(chunks)));
            stream.on('error', reject);
        });
    }
}
exports.MinioStorage = MinioStorage;
//# sourceMappingURL=minio-storage.js.map