import { SequenceController } from './sequence.controller';

describe('SequenceController', () => {
  let controller: SequenceController;
  let service: Record<string, any>;

  beforeEach(() => {
    service = {
      create: jest.fn().mockResolvedValue({ id: 'seq-1' }),
      findAllByRegulatoryActivity: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue({ id: 'seq-1' }),
      update: jest.fn().mockResolvedValue({ id: 'seq-1' }),
      remove: jest.fn().mockResolvedValue({}),
    };
    controller = new SequenceController(service as any);
  });

  it('should create sequence', async () => {
    await controller.create('ra-1', { sequenceTypeCode: 'cnsqt1' } as any);
    expect(service.create).toHaveBeenCalledWith('ra-1', { sequenceTypeCode: 'cnsqt1' });
  });

  it('should find all sequences', async () => {
    await controller.findAll('ra-1');
    expect(service.findAllByRegulatoryActivity).toHaveBeenCalledWith('ra-1');
  });

  it('should find one', async () => {
    const result = await controller.findOne('seq-1');
    expect(result.id).toBe('seq-1');
  });

  it('should update', async () => {
    await controller.update('seq-1', { description: '更新' } as any);
    expect(service.update).toHaveBeenCalledWith('seq-1', { description: '更新' });
  });

  it('should remove', async () => {
    await controller.remove('seq-1');
    expect(service.remove).toHaveBeenCalledWith('seq-1');
  });
});
