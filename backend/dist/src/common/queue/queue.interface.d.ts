export interface IQueueJob {
    id: string | number;
    progress(): number;
    getState(): Promise<string>;
    returnvalue?: any;
    failedReason?: string;
}
export interface IQueue {
    add(name: string, data: any): Promise<IQueueJob>;
    getJob(id: string): Promise<IQueueJob | null>;
}
