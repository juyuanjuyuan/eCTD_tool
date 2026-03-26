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
var StfService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.StfService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
const fast_xml_parser_1 = require("fast-xml-parser");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
let StfService = StfService_1 = class StfService {
    prisma;
    logger = new common_1.Logger(StfService_1.name);
    categories = [];
    fileTags = [];
    validValuesLoaded = false;
    constructor(prisma) {
        this.prisma = prisma;
    }
    loadValidValues() {
        if (this.validValuesLoaded)
            return;
        const validValuesPath = path.resolve(process.cwd(), '../reference/eCTD技术规范V1.1附件包/附件2-6：STF标签值文件/valid-values.xml');
        try {
            const xml = fs.readFileSync(validValuesPath, 'utf-8');
            const parser = new fast_xml_parser_1.XMLParser({
                ignoreAttributes: false,
                attributeNamePrefix: '@_',
            });
            const parsed = parser.parse(xml);
            const version = parsed['valid-values']?.version;
            if (version) {
                const categories = Array.isArray(version.category)
                    ? version.category
                    : version.category
                        ? [version.category]
                        : [];
                for (const cat of categories) {
                    const catName = cat['@_name'];
                    const values = Array.isArray(cat.value) ? cat.value : cat.value ? [cat.value] : [];
                    this.categories.push({
                        name: catName,
                        values: values.map((v) => (typeof v === 'string' ? v : v['@_name'] || v['#text'] || '')),
                    });
                }
                const fileTags = Array.isArray(version['file-tag'])
                    ? version['file-tag']
                    : version['file-tag']
                        ? [version['file-tag']]
                        : [];
                for (const ft of fileTags) {
                    this.fileTags.push({
                        name: ft['@_name'] || ft['#text'] || '',
                        module: ft['@_module'] || '',
                    });
                }
            }
            this.validValuesLoaded = true;
            this.logger.log(`Loaded valid-values.xml: ${this.categories.length} categories, ${this.fileTags.length} file-tags`);
        }
        catch (err) {
            this.logger.warn(`Failed to load valid-values.xml: ${err}`);
            this.validValuesLoaded = true;
        }
    }
    getCategories() {
        this.loadValidValues();
        return this.categories;
    }
    getFileTags() {
        this.loadValidValues();
        return this.fileTags;
    }
    async saveStf(nodeId, data) {
        const node = await this.prisma.sequenceNode.findUnique({
            where: { id: nodeId },
            include: { templateNode: { select: { requiresStf: true } } },
        });
        if (!node)
            throw new common_1.NotFoundException('节点不存在');
        const xmlContent = this.generateStfXml(data, node);
        return this.prisma.studyTaggingFile.upsert({
            where: { sequenceNodeId: nodeId },
            create: {
                sequenceNodeId: nodeId,
                studyTitle: data.studyTitle,
                studyId: data.studyId,
                categories: data.categories || {},
                fileTags: data.fileTags || [],
                stfXmlContent: xmlContent,
                operation: node.operation || 'NEW',
            },
            update: {
                studyTitle: data.studyTitle,
                studyId: data.studyId,
                categories: data.categories || {},
                fileTags: data.fileTags || [],
                stfXmlContent: xmlContent,
            },
        });
    }
    async getStf(nodeId) {
        return this.prisma.studyTaggingFile.findUnique({
            where: { sequenceNodeId: nodeId },
        });
    }
    generateStfXml(data, node) {
        const lines = [];
        lines.push('<?xml version="1.0" encoding="UTF-8"?>');
        lines.push('<!DOCTYPE ectd:study SYSTEM "../../util/dtd/ich-stf-v2-2.dtd">');
        lines.push('<?xml-stylesheet type="text/xsl" href="../../util/style/ich-stf-stylesheet-2-3.xsl"?>');
        lines.push('<ectd:study xmlns:ectd="http://www.ich.org/ectd"', '            xmlns:xlink="http://www.w3.org/1999/xlink" dtd-version="2.2">');
        lines.push('  <study-identifier>');
        lines.push(`    <title>${this.escapeXml(data.studyTitle)}</title>`);
        lines.push(`    <study-id>${this.escapeXml(data.studyId)}</study-id>`);
        if (data.categories) {
            for (const [name, value] of Object.entries(data.categories)) {
                if (value) {
                    lines.push(`    <category name="${this.escapeXml(name)}" info-type="keyword">${this.escapeXml(value)}</category>`);
                }
            }
        }
        lines.push('  </study-identifier>');
        if (node.fileAttachments && node.fileAttachments.length > 0) {
            lines.push('  <study-document>');
            for (const file of node.fileAttachments) {
                lines.push(`    <doc-content xlink:href="${this.escapeXml(file.ectdRelativePath)}">`);
                lines.push(`      <title>${this.escapeXml(data.studyTitle)}</title>`);
                if (data.fileTags && data.fileTags.length > 0) {
                    for (const tag of data.fileTags) {
                        lines.push(`      <file-tag name="${this.escapeXml(tag.name)}" info-type="${this.escapeXml(tag.infoType || 'keyword')}"/>`);
                    }
                }
                lines.push('    </doc-content>');
            }
            lines.push('  </study-document>');
        }
        lines.push('</ectd:study>');
        return lines.join('\n');
    }
    escapeXml(str) {
        if (!str)
            return '';
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
    }
};
exports.StfService = StfService;
exports.StfService = StfService = StfService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], StfService);
//# sourceMappingURL=stf.service.js.map