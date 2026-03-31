import { PrismaService } from '../../prisma/prisma.service';
import { CnRegionalXmlService } from './cn-regional-xml.service';
import { IndexXmlService } from './index-xml.service';
import { Md5Service } from './md5.service';
import { MinioService } from '../../file/minio.service';
import { PassThrough } from 'stream';
export declare class PackageAssemblerService {
    private prisma;
    private cnRegionalXml;
    private indexXml;
    private md5Service;
    private minioService?;
    private readonly logger;
    private readonly utilSourceBase;
    constructor(prisma: PrismaService, cnRegionalXml: CnRegionalXmlService, indexXml: IndexXmlService, md5Service: Md5Service, minioService?: MinioService | undefined);
    assemblePackage(sequenceId: string): Promise<{
        buffer: Buffer;
        fileName: string;
    }>;
    assemblePackageStream(sequenceId: string): Promise<{
        stream: PassThrough;
        fileName: string;
    }>;
    private buildZip;
    private addUtilFiles;
    private getStfPath;
    previewStructure(sequenceId: string): Promise<string[]>;
}
