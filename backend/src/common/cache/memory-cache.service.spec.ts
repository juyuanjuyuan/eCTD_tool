import { MemoryCacheService } from './memory-cache.service';

describe('MemoryCacheService', () => {
  let service: MemoryCacheService;

  beforeEach(() => {
    service = new MemoryCacheService();
  });

  it('should set/get cache item', async () => {
    await service.set('k1', { a: 1 }, 60);
    const value = await service.get<{ a: number }>('k1');
    expect(value).toEqual({ a: 1 });
  });

  it('should expire item by ttl', async () => {
    await service.set('k2', 'v', 0);
    const value = await service.get<string>('k2');
    expect(value).toBeNull();
  });

  it('wrap should cache factory result', async () => {
    const factory = jest.fn().mockResolvedValue('ok');
    const v1 = await service.wrap('k3', factory, 60);
    const v2 = await service.wrap('k3', factory, 60);

    expect(v1).toBe('ok');
    expect(v2).toBe('ok');
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it('setnx should only set once', async () => {
    const first = await service.setnx('lock', { user: 'u1' }, 30);
    const second = await service.setnx('lock', { user: 'u2' }, 30);

    expect(first).toBe(true);
    expect(second).toBe(false);
  });

  it('scanKeys should match wildcard pattern', async () => {
    await service.set('presence:u1', true, 60);
    await service.set('presence:u2', true, 60);
    await service.set('other:u3', true, 60);

    const keys = await service.scanKeys('presence:*');
    expect(keys.sort()).toEqual(['presence:u1', 'presence:u2']);
  });

  it('expire should extend ttl for existing key', async () => {
    await service.set('ttl:key', 'v', 1);
    const ok = await service.expire('ttl:key', 60);

    expect(ok).toBe(true);
    const value = await service.get('ttl:key');
    expect(value).toBe('v');
  });

});
