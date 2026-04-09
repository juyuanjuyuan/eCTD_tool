import { LeafOperation } from '@prisma/client';
import { StudyCategoryDto, StudyDocumentDto } from './create-study.dto';
export declare class UpdateStudyDto {
    studyId?: string;
    title?: string;
    operation?: LeafOperation;
    modifiedFromId?: string;
    categories?: StudyCategoryDto[];
    documents?: StudyDocumentDto[];
}
