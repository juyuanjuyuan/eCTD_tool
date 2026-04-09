import { Test, TestingModule } from '@nestjs/testing';
import { RegulatoryActivityService } from './regulatory-activity.service';
import { PrismaService } from '../prisma/prisma.service';
import { ControlledVocabularyService } from '../controlled-vocabulary/controlled-vocabulary.service';
import { NotFoundException, BadRequestException } from '@nestjs/common';

describe('RegulatoryActivityService', () => {
  let service: RegulatoryActivityService;
  let prisma: Record<string, any>;
  let cvService: Record<string, any>;

  const mockApplication = {
    id: 'app-1',
    applicationNumber: 'x202600001',
    applicationTypeCode: 'cnapt2',
  };

  const mockRA = {
    id: 'ra-1',
    applicationId: 'app-1',
    regulatoryActivityTypeCode: 'cnrat1',
    regulatoryActivityTypeVersion: '1.0',
    relatedSequence: '0000',
    _count: { sequences: 0 },
  };

  beforeEach(async () => {
    prisma = {
      application: {
        findUnique: jest.fn().mockResolvedValue(mockApplication),
      },
      regulatoryActivity: {
        create: jest.fn().mockResolvedValue(mockRA),
        findMany: jest.fn().mockResolvedValue([mockRA]),
        findUnique: jest.fn().mockResolvedValue(mockRA),
      },
      sequence: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };

    cvService = {
      validateDependency: jest.fn().mockResolvedValue(true),
      getCvVersion: jest.fn().mockResolvedValue('1.0'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RegulatoryActivityService,
        { provide: PrismaService, useValue: prisma },
        { provide: ControlledVocabularyService, useValue: cvService },
      ],
    }).compile();

    service = module.get<RegulatoryActivityService>(RegulatoryActivityService);
  });

  describe('create', () => {
    it('should create regulatory activity', async () => {
      const result = await service.create('app-1', {
        regulatoryActivityTypeCode: 'cnrat1',
      });

      expect(result.regulatoryActivityTypeCode).toBe('cnrat1');
      expect(prisma.regulatoryActivity.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          applicationId: 'app-1',
          regulatoryActivityTypeCode: 'cnrat1',
          relatedSequence: '0000',
        }),
        include: expect.anything(),
      });
    });

    it('should use next global sequence number as relatedSequence', async () => {
      // Under method C, related-sequence marks the starting sequence number of
      // this new RA within the application, which is (max + 1) or 0000 when
      // the application has no sequences yet.
      prisma.sequence.findFirst.mockResolvedValue({ sequenceNumber: '0003' });

      await service.create('app-1', { regulatoryActivityTypeCode: 'cnrat1' });

      expect(prisma.regulatoryActivity.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ relatedSequence: '0004' }),
        include: expect.anything(),
      });
    });

    it('should throw when application not found', async () => {
      prisma.application.findUnique.mockResolvedValue(null);

      await expect(
        service.create('x', { regulatoryActivityTypeCode: 'cnrat1' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw when dependency is invalid', async () => {
      cvService.validateDependency.mockResolvedValue(false);

      await expect(
        service.create('app-1', { regulatoryActivityTypeCode: 'cnrat9' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('findAllByApplication', () => {
    it('should return all regulatory activities', async () => {
      const result = await service.findAllByApplication('app-1');

      expect(result).toHaveLength(1);
      expect(prisma.regulatoryActivity.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { applicationId: 'app-1' },
        }),
      );
    });
  });

  describe('findOne', () => {
    it('should return regulatory activity with relations', async () => {
      const result = await service.findOne('ra-1');

      expect(result.id).toBe('ra-1');
    });

    it('should throw when not found', async () => {
      prisma.regulatoryActivity.findUnique.mockResolvedValue(null);

      await expect(service.findOne('x')).rejects.toThrow(NotFoundException);
    });
  });
});
