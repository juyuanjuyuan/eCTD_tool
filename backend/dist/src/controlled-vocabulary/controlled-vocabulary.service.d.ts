import { OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
export declare class ControlledVocabularyService implements OnModuleInit {
    private prisma;
    private readonly logger;
    private readonly xmlParser;
    private readonly cvBasePath;
    constructor(prisma: PrismaService);
    onModuleInit(): Promise<void>;
    seedControlledVocabularies(): Promise<void>;
    private parseCvFile;
    private parseDependencyFile;
    private parseDate;
    getApplicationTypes(): Promise<{
        id: string;
        vocabularyName: string;
        code: string;
        version: string;
        validFrom: Date;
        validTo: Date | null;
        descriptionZh: string;
        descriptionEn: string;
    }[]>;
    getProductTypes(): Promise<{
        id: string;
        vocabularyName: string;
        code: string;
        version: string;
        validFrom: Date;
        validTo: Date | null;
        descriptionZh: string;
        descriptionEn: string;
    }[]>;
    getRegulatoryActivityTypes(appType?: string): Promise<{
        id: string;
        vocabularyName: string;
        code: string;
        version: string;
        validFrom: Date;
        validTo: Date | null;
        descriptionZh: string;
        descriptionEn: string;
    }[]>;
    getSequenceTypes(appType?: string, ratType?: string): Promise<{
        id: string;
        vocabularyName: string;
        code: string;
        version: string;
        validFrom: Date;
        validTo: Date | null;
        descriptionZh: string;
        descriptionEn: string;
    }[]>;
    validateDependency(appType: string, ratType: string, sqtType?: string): Promise<boolean>;
    getCvVersion(vocabularyName: string, code: string): Promise<string>;
}
