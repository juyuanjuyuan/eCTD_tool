import { SequenceNodeStatus, LeafOperation } from '@prisma/client';
export declare class UpdateSequenceNodeDto {
    status?: SequenceNodeStatus;
    operation?: LeafOperation;
    title?: string;
}
