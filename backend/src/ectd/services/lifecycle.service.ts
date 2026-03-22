import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { LeafOperation } from '@prisma/client';

export interface OperationValidation {
  isValid: boolean;
  message?: string;
}

@Injectable()
export class LifecycleService {
  private readonly logger = new Logger(LifecycleService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Validate whether a lifecycle operation is allowed for a given leaf node
   */
  async validateOperation(
    sequenceId: string,
    nodeId: string,
    operation: LeafOperation,
  ): Promise<OperationValidation> {
    const sequence = await this.prisma.sequence.findUnique({
      where: { id: sequenceId },
      include: {
        regulatoryActivity: { select: { id: true } },
      },
    });
    if (!sequence) return { isValid: false, message: '序列不存在' };

    const isFirstSequence = sequence.sequenceNumber === '0000';

    // Rule: first sequence (0000) must use only NEW
    if (isFirstSequence && operation !== LeafOperation.NEW) {
      return {
        isValid: false,
        message: '首次提交序列(0000)的所有叶元素操作必须为 new',
      };
    }

    // For non-first sequences, check the previous state of this node
    if (!isFirstSequence) {
      const node = await this.prisma.sequenceNode.findUnique({
        where: { id: nodeId },
        select: { templateNodeId: true, ctdSectionNumber: true },
      });
      if (!node) return { isValid: false, message: '节点不存在' };

      // Find the same template node's operation in the previous sequence
      const prevOp = await this.findPreviousOperation(
        sequence.regulatoryActivityId,
        sequence.sequenceNumber,
        node.templateNodeId,
      );

      return this.checkOperationTransition(prevOp, operation);
    }

    return { isValid: true };
  }

  /**
   * Find the most recent operation for a template node in prior sequences
   */
  private async findPreviousOperation(
    regulatoryActivityId: string,
    currentSeqNumber: string,
    templateNodeId: string,
  ): Promise<LeafOperation | null> {
    // Get all prior sequences in this RA
    const priorSequences = await this.prisma.sequence.findMany({
      where: {
        regulatoryActivityId,
        sequenceNumber: { lt: currentSeqNumber },
      },
      orderBy: { sequenceNumber: 'desc' },
      select: { id: true },
    });

    // Search backwards to find the most recent operation
    for (const seq of priorSequences) {
      const node = await this.prisma.sequenceNode.findFirst({
        where: {
          sequenceId: seq.id,
          templateNodeId,
          operation: { not: null },
        },
        select: { operation: true },
      });
      if (node?.operation) return node.operation;
    }

    return null;
  }

  /**
   * Check if operation transition is valid based on previous state
   */
  private checkOperationTransition(
    prevOp: LeafOperation | null,
    newOp: LeafOperation,
  ): OperationValidation {
    // No previous operation — only NEW is allowed (creating a new leaf)
    if (!prevOp) {
      if (newOp === LeafOperation.NEW) {
        return { isValid: true };
      }
      return {
        isValid: false,
        message: `该叶元素在前序序列中不存在，只能使用 new 操作`,
      };
    }

    // State transition table
    const transitions: Record<LeafOperation, LeafOperation[]> = {
      [LeafOperation.NEW]: [LeafOperation.REPLACE, LeafOperation.DELETE],
      [LeafOperation.REPLACE]: [LeafOperation.REPLACE, LeafOperation.DELETE],
      [LeafOperation.APPEND]: [
        LeafOperation.REPLACE,
        LeafOperation.DELETE,
        LeafOperation.APPEND,
      ],
      [LeafOperation.DELETE]: [LeafOperation.NEW],
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

  /**
   * Validate replace operation: xml:lang must match
   */
  async validateReplaceLanguage(
    sequenceId: string,
    nodeId: string,
    newXmlLang: string,
  ): Promise<OperationValidation> {
    const node = await this.prisma.sequenceNode.findUnique({
      where: { id: nodeId },
      select: { templateNodeId: true },
    });
    if (!node) return { isValid: false, message: '节点不存在' };

    const sequence = await this.prisma.sequence.findUnique({
      where: { id: sequenceId },
      select: { regulatoryActivityId: true, sequenceNumber: true },
    });
    if (!sequence) return { isValid: false, message: '序列不存在' };

    // Find the original file's xml:lang from previous sequences
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

  /**
   * Generate a withdraw sequence (cnsqt3) - 4-step process
   * This creates the operation mappings for a withdraw sequence
   */
  async generateWithdrawOperations(
    targetSequenceId: string,
  ): Promise<Array<{ templateNodeId: string; operation: LeafOperation; note: string }>> {
    const targetNodes = await this.prisma.sequenceNode.findMany({
      where: {
        sequenceId: targetSequenceId,
        isLeaf: true,
        operation: { not: null },
      },
    });

    const operations: Array<{
      templateNodeId: string;
      operation: LeafOperation;
      note: string;
    }> = [];

    for (const node of targetNodes) {
      switch (node.operation) {
        case LeafOperation.NEW:
          // Step 1: Mark new files as delete
          operations.push({
            templateNodeId: node.templateNodeId,
            operation: LeafOperation.DELETE,
            note: `撤回: 将 new 文件标记为 delete`,
          });
          break;

        case LeafOperation.REPLACE:
          // Step 2: Restore original file with new operation
          operations.push({
            templateNodeId: node.templateNodeId,
            operation: LeafOperation.NEW,
            note: `撤回: 以 new 恢复被替换的原始文件`,
          });
          break;

        case LeafOperation.DELETE:
          // Step 3: Re-create deleted file with new operation
          operations.push({
            templateNodeId: node.templateNodeId,
            operation: LeafOperation.NEW,
            note: `撤回: 以 new 重新创建被删除的文件`,
          });
          break;

        case LeafOperation.APPEND:
          // Append is similar to new for withdraw purposes
          operations.push({
            templateNodeId: node.templateNodeId,
            operation: LeafOperation.DELETE,
            note: `撤回: 将 append 文件标记为 delete`,
          });
          break;
      }
    }

    return operations;
  }

  /**
   * Check for parallel change conflicts
   */
  async checkParallelConflicts(
    sequenceId: string,
  ): Promise<Array<{ message: string; conflictNodeIds: string[] }>> {
    const sequence = await this.prisma.sequence.findUnique({
      where: { id: sequenceId },
      include: {
        regulatoryActivity: { select: { id: true } },
      },
    });
    if (!sequence) return [];

    // Find other non-submitted sequences in the same RA
    const parallelSequences = await this.prisma.sequence.findMany({
      where: {
        regulatoryActivityId: sequence.regulatoryActivityId,
        id: { not: sequenceId },
        status: { in: ['DRAFT', 'EDITING', 'VALIDATING'] },
      },
    });

    if (parallelSequences.length === 0) return [];

    const conflicts: Array<{ message: string; conflictNodeIds: string[] }> = [];

    // Check if any of the current sequence's nodes overlap with parallel sequences
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
}
