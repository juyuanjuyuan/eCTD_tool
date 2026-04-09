import { PrismaService } from '../prisma/prisma.service';
import { ControlledVocabularyService } from '../controlled-vocabulary/controlled-vocabulary.service';
import { StudyTaggingFileService } from '../ectd/services/study-tagging-file.service';
import { MinioService } from '../file/minio.service';
import { ImportOnConflict } from './dto';
export interface StfImportResult {
    studyId: string;
    created: boolean;
    warnings: string[];
}
interface AttachedFileInput {
    originalName: string;
    buffer: Buffer;
    md5?: string;
}
export declare class StudyTaggingFileImportService {
    private prisma;
    private stfXml;
    private cvService;
    private minioService?;
    private readonly logger;
    constructor(prisma: PrismaService, stfXml: StudyTaggingFileService, cvService: ControlledVocabularyService, minioService?: MinioService | undefined);
    importStfXml(sequenceNodeId: string, xmlString: string, options?: {
        onConflict?: ImportOnConflict;
    }): Promise<StfImportResult>;
    importStfBundle(sequenceNodeId: string, params: {
        xmlString: string;
        attachedFiles: AttachedFileInput[];
        onConflict?: ImportOnConflict;
    }): Promise<StfImportResult>;
    private importInternal;
    private resolveModifiedFromStudy;
    private deriveStudyOperation;
    private uploadAndCreateAttachment;
    private buildStfXmlForStudy;
    private basename;
    private extname;
    private md5Buffer;
    private normalizeLeafIdPart;
    private buildEctdRelativePath;
}
export {};
