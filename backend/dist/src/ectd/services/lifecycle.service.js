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
var LifecycleService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.LifecycleService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
const client_1 = require("@prisma/client");
let LifecycleService = LifecycleService_1 = class LifecycleService {
    prisma;
    logger = new common_1.Logger(LifecycleService_1.name);
    constructor(prisma) {
        this.prisma = prisma;
    }
    async validateOperation(sequenceId, nodeId, operation) {
        const sequence = await this.prisma.sequence.findUnique({
            where: { id: sequenceId },
            include: {
                regulatoryActivity: { select: { id: true } },
            },
        });
        if (!sequence)
            return { isValid: false, message: '序列不存在' };
        const isFirstSequence = sequence.sequenceNumber === '0000';
        if (isFirstSequence && operation !== client_1.LeafOperation.NEW) {
            return {
                isValid: false,
                message: '首次提交序列(0000)的所有叶元素操作必须为 new',
            };
        }
        if (!isFirstSequence) {
            const node = await this.prisma.sequenceNode.findUnique({
                where: { id: nodeId },
                select: { templateNodeId: true, ctdSectionNumber: true },
            });
            if (!node)
                return { isValid: false, message: '节点不存在' };
            const prevOp = await this.findPreviousOperation(sequence.regulatoryActivityId, sequence.sequenceNumber, node.templateNodeId);
            return this.checkOperationTransition(prevOp, operation);
        }
        return { isValid: true };
    }
    async findPreviousOperation(regulatoryActivityId, currentSeqNumber, templateNodeId) {
        const priorSequences = await this.prisma.sequence.findMany({
            where: {
                regulatoryActivityId,
                sequenceNumber: { lt: currentSeqNumber },
            },
            orderBy: { sequenceNumber: 'desc' },
            select: { id: true },
        });
        for (const seq of priorSequences) {
            const node = await this.prisma.sequenceNode.findFirst({
                where: {
                    sequenceId: seq.id,
                    templateNodeId,
                    operation: { not: null },
                },
                select: { operation: true },
            });
            if (node?.operation)
                return node.operation;
        }
        return null;
    }
    checkOperationTransition(prevOp, newOp) {
        if (!prevOp) {
            if (newOp === client_1.LeafOperation.NEW) {
                return { isValid: true };
            }
            return {
                isValid: false,
                message: `该叶元素在前序序列中不存在，只能使用 new 操作`,
            };
        }
        const transitions = {
            [client_1.LeafOperation.NEW]: [client_1.LeafOperation.REPLACE, client_1.LeafOperation.DELETE],
            [client_1.LeafOperation.REPLACE]: [client_1.LeafOperation.REPLACE, client_1.LeafOperation.DELETE],
            [client_1.LeafOperation.APPEND]: [
                client_1.LeafOperation.REPLACE,
                client_1.LeafOperation.DELETE,
                client_1.LeafOperation.APPEND,
            ],
            [client_1.LeafOperation.DELETE]: [client_1.LeafOperation.NEW],
        };
        const allowed = transitions[prevOp] || [];
        if (allowed.includes(newOp)) {
            return { isValid: true };
        }
        return {
            isValid: false,
            message: `前序操作为 ${prevOp.toLowerCase()}, 不允许执行 ${newOp.toLowerCase()} 操作。允许的操作: ${allowed.map((o) => o.toLowerCase()).join(', ')}`,
        };
    }
    async validateReplaceLanguage(sequenceId, nodeId, newXmlLang) {
        const node = await this.prisma.sequenceNode.findUnique({
            where: { id: nodeId },
            select: { templateNodeId: true },
        });
        if (!node)
            return { isValid: false, message: '节点不存在' };
        const sequence = await this.prisma.sequence.findUnique({
            where: { id: sequenceId },
            select: { regulatoryActivityId: true, sequenceNumber: true },
        });
        if (!sequence)
            return { isValid: false, message: '序列不存在' };
        const priorSequences = await this.prisma.sequence.findMany({
            where: {
                regulatoryActivityId: sequence.regulatoryActivityId,
                sequenceNumber: { lt: sequence.sequenceNumber },
            },
            orderBy: { sequenceNumber: 'desc' },
            select: { id: true },
        });
        for (const seq of priorSequences) {
            const prevNode = await this.prisma.sequenceNode.findFirst({
                where: { sequenceId: seq.id, templateNodeId: node.templateNodeId },
                include: {
                    document: { select: { xmlLang: true } },
                },
            });
            if (prevNode?.document?.xmlLang) {
                if (prevNode.document.xmlLang !== newXmlLang) {
                    return {
                        isValid: false,
                        message: `替换操作要求语言属性一致: 原文件为 ${prevNode.document.xmlLang}, 新文件为 ${newXmlLang}`,
                    };
                }
                break;
            }
        }
        return { isValid: true };
    }
    async generateWithdrawOperations(targetSequenceId) {
        const targetNodes = await this.prisma.sequenceNode.findMany({
            where: {
                sequenceId: targetSequenceId,
                isLeaf: true,
                operation: { not: null },
            },
        });
        const operations = [];
        for (const node of targetNodes) {
            switch (node.operation) {
                case client_1.LeafOperation.NEW:
                    operations.push({
                        templateNodeId: node.templateNodeId,
                        operation: client_1.LeafOperation.DELETE,
                        note: `撤回: 将 new 文件标记为 delete`,
                    });
                    break;
                case client_1.LeafOperation.REPLACE:
                    operations.push({
                        templateNodeId: node.templateNodeId,
                        operation: client_1.LeafOperation.NEW,
                        note: `撤回: 以 new 恢复被替换的原始文件`,
                    });
                    break;
                case client_1.LeafOperation.DELETE:
                    operations.push({
                        templateNodeId: node.templateNodeId,
                        operation: client_1.LeafOperation.NEW,
                        note: `撤回: 以 new 重新创建被删除的文件`,
                    });
                    break;
                case client_1.LeafOperation.APPEND:
                    operations.push({
                        templateNodeId: node.templateNodeId,
                        operation: client_1.LeafOperation.DELETE,
                        note: `撤回: 将 append 文件标记为 delete`,
                    });
                    break;
            }
        }
        return operations;
    }
    async checkParallelConflicts(sequenceId) {
        const sequence = await this.prisma.sequence.findUnique({
            where: { id: sequenceId },
            include: {
                regulatoryActivity: { select: { id: true } },
            },
        });
        if (!sequence)
            return [];
        const parallelSequences = await this.prisma.sequence.findMany({
            where: {
                regulatoryActivityId: sequence.regulatoryActivityId,
                id: { not: sequenceId },
                status: { in: ['DRAFT', 'EDITING', 'VALIDATING'] },
            },
        });
        if (parallelSequences.length === 0)
            return [];
        const conflicts = [];
        const currentNodes = await this.prisma.sequenceNode.findMany({
            where: {
                sequenceId,
                isLeaf: true,
                operation: { not: null },
            },
            select: { templateNodeId: true, id: true },
        });
        for (const pSeq of parallelSequences) {
            const parallelNodes = await this.prisma.sequenceNode.findMany({
                where: {
                    sequenceId: pSeq.id,
                    isLeaf: true,
                    operation: { not: null },
                },
                select: { templateNodeId: true, id: true },
            });
            const parallelTemplateIds = new Set(parallelNodes.map((n) => n.templateNodeId));
            const conflictIds = currentNodes
                .filter((n) => parallelTemplateIds.has(n.templateNodeId))
                .map((n) => n.id);
            if (conflictIds.length > 0) {
                conflicts.push({
                    message: `与未审批序列 ${pSeq.sequenceNumber} 存在 ${conflictIds.length} 个并行变更冲突`,
                    conflictNodeIds: conflictIds,
                });
            }
        }
        return conflicts;
    }
};
exports.LifecycleService = LifecycleService;
exports.LifecycleService = LifecycleService = LifecycleService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], LifecycleService);
//# sourceMappingURL=lifecycle.service.js.map