import { IQueue, IQueueJob } from './queue.interface';
type JobHandler = (data: any, job: {
    id: string;
    progress: (n: number) => Promise<void>;
}) => Promise<any>;
export declare class SyncQueueRunner implements IQueue {
    private readonly handlers;
    private jobs;
    private sequence;
    constructor(handlers: Record<string, JobHandler>);
    add(name: string, data: any): Promise<IQueueJob>;
    getJob(id: string): Promise<IQueueJob | null>;
}
export {};
