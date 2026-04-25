import { IQueue, IQueueJob } from './queue.interface';

type JobState = 'waiting' | 'active' | 'completed' | 'failed';

type JobHandler = (
  data: any,
  job: {
    id: string;
    progress: (n: number) => Promise<void>;
  },
) => Promise<any>;

class SyncQueueJob implements IQueueJob {
  public returnvalue?: any;
  public failedReason?: string;
  private state: JobState = 'waiting';
  private progressValue = 0;

  constructor(public readonly id: string) {}

  setState(state: JobState) {
    this.state = state;
  }

  setProgress(value: number) {
    this.progressValue = value;
  }

  progress(): number {
    return this.progressValue;
  }

  async getState(): Promise<string> {
    return this.state;
  }
}

export class SyncQueueRunner implements IQueue {
  private jobs = new Map<string, SyncQueueJob>();
  private sequence = 1;

  constructor(private readonly handlers: Record<string, JobHandler>) {}

  async add(name: string, data: any): Promise<IQueueJob> {
    const id = String(this.sequence++);
    const job = new SyncQueueJob(id);
    this.jobs.set(id, job);

    const handler = this.handlers[name];
    if (!handler) {
      job.setState('failed');
      job.failedReason = `No sync queue handler for job: ${name}`;
      return job;
    }

    job.setState('active');

    Promise.resolve()
      .then(() =>
        handler(data, {
          id,
          progress: async (n: number) => {
            job.setProgress(n);
          },
        }),
      )
      .then((result) => {
        job.returnvalue = result;
        job.setProgress(100);
        job.setState('completed');
      })
      .catch((err: any) => {
        job.failedReason = err?.message || 'Unknown queue error';
        job.setState('failed');
      });

    return job;
  }

  async getJob(id: string): Promise<IQueueJob | null> {
    return this.jobs.get(id) ?? null;
  }
}
