import { PrismaService } from '../../prisma/prisma.service';
import { Md5Service } from './md5.service';
import { ValidationSeverity } from '@prisma/client';
export interface ValidationItemInput {
    ruleCode: string;
    ruleCategory: string;
    severity: ValidationSeverity;
    description: string;
    detail?: string;
    filePath?: string;
    suggestion?: string;
}
export declare class ValidatorService {
    private prisma;
    private md5Service;
    private readonly logger;
    constructor(prisma: PrismaService, md5Service: Md5Service);
    validate(sequenceId: string): Promise<{
        reportId: string;
        totalErrors: number;
        totalWarnings: number;
        totalInfos: number;
        isPassed: boolean;
        items: ValidationItemInput[];
    }>;
    private validateBasicIdentification;
    private validateFileStructure;
    private hasActiveDescendant;
    private validateIchBackbone;
    private validateLifecycle;
    private getLastOperation;
    private checkPriorNodeExists;
    private checkLanguageConsistency;
    private validateRegionalBackbone;
    private validateM1Lifecycle;
    private checkRegionalLanguageConsistency;
    private validateEnvelopeInfo;
    private validateEnvelopeImmutability;
    private validateCompleteness;
    private validateStf;
    private validatePdf;
    getReport(reportId: string): Promise<({
        items: {
            id: string;
            ruleCode: string;
            severity: import("@prisma/client").$Enums.ValidationSeverity;
            reportId: string;
            ruleCategory: string;
            description: string;
            detail: string | null;
            filePath: string | null;
            suggestion: string | null;
        }[];
    } & {
        id: string;
        sequenceId: string;
        totalErrors: number;
        totalWarnings: number;
        totalInfos: number;
        isPassed: boolean;
        createdAt: Date;
    }) | null>;
    getLatestReport(sequenceId: string): Promise<({
        items: {
            id: string;
            ruleCode: string;
            severity: import("@prisma/client").$Enums.ValidationSeverity;
            reportId: string;
            ruleCategory: string;
            description: string;
            detail: string | null;
            filePath: string | null;
            suggestion: string | null;
        }[];
    } & {
        id: string;
        sequenceId: string;
        totalErrors: number;
        totalWarnings: number;
        totalInfos: number;
        isPassed: boolean;
        createdAt: Date;
    }) | null>;
}
