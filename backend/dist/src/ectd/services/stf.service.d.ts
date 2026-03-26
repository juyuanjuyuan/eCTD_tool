import { PrismaService } from '../../prisma/prisma.service';
export interface StfCategory {
    name: string;
    values: string[];
}
export interface StfFileTag {
    name: string;
    module: string;
}
export declare class StfService {
    private prisma;
    private readonly logger;
    private categories;
    private fileTags;
    private validValuesLoaded;
    constructor(prisma: PrismaService);
    private loadValidValues;
    getCategories(): StfCategory[];
    getFileTags(): StfFileTag[];
    saveStf(nodeId: string, data: {
        studyTitle: string;
        studyId: string;
        categories?: Record<string, string>;
        fileTags?: Array<{
            name: string;
            infoType: string;
        }>;
    }): Promise<{
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
    generateStfXml(data: {
        studyTitle: string;
        studyId: string;
        categories?: Record<string, string>;
        fileTags?: Array<{
            name: string;
            infoType: string;
        }>;
    }, node: {
        fileAttachments?: Array<{
            ectdRelativePath: string;
        }>;
    } & Record<string, any>): string;
    private escapeXml;
}
