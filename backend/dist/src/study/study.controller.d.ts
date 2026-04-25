import { StudyService } from './study.service';
import { StudyTaggingFileImportService } from './study-tagging-file-import.service';
import { CreateStudyDto, UpdateStudyDto, ImportStfXmlDto, ImportStfBundleDto } from './dto';
import type { ImportOnConflict } from './dto';
export declare class StudyController {
    private readonly studyService;
    private readonly importService;
    constructor(studyService: StudyService, importService: StudyTaggingFileImportService);
    listBySequence(seqId: string): Promise<({
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
    listByNode(nodeId: string): Promise<({
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
    getOne(id: string): Promise<{
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
    create(nodeId: string, dto: CreateStudyDto): Promise<{
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
    remove(id: string): Promise<{
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
    importStfXml(nodeId: string, dto: ImportStfXmlDto): Promise<import("./study-tagging-file-import.service").StfImportResult>;
    importStfBundleJson(nodeId: string, dto: ImportStfBundleDto): Promise<import("./study-tagging-file-import.service").StfImportResult>;
    importStfBundleMultipart(nodeId: string, uploaded: {
        xml?: Express.Multer.File[];
        files?: Express.Multer.File[];
    }, onConflict?: ImportOnConflict): Promise<import("./study-tagging-file-import.service").StfImportResult>;
}
