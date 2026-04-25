"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BullQueueAdapter = void 0;
class BullQueueAdapter {
    queue;
    constructor(queue) {
        this.queue = queue;
    }
    async add(name, data) {
        const job = await this.queue.add(name, data);
        return job;
    }
    async getJob(id) {
        const job = await this.queue.getJob(id);
        return job;
    }
}
exports.BullQueueAdapter = BullQueueAdapter;
//# sourceMappingURL=bull-queue.adapter.js.map