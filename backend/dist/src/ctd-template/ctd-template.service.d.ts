import { PrismaService } from '../prisma/prisma.service';
import { UpdateSequenceNodeDto, UpdateBackboneAttributesDto, CreateExtensionNodeDto } from './dto';
export declare class CtdTemplateService {
    private prisma;
    constructor(prisma: PrismaService);
    getTemplateTree(): Promise<({
        children: ({
            children: ({
                children: ({
                    children: ({
                        children: ({
                            children: {
                                id: string;
                                module: number;
                                elementName: string;
                                ctdSectionNumber: string;
                                titleZh: string;
                                titleEn: string;
                                nodeType: import("@prisma/client").$Enums.CtdNodeType;
                                isLeaf: boolean;
                                requiresStf: boolean;
                                requiresESeal: boolean;
                                allowsExtension: boolean;
                                sortOrder: number;
                                parentId: string | null;
                            }[];
                        } & {
                            id: string;
                            module: number;
                            elementName: string;
                            ctdSectionNumber: string;
                            titleZh: string;
                            titleEn: string;
                            nodeType: import("@prisma/client").$Enums.CtdNodeType;
                            isLeaf: boolean;
                            requiresStf: boolean;
                            requiresESeal: boolean;
                            allowsExtension: boolean;
                            sortOrder: number;
                            parentId: string | null;
                        })[];
                    } & {
                        id: string;
                        module: number;
                        elementName: string;
                        ctdSectionNumber: string;
                        titleZh: string;
                        titleEn: string;
                        nodeType: import("@prisma/client").$Enums.CtdNodeType;
                        isLeaf: boolean;
                        requiresStf: boolean;
                        requiresESeal: boolean;
                        allowsExtension: boolean;
                        sortOrder: number;
                        parentId: string | null;
                    })[];
                } & {
                    id: string;
                    module: number;
                    elementName: string;
                    ctdSectionNumber: string;
                    titleZh: string;
                    titleEn: string;
                    nodeType: import("@prisma/client").$Enums.CtdNodeType;
                    isLeaf: boolean;
                    requiresStf: boolean;
                    requiresESeal: boolean;
                    allowsExtension: boolean;
                    sortOrder: number;
                    parentId: string | null;
                })[];
            } & {
                id: string;
                module: number;
                elementName: string;
                ctdSectionNumber: string;
                titleZh: string;
                titleEn: string;
                nodeType: import("@prisma/client").$Enums.CtdNodeType;
                isLeaf: boolean;
                requiresStf: boolean;
                requiresESeal: boolean;
                allowsExtension: boolean;
                sortOrder: number;
                parentId: string | null;
            })[];
        } & {
            id: string;
            module: number;
            elementName: string;
            ctdSectionNumber: string;
            titleZh: string;
            titleEn: string;
            nodeType: import("@prisma/client").$Enums.CtdNodeType;
            isLeaf: boolean;
            requiresStf: boolean;
            requiresESeal: boolean;
            allowsExtension: boolean;
            sortOrder: number;
            parentId: string | null;
        })[];
    } & {
        id: string;
        module: number;
        elementName: string;
        ctdSectionNumber: string;
        titleZh: string;
        titleEn: string;
        nodeType: import("@prisma/client").$Enums.CtdNodeType;
        isLeaf: boolean;
        requiresStf: boolean;
        requiresESeal: boolean;
        allowsExtension: boolean;
        sortOrder: number;
        parentId: string | null;
    })[]>;
    getTemplateTreeWithRules(appTypeCode: string, ratTypeCode: string): Promise<any[]>;
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
    updateBackboneAttributes(sequenceId: string, nodeId: string, dto: UpdateBackboneAttributesDto): Promise<{
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
    createExtensionNode(sequenceId: string, parentNodeId: string, dto: CreateExtensionNodeDto): Promise<{
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
    deleteExtensionNode(sequenceId: string, nodeId: string): Promise<{
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
    getExtensionNodeOptions(): {
        type: string;
        titleZh: string;
        titleEn: string;
    }[];
}
