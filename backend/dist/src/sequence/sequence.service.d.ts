import { PrismaService } from '../prisma/prisma.service';
import { ControlledVocabularyService } from '../controlled-vocabulary/controlled-vocabulary.service';
import { CreateSequenceDto, UpdateSequenceDto } from './dto';
export declare class SequenceService {
    private prisma;
    private cvService;
    constructor(prisma: PrismaService, cvService: ControlledVocabularyService);
    create(regulatoryActivityId: string, dto: CreateSequenceDto): Promise<{
        description: string;
        id: string;
        status: import("@prisma/client").$Enums.SequenceStatus;
        createdAt: Date;
        updatedAt: Date;
        regulatoryActivityId: string;
        sequenceNumber: string;
        sequenceTypeCode: string;
        sequenceTypeVersion: string;
        contactName: string;
        contactPhone: string;
        contactEmail: string;
    }>;
    findAllByRegulatoryActivity(regulatoryActivityId: string): Promise<{
        description: string;
        id: string;
        status: import("@prisma/client").$Enums.SequenceStatus;
        createdAt: Date;
        updatedAt: Date;
        regulatoryActivityId: string;
        sequenceNumber: string;
        sequenceTypeCode: string;
        sequenceTypeVersion: string;
        contactName: string;
        contactPhone: string;
        contactEmail: string;
    }[]>;
    findOne(id: string): Promise<{
        regulatoryActivity: {
            application: {
                id: string;
                applicationTypeCode: string;
                project: {
                    id: string;
                    name: string;
                };
                applicationNumber: string;
                productTypeCode: string;
                productNumber: string;
            };
        } & {
            id: string;
            regulatoryActivityTypeCode: string;
            createdAt: Date;
            applicationId: string;
            regulatoryActivityTypeVersion: string;
            relatedSequence: string;
        };
    } & {
        description: string;
        id: string;
        status: import("@prisma/client").$Enums.SequenceStatus;
        createdAt: Date;
        updatedAt: Date;
        regulatoryActivityId: string;
        sequenceNumber: string;
        sequenceTypeCode: string;
        sequenceTypeVersion: string;
        contactName: string;
        contactPhone: string;
        contactEmail: string;
    }>;
    update(id: string, dto: UpdateSequenceDto): Promise<{
        description: string;
        id: string;
        status: import("@prisma/client").$Enums.SequenceStatus;
        createdAt: Date;
        updatedAt: Date;
        regulatoryActivityId: string;
        sequenceNumber: string;
        sequenceTypeCode: string;
        sequenceTypeVersion: string;
        contactName: string;
        contactPhone: string;
        contactEmail: string;
    }>;
    remove(id: string): Promise<{
        description: string;
        id: string;
        status: import("@prisma/client").$Enums.SequenceStatus;
        createdAt: Date;
        updatedAt: Date;
        regulatoryActivityId: string;
        sequenceNumber: string;
        sequenceTypeCode: string;
        sequenceTypeVersion: string;
        contactName: string;
        contactPhone: string;
        contactEmail: string;
    }>;
}
