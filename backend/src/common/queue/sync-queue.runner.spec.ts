import { SyncQueueRunner } from './sync-queue.runner';

describe('SyncQueueRunner', () => {
  it('should execute handler and complete job', async () => {
    const runner = new SyncQueueRunner({
      demo: async (_data, job) => {
        await job.progress(30);
        await job.progress(100);
        return { ok: true };
      },
    });

    const job = await runner.add('demo', { a: 1 });

    // wait for microtask chain
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(await job.getState()).toBe('completed');
    expect(job.progress()).toBe(100);
    expect(job.returnvalue).toEqual({ ok: true });
  });

  it('should fail when handler is missing', async () => {
    const runner = new SyncQueueRunner({});
    const job = await runner.add('unknown', {});

    expect(await job.getState()).toBe('failed');
    expect(job.failedReason).toContain('No sync queue handler');
  });
});
