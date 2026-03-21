import { SequenceStatus } from '@prisma/client';
export declare class UpdateSequenceDto {
    description?: string;
    contactName?: string;
    contactPhone?: string;
    contactEmail?: string;
    status?: SequenceStatus;
}
