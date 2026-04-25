"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SyncQueueRunner = void 0;
class SyncQueueJob {
    id;
    returnvalue;
    failedReason;
    state = 'waiting';
    progressValue = 0;
    constructor(id) {
        this.id = id;
    }
    setState(state) {
        this.state = state;
    }
    setProgress(value) {
        this.progressValue = value;
    }
    progress() {
        return this.progressValue;
    }
    async getState() {
        return this.state;
    }
}
class SyncQueueRunner {
    handlers;
    jobs = new Map();
    sequence = 1;
    constructor(handlers) {
        this.handlers = handlers;
    }
    async add(name, data) {
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
            .then(() => handler(data, {
            id,
            progress: async (n) => {
                job.setProgress(n);
            },
        }))
            .then((result) => {
            job.returnvalue = result;
            job.setProgress(100);
            job.setState('completed');
        })
            .catch((err) => {
            job.failedReason = err?.message || 'Unknown queue error';
            job.setState('failed');
        });
        return job;
    }
    async getJob(id) {
        return this.jobs.get(id) ?? null;
    }
}
exports.SyncQueueRunner = SyncQueueRunner;
//# sourceMappingURL=sync-queue.runner.js.map