"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var IndexXmlService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.IndexXmlService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
const md5_service_1 = require("./md5.service");
const SUBSTANCE_ELEMENTS = new Set([
    'm2-3-s-drug-substance',
    'm3-2-s-drug-substance',
]);
const PRODUCT_ELEMENTS = new Set([
    'm2-3-p-drug-product',
    'm3-2-p-drug-product',
]);
const INDICATION_ELEMENTS = new Set([
    'm2-7-3-summary-of-clinical-efficacy',
]);
const INDICATION_ELEMENTS_M5 = new Set([
    'm5-3-5-reports-of-efficacy-and-safety-studies',
]);
let IndexXmlService = IndexXmlService_1 = class IndexXmlService {
    prisma;
    md5Service;
    logger = new common_1.Logger(IndexXmlService_1.name);
    constructor(prisma, md5Service) {
        this.prisma = prisma;
        this.md5Service = md5Service;
    }
    async generateIndexXml(sequenceId) {
        const sequence = await this.prisma.sequence.findUnique({
            where: { id: sequenceId },
            select: {
                id: true,
                sequenceNumber: true,
                regulatoryActivityId: true,
            },
        });
        if (!sequence)
            throw new Error(`序列 ${sequenceId} 不存在`);
        const priorLeafIdMap = await this.buildPriorLeafIdMap(sequence);
        const moduleRoots = await this.loadModuleNodes(sequenceId);
        return this.buildXml(sequenceId, moduleRoots, priorLeafIdMap);
    }
    async buildPriorLeafIdMap(sequence) {
        const map = new Map();
        if (sequence.sequenceNumber === '0000')
            return map;
        const priorSequences = await this.prisma.sequence.findMany({
            where: {
                regulatoryActivityId: sequence.regulatoryActivityId,
                sequenceNumber: { lt: sequence.sequenceNumber },
            },
            orderBy: { sequenceNumber: 'desc' },
            select: { id: true },
        });
        for (const priorSeq of priorSequences) {
            const priorNodes = await this.prisma.sequenceNode.findMany({
                where: {
                    sequenceId: priorSeq.id,
                    isLeaf: true,
                    operation: { not: null },
                    templateNode: { module: { gte: 2 } },
                },
                select: { id: true, templateNodeId: true },
            });
            for (const node of priorNodes) {
                if (!map.has(node.templateNodeId)) {
                    map.set(node.templateNodeId, this.md5Service.generateDeterministicLeafId(priorSeq.id, node.id));
                }
            }
            break;
        }
        return map;
    }
    async loadModuleNodes(sequenceId) {
        const allNodes = await this.prisma.sequenceNode.findMany({
            where: { sequenceId },
            include: {
                templateNode: { select: { module: true } },
                fileAttachments: {
                    select: {
                        ectdRelativePath: true,
                        md5Checksum: true,
                        xmlLang: true,
                    },
                },
            },
            orderBy: { sortOrder: 'asc' },
        });
        const ichNodes = allNodes.filter((n) => n.templateNode.module >= 2);
        const nodeMap = new Map();
        for (const node of ichNodes) {
            nodeMap.set(node.id, {
                id: node.id,
                templateNodeId: node.templateNodeId,
                elementName: node.elementName,
                ctdSectionNumber: node.ctdSectionNumber,
                title: node.title,
                operation: node.operation,
                isLeaf: node.isLeaf,
                substance: node.substance,
                manufacturer: node.manufacturer,
                productName: node.productName,
                dosageForm: node.dosageForm,
                indication: node.indication,
                children: [],
                fileAttachments: node.fileAttachments,
            });
        }
        const roots = [];
        for (const node of ichNodes) {
            const treeNode = nodeMap.get(node.id);
            if (node.parentId && nodeMap.has(node.parentId)) {
                nodeMap.get(node.parentId).children.push(treeNode);
            }
            else {
                roots.push(treeNode);
            }
        }
        return roots;
    }
    buildXml(sequenceId, moduleRoots, priorLeafIdMap) {
        const lines = [];
        lines.push('<?xml version="1.0" encoding="UTF-8"?>');
        lines.push('<!DOCTYPE ectd:ectd SYSTEM "util/dtd/ich-ectd-3-2.dtd">');
        lines.push('<?xml-stylesheet type="text/xsl" href="util/style/ectd-2-0.xsl"?>');
        lines.push('<ectd:ectd xmlns:ectd="http://www.ich.org/ectd"', '           xmlns:xlink="http://www.w3.org/1999/xlink">');
        for (const root of moduleRoots) {
            if (this.hasActiveLeaves(root)) {
                this.buildElement(lines, root, '  ', sequenceId, priorLeafIdMap);
            }
        }
        lines.push('</ectd:ectd>');
        return lines.join('\n');
    }
    buildElement(lines, node, indent, sequenceId, priorLeafIdMap) {
        if (node.isLeaf) {
            this.buildLeafElements(lines, node, indent, sequenceId, priorLeafIdMap);
            return;
        }
        if (node.elementName === 'node-extension') {
            this.buildNodeExtension(lines, node, indent, sequenceId, priorLeafIdMap);
            return;
        }
        const attrs = this.buildBackboneAttributes(node);
        const openTag = attrs
            ? `${indent}<${node.elementName} ${attrs}>`
            : `${indent}<${node.elementName}>`;
        lines.push(openTag);
        for (const child of node.children) {
            if (this.hasActiveLeaves(child)) {
                this.buildElement(lines, child, indent + '  ', sequenceId, priorLeafIdMap);
            }
        }
        lines.push(`${indent}</${node.elementName}>`);
    }
    buildNodeExtension(lines, node, indent, sequenceId, priorLeafIdMap) {
        lines.push(`${indent}<node-extension>`);
        lines.push(`${indent}  <title>${this.escapeXml(node.title)}</title>`);
        for (const child of node.children) {
            this.buildLeafElements(lines, child, indent + '  ', sequenceId, priorLeafIdMap);
        }
        if (node.fileAttachments.length > 0 && node.operation) {
            this.buildLeafFromAttachments(lines, node, indent + '  ', sequenceId, priorLeafIdMap);
        }
        lines.push(`${indent}</node-extension>`);
    }
    buildLeafElements(lines, node, indent, sequenceId, priorLeafIdMap) {
        if (!node.operation)
            return;
        this.buildLeafFromAttachments(lines, node, indent, sequenceId, priorLeafIdMap);
    }
    buildLeafFromAttachments(lines, node, indent, sequenceId, priorLeafIdMap) {
        const op = node.operation.toLowerCase();
        const modifiedFile = ['replace', 'delete', 'append'].includes(op)
            ? priorLeafIdMap.get(node.templateNodeId)
            : undefined;
        if (node.fileAttachments.length > 0) {
            for (let i = 0; i < node.fileAttachments.length; i++) {
                const file = node.fileAttachments[i];
                const leafId = this.md5Service.generateDeterministicLeafId(sequenceId, node.id, i);
                const attrs = this.buildLeafAttrs(leafId, op, file, modifiedFile);
                lines.push(`${indent}<leaf ${attrs}>`);
                lines.push(`${indent}  <title>${this.escapeXml(node.title)}</title>`);
                lines.push(`${indent}</leaf>`);
            }
        }
        else if (op === 'delete') {
            const leafId = this.md5Service.generateDeterministicLeafId(sequenceId, node.id);
            const deleteAttrs = [`ID="${leafId}"`, `operation="delete"`];
            if (modifiedFile) {
                deleteAttrs.push(`modified-file="${modifiedFile}"`);
            }
            lines.push(`${indent}<leaf ${deleteAttrs.join(' ')}>`);
            lines.push(`${indent}  <title>${this.escapeXml(node.title)}</title>`);
            lines.push(`${indent}</leaf>`);
        }
    }
    buildLeafAttrs(leafId, operation, file, modifiedFile) {
        const parts = [`ID="${leafId}"`, `operation="${operation}"`];
        if (modifiedFile) {
            parts.push(`modified-file="${modifiedFile}"`);
        }
        if (operation !== 'delete') {
            parts.push(`xlink:href="${this.escapeXml(file.ectdRelativePath)}"`);
            parts.push(`checksum="${file.md5Checksum}"`);
            parts.push(`checksum-type="MD5"`);
        }
        if (file.xmlLang) {
            parts.push(`xml:lang="${this.escapeXml(file.xmlLang)}"`);
        }
        return parts.join('\n              ');
    }
    buildBackboneAttributes(node) {
        const parts = [];
        if (SUBSTANCE_ELEMENTS.has(node.elementName)) {
            parts.push(`substance="${this.escapeXml(node.substance || '')}"`);
            parts.push(`manufacturer="${this.escapeXml(node.manufacturer || '')}"`);
        }
        else if (PRODUCT_ELEMENTS.has(node.elementName)) {
            if (node.productName) {
                parts.push(`product-name="${this.escapeXml(node.productName)}"`);
            }
            if (node.dosageForm) {
                parts.push(`dosageform="${this.escapeXml(node.dosageForm)}"`);
            }
            if (node.manufacturer) {
                parts.push(`manufacturer="${this.escapeXml(node.manufacturer)}"`);
            }
        }
        else if (INDICATION_ELEMENTS.has(node.elementName) ||
            INDICATION_ELEMENTS_M5.has(node.elementName)) {
            parts.push(`indication="${this.escapeXml(node.indication || '')}"`);
        }
        return parts.length > 0 ? parts.join(' ') : null;
    }
    hasActiveLeaves(node) {
        if (node.isLeaf && node.operation) {
            return (node.fileAttachments.length > 0 || node.operation.toUpperCase() === 'DELETE');
        }
        return node.children.some((child) => this.hasActiveLeaves(child));
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
exports.IndexXmlService = IndexXmlService;
exports.IndexXmlService = IndexXmlService = IndexXmlService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        md5_service_1.Md5Service])
], IndexXmlService);
//# sourceMappingURL=index-xml.service.js.map