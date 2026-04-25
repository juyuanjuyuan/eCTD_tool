import { ApplicationService } from './application.service';
import { CreateApplicationDto } from './dto';
import { SequenceService } from '../sequence/sequence.service';
import { CreateSequenceWithRaDto } from '../sequence/dto';
export declare class ApplicationController {
    private readonly applicationService;
    private readonly sequenceService;
    constructor(applicationService: ApplicationService, sequenceService: SequenceService);
    create(projectId: string, dto: CreateApplicationDto): Promise<{
        id: string;
        applicationTypeCode: string;
        createdAt: Date;
        updatedAt: Date;
        projectId: string;
        applicationNumber: string;
        applicationTypeVersion: string;
        productTypeCode: string;
        productTypeVersion: string;
        productNumber: string;
    }>;
    findAll(projectId: string): Promise<({
        _count: {
            regulatoryActivities: number;
        };
    } & {
        id: string;
        applicationTypeCode: string;
        createdAt: Date;
        updatedAt: Date;
        projectId: string;
        applicationNumber: string;
        applicationTypeVersion: string;
        productTypeCode: string;
        productTypeVersion: string;
        productNumber: string;
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
        applicationNumber: string;
        applicationTypeVersion: string;
        productTypeCode: string;
        productTypeVersion: string;
        productNumber: string;
    }>;
    remove(id: string): Promise<{
        id: string;
        applicationTypeCode: string;
        createdAt: Date;
        updatedAt: Date;
        projectId: string;
        applicationNumber: string;
        applicationTypeVersion: string;
        productTypeCode: string;
        productTypeVersion: string;
        productNumber: string;
    }>;
    createSequenceWithRa(appId: string, dto: CreateSequenceWithRaDto): Promise<{
        regulatoryActivity: {
            id: string;
            regulatoryActivityTypeCode: string;
            createdAt: Date;
            applicationId: string;
            regulatoryActivityTypeVersion: string;
            relatedSequence: string;
        };
        isNewRa: boolean;
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
