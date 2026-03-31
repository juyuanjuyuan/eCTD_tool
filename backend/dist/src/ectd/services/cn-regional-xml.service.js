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
var CnRegionalXmlService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.CnRegionalXmlService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
const md5_service_1 = require("./md5.service");
let CnRegionalXmlService = CnRegionalXmlService_1 = class CnRegionalXmlService {
    prisma;
    md5Service;
    logger = new common_1.Logger(CnRegionalXmlService_1.name);
    constructor(prisma, md5Service) {
        this.prisma = prisma;
        this.md5Service = md5Service;
    }
    async generateCnRegionalXml(sequenceId) {
        const sequence = await this.prisma.sequence.findUnique({
            where: { id: sequenceId },
            include: {
                regulatoryActivity: {
                    include: {
                        application: true,
                    },
                },
            },
        });
        if (!sequence) {
            throw new Error(`序列 ${sequenceId} 不存在`);
        }
        const app = sequence.regulatoryActivity.application;
        const ra = sequence.regulatoryActivity;
        const priorLeafIdMap = await this.buildPriorLeafIdMap(sequence);
        const module1Nodes = await this.loadModule1Nodes(sequenceId);
        const xml = this.buildXml(sequence, app, ra, module1Nodes, priorLeafIdMap);
        return xml;
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
                    templateNode: { module: 1 },
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
    async loadModule1Nodes(sequenceId) {
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
        const m1Nodes = allNodes.filter((n) => n.templateNode.module === 1);
        const nodeMap = new Map();
        for (const node of m1Nodes) {
            nodeMap.set(node.id, {
                id: node.id,
                templateNodeId: node.templateNodeId,
                elementName: node.elementName,
                ctdSectionNumber: node.ctdSectionNumber,
                title: node.title,
                operation: node.operation,
                isLeaf: node.isLeaf,
                children: [],
                fileAttachments: node.fileAttachments,
            });
        }
        const roots = [];
        for (const node of m1Nodes) {
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
    buildXml(sequence, app, ra, module1Nodes, priorLeafIdMap) {
        const lines = [];
        lines.push('<?xml version="1.0" encoding="UTF-8"?>');
        lines.push('<cn_ectd schema-version="1.0"', '         xmlns="cn_ectd"', '         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"', '         xsi:schemaLocation="cn_ectd ../../util/dtd/cn-regional-1-0.xsd"', '         xmlns:xlink="http://www.w3.org/1999/xlink">');
        lines.push('  <cn-envelope>');
        lines.push(`    <application-id>${this.escapeXml(app.applicationNumber)}</application-id>`);
        lines.push(`    <application-type code="${this.escapeXml(app.applicationTypeCode)}" version="${this.escapeXml(app.applicationTypeVersion)}"/>`);
        lines.push(`    <product-type code="${this.escapeXml(app.productTypeCode)}" version="${this.escapeXml(app.productTypeVersion)}"/>`);
        lines.push(`    <product-number>${this.escapeXml(app.productNumber)}</product-number>`);
        lines.push(`    <related-sequence>${this.escapeXml(ra.relatedSequence)}</related-sequence>`);
        lines.push(`    <regulatory-activity-type code="${this.escapeXml(ra.regulatoryActivityTypeCode)}" version="${this.escapeXml(ra.regulatoryActivityTypeVersion)}"/>`);
        lines.push(`    <sequence-number>${this.escapeXml(sequence.sequenceNumber)}</sequence-number>`);
        lines.push(`    <sequence-type code="${this.escapeXml(sequence.sequenceTypeCode)}" version="${this.escapeXml(sequence.sequenceTypeVersion)}"/>`);
        lines.push(`    <sequence-description>${this.escapeXml(sequence.description)}</sequence-description>`);
        lines.push('    <sequence-contact>');
        lines.push(`      <name>${this.escapeXml(sequence.contactName)}</name>`);
        lines.push(`      <phone>${this.escapeXml(sequence.contactPhone)}</phone>`);
        lines.push(`      <email>${this.escapeXml(sequence.contactEmail)}</email>`);
        lines.push('    </sequence-contact>');
        lines.push('  </cn-envelope>');
        lines.push('  <cn-content>');
        this.buildContentElements(lines, module1Nodes, '    ', sequence.id, priorLeafIdMap);
        lines.push('  </cn-content>');
        lines.push('</cn_ectd>');
        return lines.join('\n');
    }
    buildContentElements(lines, nodes, indent, sequenceId, priorLeafIdMap) {
        for (const node of nodes) {
            if (node.isLeaf) {
                this.buildLeafElements(lines, node, indent, sequenceId, priorLeafIdMap);
            }
            else if (node.children.length > 0) {
                if (this.hasActiveLeaves(node)) {
                    lines.push(`${indent}<${node.elementName}>`);
                    this.buildContentElements(lines, node.children, indent + '  ', sequenceId, priorLeafIdMap);
                    lines.push(`${indent}</${node.elementName}>`);
                }
            }
        }
    }
    buildLeafElements(lines, node, indent, sequenceId, priorLeafIdMap) {
        if (!node.operation)
            return;
        const op = node.operation.toLowerCase();
        const modifiedFile = ['replace', 'delete', 'append'].includes(op)
            ? priorLeafIdMap.get(node.templateNodeId)
            : undefined;
        if (node.fileAttachments.length > 0) {
            for (let i = 0; i < node.fileAttachments.length; i++) {
                const file = node.fileAttachments[i];
                const leafId = this.md5Service.generateDeterministicLeafId(sequenceId, node.id, i);
                const attrs = this.buildLeafAttributes(leafId, op, file, modifiedFile);
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
    buildLeafAttributes(leafId, operation, file, modifiedFile) {
        const parts = [`ID="${leafId}"`, `operation="${operation}"`];
        if (modifiedFile) {
            parts.push(`modified-file="${modifiedFile}"`);
        }
        if (operation !== 'delete') {
            const href = file.ectdRelativePath.startsWith('m1/cn/')
                ? file.ectdRelativePath.substring('m1/cn/'.length)
                : file.ectdRelativePath;
            parts.push(`xlink:href="${this.escapeXml(href)}"`);
            parts.push(`checksum="${file.md5Checksum}"`);
            parts.push(`checksum-type="MD5"`);
        }
        if (file.xmlLang) {
            parts.push(`xml:lang="${this.escapeXml(file.xmlLang)}"`);
        }
        return parts.join('\n              ');
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
exports.CnRegionalXmlService = CnRegionalXmlService;
exports.CnRegionalXmlService = CnRegionalXmlService = CnRegionalXmlService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        md5_service_1.Md5Service])
], CnRegionalXmlService);
//# sourceMappingURL=cn-regional-xml.service.js.map