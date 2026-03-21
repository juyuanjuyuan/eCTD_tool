import { CtdTemplateService } from './ctd-template.service';
import { UpdateSequenceNodeDto, UpdateBackboneAttributesDto, CreateExtensionNodeDto } from './dto';
export declare class CtdTemplateController {
    private readonly ctdTemplateService;
    constructor(ctdTemplateService: CtdTemplateService);
    getTemplateTree(appType?: string, ratType?: string): Promise<any[]>;
    getExtensionOptions(): {
        type: string;
        titleZh: string;
        titleEn: string;
    }[];
    initializeSequence(seqId: string): Promise<{
        message: string;
        nodeCount: number;
    }>;
    getSequenceNodeTree(seqId: string): Promise<any[]>;
    updateSequenceNode(seqId: string, nodeId: string, dto: UpdateSequenceNodeDto): Promise<{
        id: string;
        elementName: string;
        ctdSectionNumber: string;
        isLeaf: boolean;
        sortOrder: number;
        parentId: string | null;
        templateNodeId: string;
        status: import("@prisma/client").$Enums.SequenceNodeStatus;
        operation: import("@prisma/client").$Enums.LeafOperation | null;
        title: string;
        substance: string | null;
        manufacturer: string | null;
        productName: string | null;
        dosageForm: string | null;
        indication: string | null;
        sequenceId: string;
        isRequired: boolean;
    }>;
    updateBackboneAttributes(seqId: string, nodeId: string, dto: UpdateBackboneAttributesDto): Promise<{
        id: string;
        elementName: string;
        ctdSectionNumber: string;
        isLeaf: boolean;
        sortOrder: number;
        parentId: string | null;
        templateNodeId: string;
        status: import("@prisma/client").$Enums.SequenceNodeStatus;
        operation: import("@prisma/client").$Enums.LeafOperation | null;
        title: string;
        substance: string | null;
        manufacturer: string | null;
        productName: string | null;
        dosageForm: string | null;
        indication: string | null;
        sequenceId: string;
        isRequired: boolean;
    }>;
    createExtensionNode(seqId: string, parentNodeId: string, dto: CreateExtensionNodeDto): Promise<{
        id: string;
        elementName: string;
        ctdSectionNumber: string;
        isLeaf: boolean;
        sortOrder: number;
        parentId: string | null;
        templateNodeId: string;
        status: import("@prisma/client").$Enums.SequenceNodeStatus;
        operation: import("@prisma/client").$Enums.LeafOperation | null;
        title: string;
        substance: string | null;
        manufacturer: string | null;
        productName: string | null;
        dosageForm: string | null;
        indication: string | null;
        sequenceId: string;
        isRequired: boolean;
    }>;
    deleteExtensionNode(seqId: string, nodeId: string): Promise<{
        id: string;
        elementName: string;
        ctdSectionNumber: string;
        isLeaf: boolean;
        sortOrder: number;
        parentId: string | null;
        templateNodeId: string;
        status: import("@prisma/client").$Enums.SequenceNodeStatus;
        operation: import("@prisma/client").$Enums.LeafOperation | null;
        title: string;
        substance: string | null;
        manufacturer: string | null;
        productName: string | null;
        dosageForm: string | null;
        indication: string | null;
        sequenceId: string;
        isRequired: boolean;
    }>;
    checkCompleteness(seqId: string): Promise<{
        totalSections: number;
        requiredSections: number;
        completedRequired: number;
        forbiddenViolations: {
            elementName: string;
            section: string;
            title: string;
        }[];
        missingRequired: {
            elementName: string;
            section: string;
            title: string;
            severity: string;
        }[];
        moduleStats: Record<string, {
            total: number;
            required: number;
            completed: number;
        }>;
    }>;
}
