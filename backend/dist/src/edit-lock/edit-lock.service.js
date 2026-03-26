"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EditLockService = void 0;
const common_1 = require("@nestjs/common");
const redis_cache_service_1 = require("../common/redis-cache.service");
const LOCK_TTL_SECONDS = 30 * 60;
const LOCK_PREFIX = 'lock:node:';
let EditLockService = class EditLockService {
    redis;
    constructor(redis) {
        this.redis = redis;
    }
    lockKey(nodeId) {
        return `${LOCK_PREFIX}${nodeId}`;
    }
    async acquireLock(nodeId, userId, userName) {
        const key = this.lockKey(nodeId);
        const existing = await this.redis.get(key);
        if (existing && existing.userId === userId) {
            await this.redis.set(key, existing, LOCK_TTL_SECONDS);
            return existing;
        }
        const now = new Date();
        const lockInfo = {
            userId,
            userName,
            acquiredAt: now.toISOString(),
            expiresAt: new Date(now.getTime() + LOCK_TTL_SECONDS * 1000).toISOString(),
        };
        const acquired = await this.redis.setnx(key, lockInfo, LOCK_TTL_SECONDS);
        if (!acquired) {
            const holder = await this.redis.get(key);
            throw new common_1.ConflictException({
                message: `节点正在被 ${holder?.userName || '其他用户'} 编辑`,
                lockedBy: holder,
            });
        }
        return lockInfo;
    }
    async releaseLock(nodeId, userId) {
        const key = this.lockKey(nodeId);
        const existing = await this.redis.get(key);
        if (!existing)
            return;
        if (existing.userId !== userId) {
            throw new common_1.ForbiddenException('只能释放自己持有的锁');
        }
        await this.redis.del(key);
    }
    async queryLock(nodeId) {
        return this.redis.get(this.lockKey(nodeId));
    }
    async forceUnlock(nodeId) {
        await this.redis.del(this.lockKey(nodeId));
    }
    async heartbeat(nodeId, userId) {
        const key = this.lockKey(nodeId);
        const existing = await this.redis.get(key);
        if (!existing || existing.userId !== userId) {
            return null;
        }
        const updated = {
            ...existing,
            expiresAt: new Date(Date.now() + LOCK_TTL_SECONDS * 1000).toISOString(),
        };
        await this.redis.set(key, updated, LOCK_TTL_SECONDS);
        return updated;
    }
};
exports.EditLockService = EditLockService;
exports.EditLockService = EditLockService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [redis_cache_service_1.RedisCacheService])
], EditLockService);
//# sourceMappingURL=edit-lock.service.js.map