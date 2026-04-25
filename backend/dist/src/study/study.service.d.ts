import { PrismaService } from '../prisma/prisma.service';
import { ControlledVocabularyService } from '../controlled-vocabulary/controlled-vocabulary.service';
import { StudyTaggingFileService } from '../ectd/services/study-tagging-file.service';
import { CreateStudyDto, UpdateStudyDto } from './dto';
export interface StudyMetadataValidation {
    valid: boolean;
    errors: string[];
    warnings: string[];
}
export declare class StudyService {
    private prisma;
    private cvService;
    private stfXml;
    private readonly logger;
    constructor(prisma: PrismaService, cvService: ControlledVocabularyService, stfXml: StudyTaggingFileService);
    listBySequence(sequenceId: string): Promise<({
        categories: {
            id: string;
            sortOrder: number;
            name: string;
            value: string;
            studyId: string;
            infoType: string;
        }[];
        documents: ({
            fileAttachment: {
                id: string;
                createdAt: Date;
                sequenceNodeId: string;
                xmlLang: string;
                originalName: string;
                storedName: string;
                exportName: string | null;
                storagePath: string;
                ectdRelativePath: string;
                fileType: string;
                fileSize: bigint;
                md5Checksum: string;
                isReference: boolean;
                referenceFileId: string | null;
                uploadedBy: string | null;
            };
        } & {
            id: string;
            sortOrder: number;
            studyId: string;
            fileAttachmentId: string;
            fileTag: string;
            fileTagInfoType: string;
        })[];
    } & {
        id: string;
        ctdSectionNumber: string;
        createdAt: Date;
        updatedAt: Date;
        sequenceId: string;
        title: string;
        operation: import("@prisma/client").$Enums.LeafOperation;
        sequenceNodeId: string;
        studyId: string;
        modifiedFromId: string | null;
        stfFilePath: string | null;
        stfChecksum: string | null;
        stfXmlContent: string | null;
    })[]>;
    listByNode(sequenceNodeId: string): Promise<({
        categories: {
            id: string;
            sortOrder: number;
            name: string;
            value: string;
            studyId: string;
            infoType: string;
        }[];
        documents: ({
            fileAttachment: {
                id: string;
                createdAt: Date;
                sequenceNodeId: string;
                xmlLang: string;
                originalName: string;
                storedName: string;
                exportName: string | null;
                storagePath: string;
                ectdRelativePath: string;
                fileType: string;
                fileSize: bigint;
                md5Checksum: string;
                isReference: boolean;
                referenceFileId: string | null;
                uploadedBy: string | null;
            };
        } & {
            id: string;
            sortOrder: number;
            studyId: string;
            fileAttachmentId: string;
            fileTag: string;
            fileTagInfoType: string;
        })[];
    } & {
        id: string;
        ctdSectionNumber: string;
        createdAt: Date;
        updatedAt: Date;
        sequenceId: string;
        title: string;
        operation: import("@prisma/client").$Enums.LeafOperation;
        sequenceNodeId: string;
        studyId: string;
        modifiedFromId: string | null;
        stfFilePath: string | null;
        stfChecksum: string | null;
        stfXmlContent: string | null;
    })[]>;
    getById(id: string): Promise<{
        sequenceNode: {
            id: string;
            ctdSectionNumber: string;
            title: string;
        };
        categories: {
            id: string;
            sortOrder: number;
            name: string;
            value: string;
            studyId: string;
            infoType: string;
        }[];
        documents: ({
            fileAttachment: {
                id: string;
                createdAt: Date;
                sequenceNodeId: string;
                xmlLang: string;
                originalName: string;
                storedName: string;
                exportName: string | null;
                storagePath: string;
                ectdRelativePath: string;
                fileType: string;
                fileSize: bigint;
                md5Checksum: string;
                isReference: boolean;
                referenceFileId: string | null;
                uploadedBy: string | null;
            };
        } & {
            id: string;
            sortOrder: number;
            studyId: string;
            fileAttachmentId: string;
            fileTag: string;
            fileTagInfoType: string;
        })[];
    } & {
        id: string;
        ctdSectionNumber: string;
        createdAt: Date;
        updatedAt: Date;
        sequenceId: string;
        title: string;
        operation: import("@prisma/client").$Enums.LeafOperation;
        sequenceNodeId: string;
        studyId: string;
        modifiedFromId: string | null;
        stfFilePath: string | null;
        stfChecksum: string | null;
        stfXmlContent: string | null;
    }>;
    create(sequenceNodeId: string, dto: CreateStudyDto): Promise<{
        categories: {
            id: string;
            sortOrder: number;
            name: string;
            value: string;
            studyId: string;
            infoType: string;
        }[];
        documents: ({
            fileAttachment: {
                id: string;
                createdAt: Date;
                sequenceNodeId: string;
                xmlLang: string;
                originalName: string;
                storedName: string;
                exportName: string | null;
                storagePath: string;
                ectdRelativePath: string;
                fileType: string;
                fileSize: bigint;
                md5Checksum: string;
                isReference: boolean;
                referenceFileId: string | null;
                uploadedBy: string | null;
            };
        } & {
            id: string;
            sortOrder: number;
            studyId: string;
            fileAttachmentId: string;
            fileTag: string;
            fileTagInfoType: string;
        })[];
    } & {
        id: string;
        ctdSectionNumber: string;
        createdAt: Date;
        updatedAt: Date;
        sequenceId: string;
        title: string;
        operation: import("@prisma/client").$Enums.LeafOperation;
        sequenceNodeId: string;
        studyId: string;
        modifiedFromId: string | null;
        stfFilePath: string | null;
        stfChecksum: string | null;
        stfXmlContent: string | null;
    }>;
    update(id: string, dto: UpdateStudyDto): Promise<{
        categories: {
            id: string;
            sortOrder: number;
            name: string;
            value: string;
            studyId: string;
            infoType: string;
        }[];
        documents: ({
            fileAttachment: {
                id: string;
                createdAt: Date;
                sequenceNodeId: string;
                xmlLang: string;
                originalName: string;
                storedName: string;
                exportName: string | null;
                storagePath: string;
                ectdRelativePath: string;
                fileType: string;
                fileSize: bigint;
                md5Checksum: string;
                isReference: boolean;
                referenceFileId: string | null;
                uploadedBy: string | null;
            };
        } & {
            id: string;
            sortOrder: number;
            studyId: string;
            fileAttachmentId: string;
            fileTag: string;
            fileTagInfoType: string;
        })[];
    } & {
        id: string;
        ctdSectionNumber: string;
        createdAt: Date;
        updatedAt: Date;
        sequenceId: string;
        title: string;
        operation: import("@prisma/client").$Enums.LeafOperation;
        sequenceNodeId: string;
        studyId: string;
        modifiedFromId: string | null;
        stfFilePath: string | null;
        stfChecksum: string | null;
        stfXmlContent: string | null;
    }>;
    delete(id: string): Promise<{
        id: string;
        deleted: boolean;
    }>;
    regenerateXml(id: string): Promise<{
        categories: {
            id: string;
            sortOrder: number;
            name: string;
            value: string;
            studyId: string;
            infoType: string;
        }[];
        documents: ({
            fileAttachment: {
                id: string;
                createdAt: Date;
                sequenceNodeId: string;
                xmlLang: string;
                originalName: string;
                storedName: string;
                exportName: string | null;
                storagePath: string;
                ectdRelativePath: string;
                fileType: string;
                fileSize: bigint;
                md5Checksum: string;
                isReference: boolean;
                referenceFileId: string | null;
                uploadedBy: string | null;
            };
        } & {
            id: string;
            sortOrder: number;
            studyId: string;
            fileAttachmentId: string;
            fileTag: string;
            fileTagInfoType: string;
        })[];
    } & {
        id: string;
        ctdSectionNumber: string;
        createdAt: Date;
        updatedAt: Date;
        sequenceId: string;
        title: string;
        operation: import("@prisma/client").$Enums.LeafOperation;
        sequenceNodeId: string;
        studyId: string;
        modifiedFromId: string | null;
        stfFilePath: string | null;
        stfChecksum: string | null;
        stfXmlContent: string | null;
    }>;
    validateMetadata(ctdSectionNumber: string, payload: {
        studyId: string;
        title: string;
        categories: Array<{
            name: string;
            value: string;
        }>;
        documents: Array<{
            fileTag: string;
        }>;
    }): Promise<StudyMetadataValidation>;
    private resolveModifiedFromId;
    private buildStfXmlForStudy;
    private loadNode;
    private assertStfAllowed;
    private loadFileAttachments;
    private basename;
    private normalizeLeafIdPart;
}
