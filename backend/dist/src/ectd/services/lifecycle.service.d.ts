import { PrismaService } from '../../prisma/prisma.service';
import { LeafOperation } from '@prisma/client';
export interface OperationValidation {
    isValid: boolean;
    message?: string;
}
export declare class LifecycleService {
    private prisma;
    private readonly logger;
    constructor(prisma: PrismaService);
    validateOperation(sequenceId: string, nodeId: string, operation: LeafOperation): Promise<OperationValidation>;
    private findPreviousOperation;
    private checkOperationTransition;
    validateReplaceLanguage(sequenceId: string, nodeId: string, newXmlLang: string): Promise<OperationValidation>;
    generateWithdrawOperations(targetSequenceId: string): Promise<Array<{
        templateNodeId: string;
        operation: LeafOperation;
        note: string;
    }>>;
    checkParallelConflicts(sequenceId: string): Promise<Array<{
        message: string;
        conflictNodeIds: string[];
    }>>;
}
