import { PrismaService } from '../prisma/prisma.service';
import { RedisCacheService } from '../common/redis-cache.service';
import { UpdateSequenceNodeDto, UpdateBackboneAttributesDto, CreateExtensionNodeDto } from './dto';
export declare class CtdTemplateService {
    private prisma;
    private cache;
    constructor(prisma: PrismaService, cache: RedisCacheService);
    getTemplateTree(): Promise<{}>;
    getTemplateTreeWithRules(appTypeCode: string, ratTypeCode: string): Promise<{}>;
    initializeSequenceNodes(sequenceId: string): Promise<{
        message: string;
        nodeCount: number;
    }>;
    getSequenceNodeTree(sequenceId: string): Promise<any[]>;
    updateSequenceNode(sequenceId: string, nodeId: string, dto: UpdateSequenceNodeDto): Promise<{
        id: string;
        elementName: string;
        ctdSectionNumber: string;
        isLeaf: boolean;
        sortOrder: number;
        parentId: string | null;
        templateNodeId: string;
        status: import("@prisma/client").$Enums.SequenceNodeStatus;
        sequenceId: string;
        title: string;
        operation: import("@prisma/client").$Enums.LeafOperation | null;
        isRequired: boolean;
        substance: string | null;
        manufacturer: string | null;
        productName: string | null;
        dosageForm: string | null;
        indication: string | null;
        approvalStatus: import("@prisma/client").$Enums.ApprovalStatus;
        submittedBy: string | null;
        submittedAt: Date | null;
        approvedBy: string | null;
        approvedAt: Date | null;
        rejectionReason: string | null;
    }>;
    updateBackboneAttributes(sequenceId: string, nodeId: string, dto: UpdateBackboneAttributesDto): Promise<{
        id: string;
        elementName: string;
        ctdSectionNumber: string;
        isLeaf: boolean;
        sortOrder: number;
        parentId: string | null;
        templateNodeId: string;
        status: import("@prisma/client").$Enums.SequenceNodeStatus;
        sequenceId: string;
        title: string;
        operation: import("@prisma/client").$Enums.LeafOperation | null;
        isRequired: boolean;
        substance: string | null;
        manufacturer: string | null;
        productName: string | null;
        dosageForm: string | null;
        indication: string | null;
        approvalStatus: import("@prisma/client").$Enums.ApprovalStatus;
        submittedBy: string | null;
        submittedAt: Date | null;
        approvedBy: string | null;
        approvedAt: Date | null;
        rejectionReason: string | null;
    }>;
    private getDescendantIds;
    createExtensionNode(sequenceId: string, parentNodeId: string, dto: CreateExtensionNodeDto): Promise<{
        id: string;
        elementName: string;
        ctdSectionNumber: string;
        isLeaf: boolean;
        sortOrder: number;
        parentId: string | null;
        templateNodeId: string;
        status: import("@prisma/client").$Enums.SequenceNodeStatus;
        sequenceId: string;
        title: string;
        operation: import("@prisma/client").$Enums.LeafOperation | null;
        isRequired: boolean;
        substance: string | null;
        manufacturer: string | null;
        productName: string | null;
        dosageForm: string | null;
        indication: string | null;
        approvalStatus: import("@prisma/client").$Enums.ApprovalStatus;
        submittedBy: string | null;
        submittedAt: Date | null;
        approvedBy: string | null;
        approvedAt: Date | null;
        rejectionReason: string | null;
    }>;
    deleteExtensionNode(sequenceId: string, nodeId: string): Promise<{
        id: string;
        elementName: string;
        ctdSectionNumber: string;
        isLeaf: boolean;
        sortOrder: number;
        parentId: string | null;
        templateNodeId: string;
        status: import("@prisma/client").$Enums.SequenceNodeStatus;
        sequenceId: string;
        title: string;
        operation: import("@prisma/client").$Enums.LeafOperation | null;
        isRequired: boolean;
        substance: string | null;
        manufacturer: string | null;
        productName: string | null;
        dosageForm: string | null;
        indication: string | null;
        approvalStatus: import("@prisma/client").$Enums.ApprovalStatus;
        submittedBy: string | null;
        submittedAt: Date | null;
        approvedBy: string | null;
        approvedAt: Date | null;
        rejectionReason: string | null;
    }>;
    checkCompleteness(sequenceId: string): Promise<{
        totalSections: number;
        requiredSections: number;
        completedRequired: number;
        forbiddenViolations: Array<{
            elementName: string;
            section: string;
            title: string;
        }>;
        missingRequired: Array<{
            elementName: string;
            section: string;
            title: string;
            severity: string;
        }>;
        moduleStats: Record<string, {
            total: number;
            required: number;
            completed: number;
        }>;
    }>;
    previewRequiredSections(sequenceId: string): Promise<{
        applicationTypeCode: string;
        regulatoryActivityTypeCode: string;
        requiredSections: {
            section: string;
            title: string;
            module: number;
            severity: import("@prisma/client").$Enums.CompletenessRuleSeverity;
        }[];
        forbiddenSections: {
            section: string;
            title: string;
            module: number;
        }[];
        totalRequired: number;
    }>;
    getExtensionNodeOptions(): {
        type: string;
        titleZh: string;
        titleEn: string;
    }[];
}
