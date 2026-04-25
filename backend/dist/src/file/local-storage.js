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
exports.LocalStorage = void 0;
const common_1 = require("@nestjs/common");
const crypto = __importStar(require("crypto"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const stream_1 = require("stream");
const util_1 = require("util");
const jwt = __importStar(require("jsonwebtoken"));
const pipeline = (0, util_1.promisify)(require('stream').pipeline);
class LocalStorage {
    config;
    logger = new common_1.Logger(LocalStorage.name);
    filesRoot;
    constructor(config) {
        this.config = config;
        if (!config.dataDir) {
            throw new Error('LocalStorage: dataDir is required');
        }
        if (!config.presignSecret) {
            throw new Error('LocalStorage: presignSecret is required');
        }
        this.filesRoot = path.join(config.dataDir, 'files');
        fs.mkdirSync(this.filesRoot, { recursive: true });
        this.logger.log(`LocalStorage ready at ${this.filesRoot}`);
    }
    async uploadFile(key, buffer, _contentType) {
        const target = this.resolveSafe(key);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, buffer);
        const md5 = crypto.createHash('md5').update(buffer).digest('hex');
        this.logger.log(`Uploaded: ${key} (${buffer.length} bytes, MD5: ${md5})`);
        return md5;
    }
    async uploadFileStream(key, stream, fileSize, _contentType) {
        const target = this.resolveSafe(key);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        const hash = crypto.createHash('md5');
        const passThrough = new stream_1.PassThrough();
        passThrough.on('data', (chunk) => hash.update(chunk));
        const writeStream = fs.createWriteStream(target);
        await pipeline(stream, passThrough, writeStream);
        const md5 = hash.digest('hex');
        this.logger.log(`Uploaded (stream): ${key} (${fileSize} bytes, MD5: ${md5})`);
        return md5;
    }
    async getFile(key) {
        const target = this.resolveSafe(key);
        return fs.promises.readFile(target);
    }
    async getFileStream(key) {
        const target = this.resolveSafe(key);
        if (!fs.existsSync(target)) {
            throw new Error(`File not found: ${key}`);
        }
        return fs.createReadStream(target);
    }
    async fileExists(key) {
        const target = this.resolveSafe(key);
        return fs.promises
            .stat(target)
            .then((s) => s.isFile())
            .catch(() => false);
    }
    async deleteFile(key) {
        const target = this.resolveSafe(key);
        await fs.promises.rm(target, { force: true });
        this.logger.log(`Deleted: ${key}`);
    }
    async getPresignedDownloadUrl(key, expirySeconds = 3600) {
        return this.signUrl(key, 'download', expirySeconds);
    }
    async getPresignedPreviewUrl(key, expirySeconds = 3600) {
        return this.signUrl(key, 'preview', expirySeconds);
    }
    verifyPresignToken(token) {
        const decoded = jwt.verify(token, this.config.presignSecret);
        if (!decoded || typeof decoded.key !== 'string' || !decoded.mode) {
            throw new Error('Invalid presign token');
        }
        return { key: decoded.key, mode: decoded.mode };
    }
    resolveSafe(key) {
        const normalized = path.normalize(key).replace(/^[/\\]+/, '');
        const target = path.resolve(this.filesRoot, normalized);
        const root = path.resolve(this.filesRoot);
        if (target !== root && !target.startsWith(root + path.sep)) {
            throw new Error(`LocalStorage: refused traversal outside data dir: ${key}`);
        }
        return target;
    }
    signUrl(key, mode, expirySeconds) {
        const token = jwt.sign({ key, mode }, this.config.presignSecret, {
            expiresIn: expirySeconds,
        });
        const base = (this.config.publicBaseUrl ?? '').replace(/\/$/, '');
        return `${base}/api/v1/files/serve/${token}`;
    }
}
exports.LocalStorage = LocalStorage;
//# sourceMappingURL=local-storage.js.map