import { PrismaService } from '../prisma/prisma.service';
import { ControlledVocabularyService } from '../controlled-vocabulary/controlled-vocabulary.service';
import { CreateApplicationDto } from './dto';
export declare class ApplicationService {
    private prisma;
    private cvService;
    constructor(prisma: PrismaService, cvService: ControlledVocabularyService);
    create(projectId: string, dto: CreateApplicationDto): Promise<{
        id: string;
        applicationTypeCode: string;
        createdAt: Date;
        updatedAt: Date;
        projectId: string;
        productTypeCode: string;
        productNumber: string;
        applicationNumber: string;
        applicationTypeVersion: string;
        productTypeVersion: string;
    }>;
    findAllByProject(projectId: string): Promise<({
        _count: {
            regulatoryActivities: number;
        };
    } & {
        id: string;
        applicationTypeCode: string;
        createdAt: Date;
        updatedAt: Date;
        projectId: string;
        productTypeCode: string;
        productNumber: string;
        applicationNumber: string;
        applicationTypeVersion: string;
        productTypeVersion: string;
    })[]>;
    findOne(id: string): Promise<{
        project: {
            id: string;
            name: string;
        };
        regulatoryActivities: ({
            _count: {
                sequences: number;
            };
        } & {
            id: string;
            regulatoryActivityTypeCode: string;
            createdAt: Date;
            applicationId: string;
            regulatoryActivityTypeVersion: string;
            relatedSequence: string;
        })[];
    } & {
        id: string;
        applicationTypeCode: string;
        createdAt: Date;
        updatedAt: Date;
        projectId: string;
        productTypeCode: string;
        productNumber: string;
        applicationNumber: string;
        applicationTypeVersion: string;
        productTypeVersion: string;
    }>;
    remove(id: string): Promise<{
        id: string;
        applicationTypeCode: string;
        createdAt: Date;
        updatedAt: Date;
        projectId: string;
        productTypeCode: string;
        productNumber: string;
        applicationNumber: string;
        applicationTypeVersion: string;
        productTypeVersion: string;
    }>;
    private generateApplicationNumber;
}
