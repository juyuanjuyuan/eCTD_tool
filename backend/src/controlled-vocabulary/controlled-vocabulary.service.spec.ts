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

  // ==================== STF Vocabulary ====================

  describe('seedStfVocabularies', () => {
    it('should skip seeding when STF rows already exist', async () => {
      prisma.controlledVocabulary.count.mockResolvedValue(50);

      await service.seedStfVocabularies();

      expect(prisma.controlledVocabulary.count).toHaveBeenCalledWith({
        where: { vocabularyName: { startsWith: 'stf-' } },
      });
      expect(prisma.controlledVocabulary.create).not.toHaveBeenCalled();
    });

    it('should parse valid-values.xml and insert category + file-tag rows', async () => {
      prisma.controlledVocabulary.count.mockResolvedValue(0);
      prisma.controlledVocabulary.create.mockResolvedValue({});

      await service.seedStfVocabularies();

      const createCalls = prisma.controlledVocabulary.create.mock.calls as any[];
      expect(createCalls.length).toBeGreaterThan(0);

      const vocabNames = new Set(
        createCalls.map((c: any) => c[0].data.vocabularyName),
      );

      // 4 categories from valid-values.xml: species, route-of-admin,
      // duration, type-of-control
      expect(vocabNames.has('stf-category-species')).toBe(true);
      expect(vocabNames.has('stf-category-route-of-admin')).toBe(true);
      expect(vocabNames.has('stf-category-duration')).toBe(true);
      expect(vocabNames.has('stf-category-type-of-control')).toBe(true);

      // file-tags mirrored under both m4 and m5
      expect(vocabNames.has('stf-file-tag-m4')).toBe(true);
      expect(vocabNames.has('stf-file-tag-m5')).toBe(true);

      const speciesRows = createCalls.filter(
        (c: any) => c[0].data.vocabularyName === 'stf-category-species',
      );
      // species has 9 ich values in v6 valid-values.xml
      expect(speciesRows.length).toBe(9);
      expect(speciesRows[0][0].data.code).toBeTruthy();
      expect(speciesRows[0][0].data.version).toBe('6.0');
      expect(speciesRows[0][0].data.descriptionEn).toMatch(/^\[ich\] /);

      const m4Rows = createCalls.filter(
        (c: any) => c[0].data.vocabularyName === 'stf-file-tag-m4',
      );
      const m5Rows = createCalls.filter(
        (c: any) => c[0].data.vocabularyName === 'stf-file-tag-m5',
      );
      // file-tag block in valid-values.xml has 97 entries
      expect(m4Rows.length).toBe(97);
      expect(m5Rows.length).toBe(97);
    });

    it('should encode realm into descriptionEn prefix', async () => {
      prisma.controlledVocabulary.count.mockResolvedValue(0);
      prisma.controlledVocabulary.create.mockResolvedValue({});

      await service.seedStfVocabularies();

      const createCalls = prisma.controlledVocabulary.create.mock.calls as any[];
      const durationRow = createCalls.find(
        (c: any) =>
          c[0].data.vocabularyName === 'stf-category-duration' &&
          c[0].data.code === 'short',
      );
      expect(durationRow).toBeDefined();
      expect(durationRow[0].data.descriptionEn).toBe('[us] short');
      expect(durationRow[0].data.descriptionZh).toBe('short');
    });
  });

  describe('getStfCategories', () => {
    it('should group rows by category name with decoded realm', async () => {
      prisma.controlledVocabulary.findMany.mockResolvedValue([
        {
          vocabularyName: 'stf-category-species',
          code: 'mouse',
          descriptionZh: 'mouse',
          descriptionEn: '[ich] mouse',
        },
        {
          vocabularyName: 'stf-category-species',
          code: 'rat',
          descriptionZh: 'rat',
          descriptionEn: '[ich] rat',
        },
        {
          vocabularyName: 'stf-category-duration',
          code: 'short',
          descriptionZh: 'short',
          descriptionEn: '[us] short',
        },
      ]);

      const result = await service.getStfCategories();

      expect(result).toEqual([
        {
          name: 'species',
          values: [
            { value: 'mouse', realm: 'ich' },
            { value: 'rat', realm: 'ich' },
          ],
        },
        {
          name: 'duration',
          values: [{ value: 'short', realm: 'us' }],
        },
      ]);
      expect(prisma.controlledVocabulary.findMany).toHaveBeenCalledWith({
        where: { vocabularyName: { startsWith: 'stf-category-' } },
        orderBy: [{ vocabularyName: 'asc' }, { code: 'asc' }],
      });
    });

    it('should return cached value if available', async () => {
      const cached = [{ name: 'species', values: [] }];
      cache.get.mockResolvedValue(cached);

      const result = await service.getStfCategories();

      expect(result).toEqual(cached);
      expect(prisma.controlledVocabulary.findMany).not.toHaveBeenCalled();
    });

    it('should cache result under cv:stf-categories key', async () => {
      prisma.controlledVocabulary.findMany.mockResolvedValue([]);

      await service.getStfCategories();

      expect(cache.set).toHaveBeenCalledWith('cv:stf-categories', [], 86400);
    });
  });

  describe('getStfFileTags', () => {
    it('should return ICH file-tags for m4 with decoded realm', async () => {
      prisma.controlledVocabulary.findMany.mockResolvedValue([
        {
          vocabularyName: 'stf-file-tag-m4',
          code: 'study-report-body',
          descriptionZh: 'study-report-body',
          descriptionEn: '[ich] study-report-body',
        },
        {
          vocabularyName: 'stf-file-tag-m4',
          code: 'protocol-or-amendment',
          descriptionZh: 'protocol-or-amendment',
          descriptionEn: '[ich] protocol-or-amendment',
        },
      ]);

      const result = await service.getStfFileTags('m4');

      expect(result).toEqual([
        { value: 'study-report-body', realm: 'ich' },
        { value: 'protocol-or-amendment', realm: 'ich' },
      ]);
      expect(prisma.controlledVocabulary.findMany).toHaveBeenCalledWith({
        where: { vocabularyName: 'stf-file-tag-m4' },
        orderBy: { code: 'asc' },
      });
    });

    it('should query m5 with different cache key', async () => {
      prisma.controlledVocabulary.findMany.mockResolvedValue([]);

      await service.getStfFileTags('m5');

      expect(cache.get).toHaveBeenCalledWith('cv:stf-file-tags:m5');
      expect(prisma.controlledVocabulary.findMany).toHaveBeenCalledWith({
        where: { vocabularyName: 'stf-file-tag-m5' },
        orderBy: { code: 'asc' },
      });
    });
  });

  describe('getStfCategoryValues', () => {
    it('should return values for a single category', async () => {
      prisma.controlledVocabulary.findMany.mockResolvedValue([
        {
          vocabularyName: 'stf-category-species',
          code: 'rat',
          descriptionZh: 'rat',
          descriptionEn: '[ich] rat',
        },
        {
          vocabularyName: 'stf-category-species',
          code: 'mouse',
          descriptionZh: 'mouse',
          descriptionEn: '[ich] mouse',
        },
      ]);

      const result = await service.getStfCategoryValues('species');

      expect(result).toEqual([
        { value: 'rat', realm: 'ich' },
        { value: 'mouse', realm: 'ich' },
      ]);
      expect(prisma.controlledVocabulary.findMany).toHaveBeenCalledWith({
        where: { vocabularyName: 'stf-category-species' },
        orderBy: { code: 'asc' },
      });
      expect(cache.set).toHaveBeenCalledWith(
        'cv:stf-category-values:species',
        expect.any(Array),
        86400,
      );
    });
  });
});
