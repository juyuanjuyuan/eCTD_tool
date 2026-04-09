import { PrismaService } from '../prisma/prisma.service';
import { ControlledVocabularyService } from '../controlled-vocabulary/controlled-vocabulary.service';
import { CreateRegulatoryActivityDto } from './dto';
export declare class RegulatoryActivityService {
    private prisma;
    private cvService;
    constructor(prisma: PrismaService, cvService: ControlledVocabularyService);
    create(applicationId: string, dto: CreateRegulatoryActivityDto): Promise<{
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
    }>;
    findAllByApplication(applicationId: string): Promise<({
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
    })[]>;
    findOne(id: string): Promise<{
        application: {
            id: string;
            applicationTypeCode: string;
            applicationNumber: string;
            productTypeCode: string;
        };
        sequences: {
            id: string;
            description: string;
            status: import("@prisma/client").$Enums.SequenceStatus;
            createdAt: Date;
            updatedAt: Date;
            applicationId: string;
            regulatoryActivityId: string;
            sequenceNumber: string;
            sequenceTypeCode: string;
            sequenceTypeVersion: string;
            contactName: string;
            contactPhone: string;
            contactEmail: string;
        }[];
    } & {
        id: string;
        regulatoryActivityTypeCode: string;
        createdAt: Date;
        applicationId: string;
        regulatoryActivityTypeVersion: string;
        relatedSequence: string;
    }>;
}
