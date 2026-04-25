import { RegulatoryActivityService } from './regulatory-activity.service';
import { CreateRegulatoryActivityDto } from './dto';
export declare class RegulatoryActivityController {
    private readonly raService;
    constructor(raService: RegulatoryActivityService);
    create(appId: string, dto: CreateRegulatoryActivityDto): Promise<{
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
    findAll(appId: string): Promise<({
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
