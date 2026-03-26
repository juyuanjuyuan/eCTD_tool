import { RegulatoryActivityController } from './regulatory-activity.controller';

describe('RegulatoryActivityController', () => {
  let controller: RegulatoryActivityController;
  let service: Record<string, any>;

  beforeEach(() => {
    service = {
      create: jest.fn().mockResolvedValue({ id: 'ra-1' }),
      findAllByApplication: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue({ id: 'ra-1' }),
    };
    controller = new RegulatoryActivityController(service as any);
  });

  it('should create', async () => {
    await controller.create('app-1', { regulatoryActivityTypeCode: 'cnrat1' } as any);
    expect(service.create).toHaveBeenCalledWith('app-1', { regulatoryActivityTypeCode: 'cnrat1' });
  });

  it('should find all', async () => {
    await controller.findAll('app-1');
    expect(service.findAllByApplication).toHaveBeenCalledWith('app-1');
  });

  it('should find one', async () => {
    const result = await controller.findOne('ra-1');
    expect(result.id).toBe('ra-1');
  });
});
