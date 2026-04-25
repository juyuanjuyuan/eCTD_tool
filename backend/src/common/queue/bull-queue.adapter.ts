import type { Queue, Job } from 'bull';
import { IQueue, IQueueJob } from './queue.interface';

export class BullQueueAdapter implements IQueue {
  constructor(private readonly queue: Queue) {}

  async add(name: string, data: any): Promise<IQueueJob> {
    const job = await this.queue.add(name, data);
    return job as unknown as IQueueJob;
  }

  async getJob(id: string): Promise<IQueueJob | null> {
    const job = await this.queue.getJob(id);
    return (job as Job | null) as unknown as IQueueJob | null;
  }
}
