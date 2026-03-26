import { Test, TestingModule } from '@nestjs/testing';
import { ControlledVocabularyService } from './controlled-vocabulary.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisCacheService } from '../common/redis-cache.service';

describe('ControlledVocabularyService', () => {
  let service: ControlledVocabularyService;
  let prisma: Record<string, any>;
  let cache: Record<string, any>;

  const mockCvRecords = [
    { id: '1', vocabularyName: 'application-type', code: 'cnapt1', version: '1.0', descriptionZh: '临床试验申请', descriptionEn: 'CTA' },
    { id: '2', vocabularyName: 'application-type', code: 'cnapt2', version: '1.0', descriptionZh: '新药上市申请', descriptionEn: 'NDA' },
    { id: '3', vocabularyName: 'application-type', code: 'cnapt3', version: '1.0', descriptionZh: '仿制药申请', descriptionEn: 'ANDA' },
    { id: '4', vocabularyName: 'application-type', code: 'cnapt4', version: '1.0', descriptionZh: '原料药申请', descriptionEn: 'DMF' },
  ];

  const mockProductTypes = [
    { id: '5', vocabularyName: 'product-type', code: 'cnprt1', version: '1.0', descriptionZh: '化学药品', descriptionEn: 'Chemical Drug' },
    { id: '6', vocabularyName: 'product-type', code: 'cnprt2', version: '1.0', descriptionZh: '生物制品', descriptionEn: 'Biological Product' },
  ];

  const mockRatRecords = [
    { id: '7', vocabularyName: 'regulatory-activity-type', code: 'cnrat1', version: '1.0', descriptionZh: '首次申请', descriptionEn: 'Initial' },
    { id: '8', vocabularyName: 'regulatory-activity-type', code: 'cnrat2', version: '1.0', descriptionZh: '补充申请', descriptionEn: 'Supplemental' },
  ];

  const mockSqtRecords = [
    { id: '9', vocabularyName: 'sequence-type', code: 'cnsqt1', version: '1.0', descriptionZh: '首次提交', descriptionEn: 'Initial Submission' },
    { id: '10', vocabularyName: 'sequence-type', code: 'cnsqt2', version: '1.0', descriptionZh: '回复', descriptionEn: 'Response' },
  ];

  beforeEach(async () => {
    prisma = {
      controlledVocabulary: {
        count: jest.fn(),
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
      },
      cvDependency: {
        create: jest.fn(),
        count: jest.fn(),
        findMany: jest.fn(),
      },
    };

    cache = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ControlledVocabularyService,
        { provide: PrismaService, useValue: prisma },
        { provide: RedisCacheService, useValue: cache },
      ],
    }).compile();

    service = module.get<ControlledVocabularyService>(ControlledVocabularyService);
  });

  describe('getApplicationTypes', () => {
    it('should return application types from database', async () => {
      prisma.controlledVocabulary.findMany.mockResolvedValue(mockCvRecords);

      const result = await service.getApplicationTypes();

      expect(result).toEqual(mockCvRecords);
      expect(prisma.controlledVocabulary.findMany).toHaveBeenCalledWith({
        where: { vocabularyName: 'application-type' },
        orderBy: { code: 'asc' },
      });
    });

    it('should return cached value if available', async () => {
      cache.get.mockResolvedValue(mockCvRecords);

      const result = await service.getApplicationTypes();

      expect(result).toEqual(mockCvRecords);
      expect(prisma.controlledVocabulary.findMany).not.toHaveBeenCalled();
    });

    it('should cache result with 24h TTL', async () => {
      prisma.controlledVocabulary.findMany.mockResolvedValue(mockCvRecords);

      await service.getApplicationTypes();

      expect(cache.set).toHaveBeenCalledWith('cv:application-types', mockCvRecords, 86400);
    });
  });

  describe('getProductTypes', () => {
    it('should return product types from database', async () => {
      prisma.controlledVocabulary.findMany.mockResolvedValue(mockProductTypes);

      const result = await service.getProductTypes();

      expect(result).toEqual(mockProductTypes);
      expect(prisma.controlledVocabulary.findMany).toHaveBeenCalledWith({
        where: { vocabularyName: 'product-type' },
        orderBy: { code: 'asc' },
      });
    });

    it('should return cached value if available', async () => {
      cache.get.mockResolvedValue(mockProductTypes);

      const result = await service.getProductTypes();

      expect(result).toEqual(mockProductTypes);
      expect(prisma.controlledVocabulary.findMany).not.toHaveBeenCalled();
    });
  });

  describe('getRegulatoryActivityTypes', () => {
    it('should return all RAT types when no appType filter', async () => {
      prisma.controlledVocabulary.findMany.mockResolvedValue(mockRatRecords);

      const result = await service.getRegulatoryActivityTypes();

      expect(result).toEqual(mockRatRecords);
      expect(prisma.controlledVocabulary.findMany).toHaveBeenCalledWith({
        where: { vocabularyName: 'regulatory-activity-type' },
        orderBy: { code: 'asc' },
      });
    });

    it('should filter RAT types by appType dependency', async () => {
      prisma.cvDependency.findMany.mockResolvedValue([
        { regulatoryActivityTypeCode: 'cnrat1' },
        { regulatoryActivityTypeCode: 'cnrat2' },
      ]);
      prisma.controlledVocabulary.findMany.mockResolvedValue(mockRatRecords);

      const result = await service.getRegulatoryActivityTypes('cnapt1');

      expect(result).toEqual(mockRatRecords);
      expect(prisma.cvDependency.findMany).toHaveBeenCalledWith({
        where: { applicationTypeCode: 'cnapt1' },
        select: { regulatoryActivityTypeCode: true },
        distinct: ['regulatoryActivityTypeCode'],
      });
      expect(prisma.controlledVocabulary.findMany).toHaveBeenCalledWith({
        where: {
          vocabularyName: 'regulatory-activity-type',
          code: { in: ['cnrat1', 'cnrat2'] },
        },
        orderBy: { code: 'asc' },
      });
    });

    it('should use cache key with appType', async () => {
      prisma.cvDependency.findMany.mockResolvedValue([]);
      prisma.controlledVocabulary.findMany.mockResolvedValue([]);

      await service.getRegulatoryActivityTypes('cnapt2');

      expect(cache.get).toHaveBeenCalledWith('cv:rat-types:cnapt2');
    });
  });

  describe('getSequenceTypes', () => {
    it('should return all SQT types when no filters', async () => {
      prisma.controlledVocabulary.findMany.mockResolvedValue(mockSqtRecords);

      const result = await service.getSequenceTypes();

      expect(result).toEqual(mockSqtRecords);
      expect(prisma.controlledVocabulary.findMany).toHaveBeenCalledWith({
        where: { vocabularyName: 'sequence-type' },
        orderBy: { code: 'asc' },
      });
    });

    it('should filter SQT types by appType and ratType dependency', async () => {
      prisma.cvDependency.findMany.mockResolvedValue([
        { sequenceTypeCode: 'cnsqt1' },
        { sequenceTypeCode: null },
      ]);
      prisma.controlledVocabulary.findMany.mockResolvedValue([mockSqtRecords[0]]);

      const result = await service.getSequenceTypes('cnapt1', 'cnrat1');

      expect(result).toEqual([mockSqtRecords[0]]);
      expect(prisma.cvDependency.findMany).toHaveBeenCalledWith({
        where: {
          applicationTypeCode: 'cnapt1',
          regulatoryActivityTypeCode: 'cnrat1',
        },
        select: { sequenceTypeCode: true },
      });
    });

    it('should filter out null sequence type codes', async () => {
      prisma.cvDependency.findMany.mockResolvedValue([
        { sequenceTypeCode: 'cnsqt1' },
        { sequenceTypeCode: null },
      ]);
      prisma.controlledVocabulary.findMany.mockResolvedValue([mockSqtRecords[0]]);

      await service.getSequenceTypes('cnapt1', 'cnrat1');

      expect(prisma.controlledVocabulary.findMany).toHaveBeenCalledWith({
        where: {
          vocabularyName: 'sequence-type',
          code: { in: ['cnsqt1'] },
        },
        orderBy: { code: 'asc' },
      });
    });

    it('should use cache key with both filters', async () => {
      prisma.cvDependency.findMany.mockResolvedValue([]);
      prisma.controlledVocabulary.findMany.mockResolvedValue([]);

      await service.getSequenceTypes('cnapt1', 'cnrat2');

      expect(cache.get).toHaveBeenCalledWith('cv:sqt-types:cnapt1:cnrat2');
    });
  });

  describe('validateDependency', () => {
    it('should return true when dependency exists (appType + ratType)', async () => {
      prisma.cvDependency.count.mockResolvedValue(3);

      const result = await service.validateDependency('cnapt1', 'cnrat1');

      expect(result).toBe(true);
      expect(prisma.cvDependency.count).toHaveBeenCalledWith({
        where: {
          applicationTypeCode: 'cnapt1',
          regulatoryActivityTypeCode: 'cnrat1',
        },
      });
    });

    it('should return false when dependency does not exist', async () => {
      prisma.cvDependency.count.mockResolvedValue(0);

      const result = await service.validateDependency('cnapt1', 'cnrat3');

      expect(result).toBe(false);
    });

    it('should include sqtType in query when provided', async () => {
      prisma.cvDependency.count.mockResolvedValue(1);

      await service.validateDependency('cnapt1', 'cnrat1', 'cnsqt1');

      expect(prisma.cvDependency.count).toHaveBeenCalledWith({
        where: {
          applicationTypeCode: 'cnapt1',
          regulatoryActivityTypeCode: 'cnrat1',
          sequenceTypeCode: 'cnsqt1',
        },
      });
    });

    it('should return false for invalid triple', async () => {
      prisma.cvDependency.count.mockResolvedValue(0);

      const result = await service.validateDependency('cnapt1', 'cnrat1', 'cnsqt4');

      expect(result).toBe(false);
    });
  });

  describe('getCvVersion', () => {
    it('should return version string for existing CV code', async () => {
      prisma.controlledVocabulary.findFirst.mockResolvedValue({
        version: '1.0',
      });

      const result = await service.getCvVersion('application-type', 'cnapt1');

      expect(result).toBe('1.0');
      expect(prisma.controlledVocabulary.findFirst).toHaveBeenCalledWith({
        where: { vocabularyName: 'application-type', code: 'cnapt1' },
        orderBy: { validFrom: 'desc' },
      });
    });

    it('should return "1.0" when CV code not found', async () => {
      prisma.controlledVocabulary.findFirst.mockResolvedValue(null);

      const result = await service.getCvVersion('application-type', 'unknown');

      expect(result).toBe('1.0');
    });
  });

  describe('seedControlledVocabularies', () => {
    it('should skip seeding when data already exists', async () => {
      prisma.controlledVocabulary.count.mockResolvedValue(19);

      await service.seedControlledVocabularies();

      expect(prisma.controlledVocabulary.create).not.toHaveBeenCalled();
      expect(prisma.cvDependency.create).not.toHaveBeenCalled();
    });
  });
});
