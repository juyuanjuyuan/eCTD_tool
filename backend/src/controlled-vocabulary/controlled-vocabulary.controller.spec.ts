import { ControlledVocabularyController } from './controlled-vocabulary.controller';

describe('ControlledVocabularyController', () => {
  let controller: ControlledVocabularyController;
  let service: Record<string, any>;

  beforeEach(() => {
    service = {
      getApplicationTypes: jest.fn().mockResolvedValue([{ code: 'cnapt1' }]),
      getProductTypes: jest.fn().mockResolvedValue([{ code: 'cnprt1' }]),
      getRegulatoryActivityTypes: jest.fn().mockResolvedValue([{ code: 'cnrat1' }]),
      getSequenceTypes: jest.fn().mockResolvedValue([{ code: 'cnsqt1' }]),
    };
    controller = new ControlledVocabularyController(service as any);
  });

  it('should get application types', async () => {
    const result = await controller.getApplicationTypes();
    expect(result).toHaveLength(1);
  });

  it('should get product types', async () => {
    const result = await controller.getProductTypes();
    expect(result).toHaveLength(1);
  });

  it('should get regulatory activity types', async () => {
    await controller.getRegulatoryActivityTypes('cnapt2');
    expect(service.getRegulatoryActivityTypes).toHaveBeenCalledWith('cnapt2');
  });

  it('should get sequence types', async () => {
    await controller.getSequenceTypes('cnapt2', 'cnrat1');
    expect(service.getSequenceTypes).toHaveBeenCalledWith('cnapt2', 'cnrat1');
  });
});
