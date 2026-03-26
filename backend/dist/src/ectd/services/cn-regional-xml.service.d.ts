import { PrismaService } from '../../prisma/prisma.service';
import { Md5Service } from './md5.service';
export declare class CnRegionalXmlService {
    private prisma;
    private md5Service;
    private readonly logger;
    constructor(prisma: PrismaService, md5Service: Md5Service);
    generateCnRegionalXml(sequenceId: string): Promise<string>;
    private loadModule1Nodes;
    private buildXml;
    private buildContentElements;
    private buildLeafElements;
    private buildLeafAttributes;
    private hasActiveLeaves;
    private escapeXml;
}
