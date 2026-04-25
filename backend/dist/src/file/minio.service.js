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
const crypto = __importStar(require("crypto"));
const local_storage_1 = require("./local-storage");
const minio_storage_1 = require("./minio-storage");
let MinioService = MinioService_1 = class MinioService {
    config;
    logger = new common_1.Logger(MinioService_1.name);
    delegate;
    providerName;
    constructor(config) {
        this.config = config;
        const provider = (process.env.STORAGE_PROVIDER || 'local').toLowerCase();
        if (provider === 'minio') {
            this.providerName = 'minio';
            this.delegate = new minio_storage_1.MinioStorage({
                endpoint: this.config.get('MINIO_ENDPOINT', 'localhost'),
                port: this.config.get('MINIO_PORT', 9000),
                accessKey: this.config.get('MINIO_ACCESS_KEY', 'ectd_minio'),
                secretKey: this.config.get('MINIO_SECRET_KEY', 'ectd_minio_password'),
                bucket: this.config.get('MINIO_BUCKET', 'ectd-files'),
                publicUrl: this.config.get('MINIO_PUBLIC_URL', ''),
            });
        }
        else {
            this.providerName = 'local';
            const dataDir = process.env.DATA_DIR || this.config.get('DATA_DIR') || '';
            if (!dataDir) {
                throw new Error('STORAGE_PROVIDER=local requires DATA_DIR (Electron main injects this).');
            }
            const presignSecret = process.env.STORAGE_PRESIGN_SECRET ||
                this.config.get('STORAGE_PRESIGN_SECRET') ||
                process.env.JWT_SECRET ||
                this.config.get('JWT_SECRET') ||
                '';
            if (!presignSecret) {
                throw new Error('STORAGE_PROVIDER=local requires STORAGE_PRESIGN_SECRET or JWT_SECRET.');
            }
            this.delegate = new local_storage_1.LocalStorage({
                dataDir,
                publicBaseUrl: process.env.PUBLIC_BASE_URL ||
                    this.config.get('PUBLIC_BASE_URL', ''),
                presignSecret,
            });
        }
        this.logger.log(`Storage provider: ${this.providerName}`);
    }
    async onModuleInit() {
        if (this.providerName === 'minio' && 'init' in this.delegate) {
            await this.delegate.init();
        }
    }
    getDelegate() {
        return this.delegate;
    }
    isLocal() {
        return this.providerName === 'local';
    }
    uploadFile(key, buffer, contentType) {
        return this.delegate.uploadFile(key, buffer, contentType);
    }
    uploadFileStream(key, stream, fileSize, contentType) {
        return this.delegate.uploadFileStream(key, stream, fileSize, contentType);
    }
    getFile(key) {
        return this.delegate.getFile(key);
    }
    getFileStream(key) {
        return this.delegate.getFileStream(key);
    }
    fileExists(key) {
        return this.delegate.fileExists(key);
    }
    deleteFile(key) {
        return this.delegate.deleteFile(key);
    }
    getPresignedDownloadUrl(key, expirySeconds = 3600) {
        return this.delegate.getPresignedDownloadUrl(key, expirySeconds);
    }
    getPresignedPreviewUrl(key, expirySeconds = 3600) {
        return this.delegate.getPresignedPreviewUrl(key, expirySeconds);
    }
    calculateMd5(buffer) {
        return crypto.createHash('md5').update(buffer).digest('hex');
    }
};
exports.MinioService = MinioService;
exports.MinioService = MinioService = MinioService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], MinioService);
//# sourceMappingURL=minio.service.js.map