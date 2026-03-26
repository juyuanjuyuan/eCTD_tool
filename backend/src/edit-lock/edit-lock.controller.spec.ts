import { EditLockController } from './edit-lock.controller';

describe('EditLockController', () => {
  let controller: EditLockController;
  let service: Record<string, any>;

  beforeEach(() => {
    service = {
      acquireLock: jest.fn().mockResolvedValue({ userId: 'user-1', userName: '张三' }),
      releaseLock: jest.fn().mockResolvedValue(undefined),
      queryLock: jest.fn().mockResolvedValue({ userId: 'user-1' }),
      forceUnlock: jest.fn().mockResolvedValue(undefined),
      heartbeat: jest.fn().mockResolvedValue({ userId: 'user-1' }),
    };
    controller = new EditLockController(service as any);
  });

  it('should acquire lock', async () => {
    const result = await controller.acquireLock('node-1', { id: 'user-1', name: '张三' });
    expect(service.acquireLock).toHaveBeenCalledWith('node-1', 'user-1', '张三');
  });

  it('should release lock', async () => {
    await controller.releaseLock('node-1', 'user-1');
    expect(service.releaseLock).toHaveBeenCalledWith('node-1', 'user-1');
  });

  it('should query lock', async () => {
    const result = await controller.queryLock('node-1');
    expect(result.userId).toBe('user-1');
  });

  it('should force unlock', async () => {
    await controller.forceUnlock('node-1');
    expect(service.forceUnlock).toHaveBeenCalledWith('node-1');
  });

  it('should heartbeat', async () => {
    const result = await controller.heartbeat('node-1', 'user-1');
    expect(service.heartbeat).toHaveBeenCalledWith('node-1', 'user-1');
  });
});
