import { SequenceService } from './sequence.service';
import { CreateSequenceDto, UpdateSequenceDto } from './dto';
export declare class SequenceController {
    private readonly sequenceService;
    constructor(sequenceService: SequenceService);
    create(raId: string, dto: CreateSequenceDto): Promise<{
        description: string;
        id: string;
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
    }>;
    findAll(raId: string): Promise<{
        description: string;
        id: string;
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
        applicationId: string;
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
        applicationId: string;
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
        applicationId: string;
        regulatoryActivityId: string;
        sequenceNumber: string;
        sequenceTypeCode: string;
        sequenceTypeVersion: string;
        contactName: string;
        contactPhone: string;
        contactEmail: string;
    }>;
}
