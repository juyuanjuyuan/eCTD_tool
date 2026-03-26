import { EditLockService } from './edit-lock.service';
import { RedisCacheService } from '../common/redis-cache.service';
import { ConflictException, ForbiddenException } from '@nestjs/common';

describe('EditLockService', () => {
  let service: EditLockService;
  let redis: Record<string, any>;

  beforeEach(() => {
    redis = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
      del: jest.fn().mockResolvedValue(undefined),
      setnx: jest.fn().mockResolvedValue(true),
    };

    service = new EditLockService(redis as any);
  });

  describe('acquireLock', () => {
    it('should acquire lock on unlocked node', async () => {
      const result = await service.acquireLock('node-1', 'user-1', '张三');

      expect(result.userId).toBe('user-1');
      expect(result.userName).toBe('张三');
      expect(result.acquiredAt).toBeDefined();
      expect(result.expiresAt).toBeDefined();
      expect(redis.setnx).toHaveBeenCalledWith(
        'lock:node:node-1',
        expect.objectContaining({ userId: 'user-1' }),
        1800,
      );
    });

    it('should refresh lock for same user', async () => {
      const existingLock = {
        userId: 'user-1',
        userName: '张三',
        acquiredAt: new Date().toISOString(),
        expiresAt: new Date().toISOString(),
      };
      redis.get.mockResolvedValue(existingLock);

      const result = await service.acquireLock('node-1', 'user-1', '张三');

      expect(result).toEqual(existingLock);
      expect(redis.set).toHaveBeenCalled();
      expect(redis.setnx).not.toHaveBeenCalled();
    });

    it('should throw ConflictException when locked by another user', async () => {
      redis.get.mockResolvedValue(null); // First get returns null (no existing lock for same user check)
      redis.setnx.mockResolvedValue(false);
      // Second get returns the holder's lock
      redis.get.mockResolvedValueOnce(null).mockResolvedValueOnce({
        userId: 'user-2',
        userName: '李四',
      });

      await expect(
        service.acquireLock('node-1', 'user-1', '张三'),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('releaseLock', () => {
    it('should release lock held by the user', async () => {
      redis.get.mockResolvedValue({ userId: 'user-1', userName: '张三' });

      await service.releaseLock('node-1', 'user-1');

      expect(redis.del).toHaveBeenCalledWith('lock:node:node-1');
    });

    it('should do nothing when no lock exists', async () => {
      redis.get.mockResolvedValue(null);

      await service.releaseLock('node-1', 'user-1');

      expect(redis.del).not.toHaveBeenCalled();
    });

    it('should throw when trying to release another user\'s lock', async () => {
      redis.get.mockResolvedValue({ userId: 'user-2', userName: '李四' });

      await expect(
        service.releaseLock('node-1', 'user-1'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('queryLock', () => {
    it('should return lock info when locked', async () => {
      const lockInfo = { userId: 'user-1', userName: '张三' };
      redis.get.mockResolvedValue(lockInfo);

      const result = await service.queryLock('node-1');

      expect(result).toEqual(lockInfo);
      expect(redis.get).toHaveBeenCalledWith('lock:node:node-1');
    });

    it('should return null when not locked', async () => {
      redis.get.mockResolvedValue(null);

      const result = await service.queryLock('node-1');

      expect(result).toBeNull();
    });
  });

  describe('forceUnlock', () => {
    it('should delete lock regardless of owner', async () => {
      await service.forceUnlock('node-1');

      expect(redis.del).toHaveBeenCalledWith('lock:node:node-1');
    });
  });

  describe('heartbeat', () => {
    it('should refresh TTL for lock holder', async () => {
      const existing = {
        userId: 'user-1',
        userName: '张三',
        acquiredAt: new Date().toISOString(),
        expiresAt: new Date().toISOString(),
      };
      redis.get.mockResolvedValue(existing);

      const result = await service.heartbeat('node-1', 'user-1');

      expect(result).toBeDefined();
      expect(result!.userId).toBe('user-1');
      expect(redis.set).toHaveBeenCalledWith(
        'lock:node:node-1',
        expect.objectContaining({ userId: 'user-1' }),
        1800,
      );
    });

    it('should return null when no lock exists', async () => {
      redis.get.mockResolvedValue(null);

      const result = await service.heartbeat('node-1', 'user-1');

      expect(result).toBeNull();
    });

    it('should return null when lock belongs to another user', async () => {
      redis.get.mockResolvedValue({ userId: 'user-2', userName: '李四' });

      const result = await service.heartbeat('node-1', 'user-1');

      expect(result).toBeNull();
    });
  });
});
