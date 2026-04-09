import { LeafOperation } from '@prisma/client';
export declare class StudyCategoryDto {
    name: string;
    value: string;
    infoType?: string;
    sortOrder?: number;
}
export declare class StudyDocumentDto {
    fileAttachmentId: string;
    fileTag: string;
    fileTagInfoType?: string;
    sortOrder?: number;
}
export declare class CreateStudyDto {
    studyId: string;
    title: string;
    operation?: LeafOperation;
    modifiedFromId?: string;
    categories: StudyCategoryDto[];
    documents: StudyDocumentDto[];
}
