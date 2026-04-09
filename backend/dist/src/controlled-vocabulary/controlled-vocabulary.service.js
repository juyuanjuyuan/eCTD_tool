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
var ControlledVocabularyService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ControlledVocabularyService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const redis_cache_service_1 = require("../common/redis-cache.service");
const fast_xml_parser_1 = require("fast-xml-parser");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
let ControlledVocabularyService = ControlledVocabularyService_1 = class ControlledVocabularyService {
    prisma;
    cache;
    logger = new common_1.Logger(ControlledVocabularyService_1.name);
    xmlParser = new fast_xml_parser_1.XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: '@_',
    });
    cvBasePath = path.resolve(process.cwd(), '../reference/eCTD技术规范V1.1附件包/附件1-2：受控词汇文件包');
    constructor(prisma, cache) {
        this.prisma = prisma;
        this.cache = cache;
    }
    async onModuleInit() {
        await this.seedControlledVocabularies();
        await this.seedStfVocabularies();
    }
    async seedControlledVocabularies() {
        const existingCount = await this.prisma.controlledVocabulary.count();
        if (existingCount > 0) {
            this.logger.log('受控词汇数据已存在，跳过初始化');
            return;
        }
        this.logger.log('开始解析受控词汇文件...');
        const cvFiles = [
            { file: 'cv-application-type.xml', vocabName: 'application-type' },
            { file: 'cv-product-type.xml', vocabName: 'product-type' },
            { file: 'cv-regulatory-activity-type.xml', vocabName: 'regulatory-activity-type' },
            { file: 'cv-sequence-type.xml', vocabName: 'sequence-type' },
        ];
        for (const { file, vocabName } of cvFiles) {
            await this.parseCvFile(file, vocabName);
        }
        await this.parseDependencyFile();
        this.logger.log('受控词汇数据初始化完成');
    }
    async parseCvFile(fileName, vocabularyName) {
        const filePath = path.join(this.cvBasePath, fileName);
        const xml = fs.readFileSync(filePath, 'utf-8');
        const parsed = this.xmlParser.parse(xml);
        const cv = parsed['controlled-vocabulary'];
        const version = cv.version;
        const versionNumber = version['@_number'];
        const validFrom = this.parseDate(version['@_valid-from']);
        const codes = Array.isArray(version.code) ? version.code : [version.code];
        for (const code of codes) {
            const descriptions = Array.isArray(code.description)
                ? code.description
                : [code.description];
            const zhDesc = descriptions.find((d) => d['@_xml:lang'] === 'zh');
            const enDesc = descriptions.find((d) => d['@_xml:lang'] === 'en');
            await this.prisma.controlledVocabulary.create({
                data: {
                    vocabularyName,
                    code: code['@_name'],
                    version: versionNumber,
                    validFrom,
                    descriptionZh: zhDesc?.['#text'] || '',
                    descriptionEn: enDesc?.['#text'] || '',
                },
            });
        }
        this.logger.log(`已解析 ${fileName}: ${codes.length} 条记录`);
    }
    async parseDependencyFile() {
        const filePath = path.join(this.cvBasePath, 'depend-apt-rat-sqt.xml');
        const xml = fs.readFileSync(filePath, 'utf-8');
        const parsed = this.xmlParser.parse(xml);
        const dependency = parsed.dependency;
        const version = dependency.version;
        const versionNumber = version['@_number'];
        const appCodes = Array.isArray(version.code)
            ? version.code
            : [version.code];
        for (const appCode of appCodes) {
            const appType = appCode['@_name'];
            const ratCodes = Array.isArray(appCode.code)
                ? appCode.code
                : [appCode.code];
            for (const ratCode of ratCodes) {
                const ratType = ratCode['@_name'];
                const sqtCodes = Array.isArray(ratCode.code)
                    ? ratCode.code
                    : [ratCode.code];
                for (const sqtCode of sqtCodes) {
                    await this.prisma.cvDependency.create({
                        data: {
                            applicationTypeCode: appType,
                            regulatoryActivityTypeCode: ratType,
                            sequenceTypeCode: sqtCode['@_name'],
                            version: versionNumber,
                        },
                    });
                }
            }
        }
        this.logger.log('已解析 depend-apt-rat-sqt.xml');
    }
    parseDate(dateStr) {
        const parts = dateStr.split('-');
        return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    }
    async seedStfVocabularies() {
        const existingCount = await this.prisma.controlledVocabulary.count({
            where: { vocabularyName: { startsWith: 'stf-' } },
        });
        if (existingCount > 0) {
            this.logger.log('STF CV already seeded');
            return;
        }
        const filePath = path.resolve(process.cwd(), '../reference/eCTD技术规范V1.1附件包/附件2-6：STF标签值文件/valid-values.xml');
        if (!fs.existsSync(filePath)) {
            this.logger.warn(`STF valid-values.xml not found at ${filePath}`);
            return;
        }
        const { categories, fileTags, version, validFrom } = this.parseStfValidValuesFile(filePath);
        let categoryRowCount = 0;
        for (const category of categories) {
            const vocabularyName = `stf-category-${category.name}`;
            for (const entry of category.values) {
                await this.prisma.controlledVocabulary.create({
                    data: {
                        vocabularyName,
                        code: entry.value,
                        version,
                        validFrom,
                        descriptionZh: entry.value,
                        descriptionEn: `[${entry.realm}] ${entry.value}`,
                    },
                });
                categoryRowCount++;
            }
        }
        let fileTagRowCount = 0;
        for (const moduleKey of ['m4', 'm5']) {
            const vocabularyName = `stf-file-tag-${moduleKey}`;
            for (const entry of fileTags) {
                await this.prisma.controlledVocabulary.create({
                    data: {
                        vocabularyName,
                        code: entry.value,
                        version,
                        validFrom,
                        descriptionZh: entry.value,
                        descriptionEn: `[${entry.realm}] ${entry.value}`,
                    },
                });
                fileTagRowCount++;
            }
        }
        this.logger.log(`STF CV seeded: ${categories.length} categories (${categoryRowCount} values), ${fileTagRowCount} file-tag rows (mirrored m4+m5)`);
    }
    parseStfValidValuesFile(filePath) {
        const xml = fs.readFileSync(filePath, 'utf-8');
        const parsed = this.xmlParser.parse(xml);
        const root = parsed['ectd:study-values'];
        if (!root) {
            throw new Error('Invalid STF valid-values.xml: missing <ectd:study-values> root');
        }
        const normaliseEntries = (raw) => {
            if (!raw)
                return [];
            const entries = Array.isArray(raw) ? raw : [raw];
            return entries.map((e) => ({
                value: String(e['@_value']),
                realm: String(e['@_realm'] || 'ich'),
            }));
        };
        const rawCategories = Array.isArray(root.category)
            ? root.category
            : root.category
                ? [root.category]
                : [];
        const categories = rawCategories.map((cat) => ({
            name: String(cat['@_name']),
            values: normaliseEntries(cat['valid-value']),
        }));
        const fileTagBlock = root['file-tag'];
        const fileTags = normaliseEntries(fileTagBlock?.['valid-value']);
        return {
            categories,
            fileTags,
            version: '6.0',
            validFrom: new Date('2023-11-01'),
        };
    }
    async getApplicationTypes() {
        const cacheKey = 'cv:application-types';
        const cached = await this.cache.get(cacheKey);
        if (cached)
            return cached;
        const result = await this.prisma.controlledVocabulary.findMany({
            where: { vocabularyName: 'application-type' },
            orderBy: { code: 'asc' },
        });
        await this.cache.set(cacheKey, result, 86400);
        return result;
    }
    async getProductTypes() {
        const cacheKey = 'cv:product-types';
        const cached = await this.cache.get(cacheKey);
        if (cached)
            return cached;
        const result = await this.prisma.controlledVocabulary.findMany({
            where: { vocabularyName: 'product-type' },
            orderBy: { code: 'asc' },
        });
        await this.cache.set(cacheKey, result, 86400);
        return result;
    }
    async getRegulatoryActivityTypes(appType) {
        const cacheKey = `cv:rat-types:${appType || 'all'}`;
        const cached = await this.cache.get(cacheKey);
        if (cached)
            return cached;
        let result;
        if (!appType) {
            result = await this.prisma.controlledVocabulary.findMany({
                where: { vocabularyName: 'regulatory-activity-type' },
                orderBy: { code: 'asc' },
            });
        }
        else {
            const deps = await this.prisma.cvDependency.findMany({
                where: { applicationTypeCode: appType },
                select: { regulatoryActivityTypeCode: true },
                distinct: ['regulatoryActivityTypeCode'],
            });
            const ratCodes = deps.map((d) => d.regulatoryActivityTypeCode);
            result = await this.prisma.controlledVocabulary.findMany({
                where: {
                    vocabularyName: 'regulatory-activity-type',
                    code: { in: ratCodes },
                },
                orderBy: { code: 'asc' },
            });
        }
        await this.cache.set(cacheKey, result, 86400);
        return result;
    }
    async getSequenceTypes(appType, ratType) {
        const cacheKey = `cv:sqt-types:${appType || 'all'}:${ratType || 'all'}`;
        const cached = await this.cache.get(cacheKey);
        if (cached)
            return cached;
        let result;
        if (!appType || !ratType) {
            result = await this.prisma.controlledVocabulary.findMany({
                where: { vocabularyName: 'sequence-type' },
                orderBy: { code: 'asc' },
            });
        }
        else {
            const deps = await this.prisma.cvDependency.findMany({
                where: {
                    applicationTypeCode: appType,
                    regulatoryActivityTypeCode: ratType,
                },
                select: { sequenceTypeCode: true },
            });
            const sqtCodes = deps
                .map((d) => d.sequenceTypeCode)
                .filter((c) => c !== null);
            result = await this.prisma.controlledVocabulary.findMany({
                where: {
                    vocabularyName: 'sequence-type',
                    code: { in: sqtCodes },
                },
                orderBy: { code: 'asc' },
            });
        }
        await this.cache.set(cacheKey, result, 86400);
        return result;
    }
    async validateDependency(appType, ratType, sqtType) {
        const where = {
            applicationTypeCode: appType,
            regulatoryActivityTypeCode: ratType,
        };
        if (sqtType) {
            where.sequenceTypeCode = sqtType;
        }
        const count = await this.prisma.cvDependency.count({ where });
        return count > 0;
    }
    async getCvVersion(vocabularyName, code) {
        const cv = await this.prisma.controlledVocabulary.findFirst({
            where: { vocabularyName, code },
            orderBy: { validFrom: 'desc' },
        });
        return cv?.version || '1.0';
    }
    decodeStfDescription(descriptionEn, fallbackValue) {
        const match = /^\[([^\]]+)\]\s*(.*)$/.exec(descriptionEn || '');
        if (match) {
            return { realm: match[1], value: match[2] || fallbackValue };
        }
        return { realm: 'ich', value: fallbackValue };
    }
    async getStfCategories() {
        const cacheKey = 'cv:stf-categories';
        const cached = await this.cache.get(cacheKey);
        if (cached)
            return cached;
        const rows = await this.prisma.controlledVocabulary.findMany({
            where: { vocabularyName: { startsWith: 'stf-category-' } },
            orderBy: [{ vocabularyName: 'asc' }, { code: 'asc' }],
        });
        const grouped = new Map();
        for (const row of rows) {
            const name = row.vocabularyName.replace(/^stf-category-/, '');
            const decoded = this.decodeStfDescription(row.descriptionEn, row.code);
            if (!grouped.has(name))
                grouped.set(name, []);
            grouped.get(name).push({ value: row.code, realm: decoded.realm });
        }
        const result = Array.from(grouped.entries()).map(([name, values]) => ({
            name,
            values,
        }));
        await this.cache.set(cacheKey, result, 86400);
        return result;
    }
    async getStfFileTags(module) {
        const cacheKey = `cv:stf-file-tags:${module}`;
        const cached = await this.cache.get(cacheKey);
        if (cached)
            return cached;
        const rows = await this.prisma.controlledVocabulary.findMany({
            where: { vocabularyName: `stf-file-tag-${module}` },
            orderBy: { code: 'asc' },
        });
        const result = rows.map((row) => {
            const decoded = this.decodeStfDescription(row.descriptionEn, row.code);
            return { value: row.code, realm: decoded.realm };
        });
        await this.cache.set(cacheKey, result, 86400);
        return result;
    }
    async getStfCategoryValues(categoryName) {
        const cacheKey = `cv:stf-category-values:${categoryName}`;
        const cached = await this.cache.get(cacheKey);
        if (cached)
            return cached;
        const rows = await this.prisma.controlledVocabulary.findMany({
            where: { vocabularyName: `stf-category-${categoryName}` },
            orderBy: { code: 'asc' },
        });
        const result = rows.map((row) => {
            const decoded = this.decodeStfDescription(row.descriptionEn, row.code);
            return { value: row.code, realm: decoded.realm };
        });
        await this.cache.set(cacheKey, result, 86400);
        return result;
    }
};
exports.ControlledVocabularyService = ControlledVocabularyService;
exports.ControlledVocabularyService = ControlledVocabularyService = ControlledVocabularyService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        redis_cache_service_1.RedisCacheService])
], ControlledVocabularyService);
//# sourceMappingURL=controlled-vocabulary.service.js.map