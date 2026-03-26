import { DocumentService } from './document.service';
import { SaveDocumentDto } from './dto';
export declare class DocumentController {
    private readonly documentService;
    constructor(documentService: DocumentService);
    getDocument(nodeId: string): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        createdBy: string | null;
        version: number;
        nodeId: string;
        contentJson: import("@prisma/client/runtime/library").JsonValue | null;
        contentHtml: string | null;
        xmlLang: string;
        contentText: string | null;
        wordCount: number;
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
    saveDocument(nodeId: string, dto: SaveDocumentDto, userId: string): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        createdBy: string | null;
        version: number;
        nodeId: string;
        contentJson: import("@prisma/client/runtime/library").JsonValue | null;
        contentHtml: string | null;
        xmlLang: string;
        contentText: string | null;
        wordCount: number;
        updatedBy: string | null;
    }>;
    getVersions(nodeId: string): Promise<{
        id: string;
        createdAt: Date;
        createdBy: string | null;
        version: number;
        xmlLang: string;
        wordCount: number;
    }[]>;
    getVersion(nodeId: string, v: number): Promise<{
        id: string;
        createdAt: Date;
        createdBy: string | null;
        version: number;
        contentJson: import("@prisma/client/runtime/library").JsonValue | null;
        contentHtml: string | null;
        xmlLang: string;
        wordCount: number;
        documentId: string;
    }>;
    createVersionSnapshot(nodeId: string, userId: string): Promise<{
        id: string;
        createdAt: Date;
        createdBy: string | null;
        version: number;
        contentJson: import("@prisma/client/runtime/library").JsonValue | null;
        contentHtml: string | null;
        xmlLang: string;
        wordCount: number;
        documentId: string;
    }>;
    restoreVersion(nodeId: string, v: number, userId: string): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        createdBy: string | null;
        version: number;
        nodeId: string;
        contentJson: import("@prisma/client/runtime/library").JsonValue | null;
        contentHtml: string | null;
        xmlLang: string;
        contentText: string | null;
        wordCount: number;
        updatedBy: string | null;
    }>;
}
