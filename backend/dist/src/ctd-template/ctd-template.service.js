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
const redis_cache_service_1 = require("../common/redis-cache.service");
const client_1 = require("@prisma/client");
const crypto_1 = require("crypto");
const EXTENSION_NODE_DEFS = {
    '3.2.R.1': { titleZh: '3.2.R.1工艺验证', titleEn: 'Process Validation' },
    '3.2.R.2': { titleZh: '3.2.R.2批记录', titleEn: 'Batch Records' },
    '3.2.R.3': { titleZh: '3.2.R.3分析方法验证报告', titleEn: 'Analytical Method Validation Reports' },
    '3.2.R.4': { titleZh: '3.2.R.4稳定性图谱', titleEn: 'Stability Profiles' },
    '3.2.R.5': { titleZh: '3.2.R.5可比性方案', titleEn: 'Comparability Schemes' },
    '3.2.R.6': { titleZh: '3.2.R.6其他', titleEn: 'Other' },
};
const EXTENSION_NODE_ALLOWED_PRODUCT_TYPE = 'cnprt2';
const SUBSTANCE_SECTIONS = new Set(['2.3.S', '3.2.S']);
const PRODUCT_SECTIONS = new Set(['2.3.P', '3.2.P']);
const INDICATION_SECTIONS = new Set(['2.7.3']);
let CtdTemplateService = class CtdTemplateService {
    prisma;
    cache;
    constructor(prisma, cache) {
        this.prisma = prisma;
        this.cache = cache;
    }
    async getTemplateTree() {
        const cacheKey = 'ctd:template-tree';
        const cached = await this.cache.get(cacheKey);
        if (cached)
            return cached;
        const allNodes = await this.prisma.ctdTemplateNode.findMany({
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
        await this.cache.set(cacheKey, roots, 86400);
        return roots;
    }
    async getTemplateTreeWithRules(appTypeCode, ratTypeCode) {
        const cacheKey = `ctd:template-tree:${appTypeCode}:${ratTypeCode}`;
        const cached = await this.cache.get(cacheKey);
        if (cached)
            return cached;
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
        await this.cache.set(cacheKey, roots, 86400);
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
        let priorNodesByTemplate = null;
        if (!isFirstSequence) {
            const priorSequences = await this.prisma.sequence.findMany({
                where: {
                    regulatoryActivityId: sequence.regulatoryActivity.id,
                    id: { not: sequenceId },
                },
                orderBy: { sequenceNumber: 'desc' },
                take: 1,
            });
            if (priorSequences.length > 0) {
                const priorNodes = await this.prisma.sequenceNode.findMany({
                    where: { sequenceId: priorSequences[0].id },
                });
                priorNodesByTemplate = new Map();
                for (const pn of priorNodes) {
                    priorNodesByTemplate.set(pn.templateNodeId, {
                        status: pn.status,
                        operation: null,
                    });
                }
            }
        }
        const templateToSequenceId = new Map();
        const nodeDataList = [];
        for (const tmpl of templateNodes) {
            const nodeId = (0, crypto_1.randomUUID)();
            templateToSequenceId.set(tmpl.id, nodeId);
            let operation = null;
            let status = client_1.SequenceNodeStatus.EMPTY;
            if (isFirstSequence && tmpl.isLeaf) {
                operation = client_1.LeafOperation.NEW;
            }
            else if (priorNodesByTemplate && tmpl.isLeaf) {
                const priorNode = priorNodesByTemplate.get(tmpl.id);
                if (priorNode) {
                    status = priorNode.status;
                }
            }
            nodeDataList.push({
                id: nodeId,
                sequenceId,
                templateNodeId: tmpl.id,
                parentId: null,
                elementName: tmpl.elementName,
                ctdSectionNumber: tmpl.ctdSectionNumber,
                title: tmpl.titleZh,
                operation,
                status,
                isRequired: requiredNodeIds.has(tmpl.id),
                isLeaf: tmpl.isLeaf,
                sortOrder: tmpl.sortOrder,
            });
        }
        for (let i = 0; i < templateNodes.length; i++) {
            const tmpl = templateNodes[i];
            if (tmpl.parentId) {
                const parentSeqNodeId = templateToSequenceId.get(tmpl.parentId);
                if (parentSeqNodeId) {
                    nodeDataList[i].parentId = parentSeqNodeId;
                }
            }
        }
        await this.prisma.$transaction(nodeDataList.map((data) => this.prisma.sequenceNode.create({ data })));
        if (!isFirstSequence && priorNodesByTemplate) {
            const priorSequences = await this.prisma.sequence.findMany({
                where: {
                    regulatoryActivityId: sequence.regulatoryActivity.id,
                    id: { not: sequenceId },
                },
                orderBy: { sequenceNumber: 'desc' },
                take: 1,
            });
            if (priorSequences.length > 0) {
                const priorExtensions = await this.prisma.sequenceNode.findMany({
                    where: {
                        sequenceId: priorSequences[0].id,
                        elementName: 'node-extension',
                    },
                });
                for (const ext of priorExtensions) {
                    const parentSeqNodeId = templateToSequenceId.get(ext.templateNodeId);
                    if (parentSeqNodeId) {
                        await this.prisma.sequenceNode.create({
                            data: {
                                sequenceId,
                                templateNodeId: ext.templateNodeId,
                                parentId: parentSeqNodeId,
                                elementName: 'node-extension',
                                ctdSectionNumber: ext.ctdSectionNumber,
                                title: ext.title,
                                operation: null,
                                status: ext.status,
                                isRequired: false,
                                isLeaf: true,
                                sortOrder: ext.sortOrder,
                            },
                        });
                    }
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
        if (dto.status && (node.approvalStatus === 'APPROVED' || node.approvalStatus === 'SUBMITTED')) {
            throw new common_1.BadRequestException('已提交审批或已审批的节点不允许修改状态');
        }
        if (dto.status === 'COMPLETED' && node.status === 'EMPTY') {
            throw new common_1.BadRequestException('未开始的节点不能直接标记为已完成，请先编辑');
        }
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
        if (SUBSTANCE_SECTIONS.has(sno)) {
            const hasSubstanceChange = (dto.substance !== undefined && dto.substance !== node.substance) ||
                (dto.manufacturer !== undefined && dto.manufacturer !== node.manufacturer);
            if (hasSubstanceChange) {
                const sequence = await this.prisma.sequence.findUnique({
                    where: { id: sequenceId },
                });
                if (sequence && sequence.sequenceNumber !== '0000') {
                    const childLeaves = await this.prisma.sequenceNode.findMany({
                        where: {
                            sequenceId,
                            isLeaf: true,
                        },
                    });
                    const allNodes = await this.prisma.sequenceNode.findMany({
                        where: { sequenceId },
                    });
                    const descendantIds = this.getDescendantIds(node.id, allNodes);
                    const sectionLeaves = childLeaves.filter((l) => descendantIds.has(l.id));
                    for (const leaf of sectionLeaves) {
                        await this.prisma.sequenceNode.update({
                            where: { id: leaf.id },
                            data: { operation: client_1.LeafOperation.NEW },
                        });
                    }
                }
            }
        }
        return this.prisma.sequenceNode.update({
            where: { id: nodeId },
            data,
        });
    }
    getDescendantIds(parentId, allNodes) {
        const result = new Set();
        const children = allNodes.filter((n) => n.parentId === parentId);
        for (const child of children) {
            result.add(child.id);
            const grandChildren = this.getDescendantIds(child.id, allNodes);
            grandChildren.forEach((id) => result.add(id));
        }
        return result;
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
        if (sequence.regulatoryActivity.application.productTypeCode !==
            EXTENSION_NODE_ALLOWED_PRODUCT_TYPE) {
            throw new common_1.ForbiddenException(`扩展节点仅适用于生物制品(${EXTENSION_NODE_ALLOWED_PRODUCT_TYPE})申请`);
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
    async previewRequiredSections(sequenceId) {
        const sequence = await this.prisma.sequence.findUnique({
            where: { id: sequenceId },
            include: {
                regulatoryActivity: {
                    include: {
                        application: {
                            select: { applicationTypeCode: true, productTypeCode: true },
                        },
                    },
                },
            },
        });
        if (!sequence)
            throw new common_1.NotFoundException(`序列 ${sequenceId} 不存在`);
        const appTypeCode = sequence.regulatoryActivity.application.applicationTypeCode;
        const ratTypeCode = sequence.regulatoryActivity.regulatoryActivityTypeCode;
        const rules = await this.prisma.ctdCompletenessRule.findMany({
            where: {
                applicationTypeCode: appTypeCode,
                regulatoryActivityTypeCode: ratTypeCode,
            },
            include: {
                templateNode: {
                    select: {
                        elementName: true,
                        ctdSectionNumber: true,
                        titleZh: true,
                        module: true,
                    },
                },
            },
        });
        const required = rules
            .filter((r) => r.ruleType === 'REQUIRED')
            .map((r) => ({
            section: r.templateNode.ctdSectionNumber,
            title: r.templateNode.titleZh,
            module: r.templateNode.module,
            severity: r.severity,
        }));
        const forbidden = rules
            .filter((r) => r.ruleType === 'FORBIDDEN')
            .map((r) => ({
            section: r.templateNode.ctdSectionNumber,
            title: r.templateNode.titleZh,
            module: r.templateNode.module,
        }));
        return {
            applicationTypeCode: appTypeCode,
            regulatoryActivityTypeCode: ratTypeCode,
            requiredSections: required,
            forbiddenSections: forbidden,
            totalRequired: required.length,
        };
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
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        redis_cache_service_1.RedisCacheService])
], CtdTemplateService);
//# sourceMappingURL=ctd-template.service.js.map