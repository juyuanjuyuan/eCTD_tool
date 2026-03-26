import { RedisCacheService } from './redis-cache.service';

describe('RedisCacheService', () => {
  let service: RedisCacheService;
  let mockClient: Record<string, any>;

  beforeEach(() => {
    service = new RedisCacheService();

    mockClient = {
      status: 'ready',
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1),
      keys: jest.fn().mockResolvedValue([]),
      expire: jest.fn().mockResolvedValue(1),
      on: jest.fn(),
      connect: jest.fn().mockResolvedValue(undefined),
      disconnect: jest.fn(),
    };

    // Inject the mock client directly
    (service as any).client = mockClient;
  });

  describe('get', () => {
    it('should return parsed value when key exists', async () => {
      mockClient.get.mockResolvedValue(JSON.stringify({ name: '张三' }));

      const result = await service.get<{ name: string }>('test-key');

      expect(result).toEqual({ name: '张三' });
      expect(mockClient.get).toHaveBeenCalledWith('test-key');
    });

    it('should return null when key does not exist', async () => {
      mockClient.get.mockResolvedValue(null);

      const result = await service.get('nonexistent');

      expect(result).toBeNull();
    });

    it('should return null when not connected', async () => {
      mockClient.status = 'connecting';

      const result = await service.get('key');

      expect(result).toBeNull();
      expect(mockClient.get).not.toHaveBeenCalled();
    });

    it('should return null on error', async () => {
      mockClient.get.mockRejectedValue(new Error('connection lost'));

      const result = await service.get('key');

      expect(result).toBeNull();
    });
  });

  describe('set', () => {
    it('should set value with TTL', async () => {
      await service.set('key', { data: 'value' }, 300);

      expect(mockClient.set).toHaveBeenCalledWith(
        'key',
        JSON.stringify({ data: 'value' }),
        'EX',
        300,
      );
    });

    it('should use default TTL of 3600', async () => {
      await service.set('key', 'value');

      expect(mockClient.set).toHaveBeenCalledWith('key', '"value"', 'EX', 3600);
    });

    it('should do nothing when not connected', async () => {
      mockClient.status = 'end';

      await service.set('key', 'value');

      expect(mockClient.set).not.toHaveBeenCalled();
    });

    it('should silently handle errors', async () => {
      mockClient.set.mockRejectedValue(new Error('write failed'));

      await expect(service.set('key', 'value')).resolves.toBeUndefined();
    });
  });

  describe('del', () => {
    it('should delete key', async () => {
      await service.del('key');

      expect(mockClient.del).toHaveBeenCalledWith('key');
    });

    it('should do nothing when not connected', async () => {
      mockClient.status = 'reconnecting';

      await service.del('key');

      expect(mockClient.del).not.toHaveBeenCalled();
    });
  });

  describe('delPattern', () => {
    it('should delete matching keys', async () => {
      mockClient.keys.mockResolvedValue(['cv:1', 'cv:2']);

      await service.delPattern('cv:*');

      expect(mockClient.keys).toHaveBeenCalledWith('cv:*');
      expect(mockClient.del).toHaveBeenCalledWith('cv:1', 'cv:2');
    });

    it('should not call del when no keys match', async () => {
      mockClient.keys.mockResolvedValue([]);

      await service.delPattern('nonexistent:*');

      expect(mockClient.del).not.toHaveBeenCalled();
    });
  });

  describe('setnx', () => {
    it('should return true when key was set', async () => {
      mockClient.set.mockResolvedValue('OK');

      const result = await service.setnx('lock:key', { user: '1' }, 30);

      expect(result).toBe(true);
      expect(mockClient.set).toHaveBeenCalledWith(
        'lock:key',
        JSON.stringify({ user: '1' }),
        'EX',
        30,
        'NX',
      );
    });

    it('should return false when key already exists', async () => {
      mockClient.set.mockResolvedValue(null);

      const result = await service.setnx('lock:key', { user: '1' }, 30);

      expect(result).toBe(false);
    });

    it('should return true (fallback) when not connected', async () => {
      mockClient.status = 'end';

      const result = await service.setnx('key', 'val', 30);

      expect(result).toBe(true);
    });

    it('should return true (fallback) on error', async () => {
      mockClient.set.mockRejectedValue(new Error('error'));

      const result = await service.setnx('key', 'val', 30);

      expect(result).toBe(true);
    });
  });

  describe('expire', () => {
    it('should update TTL and return true', async () => {
      mockClient.expire.mockResolvedValue(1);

      const result = await service.expire('key', 60);

      expect(result).toBe(true);
      expect(mockClient.expire).toHaveBeenCalledWith('key', 60);
    });

    it('should return false when key does not exist', async () => {
      mockClient.expire.mockResolvedValue(0);

      const result = await service.expire('nonexistent', 60);

      expect(result).toBe(false);
    });

    it('should return false when not connected', async () => {
      mockClient.status = 'end';

      const result = await service.expire('key', 60);

      expect(result).toBe(false);
    });
  });

  describe('onModuleDestroy', () => {
    it('should disconnect client', () => {
      service.onModuleDestroy();

      expect(mockClient.disconnect).toHaveBeenCalled();
    });
  });
});
