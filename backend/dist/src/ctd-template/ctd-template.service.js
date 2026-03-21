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
Object.defineProperty(exports, "__esModule", { value: true });
exports.CtdTemplateService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const client_1 = require("@prisma/client");
const EXTENSION_NODE_DEFS = {
    '3.2.R.1': { titleZh: '3.2.R.1工艺验证', titleEn: 'Process Validation' },
    '3.2.R.2': { titleZh: '3.2.R.2批记录', titleEn: 'Batch Records' },
    '3.2.R.3': { titleZh: '3.2.R.3分析方法验证报告', titleEn: 'Analytical Method Validation Reports' },
    '3.2.R.4': { titleZh: '3.2.R.4稳定性图谱', titleEn: 'Stability Profiles' },
    '3.2.R.5': { titleZh: '3.2.R.5可比性方案', titleEn: 'Comparability Schemes' },
    '3.2.R.6': { titleZh: '3.2.R.6其他', titleEn: 'Other' },
};
const SUBSTANCE_SECTIONS = new Set(['2.3.S', '3.2.S']);
const PRODUCT_SECTIONS = new Set(['2.3.P', '3.2.P']);
const INDICATION_SECTIONS = new Set(['2.7.3']);
let CtdTemplateService = class CtdTemplateService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async getTemplateTree() {
        return this.prisma.ctdTemplateNode.findMany({
            where: { parentId: null },
            include: {
                children: {
                    include: {
                        children: {
                            include: {
                                children: {
                                    include: {
                                        children: {
                                            include: {
                                                children: {
                                                    include: { children: true },
                                                },
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            },
            orderBy: { sortOrder: 'asc' },
        });
    }
    async getTemplateTreeWithRules(appTypeCode, ratTypeCode) {
        const allNodes = await this.prisma.ctdTemplateNode.findMany({
            orderBy: { sortOrder: 'asc' },
        });
        const rules = await this.prisma.ctdCompletenessRule.findMany({
            where: {
                applicationTypeCode: appTypeCode,
                regulatoryActivityTypeCode: ratTypeCode,
            },
        });
        const requiredNodeIds = new Set();
        const forbiddenNodeIds = new Set();
        for (const rule of rules) {
            if (rule.ruleType === 'REQUIRED') {
                requiredNodeIds.add(rule.templateNodeId);
            }
            else if (rule.ruleType === 'FORBIDDEN') {
                forbiddenNodeIds.add(rule.templateNodeId);
            }
        }
        const annotatedNodes = allNodes.map((node) => ({
            ...node,
            isRequired: requiredNodeIds.has(node.id),
            isForbidden: forbiddenNodeIds.has(node.id),
        }));
        const nodeMap = new Map();
        for (const node of annotatedNodes) {
            nodeMap.set(node.id, { ...node, children: [] });
        }
        const roots = [];
        for (const node of annotatedNodes) {
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
    async initializeSequenceNodes(sequenceId) {
        const sequence = await this.prisma.sequence.findUnique({
            where: { id: sequenceId },
            include: {
                regulatoryActivity: {
                    include: {
                        application: {
                            select: {
                                applicationTypeCode: true,
                                productTypeCode: true,
                            },
                        },
                    },
                },
                sequenceNodes: { select: { id: true }, take: 1 },
            },
        });
        if (!sequence) {
            throw new common_1.NotFoundException(`序列 ${sequenceId} 不存在`);
        }
        if (sequence.sequenceNodes.length > 0) {
            throw new common_1.BadRequestException('序列目录已初始化');
        }
        const appTypeCode = sequence.regulatoryActivity.application.applicationTypeCode;
        const ratTypeCode = sequence.regulatoryActivity.regulatoryActivityTypeCode;
        const isFirstSequence = sequence.sequenceNumber === '0000';
        const templateNodes = await this.prisma.ctdTemplateNode.findMany({
            orderBy: { sortOrder: 'asc' },
        });
        const rules = await this.prisma.ctdCompletenessRule.findMany({
            where: {
                applicationTypeCode: appTypeCode,
                regulatoryActivityTypeCode: ratTypeCode,
            },
        });
        const requiredNodeIds = new Set();
        for (const rule of rules) {
            if (rule.ruleType === 'REQUIRED') {
                requiredNodeIds.add(rule.templateNodeId);
            }
        }
        const templateToSequenceId = new Map();
        for (const tmpl of templateNodes) {
            const operation = isFirstSequence && tmpl.isLeaf ? client_1.LeafOperation.NEW : null;
            const seqNode = await this.prisma.sequenceNode.create({
                data: {
                    sequenceId,
                    templateNodeId: tmpl.id,
                    elementName: tmpl.elementName,
                    ctdSectionNumber: tmpl.ctdSectionNumber,
                    title: tmpl.titleZh,
                    operation,
                    status: client_1.SequenceNodeStatus.EMPTY,
                    isRequired: requiredNodeIds.has(tmpl.id),
                    isLeaf: tmpl.isLeaf,
                    sortOrder: tmpl.sortOrder,
                },
            });
            templateToSequenceId.set(tmpl.id, seqNode.id);
        }
        for (const tmpl of templateNodes) {
            if (tmpl.parentId) {
                const seqNodeId = templateToSequenceId.get(tmpl.id);
                const parentSeqNodeId = templateToSequenceId.get(tmpl.parentId);
                if (seqNodeId && parentSeqNodeId) {
                    await this.prisma.sequenceNode.update({
                        where: { id: seqNodeId },
                        data: { parentId: parentSeqNodeId },
                    });
                }
            }
        }
        await this.prisma.sequence.update({
            where: { id: sequenceId },
            data: { status: 'EDITING' },
        });
        return { message: '序列目录初始化完成', nodeCount: templateNodes.length };
    }
    async getSequenceNodeTree(sequenceId) {
        const sequence = await this.prisma.sequence.findUnique({
            where: { id: sequenceId },
        });
        if (!sequence)
            throw new common_1.NotFoundException(`序列 ${sequenceId} 不存在`);
        const allNodes = await this.prisma.sequenceNode.findMany({
            where: { sequenceId },
            orderBy: { sortOrder: 'asc' },
        });
        const nodeMap = new Map();
        for (const node of allNodes) {
            nodeMap.set(node.id, { ...node, children: [] });
        }
        const roots = [];
        for (const node of allNodes) {
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
    async updateSequenceNode(sequenceId, nodeId, dto) {
        const node = await this.prisma.sequenceNode.findFirst({
            where: { id: nodeId, sequenceId },
        });
        if (!node)
            throw new common_1.NotFoundException('序列节点不存在');
        return this.prisma.sequenceNode.update({
            where: { id: nodeId },
            data: dto,
        });
    }
    async updateBackboneAttributes(sequenceId, nodeId, dto) {
        const node = await this.prisma.sequenceNode.findFirst({
            where: { id: nodeId, sequenceId },
        });
        if (!node)
            throw new common_1.NotFoundException('序列节点不存在');
        const sno = node.ctdSectionNumber;
        const data = {};
        if (SUBSTANCE_SECTIONS.has(sno)) {
            if (dto.substance !== undefined)
                data.substance = dto.substance;
            if (dto.manufacturer !== undefined)
                data.manufacturer = dto.manufacturer;
        }
        else if (PRODUCT_SECTIONS.has(sno)) {
            if (dto.productName !== undefined)
                data.productName = dto.productName;
            if (dto.dosageForm !== undefined)
                data.dosageForm = dto.dosageForm;
            if (dto.manufacturer !== undefined)
                data.manufacturer = dto.manufacturer;
        }
        else if (INDICATION_SECTIONS.has(sno)) {
            if (dto.indication !== undefined)
                data.indication = dto.indication;
        }
        else {
            throw new common_1.BadRequestException(`章节 ${sno} 不支持骨架属性`);
        }
        return this.prisma.sequenceNode.update({
            where: { id: nodeId },
            data,
        });
    }
    async createExtensionNode(sequenceId, parentNodeId, dto) {
        const parentNode = await this.prisma.sequenceNode.findFirst({
            where: { id: parentNodeId, sequenceId },
            include: {
                templateNode: { select: { allowsExtension: true } },
            },
        });
        if (!parentNode)
            throw new common_1.NotFoundException('父节点不存在');
        if (!parentNode.templateNode.allowsExtension) {
            throw new common_1.BadRequestException('该节点不允许创建扩展子节点');
        }
        const sequence = await this.prisma.sequence.findUnique({
            where: { id: sequenceId },
            include: {
                regulatoryActivity: {
                    include: {
                        application: { select: { productTypeCode: true } },
                    },
                },
            },
        });
        if (!sequence)
            throw new common_1.NotFoundException(`序列 ${sequenceId} 不存在`);
        if (sequence.regulatoryActivity.application.productTypeCode !== 'cnprt2') {
            throw new common_1.ForbiddenException('扩展节点仅适用于生物制品(cnprt2)申请');
        }
        const extDef = EXTENSION_NODE_DEFS[dto.extensionType];
        if (!extDef) {
            throw new common_1.BadRequestException(`无效的扩展节点类型: ${dto.extensionType}`);
        }
        const existing = await this.prisma.sequenceNode.findFirst({
            where: {
                sequenceId,
                parentId: parentNodeId,
                ctdSectionNumber: dto.extensionType,
            },
        });
        if (existing) {
            throw new common_1.BadRequestException(`扩展节点 ${dto.extensionType} 已存在`);
        }
        const maxSort = await this.prisma.sequenceNode.aggregate({
            where: { sequenceId, parentId: parentNodeId },
            _max: { sortOrder: true },
        });
        return this.prisma.sequenceNode.create({
            data: {
                sequenceId,
                templateNodeId: parentNode.templateNodeId,
                parentId: parentNodeId,
                elementName: 'node-extension',
                ctdSectionNumber: dto.extensionType,
                title: extDef.titleZh,
                operation: client_1.LeafOperation.NEW,
                status: client_1.SequenceNodeStatus.EMPTY,
                isRequired: false,
                isLeaf: true,
                sortOrder: (maxSort._max.sortOrder || 0) + 1,
            },
        });
    }
    async deleteExtensionNode(sequenceId, nodeId) {
        const node = await this.prisma.sequenceNode.findFirst({
            where: { id: nodeId, sequenceId, elementName: 'node-extension' },
        });
        if (!node) {
            throw new common_1.NotFoundException('扩展节点不存在');
        }
        return this.prisma.sequenceNode.delete({ where: { id: nodeId } });
    }
    async checkCompleteness(sequenceId) {
        const sequence = await this.prisma.sequence.findUnique({
            where: { id: sequenceId },
            include: {
                regulatoryActivity: {
                    include: {
                        application: { select: { applicationTypeCode: true } },
                    },
                },
            },
        });
        if (!sequence)
            throw new common_1.NotFoundException(`序列 ${sequenceId} 不存在`);
        const appTypeCode = sequence.regulatoryActivity.application.applicationTypeCode;
        const ratTypeCode = sequence.regulatoryActivity.regulatoryActivityTypeCode;
        const nodes = await this.prisma.sequenceNode.findMany({
            where: { sequenceId },
        });
        const rules = await this.prisma.ctdCompletenessRule.findMany({
            where: {
                applicationTypeCode: appTypeCode,
                regulatoryActivityTypeCode: ratTypeCode,
            },
            include: {
                templateNode: { select: { elementName: true, ctdSectionNumber: true, titleZh: true } },
            },
        });
        const nodeByTemplateId = new Map();
        for (const n of nodes) {
            nodeByTemplateId.set(n.templateNodeId, n);
        }
        const completedNodes = new Set();
        for (const n of nodes) {
            if (n.status === 'COMPLETED') {
                completedNodes.add(n.templateNodeId);
            }
        }
        const results = {
            totalSections: nodes.filter((n) => n.isLeaf).length,
            requiredSections: 0,
            completedRequired: 0,
            forbiddenViolations: [],
            missingRequired: [],
            moduleStats: {},
        };
        for (const n of nodes) {
            if (!n.isLeaf)
                continue;
            const mod = `模块${n.ctdSectionNumber.split('.')[0]}`;
            if (!results.moduleStats[mod]) {
                results.moduleStats[mod] = { total: 0, required: 0, completed: 0 };
            }
            results.moduleStats[mod].total++;
            if (n.isRequired)
                results.moduleStats[mod].required++;
            if (n.status === 'COMPLETED')
                results.moduleStats[mod].completed++;
        }
        for (const rule of rules) {
            if (rule.ruleType === 'REQUIRED') {
                results.requiredSections++;
                const seqNode = nodeByTemplateId.get(rule.templateNodeId);
                if (seqNode && seqNode.status === 'COMPLETED') {
                    results.completedRequired++;
                }
                else {
                    results.missingRequired.push({
                        elementName: rule.templateNode.elementName,
                        section: rule.templateNode.ctdSectionNumber,
                        title: rule.templateNode.titleZh,
                        severity: rule.severity,
                    });
                }
            }
            else if (rule.ruleType === 'FORBIDDEN') {
                const seqNode = nodeByTemplateId.get(rule.templateNodeId);
                if (seqNode && seqNode.status !== 'EMPTY') {
                    results.forbiddenViolations.push({
                        elementName: rule.templateNode.elementName,
                        section: rule.templateNode.ctdSectionNumber,
                        title: rule.templateNode.titleZh,
                    });
                }
            }
        }
        return results;
    }
    getExtensionNodeOptions() {
        return Object.entries(EXTENSION_NODE_DEFS).map(([type, def]) => ({
            type,
            titleZh: def.titleZh,
            titleEn: def.titleEn,
        }));
    }
};
exports.CtdTemplateService = CtdTemplateService;
exports.CtdTemplateService = CtdTemplateService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], CtdTemplateService);
//# sourceMappingURL=ctd-template.service.js.map