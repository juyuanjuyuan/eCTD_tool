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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FileServeController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const minio_service_1 = require("./minio.service");
const public_decorator_1 = require("../license/public.decorator");
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const CONTENT_TYPES = {
    '.pdf': 'application/pdf',
    '.xml': 'application/xml',
    '.txt': 'text/plain; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.zip': 'application/zip',
};
let FileServeController = class FileServeController {
    storage;
    constructor(storage) {
        this.storage = storage;
    }
    async serve(token, res) {
        if (!this.storage.isLocal()) {
            throw new common_1.NotFoundException('Endpoint only available in local storage mode');
        }
        const local = this.storage.getDelegate();
        let payload;
        try {
            payload = local.verifyPresignToken(token);
        }
        catch {
            throw new common_1.UnauthorizedException('Invalid or expired download token');
        }
        const target = local.resolveSafe(payload.key);
        if (!fs.existsSync(target)) {
            throw new common_1.NotFoundException('File not found');
        }
        const ext = path.extname(payload.key).toLowerCase();
        const contentType = CONTENT_TYPES[ext] || 'application/octet-stream';
        const baseName = path.basename(payload.key);
        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Disposition', `${payload.mode === 'preview' ? 'inline' : 'attachment'}; filename="${encodeURIComponent(baseName)}"`);
        const stat = fs.statSync(target);
        res.setHeader('Content-Length', stat.size);
        fs.createReadStream(target).pipe(res);
    }
};
exports.FileServeController = FileServeController;
__decorate([
    (0, common_1.Get)(':token'),
    __param(0, (0, common_1.Param)('token')),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], FileServeController.prototype, "serve", null);
exports.FileServeController = FileServeController = __decorate([
    (0, swagger_1.ApiTags)('files'),
    (0, public_decorator_1.Public)(),
    (0, common_1.Controller)('api/v1/files/serve'),
    __metadata("design:paramtypes", [minio_service_1.MinioService])
], FileServeController);
//# sourceMappingURL=file-serve.controller.js.map