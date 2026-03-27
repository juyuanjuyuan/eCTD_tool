import { PrismaService } from '../../prisma/prisma.service';
import { Md5Service } from './md5.service';
export declare class IndexXmlService {
    private prisma;
    private md5Service;
    private readonly logger;
    constructor(prisma: PrismaService, md5Service: Md5Service);
    generateIndexXml(sequenceId: string): Promise<string>;
    private buildPriorLeafIdMap;
    private loadModuleNodes;
    private buildXml;
    private buildElement;
    private buildNodeExtension;
    private buildLeafElements;
    private buildLeafFromAttachments;
    private buildLeafAttrs;
    private buildBackboneAttributes;
    private hasActiveLeaves;
    private escapeXml;
}
