"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FileNameNormalizerService = exports.ALLOWED_EXTENSIONS = void 0;
const common_1 = require("@nestjs/common");
exports.ALLOWED_EXTENSIONS = new Set(['.pdf', '.xml', '.xpt', '.txt', '.xsl']);
const MAX_PATH_LENGTH = 230;
const MAX_NAME_LENGTH = 64;
const MAX_FILE_SIZE = 500 * 1024 * 1024;
const MAX_XPT_FILE_SIZE = 4 * 1024 * 1024 * 1024;
const M1_FOLDER_MAP = {
    '1.0': 'm1/cn/00',
    '1.2': 'm1/cn/02',
    '1.3': 'm1/cn/03',
    '1.4': 'm1/cn/04',
    '1.5': 'm1/cn/05',
    '1.6': 'm1/cn/06',
    '1.7': 'm1/cn/07',
    '1.8': 'm1/cn/08',
    '1.9': 'm1/cn/09',
    '1.10': 'm1/cn/10',
    '1.11': 'm1/cn/11',
    '1.12': 'm1/cn/12',
};
const ICH_FOLDER_MAP = {
    '2.2': 'm2/22-intro',
    '2.3': 'm2/23-qos',
    '2.4': 'm2/24-nonclin-over',
    '2.5': 'm2/25-clin-over',
    '2.6': 'm2/26-nonclin-sum',
    '2.7': 'm2/27-clin-sum',
    '3.2': 'm3/32-body-data',
    '3.3': 'm3/33-lit-ref',
    '4.2': 'm4/42-stud-rep',
    '4.3': 'm4/43-lit-ref',
    '5.2': 'm5/52-tab-list',
    '5.3': 'm5/53-clin-stud-rep',
    '5.4': 'm5/54-lit-ref',
};
let FileNameNormalizerService = class FileNameNormalizerService {
    normalizeFileName(name) {
        const lastDot = name.lastIndexOf('.');
        let baseName = lastDot > 0 ? name.substring(0, lastDot) : name;
        const ext = lastDot > 0 ? name.substring(lastDot).toLowerCase() : '';
        baseName = baseName
            .toLowerCase()
            .replace(/[^a-z0-9\-_]/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '');
        if (!baseName) {
            baseName = 'file';
        }
        const fullName = baseName + ext;
        if (fullName.length > MAX_NAME_LENGTH) {
            const maxBase = MAX_NAME_LENGTH - ext.length;
            baseName = baseName.substring(0, maxBase);
            return baseName + ext;
        }
        return fullName;
    }
    validateExtension(filename) {
        const ext = this.getExtension(filename);
        if (!exports.ALLOWED_EXTENSIONS.has(ext)) {
            throw new common_1.BadRequestException(`文件类型 ${ext} 不被允许。eCTD 仅允许: ${[...exports.ALLOWED_EXTENSIONS].join(', ')}`);
        }
    }
    validateFileSize(size, filename) {
        const ext = this.getExtension(filename);
        const maxSize = ext === '.xpt' ? MAX_XPT_FILE_SIZE : MAX_FILE_SIZE;
        const maxLabel = ext === '.xpt' ? '4GB' : '500MB';
        if (size > maxSize) {
            throw new common_1.BadRequestException(`文件大小 ${(size / (1024 * 1024)).toFixed(1)}MB 超过 ${maxLabel} 限制`);
        }
    }
    buildEctdRelativePath(ctdSectionNumber, normalizedFileName) {
        const folder = this.getSectionFolder(ctdSectionNumber);
        const relativePath = `${folder}/${normalizedFileName}`;
        if (relativePath.length > MAX_PATH_LENGTH) {
            throw new common_1.BadRequestException(`文件路径长度 ${relativePath.length} 超过 ${MAX_PATH_LENGTH} 字符限制`);
        }
        const segments = relativePath.split('/');
        for (const seg of segments) {
            if (seg.length > MAX_NAME_LENGTH) {
                throw new common_1.BadRequestException(`路径段 "${seg}" 长度 ${seg.length} 超过 ${MAX_NAME_LENGTH} 字符限制`);
            }
        }
        return relativePath;
    }
    buildStoragePath(projectId, applicationNumber, sequenceNumber, ectdRelativePath) {
        return `${projectId}/${applicationNumber}/${sequenceNumber}/${ectdRelativePath}`;
    }
    getSectionFolder(ctdSectionNumber) {
        const moduleNum = parseInt(ctdSectionNumber.split('.')[0], 10);
        if (moduleNum === 1) {
            const parts = ctdSectionNumber.split('.');
            const prefix = parts.slice(0, 2).join('.');
            const folder = M1_FOLDER_MAP[prefix];
            if (folder)
                return folder;
            return 'm1/cn';
        }
        const parts = ctdSectionNumber.split('.');
        const prefix = parts.slice(0, 2).join('.');
        const folder = ICH_FOLDER_MAP[prefix];
        if (folder)
            return folder;
        return `m${moduleNum}`;
    }
    isCompliantFileName(name) {
        return /^[a-z0-9\-_]+(\.[a-z0-9]+)?$/.test(name);
    }
    validatePathSeparators(path) {
        if (path.includes('\\')) {
            throw new common_1.BadRequestException('路径中不允许使用反斜杠 \\，仅允许正斜杠 /');
        }
    }
    getExtension(filename) {
        const lastDot = filename.lastIndexOf('.');
        return lastDot > 0 ? filename.substring(lastDot).toLowerCase() : '';
    }
};
exports.FileNameNormalizerService = FileNameNormalizerService;
exports.FileNameNormalizerService = FileNameNormalizerService = __decorate([
    (0, common_1.Injectable)()
], FileNameNormalizerService);
//# sourceMappingURL=file-name-normalizer.service.js.map