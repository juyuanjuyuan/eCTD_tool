import { ProjectController } from './project.controller';

describe('ProjectController', () => {
  let controller: ProjectController;
  let service: Record<string, any>;

  beforeEach(() => {
    service = {
      create: jest.fn().mockResolvedValue({ id: 'proj-1' }),
      findAll: jest.fn().mockResolvedValue({ items: [], total: 0 }),
      findOne: jest.fn().mockResolvedValue({ id: 'proj-1' }),
      update: jest.fn().mockResolvedValue({ id: 'proj-1' }),
      archive: jest.fn().mockResolvedValue({ status: 'ARCHIVED' }),
      addMember: jest.fn().mockResolvedValue({ id: 'pm-1' }),
      removeMember: jest.fn().mockResolvedValue({}),
    };
    controller = new ProjectController(service as any);
  });

  it('should create project', async () => {
    const result = await controller.create({ name: '测试' } as any, 'user-1');
    expect(service.create).toHaveBeenCalledWith({ name: '测试' }, 'user-1');
  });

  it('should find all projects', async () => {
    await controller.findAll({ page: 1, pageSize: 20 } as any, 'user-1');
    expect(service.findAll).toHaveBeenCalled();
  });

  it('should find one project', async () => {
    const result = await controller.findOne('proj-1');
    expect(result.id).toBe('proj-1');
  });

  it('should update project', async () => {
    await controller.update('proj-1', { name: '新名称' } as any, 'user-1');
    expect(service.update).toHaveBeenCalledWith('proj-1', { name: '新名称' }, 'user-1');
  });

  it('should archive project', async () => {
    await controller.archive('proj-1', 'user-1');
    expect(service.archive).toHaveBeenCalledWith('proj-1', 'user-1');
  });

  it('should add member', async () => {
    await controller.addMember('proj-1', { userId: 'u2', role: 'MEMBER' } as any, 'user-1');
    expect(service.addMember).toHaveBeenCalledWith('proj-1', { userId: 'u2', role: 'MEMBER' }, 'user-1');
  });

  it('should remove member', async () => {
    await controller.removeMember('proj-1', 'u2', 'user-1');
    expect(service.removeMember).toHaveBeenCalledWith('proj-1', 'u2', 'user-1');
  });
});
