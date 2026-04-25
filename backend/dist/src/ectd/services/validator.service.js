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
var ValidatorService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ValidatorService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
const json_field_helper_1 = require("../../common/json-field.helper");
const md5_service_1 = require("./md5.service");
const client_1 = require("@prisma/client");
const VALID_EXTENSIONS = new Set(['pdf', 'xml', 'xpt', 'txt', 'xsl']);
const VALID_NAME_REGEX = /^[a-z0-9\-_]+$/;
const REQUIRED_UTIL_DTD_FILES = [
    'ich-ectd-3-2.dtd',
    'cn-regional-1-0.xsd',
    'xml.xsd',
    'xlink.xsd',
    'ich-stf-v2-2.dtd',
    'ectd-2-0.xsl',
];
const REQUIRED_UTIL_STYLE_FILES = [
    'cn-regional-1-1.xsl',
    'ich-stf-stylesheet-2-3.xsl',
    'ich-stf-stylesheet-2-2a.xsl',
    'valid-values.xml',
];
const ALLOWED_ROOT_ITEMS = new Set([
    'index.xml',
    'index-md5.txt',
    'm1',
    'm2',
    'm3',
    'm4',
    'm5',
    'util',
]);
let ValidatorService = ValidatorService_1 = class ValidatorService {
    prisma;
    md5Service;
    logger = new common_1.Logger(ValidatorService_1.name);
    constructor(prisma, md5Service) {
        this.prisma = prisma;
        this.md5Service = md5Service;
    }
    async validate(sequenceId) {
        const items = [];
        const sequence = await this.prisma.sequence.findUnique({
            where: { id: sequenceId },
            include: {
                regulatoryActivity: {
                    include: {
                        application: true,
                        sequences: {
                            select: { id: true, sequenceNumber: true },
                            orderBy: { sequenceNumber: 'asc' },
                        },
                    },
                },
                sequenceNodes: {
                    include: {
                        templateNode: { select: { module: true, requiresStf: true, elementName: true, allowsExtension: true, ctdSectionNumber: true, titleZh: true } },
                        fileAttachments: { include: { pdfAnalysis: true } },
                        document: { select: { xmlLang: true, wordCount: true } },
                        studies: {
                            include: {
                                categories: true,
                                documents: { include: { fileAttachment: true } },
                            },
                        },
                        children: { select: { id: true, isLeaf: true, operation: true } },
                    },
                    orderBy: { sortOrder: 'asc' },
                },
            },
        });
        if (!sequence) {
            return {
                reportId: '',
                totalErrors: 1,
                totalWarnings: 0,
                totalInfos: 0,
                isPassed: false,
                items: [
                    {
                        ruleCode: '0.0',
                        ruleCategory: '基础',
                        severity: client_1.ValidationSeverity.ERROR,
                        description: '序列不存在',
                    },
                ],
            };
        }
        const app = sequence.regulatoryActivity.application;
        const ra = sequence.regulatoryActivity;
        const isFirst = sequence.sequenceNumber === '0000';
        this.validateBasicIdentification(sequence, items);
        this.validateFileStructure(sequence, items);
        this.validateEnvelopeInfo(sequence, app, ra, isFirst, items);
        this.validateStf(sequence, items);
        this.validatePdf(sequence, items);
        const asyncItems = await Promise.all([
            (async () => {
                const cat3 = [];
                await this.validateIchBackbone(sequence, isFirst, cat3);
                return cat3;
            })(),
            (async () => {
                const cat41 = [];
                await this.validateRegionalBackbone(sequence, isFirst, cat41);
                return cat41;
            })(),
            (async () => {
                const cat43 = [];
                await this.validateCompleteness(sequence, app, ra, cat43);
                return cat43;
            })(),
            (async () => {
                const cat42a = [];
                await this.validateEnvelopeImmutability(sequence, app, ra, cat42a);
                return cat42a;
            })(),
        ]);
        for (const batch of asyncItems) {
            items.push(...batch);
        }
        const totalErrors = items.filter((i) => i.severity === client_1.ValidationSeverity.ERROR).length;
        const totalWarnings = items.filter((i) => i.severity === client_1.ValidationSeverity.WARNING).length;
        const totalInfos = items.filter((i) => i.severity === client_1.ValidationSeverity.INFO).length;
        const isPassed = totalErrors === 0;
        const report = await this.prisma.validationReport.create({
            data: {
                sequenceId,
                totalErrors,
                totalWarnings,
                totalInfos,
                isPassed,
                items: {
                    create: items.map((item) => ({
                        ruleCode: item.ruleCode,
                        ruleCategory: item.ruleCategory,
                        severity: item.severity,
                        description: item.description,
                        detail: item.detail || null,
                        filePath: item.filePath || null,
                        suggestion: item.suggestion || null,
                    })),
                },
            },
        });
        await this.prisma.sequence.update({
            where: { id: sequenceId },
            data: { status: 'VALIDATING' },
        });
        return { reportId: report.id, totalErrors, totalWarnings, totalInfos, isPassed, items };
    }
    validateBasicIdentification(sequence, items) {
        const leafNodes = sequence.sequenceNodes.filter((n) => n.isLeaf && n.operation);
        const totalFiles = leafNodes.reduce((sum, n) => sum + (n.fileAttachments?.length || 0), 0);
        const totalSize = leafNodes.reduce((sum, n) => sum +
            (n.fileAttachments || []).reduce((s, f) => s + BigInt(f.fileSize || 0), 0n), 0n);
        const emptySections = sequence.sequenceNodes.filter((n) => n.isLeaf && n.status === 'EMPTY').length;
        items.push({
            ruleCode: '1.1',
            ruleCategory: '基础识别',
            severity: client_1.ValidationSeverity.INFO,
            description: `当前序列包含 ${totalFiles} 个文件`,
        });
        items.push({
            ruleCode: '1.2',
            ruleCategory: '基础识别',
            severity: client_1.ValidationSeverity.INFO,
            description: `当前序列文件总大小: ${Number(totalSize / 1024n / 1024n)} MB`,
        });
        items.push({
            ruleCode: '1.3',
            ruleCategory: '基础识别',
            severity: client_1.ValidationSeverity.INFO,
            description: `当前序列有 ${emptySections} 个空缺章节`,
        });
    }
    validateFileStructure(sequence, items) {
        const leafNodes = sequence.sequenceNodes.filter((n) => n.isLeaf);
        const allNodes = sequence.sequenceNodes;
        const nonLeafNodes = allNodes.filter((n) => !n.isLeaf);
        for (const node of nonLeafNodes) {
            const children = allNodes.filter((c) => c.parentId === node.id);
            if (children.length === 0)
                continue;
            const hasActiveChild = children.some((c) => c.isLeaf ? (c.operation && c.operation !== 'DELETE') : true);
            if (!hasActiveChild) {
                const hasActiveDescendant = this.hasActiveDescendant(node.id, allNodes);
                if (!hasActiveDescendant && node.operation !== 'DELETE') {
                    const elementName = node.elementName || '';
                    if (elementName.startsWith('m') || elementName.startsWith('cn-')) {
                        items.push({
                            ruleCode: '2.1',
                            ruleCategory: '文件/文件夹',
                            severity: client_1.ValidationSeverity.ERROR,
                            description: `文件夹不能为空`,
                            detail: `节点 ${node.ctdSectionNumber} ${node.title} 不包含任何文件或子文件夹`,
                        });
                    }
                }
            }
        }
        for (const node of leafNodes) {
            for (const file of node.fileAttachments || []) {
                const size = Number(file.fileSize || 0);
                const ext = (file.fileType || '').toLowerCase();
                const maxSize = ext === 'xpt' ? 4 * 1024 * 1024 * 1024 : 500 * 1024 * 1024;
                if (size > maxSize) {
                    items.push({
                        ruleCode: '2.2',
                        ruleCategory: '文件/文件夹',
                        severity: client_1.ValidationSeverity.ERROR,
                        description: `文件大小超过限制`,
                        detail: `${file.originalName}: ${(size / 1024 / 1024).toFixed(1)}MB, 限制: ${ext === 'xpt' ? '4GB' : '500MB'}`,
                        filePath: file.ectdRelativePath,
                        suggestion: '请缩减文件大小',
                    });
                }
                if (ext && !VALID_EXTENSIONS.has(ext)) {
                    items.push({
                        ruleCode: '2.4',
                        ruleCategory: '文件/文件夹',
                        severity: client_1.ValidationSeverity.ERROR,
                        description: `文件类型（文件扩展名检查）`,
                        detail: `${file.originalName}: .${ext}, 允许: .pdf/.xml/.xpt/.txt/.xsl`,
                        filePath: file.ectdRelativePath,
                    });
                }
                const fileName = (file.storedName || '').replace(/\.[^.]+$/, '');
                if (fileName && !VALID_NAME_REGEX.test(fileName)) {
                    items.push({
                        ruleCode: '2.5',
                        ruleCategory: '文件/文件夹',
                        severity: client_1.ValidationSeverity.ERROR,
                        description: `文件和文件夹命名规范必须正确`,
                        detail: `${file.storedName}: 仅允许 a-z, 0-9, -, _`,
                        filePath: file.ectdRelativePath,
                        suggestion: '请使用小写字母、数字、连字符或下划线命名',
                    });
                }
                if (file.ectdRelativePath && file.ectdRelativePath.length > 230) {
                    items.push({
                        ruleCode: '2.5',
                        ruleCategory: '文件/文件夹',
                        severity: client_1.ValidationSeverity.ERROR,
                        description: `文件路径超过230字符限制`,
                        detail: `路径长度: ${file.ectdRelativePath.length}`,
                        filePath: file.ectdRelativePath,
                    });
                }
                const pathParts = (file.ectdRelativePath || '').split('/');
                for (const part of pathParts) {
                    if (part.length > 64) {
                        items.push({
                            ruleCode: '2.5',
                            ruleCategory: '文件/文件夹',
                            severity: client_1.ValidationSeverity.ERROR,
                            description: `文件/文件夹名称超过64字符`,
                            detail: `"${part}" (${part.length}字符)`,
                            filePath: file.ectdRelativePath,
                        });
                    }
                }
            }
        }
        const seqNum = sequence.sequenceNumber || '';
        if (!/^\d{4}$/.test(seqNum)) {
            items.push({
                ruleCode: '2.9',
                ruleCategory: '文件/文件夹',
                severity: client_1.ValidationSeverity.ERROR,
                description: `序列文件夹要求`,
                detail: `序列文件夹名称必须仅包含4个数字: ${seqNum}`,
            });
        }
        const allSeqs = sequence.regulatoryActivity?.sequences || [];
        if (allSeqs.length > 0) {
            const seqNumbers = allSeqs.map((s) => parseInt(s.sequenceNumber, 10)).sort((a, b) => a - b);
            const currentNum = parseInt(seqNum, 10);
            if (seqNumbers[0] !== 0) {
                items.push({
                    ruleCode: '2.10',
                    ruleCategory: '文件/文件夹',
                    severity: client_1.ValidationSeverity.ERROR,
                    description: `序列编号`,
                    detail: `初始序列号必须从0000开始`,
                });
            }
            if (currentNum > 0) {
                const prevSeqNum = currentNum - 1;
                const prevExists = seqNumbers.includes(prevSeqNum);
                if (!prevExists) {
                    items.push({
                        ruleCode: '2.10',
                        ruleCategory: '文件/文件夹',
                        severity: client_1.ValidationSeverity.ERROR,
                        description: `序列编号`,
                        detail: `序列号不允许跳号，序列号${String(prevSeqNum).padStart(4, '0')}不存在`,
                    });
                }
            }
        }
    }
    hasActiveDescendant(nodeId, allNodes) {
        const children = allNodes.filter((n) => n.parentId === nodeId);
        for (const child of children) {
            if (child.isLeaf && child.operation && child.operation !== 'DELETE')
                return true;
            if (!child.isLeaf && this.hasActiveDescendant(child.id, allNodes))
                return true;
        }
        return false;
    }
    async validateIchBackbone(sequence, isFirst, items) {
        const allNodes = sequence.sequenceNodes;
        const ichLeaves = allNodes.filter((n) => n.templateNode.module >= 2 && n.isLeaf);
        const ichNonLeaves = allNodes.filter((n) => n.templateNode.module >= 2 && !n.isLeaf);
        const modifiedFileRefs = new Map();
        for (const node of ichLeaves) {
            if (!node.operation)
                continue;
            const op = node.operation;
            const sectionDesc = `${node.ctdSectionNumber} ${node.title}`;
            if (['NEW', 'REPLACE', 'APPEND'].includes(op) && (!node.fileAttachments || node.fileAttachments.length === 0)) {
                items.push({
                    ruleCode: '3.7',
                    ruleCategory: 'ICH骨架文件',
                    severity: client_1.ValidationSeverity.ERROR,
                    description: `叶元素：新建、替换或增补的叶元素，必须有"文件引用（xlink:href）"值`,
                    detail: `节点 ${sectionDesc} 操作为 ${op.toLowerCase()} 但无文件`,
                    suggestion: '请上传对应的文件',
                });
            }
            if (op === 'DELETE' && node.fileAttachments?.length > 0) {
                items.push({
                    ruleCode: '3.8',
                    ruleCategory: 'ICH骨架文件',
                    severity: client_1.ValidationSeverity.ERROR,
                    description: `叶元素：删除的叶元素不能包含"文件引用（xlink:href）"值`,
                    detail: `节点 ${sectionDesc} 有 ${node.fileAttachments.length} 个文件附件`,
                    suggestion: '删除操作不需要文件引用(xlink:href)和校验值(checksum)',
                });
            }
            if (['REPLACE', 'DELETE', 'APPEND'].includes(op)) {
                const refKey = node.templateNodeId;
                if (!modifiedFileRefs.has(refKey)) {
                    modifiedFileRefs.set(refKey, []);
                }
                modifiedFileRefs.get(refKey).push(node.id);
            }
            if (isFirst && op !== 'NEW') {
                items.push({
                    ruleCode: '3.10',
                    ruleCategory: 'ICH骨架文件',
                    severity: client_1.ValidationSeverity.ERROR,
                    description: `叶元素：初始序列中所有文件必须为新建（new）`,
                    detail: `节点 ${sectionDesc}: 当前操作为 ${op.toLowerCase()}`,
                    suggestion: '首次提交(0000)的所有叶元素必须使用 new 操作',
                });
            }
            if (!isFirst && ['REPLACE', 'APPEND', 'DELETE'].includes(op)) {
                const prevExists = await this.checkPriorNodeExists(sequence.applicationId, sequence.sequenceNumber, node.templateNodeId);
                if (!prevExists) {
                    items.push({
                        ruleCode: '3.11',
                        ruleCategory: 'ICH骨架文件',
                        severity: client_1.ValidationSeverity.ERROR,
                        description: `被修改文件对象必须存在`,
                        detail: `节点 ${sectionDesc} 的 ${op.toLowerCase()} 操作指向的原文件在前序序列中不存在`,
                        suggestion: '确保被修改的文件在前序序列中已存在',
                    });
                }
            }
            for (const file of node.fileAttachments || []) {
                if (file.ectdRelativePath?.includes('\\')) {
                    items.push({
                        ruleCode: '3.12',
                        ruleCategory: 'ICH骨架文件',
                        severity: client_1.ValidationSeverity.ERROR,
                        description: `只允许使用相对路径引用`,
                        detail: `路径包含反斜杠: ${file.ectdRelativePath}`,
                        filePath: file.ectdRelativePath,
                        suggestion: '路径中只允许使用正斜杠"/"，不允许使用反斜杠"\\"',
                    });
                }
                if (file.ectdRelativePath?.startsWith('/') ||
                    /^[a-zA-Z]:/.test(file.ectdRelativePath || '')) {
                    items.push({
                        ruleCode: '3.12',
                        ruleCategory: 'ICH骨架文件',
                        severity: client_1.ValidationSeverity.ERROR,
                        description: `只允许使用相对路径引用`,
                        detail: `路径不是相对路径: ${file.ectdRelativePath}`,
                        filePath: file.ectdRelativePath,
                        suggestion: '不允许使用绝对路径',
                    });
                }
            }
            const templateElement = node.templateNode.elementName || '';
            if (templateElement.includes('-ext-') || templateElement.includes('node-extension')) {
                const productType = sequence.regulatoryActivity.application.productTypeCode;
                if (productType !== 'cnprt2') {
                    items.push({
                        ruleCode: '3.16',
                        ruleCategory: 'ICH骨架文件',
                        severity: client_1.ValidationSeverity.ERROR,
                        description: `扩展节点的使用要求`,
                        detail: `扩展节点仅允许在产品类型为生物制品(cnprt2)的序列中的3.2.R章节使用`,
                    });
                }
            }
            if (!node.title || node.title.trim() === '') {
                items.push({
                    ruleCode: '3.18',
                    ruleCategory: 'ICH骨架文件',
                    severity: client_1.ValidationSeverity.ERROR,
                    description: `叶标题不能为空`,
                    detail: `节点 ${node.ctdSectionNumber} 的标题为空`,
                });
            }
            if (node.title && (node.title !== node.title.trim())) {
                items.push({
                    ruleCode: '3.20',
                    ruleCategory: 'ICH骨架文件',
                    severity: client_1.ValidationSeverity.WARNING,
                    description: `叶标题开头和结尾不能为空格`,
                    detail: `节点 ${sectionDesc}`,
                });
            }
            if (op === 'APPEND' && !node.templateNode.requiresStf) {
                items.push({
                    ruleCode: '3.23',
                    ruleCategory: 'ICH骨架文件',
                    severity: client_1.ValidationSeverity.WARNING,
                    description: `增补（append）的使用`,
                    detail: `节点 ${sectionDesc}: 不建议在STF定义范围外使用增补操作`,
                    suggestion: '在STF定义范围外使用"增补（append）"操作，需要在说明函中进行说明',
                });
            }
            const secNum = node.ctdSectionNumber || '';
            if ((secNum.startsWith('2.7.3') || secNum.startsWith('5.3.5')) && node.indication !== undefined) {
                if (node.indication === null || node.indication === '') {
                    items.push({
                        ruleCode: '3.25',
                        ruleCategory: 'ICH骨架文件',
                        severity: client_1.ValidationSeverity.ERROR,
                        description: `属性-适应症（indication）`,
                        detail: `适应症属性在${secNum}章节中使用时为必填项，值不能为空`,
                    });
                }
            }
            if ((secNum.startsWith('2.3.S') || secNum.startsWith('3.2.S'))) {
                if (node.manufacturer !== undefined && (node.manufacturer === null || node.manufacturer === '')) {
                    items.push({
                        ruleCode: '3.26',
                        ruleCategory: 'ICH骨架文件',
                        severity: client_1.ValidationSeverity.ERROR,
                        description: `属性-生产商（manufacturer）`,
                        detail: `生产商属性在${secNum}章节中使用时为必填项，值不能为空`,
                    });
                }
            }
            if ((secNum.startsWith('2.3.S') || secNum.startsWith('3.2.S'))) {
                if (node.substance !== undefined && (node.substance === null || node.substance === '')) {
                    items.push({
                        ruleCode: '3.27',
                        ruleCategory: 'ICH骨架文件',
                        severity: client_1.ValidationSeverity.ERROR,
                        description: `属性-活性成分（substance）`,
                        detail: `活性成分属性在${secNum}章节中使用时为必填项，值不能为空`,
                    });
                }
            }
            for (const attr of ['substance', 'manufacturer', 'productName', 'dosageForm', 'indication']) {
                const val = node[attr];
                if (val && typeof val === 'string' && val !== val.trim()) {
                    items.push({
                        ruleCode: '3.28',
                        ruleCategory: 'ICH骨架文件',
                        severity: client_1.ValidationSeverity.WARNING,
                        description: `属性值开头和结尾不能为空格`,
                        detail: `节点 ${sectionDesc} 的 ${attr} 属性值首尾含空格`,
                    });
                }
            }
            if (op === 'REPLACE' && !isFirst) {
                await this.checkLanguageConsistency(sequence, node, items);
            }
        }
        for (const [templateNodeId, nodeIds] of modifiedFileRefs) {
            if (nodeIds.length > 1) {
                const refNode = allNodes.find((n) => n.templateNodeId === templateNodeId);
                items.push({
                    ruleCode: '3.5',
                    ruleCategory: 'ICH骨架文件',
                    severity: client_1.ValidationSeverity.ERROR,
                    description: `文件在一个序列中不允许对应多个操作`,
                    detail: `节点 ${refNode?.ctdSectionNumber || templateNodeId} 在同一序列中被多次引用为"被修改文件对象（modified-file）"`,
                });
            }
        }
        for (const node of ichNonLeaves) {
            const elementName = node.elementName || '';
            if (elementName.startsWith('m')) {
                const hasLeaves = this.hasActiveDescendant(node.id, allNodes);
                if (!hasLeaves) {
                    const children = allNodes.filter((c) => c.parentId === node.id);
                    const hasAnyContent = children.some((c) => c.operation || c.status !== 'EMPTY');
                    if (hasAnyContent) {
                        items.push({
                            ruleCode: '3.21',
                            ruleCategory: 'ICH骨架文件',
                            severity: client_1.ValidationSeverity.ERROR,
                            description: `元素下必须有叶元素`,
                            detail: `名称以"m"开始的元素 ${node.ctdSectionNumber} 必须有叶元素`,
                        });
                    }
                }
            }
        }
        for (const node of ichLeaves) {
            for (const file of node.fileAttachments || []) {
                if (file.isReference && file.referenceFileId) {
                    const refFile = await this.prisma.fileAttachment.findUnique({
                        where: { id: file.referenceFileId },
                        include: {
                            sequenceNode: {
                                include: {
                                    sequence: {
                                        include: { regulatoryActivity: true },
                                    },
                                },
                            },
                        },
                    });
                    if (refFile) {
                        const refAppId = refFile.sequenceNode.sequence.regulatoryActivity.applicationId;
                        const currentAppId = sequence.regulatoryActivity.applicationId;
                        if (refAppId !== currentAppId) {
                            items.push({
                                ruleCode: '3.29',
                                ruleCategory: 'ICH骨架文件',
                                severity: client_1.ValidationSeverity.ERROR,
                                description: `内容的引用`,
                                detail: `骨架文件中不允许包含跨申请引用，只能引用同一申请中早先已提交序列的内容`,
                                filePath: file.ectdRelativePath,
                            });
                        }
                    }
                }
            }
        }
        if (!isFirst) {
            await this.validateLifecycle(sequence, ichLeaves, items, 'ICH骨架文件', '3');
        }
    }
    async validateLifecycle(sequence, leafNodes, items, category, rulePrefix) {
        for (const node of leafNodes) {
            if (!node.operation)
                continue;
            const op = node.operation;
            const lastOp = await this.getLastOperation(sequence.applicationId, sequence.sequenceNumber, node.templateNodeId);
            if (!lastOp)
                continue;
            const sectionDesc = `${node.ctdSectionNumber} ${node.title}`;
            if (lastOp === 'DELETE') {
                items.push({
                    ruleCode: `${rulePrefix}.33`,
                    ruleCategory: category,
                    severity: client_1.ValidationSeverity.ERROR,
                    description: `检测无效的生命周期模式：对已删除叶元素的操作`,
                    detail: `节点 ${sectionDesc}: 已被删除的叶元素不能再做其他任何操作`,
                });
                continue;
            }
            if (lastOp === 'REPLACE' && op === 'APPEND') {
                items.push({
                    ruleCode: `${rulePrefix}.30`,
                    ruleCategory: category,
                    severity: client_1.ValidationSeverity.ERROR,
                    description: `检测无效的生命周期模式：增补操作造成分支`,
                    detail: `节点 ${sectionDesc}: 已经被替换的叶元素不能再进行增补操作`,
                });
            }
            if (lastOp === 'REPLACE' && op === 'DELETE') {
                items.push({
                    ruleCode: `${rulePrefix}.31`,
                    ruleCategory: category,
                    severity: client_1.ValidationSeverity.ERROR,
                    description: `检测无效的生命周期模式：删除操作造成分支`,
                    detail: `节点 ${sectionDesc}: 已经被替换的叶元素不能再进行删除操作`,
                });
            }
            if (lastOp === 'REPLACE' && op === 'REPLACE') {
                items.push({
                    ruleCode: `${rulePrefix}.32`,
                    ruleCategory: category,
                    severity: client_1.ValidationSeverity.ERROR,
                    description: `检测无效的生命周期模式：替换操作造成分支`,
                    detail: `节点 ${sectionDesc}: 已经被替换的叶元素不能再进行第二次替换操作`,
                });
            }
            if (lastOp === 'APPEND' && op === 'APPEND' && !node.templateNode.requiresStf) {
                items.push({
                    ruleCode: `${rulePrefix}.34`,
                    ruleCategory: category,
                    severity: client_1.ValidationSeverity.ERROR,
                    description: `检测无效的生命周期模式：对增补的叶元素进行增补操作`,
                    detail: `节点 ${sectionDesc}: 不允许对已增补的叶元素使用增补操作（此规则不适用于STF）`,
                });
            }
        }
    }
    async getLastOperation(applicationId, currentSeqNumber, templateNodeId) {
        const priorSeqs = await this.prisma.sequence.findMany({
            where: {
                applicationId,
                sequenceNumber: { lt: currentSeqNumber },
            },
            select: { id: true, sequenceNumber: true },
            orderBy: { sequenceNumber: 'desc' },
        });
        for (const seq of priorSeqs) {
            const node = await this.prisma.sequenceNode.findFirst({
                where: {
                    sequenceId: seq.id,
                    templateNodeId,
                    operation: { not: null },
                },
                select: { operation: true },
            });
            if (node)
                return node.operation;
        }
        return null;
    }
    async checkPriorNodeExists(applicationId, currentSeqNumber, templateNodeId) {
        const lastOp = await this.getLastOperation(applicationId, currentSeqNumber, templateNodeId);
        return lastOp !== null;
    }
    async checkLanguageConsistency(sequence, node, items) {
        if (!node.fileAttachments?.length)
            return;
        const currentLang = node.fileAttachments[0].xmlLang;
        const priorSeqs = await this.prisma.sequence.findMany({
            where: {
                applicationId: sequence.applicationId,
                sequenceNumber: { lt: sequence.sequenceNumber },
            },
            select: { id: true },
            orderBy: { sequenceNumber: 'desc' },
        });
        for (const seq of priorSeqs) {
            const priorNode = await this.prisma.sequenceNode.findFirst({
                where: {
                    sequenceId: seq.id,
                    templateNodeId: node.templateNodeId,
                    operation: { not: null },
                },
                include: { fileAttachments: { take: 1 } },
            });
            if (priorNode?.fileAttachments?.[0]) {
                const priorLang = priorNode.fileAttachments[0].xmlLang;
                if (currentLang && priorLang && currentLang !== priorLang) {
                    items.push({
                        ruleCode: '3.36',
                        ruleCategory: 'ICH骨架文件',
                        severity: client_1.ValidationSeverity.WARNING,
                        description: `替换操作时语言属性不得变更`,
                        detail: `节点 ${node.ctdSectionNumber}: 原文件语言 ${priorLang}, 替换文件语言 ${currentLang}`,
                    });
                }
                break;
            }
        }
    }
    async validateRegionalBackbone(sequence, isFirst, items) {
        const allNodes = sequence.sequenceNodes;
        const m1Leaves = allNodes.filter((n) => n.templateNode.module === 1 && n.isLeaf);
        const m1NonLeaves = allNodes.filter((n) => n.templateNode.module === 1 && !n.isLeaf);
        const modifiedFileRefs = new Map();
        for (const node of m1Leaves) {
            if (!node.operation)
                continue;
            const op = node.operation;
            const sectionDesc = `${node.ctdSectionNumber} ${node.title}`;
            if (['NEW', 'REPLACE', 'APPEND'].includes(op) && (!node.fileAttachments || node.fileAttachments.length === 0)) {
                items.push({
                    ruleCode: '4.1.8',
                    ruleCategory: '区域性管理信息',
                    severity: client_1.ValidationSeverity.ERROR,
                    description: `叶元素：新建、替换或增补的叶元素，必须有"文件引用（xlink:href）"值`,
                    detail: `节点 ${sectionDesc} 操作为 ${op.toLowerCase()} 但无文件`,
                });
            }
            if (op === 'DELETE' && node.fileAttachments?.length > 0) {
                items.push({
                    ruleCode: '4.1.9',
                    ruleCategory: '区域性管理信息',
                    severity: client_1.ValidationSeverity.ERROR,
                    description: `叶元素：删除的叶元素不能包含"文件引用（xlink:href）"值`,
                    detail: `节点 ${sectionDesc}`,
                });
            }
            if (['REPLACE', 'DELETE', 'APPEND'].includes(op)) {
                const refKey = node.templateNodeId;
                if (!modifiedFileRefs.has(refKey)) {
                    modifiedFileRefs.set(refKey, []);
                }
                modifiedFileRefs.get(refKey).push(node.id);
            }
            if (isFirst && op !== 'NEW') {
                items.push({
                    ruleCode: '4.1.11',
                    ruleCategory: '区域性管理信息',
                    severity: client_1.ValidationSeverity.ERROR,
                    description: `叶元素：初始序列中所有文件必须为新建（new）`,
                    detail: `节点 ${sectionDesc}: 当前操作为 ${op.toLowerCase()}`,
                });
            }
            const elementName = node.elementName || node.templateNode.elementName || '';
            if (elementName === 'cn-1-0' || node.ctdSectionNumber === 'cn-1-0') {
                if (op !== 'NEW') {
                    items.push({
                        ruleCode: '4.1.14',
                        ruleCategory: '区域性管理信息',
                        severity: client_1.ValidationSeverity.ERROR,
                        description: `说明函的"操作（operations）"属性`,
                        detail: `所有说明函的"操作（operation）"属性值必须为"新建（new）"`,
                    });
                }
            }
            if (isFirst && (elementName === 'cn-1-2' || node.ctdSectionNumber === 'cn-1-2')) {
                if (op !== 'NEW') {
                    items.push({
                        ruleCode: '4.1.15',
                        ruleCategory: '区域性管理信息',
                        severity: client_1.ValidationSeverity.ERROR,
                        description: `申请表的"操作（operations）"属性`,
                        detail: `序列类型为"首次提交"，且提交序列中包含申请表文件时，其操作必须为"新建（new）"`,
                    });
                }
            }
            if (elementName.includes('-ext-') || elementName.includes('node-extension')) {
                items.push({
                    ruleCode: '4.1.16',
                    ruleCategory: '区域性管理信息',
                    severity: client_1.ValidationSeverity.ERROR,
                    description: `不允许使用"扩展节点（Node Extension）"`,
                    detail: `不允许在区域骨架文件结构中使用扩展节点`,
                });
            }
            if (!node.title || node.title.trim() === '') {
                items.push({
                    ruleCode: '4.1.17',
                    ruleCategory: '区域性管理信息',
                    severity: client_1.ValidationSeverity.ERROR,
                    description: `叶标题不能为空`,
                    detail: `节点 ${node.ctdSectionNumber} 的标题为空`,
                });
            }
            if (node.title && node.title !== node.title.trim()) {
                items.push({
                    ruleCode: '4.1.19',
                    ruleCategory: '区域性管理信息',
                    severity: client_1.ValidationSeverity.WARNING,
                    description: `叶标题开头和结尾不能为空格`,
                    detail: `节点 ${sectionDesc}`,
                });
            }
            if (op === 'APPEND') {
                items.push({
                    ruleCode: '4.1.30',
                    ruleCategory: '区域性管理信息',
                    severity: client_1.ValidationSeverity.WARNING,
                    description: `增补（append）的使用`,
                    detail: `不建议在区域骨架文件中使用"增补（append）"操作属性`,
                });
            }
            if (op === 'REPLACE' && !isFirst) {
                await this.checkRegionalLanguageConsistency(sequence, node, items);
            }
            for (const file of node.fileAttachments || []) {
                if (file.ectdRelativePath?.includes('\\')) {
                    items.push({
                        ruleCode: '4.1.5',
                        ruleCategory: '区域性管理信息',
                        severity: client_1.ValidationSeverity.ERROR,
                        description: `文件引用路径只允许使用正斜杠`,
                        filePath: file.ectdRelativePath,
                    });
                }
            }
        }
        for (const [templateNodeId, nodeIds] of modifiedFileRefs) {
            if (nodeIds.length > 1) {
                const refNode = allNodes.find((n) => n.templateNodeId === templateNodeId);
                items.push({
                    ruleCode: '4.1.6',
                    ruleCategory: '区域性管理信息',
                    severity: client_1.ValidationSeverity.ERROR,
                    description: `文件在一个序列中不允许对应多个操作`,
                    detail: `节点 ${refNode?.ctdSectionNumber || templateNodeId} 被多次引用为"被修改文件对象"`,
                });
            }
        }
        for (const node of m1NonLeaves) {
            const elementName = node.elementName || '';
            if (elementName.startsWith('cn-')) {
                const children = allNodes.filter((c) => c.parentId === node.id);
                const hasActive = children.some((c) => c.isLeaf ? (c.operation && c.operation !== 'DELETE') : this.hasActiveDescendant(c.id, allNodes));
                if (!hasActive) {
                    const anyContent = children.some((c) => c.operation || c.status !== 'EMPTY');
                    if (anyContent) {
                        items.push({
                            ruleCode: '4.1.20',
                            ruleCategory: '区域性管理信息',
                            severity: client_1.ValidationSeverity.ERROR,
                            description: `元素下必须有叶元素`,
                            detail: `名称以"cn-"开始的元素 ${node.ctdSectionNumber} 必须有叶元素`,
                        });
                    }
                }
            }
        }
        for (const node of m1Leaves) {
            for (const file of node.fileAttachments || []) {
                if (file.isReference && file.referenceFileId) {
                    const refFile = await this.prisma.fileAttachment.findUnique({
                        where: { id: file.referenceFileId },
                        include: {
                            sequenceNode: {
                                include: {
                                    sequence: { include: { regulatoryActivity: true } },
                                },
                            },
                        },
                    });
                    if (refFile) {
                        const refAppId = refFile.sequenceNode.sequence.regulatoryActivity.applicationId;
                        if (refAppId !== sequence.regulatoryActivity.applicationId) {
                            items.push({
                                ruleCode: '4.1.24',
                                ruleCategory: '区域性管理信息',
                                severity: client_1.ValidationSeverity.ERROR,
                                description: `内容的引用`,
                                detail: `区域骨架文件中不允许包含跨申请引用`,
                                filePath: file.ectdRelativePath,
                            });
                        }
                    }
                }
            }
        }
        if (!isFirst) {
            await this.validateLifecycle(sequence, m1Leaves, items, '区域性管理信息', '4.1.25'.slice(0, -3));
            await this.validateM1Lifecycle(sequence, m1Leaves, items);
        }
    }
    async validateM1Lifecycle(sequence, m1Leaves, items) {
        for (const node of m1Leaves) {
            if (!node.operation)
                continue;
            const op = node.operation;
            const lastOp = await this.getLastOperation(sequence.applicationId, sequence.sequenceNumber, node.templateNodeId);
            if (!lastOp)
                continue;
            const sectionDesc = `${node.ctdSectionNumber} ${node.title}`;
            if (lastOp === 'DELETE') {
                items.push({
                    ruleCode: '4.1.28',
                    ruleCategory: '区域性管理信息',
                    severity: client_1.ValidationSeverity.ERROR,
                    description: `检测无效的生命周期模式：对已删除叶元素的操作`,
                    detail: `节点 ${sectionDesc}: 已被删除的叶元素不能再做其他任何操作`,
                });
                continue;
            }
            if (lastOp === 'REPLACE' && op === 'APPEND') {
                items.push({
                    ruleCode: '4.1.25',
                    ruleCategory: '区域性管理信息',
                    severity: client_1.ValidationSeverity.ERROR,
                    description: `检测无效的生命周期模式：增补操作造成分支`,
                    detail: `节点 ${sectionDesc}`,
                });
            }
            if (lastOp === 'REPLACE' && op === 'DELETE') {
                items.push({
                    ruleCode: '4.1.26',
                    ruleCategory: '区域性管理信息',
                    severity: client_1.ValidationSeverity.ERROR,
                    description: `检测无效的生命周期模式：删除操作造成分支`,
                    detail: `节点 ${sectionDesc}`,
                });
            }
            if (lastOp === 'REPLACE' && op === 'REPLACE') {
                items.push({
                    ruleCode: '4.1.27',
                    ruleCategory: '区域性管理信息',
                    severity: client_1.ValidationSeverity.ERROR,
                    description: `检测无效的生命周期模式：替换操作造成分支`,
                    detail: `节点 ${sectionDesc}`,
                });
            }
            if (lastOp === 'APPEND' && op === 'APPEND') {
                items.push({
                    ruleCode: '4.1.29',
                    ruleCategory: '区域性管理信息',
                    severity: client_1.ValidationSeverity.ERROR,
                    description: `检测无效的生命周期模式：对增补的叶元素进行增补操作`,
                    detail: `节点 ${sectionDesc}: 该规则不适用于STF的情况`,
                });
            }
        }
    }
    async checkRegionalLanguageConsistency(sequence, node, items) {
        if (!node.fileAttachments?.length)
            return;
        const currentLang = node.fileAttachments[0].xmlLang;
        const priorSeqs = await this.prisma.sequence.findMany({
            where: {
                applicationId: sequence.applicationId,
                sequenceNumber: { lt: sequence.sequenceNumber },
            },
            select: { id: true },
            orderBy: { sequenceNumber: 'desc' },
        });
        for (const seq of priorSeqs) {
            const priorNode = await this.prisma.sequenceNode.findFirst({
                where: {
                    sequenceId: seq.id,
                    templateNodeId: node.templateNodeId,
                    operation: { not: null },
                },
                include: { fileAttachments: { take: 1 } },
            });
            if (priorNode?.fileAttachments?.[0]) {
                const priorLang = priorNode.fileAttachments[0].xmlLang;
                if (currentLang && priorLang && currentLang !== priorLang) {
                    items.push({
                        ruleCode: '4.1.31',
                        ruleCategory: '区域性管理信息',
                        severity: client_1.ValidationSeverity.WARNING,
                        description: `替换操作时语言属性不得变更`,
                        detail: `节点 ${node.ctdSectionNumber}: 原语言 ${priorLang}, 新语言 ${currentLang}`,
                    });
                }
                break;
            }
        }
    }
    validateEnvelopeInfo(sequence, app, ra, isFirst, items) {
        const appNum = app.applicationNumber || '';
        if (!/^[xyls]\d{9}$/.test(appNum)) {
            items.push({
                ruleCode: '4.2.1',
                ruleCategory: '区域性管理信息',
                severity: client_1.ValidationSeverity.ERROR,
                description: `信封元素：申请编号`,
                detail: `当前: ${appNum}, 要求: 字母前缀(x/y/l/s) + 4位年份 + 5位流水号`,
                suggestion: '申请编号必须符合《eCTD技术规范V1.1》中的编码规则',
            });
        }
        const validAppTypes = ['cnapt1', 'cnapt2', 'cnapt3', 'cnapt4'];
        if (!validAppTypes.includes(app.applicationTypeCode)) {
            items.push({
                ruleCode: '4.2.2',
                ruleCategory: '区域性管理信息',
                severity: client_1.ValidationSeverity.ERROR,
                description: `信封元素：申请类型`,
                detail: `当前: ${app.applicationTypeCode}，必须参考"cv-application-type.xml"中的定义`,
            });
        }
        const validPrdTypes = ['cnprt1', 'cnprt2'];
        if (!validPrdTypes.includes(app.productTypeCode)) {
            items.push({
                ruleCode: '4.2.3',
                ruleCategory: '区域性管理信息',
                severity: client_1.ValidationSeverity.ERROR,
                description: `信封元素：产品类型`,
                detail: `当前: ${app.productTypeCode}，必须参考"cv-product-type.xml"中的定义`,
            });
        }
        if (!app.productNumber || app.productNumber.trim() === '') {
            items.push({
                ruleCode: '4.2.4',
                ruleCategory: '区域性管理信息',
                severity: client_1.ValidationSeverity.ERROR,
                description: `信封元素：原始编号`,
                detail: `原始编号不能为空`,
            });
        }
        else if (!/^\d{10}$/.test(app.productNumber)) {
            items.push({
                ruleCode: '4.2.4',
                ruleCategory: '区域性管理信息',
                severity: client_1.ValidationSeverity.ERROR,
                description: `信封元素：原始编号`,
                detail: `原始编号必须为10位数字（年份4位+流水号6位），当前值: ${app.productNumber}`,
            });
        }
        const relatedSeq = ra.relatedSequence || '';
        if (!/^\d{4}$/.test(relatedSeq)) {
            items.push({
                ruleCode: '4.2.5',
                ruleCategory: '区域性管理信息',
                severity: client_1.ValidationSeverity.ERROR,
                description: `信封元素：相关序列`,
                detail: `相关序列必须是4位数字，且小于或等于当前序列号`,
            });
        }
        else {
            const relatedNum = parseInt(relatedSeq, 10);
            const currentNum = parseInt(sequence.sequenceNumber, 10);
            if (relatedNum > currentNum) {
                items.push({
                    ruleCode: '4.2.5',
                    ruleCategory: '区域性管理信息',
                    severity: client_1.ValidationSeverity.ERROR,
                    description: `信封元素：相关序列`,
                    detail: `相关序列 ${relatedSeq} 不应大于当前序列号 ${sequence.sequenceNumber}`,
                });
            }
        }
        const validRats = [
            'cnrat1', 'cnrat2', 'cnrat3', 'cnrat4', 'cnrat5',
            'cnrat6', 'cnrat7', 'cnrat8', 'cnrat9',
        ];
        if (!validRats.includes(ra.regulatoryActivityTypeCode)) {
            items.push({
                ruleCode: '4.2.6',
                ruleCategory: '区域性管理信息',
                severity: client_1.ValidationSeverity.ERROR,
                description: `信封元素：注册行为类型`,
                detail: `当前: ${ra.regulatoryActivityTypeCode}，必须参考"cv-regulatory-activity-type.xml"中的定义`,
            });
        }
        if (!/^\d{4}$/.test(sequence.sequenceNumber || '')) {
            items.push({
                ruleCode: '4.2.7',
                ruleCategory: '区域性管理信息',
                severity: client_1.ValidationSeverity.ERROR,
                description: `信封元素：序列号`,
                detail: `序列号必须由四位数字组成，当前: ${sequence.sequenceNumber}`,
            });
        }
        const validSqts = ['cnsqt1', 'cnsqt2', 'cnsqt3', 'cnsqt4'];
        if (!validSqts.includes(sequence.sequenceTypeCode)) {
            items.push({
                ruleCode: '4.2.8',
                ruleCategory: '区域性管理信息',
                severity: client_1.ValidationSeverity.ERROR,
                description: `信封元素：序列类型`,
                detail: `当前: ${sequence.sequenceTypeCode}，必须参考"cv-sequence-type.xml"中的定义`,
            });
        }
        if (!sequence.description || sequence.description.trim() === '') {
            items.push({
                ruleCode: '4.2.9',
                ruleCategory: '区域性管理信息',
                severity: client_1.ValidationSeverity.ERROR,
                description: `信封元素：序列描述`,
                detail: `序列描述不能为空`,
            });
        }
        else if (sequence.description.length > 120) {
            items.push({
                ruleCode: '4.2.9',
                ruleCategory: '区域性管理信息',
                severity: client_1.ValidationSeverity.ERROR,
                description: `信封元素：序列描述`,
                detail: `序列描述总长度不能超过120个中文字符，当前: ${sequence.description.length}`,
            });
        }
        if (sequence.sequenceTypeCode !== 'cnsqt1' && sequence.sequenceTypeCode !== 'cnsqt4') {
            if (relatedSeq === sequence.sequenceNumber) {
                items.push({
                    ruleCode: '4.2.11',
                    ruleCategory: '区域性管理信息',
                    severity: client_1.ValidationSeverity.ERROR,
                    description: `相关序列的值`,
                    detail: `如果序列类型不是首次提交或格式转换，则相关序列不应与当前序列号相同`,
                });
            }
        }
        if (sequence.sequenceTypeCode === 'cnsqt1' || sequence.sequenceTypeCode === 'cnsqt4') {
            if (relatedSeq !== sequence.sequenceNumber) {
                items.push({
                    ruleCode: '4.2.12',
                    ruleCategory: '区域性管理信息',
                    severity: client_1.ValidationSeverity.ERROR,
                    description: `相关序列的值`,
                    detail: `如果序列类型是首次提交或格式转换，则相关序列应与当前序列号相同`,
                });
            }
        }
        if (!sequence.contactName || !sequence.contactPhone || !sequence.contactEmail) {
            items.push({
                ruleCode: '4.2.9',
                ruleCategory: '区域性管理信息',
                severity: client_1.ValidationSeverity.ERROR,
                description: `信封元素：序列联系人信息不完整`,
                detail: `姓名/电话/邮箱均为必填`,
            });
        }
    }
    async validateEnvelopeImmutability(sequence, app, ra, items) {
        const dependency = await this.prisma.cvDependency.findFirst({
            where: {
                applicationTypeCode: app.applicationTypeCode,
                regulatoryActivityTypeCode: ra.regulatoryActivityTypeCode,
            },
        });
        if (!dependency) {
            items.push({
                ruleCode: '4.2.10',
                ruleCategory: '区域性管理信息',
                severity: client_1.ValidationSeverity.ERROR,
                description: `信封元素：序列相关信息`,
                detail: `申请类型 ${app.applicationTypeCode}、注册行为类型 ${ra.regulatoryActivityTypeCode} 的关联关系不在"depend-apt-rat-sqt.xml"定义中`,
            });
        }
        else if (dependency.sequenceTypeCode && dependency.sequenceTypeCode !== sequence.sequenceTypeCode) {
            items.push({
                ruleCode: '4.2.10',
                ruleCategory: '区域性管理信息',
                severity: client_1.ValidationSeverity.ERROR,
                description: `信封元素：序列相关信息`,
                detail: `序列类型 ${sequence.sequenceTypeCode} 与关联关系定义不匹配，期望: ${dependency.sequenceTypeCode}`,
            });
        }
        const allSeqsInApp = await this.prisma.sequence.findMany({
            where: {
                regulatoryActivity: {
                    applicationId: app.id,
                },
                sequenceNumber: { lt: sequence.sequenceNumber },
            },
            include: {
                regulatoryActivity: {
                    include: { application: true },
                },
            },
            take: 1,
            orderBy: { sequenceNumber: 'asc' },
        });
        if (allSeqsInApp.length > 0) {
            const firstSeq = allSeqsInApp[0];
            const firstApp = firstSeq.regulatoryActivity?.application;
            if (!firstApp)
                return;
            if (firstApp.applicationNumber !== app.applicationNumber) {
                items.push({
                    ruleCode: '4.2.13',
                    ruleCategory: '区域性管理信息',
                    severity: client_1.ValidationSeverity.ERROR,
                    description: `申请级别的信封元素必须保持不变`,
                    detail: `申请编号在生命周期中不能更改: 初始=${firstApp.applicationNumber}, 当前=${app.applicationNumber}`,
                });
            }
            if (firstApp.applicationTypeCode !== app.applicationTypeCode) {
                items.push({
                    ruleCode: '4.2.13',
                    ruleCategory: '区域性管理信息',
                    severity: client_1.ValidationSeverity.ERROR,
                    description: `申请级别的信封元素必须保持不变`,
                    detail: `申请类型在生命周期中不能更改`,
                });
            }
            if (firstApp.productTypeCode !== app.productTypeCode) {
                items.push({
                    ruleCode: '4.2.13',
                    ruleCategory: '区域性管理信息',
                    severity: client_1.ValidationSeverity.ERROR,
                    description: `申请级别的信封元素必须保持不变`,
                    detail: `产品类型在生命周期中不能更改`,
                });
            }
            if (firstApp.productNumber !== app.productNumber) {
                items.push({
                    ruleCode: '4.2.13',
                    ruleCategory: '区域性管理信息',
                    severity: client_1.ValidationSeverity.ERROR,
                    description: `申请级别的信封元素必须保持不变`,
                    detail: `原始编号在生命周期中不能更改`,
                });
            }
        }
        const allSeqsInRA = await this.prisma.sequence.findMany({
            where: {
                regulatoryActivityId: ra.id,
                sequenceNumber: { lt: sequence.sequenceNumber },
            },
            include: { regulatoryActivity: true },
            take: 1,
        });
        if (allSeqsInRA.length > 0) {
            const firstRASeq = allSeqsInRA[0];
            if (firstRASeq.regulatoryActivity?.regulatoryActivityTypeCode && firstRASeq.regulatoryActivity.regulatoryActivityTypeCode !== ra.regulatoryActivityTypeCode) {
                items.push({
                    ruleCode: '4.2.14',
                    ruleCategory: '区域性管理信息',
                    severity: client_1.ValidationSeverity.ERROR,
                    description: `注册行为类型必须保持不变`,
                    detail: `同一注册行为的所有序列，其注册行为类型的值必须相同`,
                });
            }
        }
    }
    async validateCompleteness(sequence, app, ra, items) {
        const candidateRules = await this.prisma.ctdCompletenessRule.findMany({
            where: {
                applicationTypeCode: app.applicationTypeCode,
                regulatoryActivityTypeCode: ra.regulatoryActivityTypeCode,
            },
            include: {
                templateNode: { select: { elementName: true, ctdSectionNumber: true, titleZh: true, isLeaf: true } },
            },
        });
        const seqType = sequence.sequenceTypeCode;
        const productType = app.productTypeCode;
        const rules = candidateRules.filter((r) => {
            const seqTypes = (0, json_field_helper_1.parseJsonField)(r.sequenceTypeCodes, []);
            if (seqTypes.length > 0 && seqType && !seqTypes.includes(seqType))
                return false;
            const productTypes = (0, json_field_helper_1.parseJsonField)(r.productTypeCodes, []);
            if (productTypes.length > 0 && productType && !productTypes.includes(productType))
                return false;
            return true;
        });
        const nodesByTemplateId = new Map();
        for (const n of sequence.sequenceNodes) {
            const arr = nodesByTemplateId.get(n.templateNodeId) ?? [];
            arr.push(n);
            nodesByTemplateId.set(n.templateNodeId, arr);
        }
        const allSeqNodes = sequence.sequenceNodes;
        const isSectionSatisfied = (sectionNodes) => {
            for (const container of sectionNodes) {
                const stack = [container.id];
                while (stack.length) {
                    const pid = stack.pop();
                    for (const n of allSeqNodes) {
                        if (n.parentId === pid) {
                            if (n.isLeaf && n.status !== 'EMPTY')
                                return true;
                            stack.push(n.id);
                        }
                    }
                }
            }
            return false;
        };
        for (const rule of rules) {
            const seqNodes = nodesByTemplateId.get(rule.templateNodeId) ?? [];
            if (rule.ruleType === 'REQUIRED') {
                let hasContent = false;
                if (seqNodes.length === 0) {
                    hasContent = false;
                }
                else if (rule.templateNode.isLeaf || seqNodes.some((n) => n.isLeaf)) {
                    hasContent = seqNodes.some((n) => n.status === 'COMPLETED' &&
                        ((n.fileAttachments?.length ?? 0) > 0 || n.document));
                }
                else {
                    hasContent = isSectionSatisfied(seqNodes);
                }
                if (!hasContent) {
                    items.push({
                        ruleCode: `4.3`,
                        ruleCategory: '区域性管理信息',
                        severity: rule.severity === 'ERROR'
                            ? client_1.ValidationSeverity.ERROR
                            : client_1.ValidationSeverity.WARNING,
                        description: `必填章节缺失: ${rule.templateNode.ctdSectionNumber} ${rule.templateNode.titleZh}`,
                        detail: `申请类型 ${app.applicationTypeCode} + 注册行为 ${ra.regulatoryActivityTypeCode}${seqType ? ` + 序列类型 ${seqType}` : ''} 要求此章节`,
                        suggestion: '请完成此章节的内容编辑',
                    });
                }
            }
            else if (rule.ruleType === 'FORBIDDEN') {
                const hasNonEmpty = seqNodes.some((n) => n.status !== 'EMPTY');
                if (hasNonEmpty) {
                    items.push({
                        ruleCode: `4.3`,
                        ruleCategory: '区域性管理信息',
                        severity: client_1.ValidationSeverity.WARNING,
                        description: `章节不应包含内容: ${rule.templateNode.ctdSectionNumber} ${rule.templateNode.titleZh}`,
                        detail: `当前申请类型和注册行为组合下此章节不应有内容`,
                    });
                }
            }
        }
        const hasAnyModule5Node = sequence.sequenceNodes.some((n) => {
            const sno = n.templateNode?.ctdSectionNumber || n.ctdSectionNumber || '';
            return sno.startsWith('5.') || sno === '5';
        });
        if (hasAnyModule5Node) {
            const REQUIRED_M5_CLINICAL_SUBSECTIONS = [
                { section: '5.3.5.1', title: '个体患者数据清单' },
                { section: '5.3.5.2', title: '有效性数据' },
                { section: '5.3.5.3', title: '安全性数据' },
            ];
            const presentM5Sections = new Set();
            for (const n of sequence.sequenceNodes) {
                const sno = n.templateNode?.ctdSectionNumber || n.ctdSectionNumber || '';
                if (sno)
                    presentM5Sections.add(sno);
            }
            for (const req of REQUIRED_M5_CLINICAL_SUBSECTIONS) {
                if (!presentM5Sections.has(req.section)) {
                    items.push({
                        ruleCode: '4.3.M5',
                        ruleCategory: '区域性管理信息',
                        severity: client_1.ValidationSeverity.ERROR,
                        description: `模块五临床研究报告缺失必填子章节: ${req.section} ${req.title}`,
                        detail: `ICH E3 要求临床研究报告包含 5.3.5.1/5.3.5.2/5.3.5.3 三个附件子章节，` +
                            `当前序列已包含模块五内容但未找到 ${req.section}`,
                        suggestion: `请在模块五下创建 ${req.section} ${req.title} 章节并完成内容编辑`,
                    });
                }
            }
        }
    }
    validateStf(sequence, items) {
        const stfRequiredNodes = sequence.sequenceNodes.filter((n) => n.templateNode.requiresStf &&
            n.isLeaf &&
            n.operation &&
            n.operation !== 'DELETE');
        for (const node of stfRequiredNodes) {
            const sectionDesc = `${node.ctdSectionNumber} ${node.title}`;
            const studies = (node.studies || []);
            if (studies.length === 0) {
                items.push({
                    ruleCode: '5.1',
                    ruleCategory: 'STF',
                    severity: client_1.ValidationSeverity.ERROR,
                    description: `STF文件必须有效`,
                    detail: `节点 ${sectionDesc} 缺少研究标签文件 (STF)，至少需要一个研究`,
                    suggestion: '在该章节下创建一个研究并填写元数据 + 关联文件',
                });
                continue;
            }
            for (const study of studies) {
                const studyDesc = `${sectionDesc} / 研究 ${study.studyId}`;
                if (!study.title || String(study.title).trim() === '') {
                    items.push({
                        ruleCode: '5.4',
                        ruleCategory: 'STF',
                        severity: client_1.ValidationSeverity.WARNING,
                        description: `研究标识的标题不能为空`,
                        detail: `${studyDesc}: 研究标题 (study-identifier > title) 不能为空`,
                    });
                }
                const cats = (study.categories || []);
                if (cats.length === 0) {
                    items.push({
                        ruleCode: '5.5',
                        ruleCategory: 'STF',
                        severity: client_1.ValidationSeverity.WARNING,
                        description: `研究标识的类别不能空`,
                        detail: `${studyDesc}: 至少需要提供一个 category`,
                    });
                }
                if (!study.studyId || String(study.studyId).trim() === '') {
                    items.push({
                        ruleCode: '5.6',
                        ruleCategory: 'STF',
                        severity: client_1.ValidationSeverity.WARNING,
                        description: `研究标识的研究ID不能为空`,
                        detail: studyDesc,
                    });
                }
                for (const cat of cats) {
                    if (!cat.name || !cat.value) {
                        items.push({
                            ruleCode: '5.8',
                            ruleCategory: 'STF',
                            severity: client_1.ValidationSeverity.WARNING,
                            description: `标签属性和类别元素的值`,
                            detail: `${studyDesc}: 存在 name 或 value 为空的 category`,
                        });
                        break;
                    }
                }
                const docs = (study.documents || []);
                if (docs.length === 0) {
                    items.push({
                        ruleCode: '5.10',
                        ruleCategory: 'STF',
                        severity: client_1.ValidationSeverity.ERROR,
                        description: `STF 至少需要一个 doc-content`,
                        detail: `${studyDesc}: 研究未关联任何文件`,
                        suggestion: '在该研究下添加至少一份文件 (study-report-body)',
                    });
                }
                for (const doc of docs) {
                    if (!doc.fileTag || String(doc.fileTag).trim() === '') {
                        items.push({
                            ruleCode: '5.11',
                            ruleCategory: 'STF',
                            severity: client_1.ValidationSeverity.WARNING,
                            description: `doc-content 必须有 file-tag`,
                            detail: `${studyDesc}: 存在缺失 file-tag 的文件`,
                        });
                        break;
                    }
                }
                if (!study.stfXmlContent || !study.stfChecksum) {
                    items.push({
                        ruleCode: '5.12',
                        ruleCategory: 'STF',
                        severity: client_1.ValidationSeverity.ERROR,
                        description: `缓存的 STF XML 内容缺失`,
                        detail: `${studyDesc}: 系统未生成 STF XML 缓存，请重新保存研究以重新生成`,
                        suggestion: '调用 POST /api/v1/studies/:id/regenerate-xml',
                    });
                }
                if (study.stfChecksum && !/^[a-f0-9]{32}$/i.test(study.stfChecksum)) {
                    items.push({
                        ruleCode: '5.13',
                        ruleCategory: 'STF',
                        severity: client_1.ValidationSeverity.ERROR,
                        description: `STF checksum 格式不合法`,
                        detail: `${studyDesc}: 校验和应为 32 位十六进制 MD5`,
                    });
                }
                const opU = String(study.operation || '').toUpperCase();
                if ((opU === 'REPLACE' || opU === 'APPEND' || opU === 'DELETE') &&
                    !study.modifiedFromId) {
                    items.push({
                        ruleCode: '5.18',
                        ruleCategory: 'STF',
                        severity: client_1.ValidationSeverity.ERROR,
                        description: `生命周期操作缺少 modified-file 引用`,
                        detail: `${studyDesc}: ${opU} 操作必须挂在一个前序研究上`,
                    });
                }
            }
        }
        const nonStfWithStudies = sequence.sequenceNodes.filter((n) => !n.templateNode.requiresStf &&
            n.isLeaf &&
            ((n.studies || []).length > 0));
        for (const node of nonStfWithStudies) {
            items.push({
                ruleCode: '5.14',
                ruleCategory: 'STF',
                severity: client_1.ValidationSeverity.WARNING,
                description: `无效 STF 目录位置`,
                detail: `节点 ${node.ctdSectionNumber}: 非 STF 章节不应包含研究 (Study)`,
            });
        }
        const sec537WithStudies = sequence.sequenceNodes.filter((n) => n.isLeaf &&
            String(n.ctdSectionNumber || '').startsWith('5.3.7') &&
            (n.studies || []).length > 0);
        for (const node of sec537WithStudies) {
            items.push({
                ruleCode: '5.16',
                ruleCategory: 'STF',
                severity: client_1.ValidationSeverity.ERROR,
                description: `5.3.7 章节不允许 STF`,
                detail: `节点 ${node.ctdSectionNumber}: 5.3.7 病例报告表必须在 5.3.5.x 的 STF 内被引用，不能独立创建`,
            });
        }
        for (const node of stfRequiredNodes) {
            const seen = new Map();
            for (const study of (node.studies || [])) {
                seen.set(study.studyId, (seen.get(study.studyId) || 0) + 1);
            }
            for (const [studyId, count] of seen.entries()) {
                if (count > 1) {
                    items.push({
                        ruleCode: '5.20',
                        ruleCategory: 'STF',
                        severity: client_1.ValidationSeverity.ERROR,
                        description: `同一章节内研究编号重复`,
                        detail: `节点 ${node.ctdSectionNumber}: studyId="${studyId}" 出现 ${count} 次`,
                    });
                }
            }
        }
    }
    validatePdf(sequence, items) {
        for (const node of sequence.sequenceNodes) {
            for (const file of node.fileAttachments || []) {
                if (file.fileType !== 'pdf')
                    continue;
                const analysis = file.pdfAnalysis;
                if (!analysis)
                    continue;
                if (analysis.pageCount === 0) {
                    items.push({
                        ruleCode: '6.1',
                        ruleCategory: 'PDF分析',
                        severity: client_1.ValidationSeverity.ERROR,
                        description: `PDF文件必须可读`,
                        detail: `${file.storedName}: 页码数为0，文件可能被破坏或不可读`,
                        filePath: file.ectdRelativePath,
                    });
                }
                if (analysis.hasExternalLinks) {
                    items.push({
                        ruleCode: '6.10',
                        ruleCategory: 'PDF分析',
                        severity: client_1.ValidationSeverity.ERROR,
                        description: `有网页、邮箱地址或其他外部链接的超文本链接`,
                        detail: `PDF文件中不允许使用包含网页链接、电子邮箱地址或其他外部链接的超文本链接`,
                        filePath: file.ectdRelativePath,
                    });
                }
                const ver = analysis.pdfVersion || '';
                const validVersions = ['1.4', '1.5', '1.6', '1.7'];
                const isPdfA = ver.toLowerCase().includes('pdf/a');
                if (!validVersions.includes(ver) && !isPdfA) {
                    items.push({
                        ruleCode: '6.16',
                        ruleCategory: 'PDF分析',
                        severity: client_1.ValidationSeverity.WARNING,
                        description: `PDF版本必须正确`,
                        detail: `${file.storedName}: 版本 ${ver}, 允许 1.4, 1.5, 1.6, 1.7, PDF/A-1, PDF/A-2`,
                        filePath: file.ectdRelativePath,
                    });
                }
                if (analysis.hasAttachments) {
                    items.push({
                        ruleCode: '6.17',
                        ruleCategory: 'PDF分析',
                        severity: client_1.ValidationSeverity.ERROR,
                        description: `不允许带附件的PDF文件`,
                        detail: `PDF文件中不能嵌入任何附件`,
                        filePath: file.ectdRelativePath,
                    });
                }
                if (analysis.isEncrypted) {
                    items.push({
                        ruleCode: '6.19',
                        ruleCategory: 'PDF分析',
                        severity: client_1.ValidationSeverity.ERROR,
                        description: `PDF文件不能有任何安全设置`,
                        detail: `不能提交有安全设置的PDF文件，例如限制选择文本或图形等`,
                        filePath: file.ectdRelativePath,
                    });
                }
                if (analysis.pageCount > 5 && !analysis.hasBookmarks) {
                    items.push({
                        ruleCode: '6.23',
                        ruleCategory: 'PDF分析',
                        severity: client_1.ValidationSeverity.ERROR,
                        description: `大于5页的文件必须有书签`,
                        detail: `${file.storedName}: ${analysis.pageCount} 页，无书签`,
                        filePath: file.ectdRelativePath,
                    });
                }
                if (analysis.hasBookmarks && !analysis.bookmarkZoomInherit) {
                    items.push({
                        ruleCode: '6.8',
                        ruleCategory: 'PDF分析',
                        severity: client_1.ValidationSeverity.WARNING,
                        description: `书签必须承前缩放（Inherit Zoom）`,
                        detail: `所有的书签的放大率设置应为承前缩放（Inherit Zoom）`,
                        filePath: file.ectdRelativePath,
                    });
                }
                if (analysis.hasJavascript) {
                    items.push({
                        ruleCode: '6.24',
                        ruleCategory: 'PDF分析',
                        severity: client_1.ValidationSeverity.WARNING,
                        description: `PDF内容限制`,
                        detail: `PDF文件不能包含JavaScript`,
                        filePath: file.ectdRelativePath,
                    });
                }
                if (analysis.hasMultimedia) {
                    items.push({
                        ruleCode: '6.24',
                        ruleCategory: 'PDF分析',
                        severity: client_1.ValidationSeverity.WARNING,
                        description: `PDF内容限制`,
                        detail: `PDF文件不能包含3D内容或动态内容（音频/视频）`,
                        filePath: file.ectdRelativePath,
                    });
                }
                if (!analysis.isTextSearchable) {
                    items.push({
                        ruleCode: '6.25',
                        ruleCategory: 'PDF分析',
                        severity: client_1.ValidationSeverity.WARNING,
                        description: `PDF内容可搜索`,
                        detail: `PDF文件中的文本必须可搜索。如果是扫描页面，则应使用OCR提供可搜索的文本`,
                        filePath: file.ectdRelativePath,
                    });
                }
                if (!analysis.fontsEmbedded) {
                    items.push({
                        ruleCode: '6.26',
                        ruleCategory: 'PDF分析',
                        severity: client_1.ValidationSeverity.WARNING,
                        description: `如使用非标准字体，需嵌入在PDF文件中`,
                        detail: `PDF文件应尽量使用标准字体。如果包含非标准字体，则需要在文件中嵌入该非标准字体`,
                        filePath: file.ectdRelativePath,
                        suggestion: '标准字体包括：宋体、黑体、Times New Roman、Arial、Courier New、Symbol、Zapf Dingbats',
                    });
                }
            }
        }
    }
    async getReport(reportId) {
        return this.prisma.validationReport.findUnique({
            where: { id: reportId },
            include: {
                items: {
                    orderBy: [{ severity: 'asc' }, { ruleCode: 'asc' }],
                },
            },
        });
    }
    async getLatestReport(sequenceId) {
        return this.prisma.validationReport.findFirst({
            where: { sequenceId },
            orderBy: { createdAt: 'desc' },
            include: {
                items: {
                    orderBy: [{ severity: 'asc' }, { ruleCode: 'asc' }],
                },
            },
        });
    }
};
exports.ValidatorService = ValidatorService;
exports.ValidatorService = ValidatorService = ValidatorService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        md5_service_1.Md5Service])
], ValidatorService);
//# sourceMappingURL=validator.service.js.map