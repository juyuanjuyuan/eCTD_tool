import type { Queue } from 'bull';
import { IQueue, IQueueJob } from './queue.interface';
export declare class BullQueueAdapter implements IQueue {
    private readonly queue;
    constructor(queue: Queue);
    add(name: string, data: any): Promise<IQueueJob>;
    getJob(id: string): Promise<IQueueJob | null>;
}
