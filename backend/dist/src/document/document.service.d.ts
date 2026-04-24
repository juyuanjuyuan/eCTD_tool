import { PrismaService } from '../prisma/prisma.service';
import { SaveDocumentDto } from './dto';
export declare class DocumentService {
    private prisma;
    constructor(prisma: PrismaService);
    getDocument(nodeId: string): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        createdBy: string | null;
        version: number;
        nodeId: string;
        contentJson: import("@prisma/client/runtime/library").JsonValue | null;
        contentHtml: string | null;
        contentText: string | null;
        wordCount: number;
        xmlLang: string;
        updatedBy: string | null;
    } | {
        id: null;
        nodeId: string;
        contentJson: null;
        contentHtml: string;
        contentText: string;
        wordCount: number;
        version: number;
        xmlLang: string;
        createdBy: null;
        updatedBy: null;
        createdAt: null;
        updatedAt: null;
    }>;
    saveDocument(nodeId: string, dto: SaveDocumentDto, userId?: string): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        createdBy: string | null;
        version: number;
        nodeId: string;
        contentJson: import("@prisma/client/runtime/library").JsonValue | null;
        contentHtml: string | null;
        contentText: string | null;
        wordCount: number;
        xmlLang: string;
        updatedBy: string | null;
    }>;
    getVersions(nodeId: string): Promise<{
        id: string;
        createdAt: Date;
        createdBy: string | null;
        version: number;
        wordCount: number;
        xmlLang: string;
    }[]>;
    getVersion(nodeId: string, version: number): Promise<{
        id: string;
        createdAt: Date;
        createdBy: string | null;
        version: number;
        contentJson: import("@prisma/client/runtime/library").JsonValue | null;
        contentHtml: string | null;
        wordCount: number;
        xmlLang: string;
        documentId: string;
    }>;
    createVersionSnapshot(nodeId: string, userId?: string): Promise<{
        id: string;
        createdAt: Date;
        createdBy: string | null;
        version: number;
        contentJson: import("@prisma/client/runtime/library").JsonValue | null;
        contentHtml: string | null;
        wordCount: number;
        xmlLang: string;
        documentId: string;
    }>;
    restoreVersion(nodeId: string, version: number, userId?: string): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        createdBy: string | null;
        version: number;
        nodeId: string;
        contentJson: import("@prisma/client/runtime/library").JsonValue | null;
        contentHtml: string | null;
        contentText: string | null;
        wordCount: number;
        xmlLang: string;
        updatedBy: string | null;
    }>;
    private extractText;
    private countWords;
}
