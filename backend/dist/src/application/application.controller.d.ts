import { ApplicationService } from './application.service';
import { CreateApplicationDto } from './dto';
export declare class ApplicationController {
    private readonly applicationService;
    constructor(applicationService: ApplicationService);
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
}
