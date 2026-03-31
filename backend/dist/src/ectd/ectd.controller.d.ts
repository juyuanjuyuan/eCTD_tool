import type { Response } from 'express';
import { CnRegionalXmlService } from './services/cn-regional-xml.service';
import { IndexXmlService } from './services/index-xml.service';
import { StfService } from './services/stf.service';
import { LifecycleService } from './services/lifecycle.service';
import { ValidatorService } from './services/validator.service';
import { PackageAssemblerService } from './services/package-assembler.service';
import { Md5Service } from './services/md5.service';
import { SaveStfDto, ValidateOperationDto } from './dto';
import { LeafOperation } from '@prisma/client';
export declare class EctdController {
    private cnRegionalXml;
    private indexXml;
    private stfService;
    private lifecycle;
    private validator;
    private packageAssembler;
    private md5Service;
    constructor(cnRegionalXml: CnRegionalXmlService, indexXml: IndexXmlService, stfService: StfService, lifecycle: LifecycleService, validator: ValidatorService, packageAssembler: PackageAssemblerService, md5Service: Md5Service);
    previewCnRegionalXml(seqId: string): Promise<{
        xml: string;
    }>;
    previewIndexXml(seqId: string): Promise<{
        xml: string;
    }>;
    getStf(nodeId: string): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        operation: import("@prisma/client").$Enums.LeafOperation;
        sequenceNodeId: string;
        studyTitle: string;
        studyId: string;
        categories: import("@prisma/client/runtime/library").JsonValue | null;
        fileTags: import("@prisma/client/runtime/library").JsonValue | null;
        stfXmlContent: string | null;
    } | null>;
    saveStf(nodeId: string, dto: SaveStfDto): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        operation: import("@prisma/client").$Enums.LeafOperation;
        sequenceNodeId: string;
        studyTitle: string;
        studyId: string;
        categories: import("@prisma/client/runtime/library").JsonValue | null;
        fileTags: import("@prisma/client/runtime/library").JsonValue | null;
        stfXmlContent: string | null;
    }>;
    getStfCategories(): import("./services/stf.service").StfCategory[];
    getStfFileTags(): import("./services/stf.service").StfFileTag[];
    validateOperation(seqId: string, nodeId: string, dto: ValidateOperationDto): Promise<import("./services/lifecycle.service").OperationValidation>;
    checkParallelConflicts(seqId: string): Promise<{
        message: string;
        conflictNodeIds: string[];
    }[]>;
    previewWithdraw(seqId: string): Promise<{
        templateNodeId: string;
        operation: LeafOperation;
        note: string;
    }[]>;
    runValidation(seqId: string): Promise<{
        reportId: string;
        totalErrors: number;
        totalWarnings: number;
        totalInfos: number;
        isPassed: boolean;
        items: import("./services/validator.service").ValidationItemInput[];
    }>;
    getLatestReport(seqId: string): Promise<({
        items: {
            id: string;
            description: string;
            ruleCode: string;
            severity: import("@prisma/client").$Enums.ValidationSeverity;
            reportId: string;
            ruleCategory: string;
            detail: string | null;
            filePath: string | null;
            suggestion: string | null;
        }[];
    } & {
        id: string;
        createdAt: Date;
        sequenceId: string;
        totalErrors: number;
        totalWarnings: number;
        totalInfos: number;
        isPassed: boolean;
    }) | null>;
    getReport(reportId: string): Promise<({
        items: {
            id: string;
            description: string;
            ruleCode: string;
            severity: import("@prisma/client").$Enums.ValidationSeverity;
            reportId: string;
            ruleCategory: string;
            detail: string | null;
            filePath: string | null;
            suggestion: string | null;
        }[];
    } & {
        id: string;
        createdAt: Date;
        sequenceId: string;
        totalErrors: number;
        totalWarnings: number;
        totalInfos: number;
        isPassed: boolean;
    }) | null>;
    previewPackage(seqId: string): Promise<{
        paths: string[];
    }>;
    exportPackage(seqId: string, res: Response): Promise<void>;
}
