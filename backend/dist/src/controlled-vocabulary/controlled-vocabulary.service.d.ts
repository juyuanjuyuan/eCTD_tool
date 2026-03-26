import { OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisCacheService } from '../common/redis-cache.service';
export declare class ControlledVocabularyService implements OnModuleInit {
    private prisma;
    private cache;
    private readonly logger;
    private readonly xmlParser;
    private readonly cvBasePath;
    constructor(prisma: PrismaService, cache: RedisCacheService);
    onModuleInit(): Promise<void>;
    seedControlledVocabularies(): Promise<void>;
    private parseCvFile;
    private parseDependencyFile;
    private parseDate;
    getApplicationTypes(): Promise<{}>;
    getProductTypes(): Promise<{}>;
    getRegulatoryActivityTypes(appType?: string): Promise<{}>;
    getSequenceTypes(appType?: string, ratType?: string): Promise<{}>;
    validateDependency(appType: string, ratType: string, sqtType?: string): Promise<boolean>;
    getCvVersion(vocabularyName: string, code: string): Promise<string>;
}
