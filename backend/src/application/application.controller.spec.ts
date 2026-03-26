import { ApplicationController } from './application.controller';

describe('ApplicationController', () => {
  let controller: ApplicationController;
  let service: Record<string, any>;

  beforeEach(() => {
    service = {
      create: jest.fn().mockResolvedValue({ id: 'app-1' }),
      findAllByProject: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue({ id: 'app-1' }),
      remove: jest.fn().mockResolvedValue({}),
    };
    controller = new ApplicationController(service as any);
  });

  it('should create application', async () => {
    await controller.create('proj-1', { applicationTypeCode: 'cnapt2' } as any);
    expect(service.create).toHaveBeenCalledWith('proj-1', { applicationTypeCode: 'cnapt2' });
  });

  it('should find all applications', async () => {
    await controller.findAll('proj-1');
    expect(service.findAllByProject).toHaveBeenCalledWith('proj-1');
  });

  it('should find one', async () => {
    const result = await controller.findOne('app-1');
    expect(result.id).toBe('app-1');
  });

  it('should remove', async () => {
    await controller.remove('app-1');
    expect(service.remove).toHaveBeenCalledWith('app-1');
  });
});
