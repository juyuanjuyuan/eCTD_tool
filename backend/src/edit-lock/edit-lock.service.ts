import { Injectable, ConflictException, ForbiddenException } from '@nestjs/common';
import { RedisCacheService } from '../common/redis-cache.service';

export interface LockInfo {
  userId: string;
  userName: string;
  acquiredAt: string;
  expiresAt: string;
}

const LOCK_TTL_SECONDS = 30 * 60; // 30 minutes
const LOCK_PREFIX = 'lock:node:';

@Injectable()
export class EditLockService {
  constructor(private readonly redis: RedisCacheService) {}

  private lockKey(nodeId: string): string {
    return `${LOCK_PREFIX}${nodeId}`;
  }

  async acquireLock(
    nodeId: string,
    userId: string,
    userName: string,
  ): Promise<LockInfo> {
    const key = this.lockKey(nodeId);

    // Check if already locked by this user
    const existing = await this.redis.get<LockInfo>(key);
    if (existing && existing.userId === userId) {
      // Refresh TTL for same user
      await this.redis.set(key, existing, LOCK_TTL_SECONDS);
      return existing;
    }

    const now = new Date();
    const lockInfo: LockInfo = {
      userId,
      userName,
      acquiredAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + LOCK_TTL_SECONDS * 1000).toISOString(),
    };

    const acquired = await this.redis.setnx(key, lockInfo, LOCK_TTL_SECONDS);
    if (!acquired) {
      const holder = await this.redis.get<LockInfo>(key);
      throw new ConflictException({
        message: `节点正在被 ${holder?.userName || '其他用户'} 编辑`,
        lockedBy: holder,
      });
    }

    return lockInfo;
  }

  async releaseLock(nodeId: string, userId: string): Promise<void> {
    const key = this.lockKey(nodeId);
    const existing = await this.redis.get<LockInfo>(key);

    if (!existing) return; // Already unlocked
    if (existing.userId !== userId) {
      throw new ForbiddenException('只能释放自己持有的锁');
    }

    await this.redis.del(key);
  }

  async queryLock(nodeId: string): Promise<LockInfo | null> {
    return this.redis.get<LockInfo>(this.lockKey(nodeId));
  }

  async forceUnlock(nodeId: string): Promise<void> {
    await this.redis.del(this.lockKey(nodeId));
  }

  async heartbeat(nodeId: string, userId: string): Promise<LockInfo | null> {
    const key = this.lockKey(nodeId);
    const existing = await this.redis.get<LockInfo>(key);

    if (!existing || existing.userId !== userId) {
      return null;
    }

    // Refresh TTL
    const updated: LockInfo = {
      ...existing,
      expiresAt: new Date(Date.now() + LOCK_TTL_SECONDS * 1000).toISOString(),
    };
    await this.redis.set(key, updated, LOCK_TTL_SECONDS);
    return updated;
  }
}
