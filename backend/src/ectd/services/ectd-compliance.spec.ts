/**
 * eCTD Compliance Test Matrix
 *
 * Tests the validator across multiple application type × regulatory activity type
 * combinations, lifecycle scenarios, and boundary cases.
 *
 * Covers Plan 8 Stage 1: sections 1.2 (test matrix), 1.3 (lifecycle), 1.4 (boundary).
 */
import { Test, TestingModule } from '@nestjs/testing';
import { ValidatorService } from './validator.service';
import { PrismaService } from '../../prisma/prisma.service';
import { Md5Service } from './md5.service';
import { ValidationSeverity } from '@prisma/client';

// ====================== Test Helpers ======================

function buildApplication(overrides: Partial<any> = {}) {
  return {
    id: 'app-1',
    applicationNumber: 'x202600001',
    applicationTypeCode: 'cnapt2',
    productTypeCode: 'cnprt1',
    productNumber: '2026000001',
    ...overrides,
  };
}

function buildRegulatoryActivity(overrides: Partial<any> = {}) {
  const { application: appOverrides, ...raOverrides } = overrides;
  return {
    id: 'ra-1',
    regulatoryActivityTypeCode: 'cnrat1',
    applicationId: 'app-1',
    relatedSequence: '0000',
    application: buildApplication(appOverrides || {}),
    ...raOverrides,
  };
}

function buildSequence(overrides: Partial<any> = {}) {
  const { regulatoryActivity: raOverrides, ...seqOverrides } = overrides;
  return {
    id: 'seq-1',
    sequenceNumber: '0000',
    sequenceTypeCode: 'cnsqt1',
    status: 'DRAFT',
    contactName: '张三',
    contactPhone: '13800000000',
    contactEmail: 'test@example.com',
    description: '首次提交申报资料',
    relatedSequence: '0000',
    regulatoryActivityId: 'ra-1',
    regulatoryActivity: {
      ...buildRegulatoryActivity(raOverrides || {}),
      sequences: [{ id: 'seq-1', sequenceNumber: '0000' }],
    },
    sequenceNodes: [],
    ...seqOverrides,
  };
}

function buildLeaf(overrides: Partial<any> = {}) {
  return {
    id: `node-${Math.random().toString(36).substr(2, 8)}`,
    isLeaf: true,
    ctdSectionNumber: '2.3.S.1',
    elementName: 'general-properties',
    title: '一般性质',
    operation: 'NEW',
    status: 'COMPLETED',
    parentId: null,
    children: [],
    templateNodeId: 'tmpl-1',
    templateNode: { module: 2, requiresStf: false, elementName: 'general-properties', allowsExtension: false, ctdSectionNumber: '2.3.S.1', titleZh: '一般性质' },
    fileAttachments: [
      {
        id: 'file-1',
        fileSize: 1024 * 1024,
        fileType: 'pdf',
        originalName: 'test.pdf',
        storedName: 'test.pdf',
        ectdRelativePath: 'm2/23-qos/test.pdf',
        pdfAnalysis: {
          pdfVersion: '1.7',
          isEncrypted: false,
          hasJavascript: false,
          hasExternalLinks: false,
          hasMultimedia: false,
          pageCount: 3,
          hasBookmarks: false,
          bookmarkZoomInherit: true,
          hasAttachments: false,
          fontsEmbedded: true,
          isTextSearchable: true,
        },
      },
    ],
    document: null,
    studyTaggingFile: null,
    substance: undefined,
    manufacturer: undefined,
    productName: undefined,
    dosageForm: undefined,
    indication: undefined,
    ...overrides,
  };
}

function buildStfLeaf(overrides: Partial<any> = {}) {
  return buildLeaf({
    ctdSectionNumber: '4.2.1',
    title: '药理学研究',
    elementName: 'pharmacology',
    templateNode: { module: 4, requiresStf: true, elementName: 'pharmacology', allowsExtension: false, ctdSectionNumber: '4.2.1', titleZh: '药理学研究' },
    studyTaggingFile: {
      id: 'stf-1',
      studyTitle: '药理学研究',
      studyId: 'STUDY-001',
      category: 'category-1',
      fileTag: 'file-tag-1',
      categories: { 'cat-1': 'category-1' },
      fileTags: [{ name: 'file-tag-1' }],
    },
    fileAttachments: [
      {
        id: 'file-stf',
        fileSize: 2 * 1024 * 1024,
        fileType: 'pdf',
        originalName: 'study-001.pdf',
        storedName: 'study-001.pdf',
        ectdRelativePath: 'm4/42-stud-rep/study-001.pdf',
        pdfAnalysis: {
          pdfVersion: '1.7',
          isEncrypted: false,
          hasJavascript: false,
          hasExternalLinks: false,
          hasMultimedia: false,
          pageCount: 15,
          hasBookmarks: true,
          bookmarkZoomInherit: true,
          hasAttachments: false,
          fontsEmbedded: true,
          isTextSearchable: true,
        },
      },
    ],
    ...overrides,
  });
}

// ====================== Test Suite ======================

describe('eCTD Compliance Test Matrix', () => {
  let service: ValidatorService;
  let prisma: Record<string, any>;

  beforeEach(async () => {
    prisma = {
      sequence: {
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({}),
      },
      sequenceNode: {
        findFirst: jest.fn(),
      },
      validationReport: {
        create: jest.fn().mockImplementation(({ data }) => ({
          id: 'report-1',
          ...data,
        })),
      },
      ctdCompletenessRule: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      cvDependency: {
        findFirst: jest.fn().mockResolvedValue({ id: 'dep1', sequenceTypeCode: null }),
      },
      fileAttachment: {
        findUnique: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ValidatorService,
        { provide: PrismaService, useValue: prisma },
        { provide: Md5Service, useValue: {} },
      ],
    }).compile();

    service = module.get<ValidatorService>(ValidatorService);
  });

  // ==============================================================
  // 1.2 Application Type × RAT Test Matrix
  // ==============================================================

  describe('Application Type × RAT combinations', () => {
    const combinations = [
      { apt: 'cnapt1', rat: 'cnrat1', desc: '临床试验申请 + 首次申请', prefix: 'x' },
      { apt: 'cnapt2', rat: 'cnrat1', desc: '新药申请 + 首次申请', prefix: 'x' },
      { apt: 'cnapt2', rat: 'cnrat2', desc: '新药申请 + 补充申请', prefix: 'x' },
      { apt: 'cnapt3', rat: 'cnrat1', desc: '仿制药申请 + 首次申请', prefix: 'y' },
      { apt: 'cnapt3', rat: 'cnrat8', desc: '仿制药申请 + 再注册', prefix: 'y' },
      { apt: 'cnapt4', rat: 'cnrat1', desc: '原料药申请 + 首次申请', prefix: 's' },
    ];

    for (const combo of combinations) {
      describe(`${combo.desc} (${combo.apt} + ${combo.rat})`, () => {
        it('should pass validation for valid first submission', async () => {
          const seq = buildSequence({
            regulatoryActivity: {
              regulatoryActivityTypeCode: combo.rat,
              application: {
                applicationTypeCode: combo.apt,
                applicationNumber: `${combo.prefix}202600001`,
              },
            },
            sequenceNodes: [
              buildLeaf({ ctdSectionNumber: '2.3.S.1', templateNodeId: 'tmpl-s1' }),
            ],
          });

          prisma.sequence.findUnique.mockResolvedValue(seq);

          const result = await service.validate('seq-1');

          // Should have no errors related to envelope/CV
          const envelopeErrors = result.items.filter(
            i => i.severity === ValidationSeverity.ERROR &&
            (i.ruleCode.startsWith('4.2') || i.ruleCode === '3.10'),
          );
          expect(envelopeErrors).toHaveLength(0);
        });

        it('should validate CV codes correctly', async () => {
          const seq = buildSequence({
            regulatoryActivity: {
              regulatoryActivityTypeCode: combo.rat,
              application: {
                applicationTypeCode: combo.apt,
                applicationNumber: `${combo.prefix}202600001`,
              },
            },
            sequenceNodes: [],
          });

          prisma.sequence.findUnique.mockResolvedValue(seq);

          const result = await service.validate('seq-1');

          // Application type and RAT should be valid
          const aptError = result.items.find(i => i.ruleCode === '4.2.2');
          const ratError = result.items.find(i => i.ruleCode === '4.2.6');
          expect(aptError).toBeUndefined();
          expect(ratError).toBeUndefined();
        });

        it('should validate file naming rules', async () => {
          const seq = buildSequence({
            regulatoryActivity: {
              regulatoryActivityTypeCode: combo.rat,
              application: {
                applicationTypeCode: combo.apt,
                applicationNumber: `${combo.prefix}202600001`,
              },
            },
            sequenceNodes: [
              buildLeaf({
                fileAttachments: [
                  {
                    id: 'f-1',
                    fileSize: 1024,
                    fileType: 'pdf',
                    originalName: 'compliant-file.pdf',
                    storedName: 'compliant-file.pdf',
                    ectdRelativePath: 'm2/23-qos/compliant-file.pdf',
                    pdfAnalysis: null,
                  },
                ],
              }),
            ],
          });

          prisma.sequence.findUnique.mockResolvedValue(seq);

          const result = await service.validate('seq-1');

          const namingErrors = result.items.filter(i => i.ruleCode === '2.5');
          expect(namingErrors).toHaveLength(0);
        });
      });
    }
  });

  // ==============================================================
  // 1.2 Invalid CV code detection
  // ==============================================================

  describe('Invalid controlled vocabulary detection', () => {
    it('should error on invalid application type code', async () => {
      const seq = buildSequence({
        regulatoryActivity: {
          application: { applicationTypeCode: 'invalid-apt' },
        },
        sequenceNodes: [],
      });
      prisma.sequence.findUnique.mockResolvedValue(seq);

      const result = await service.validate('seq-1');

      expect(result.items.find(i => i.ruleCode === '4.2.2')).toBeDefined();
    });

    it('should error on invalid product type code', async () => {
      const seq = buildSequence({
        regulatoryActivity: {
          application: { productTypeCode: 'invalid-prt' },
        },
        sequenceNodes: [],
      });
      prisma.sequence.findUnique.mockResolvedValue(seq);

      const result = await service.validate('seq-1');

      expect(result.items.find(i => i.ruleCode === '4.2.3')).toBeDefined();
    });

    it('should error on invalid regulatory activity type', async () => {
      const seq = buildSequence({
        regulatoryActivity: {
          regulatoryActivityTypeCode: 'cnrat99',
        },
        sequenceNodes: [],
      });
      prisma.sequence.findUnique.mockResolvedValue(seq);

      const result = await service.validate('seq-1');

      expect(result.items.find(i => i.ruleCode === '4.2.6')).toBeDefined();
    });

    it('should error on invalid sequence type', async () => {
      const seq = buildSequence({
        sequenceTypeCode: 'invalid-sqt',
        sequenceNodes: [],
      });
      prisma.sequence.findUnique.mockResolvedValue(seq);

      const result = await service.validate('seq-1');

      expect(result.items.find(i => i.ruleCode === '4.2.8')).toBeDefined();
    });
  });

  // ==============================================================
  // 1.2 Envelope element validation
  // ==============================================================

  describe('Envelope element validation', () => {
    it('should error on malformed application number', async () => {
      const seq = buildSequence({
        regulatoryActivity: {
          application: { applicationNumber: '123' },
        },
        sequenceNodes: [],
      });
      prisma.sequence.findUnique.mockResolvedValue(seq);

      const result = await service.validate('seq-1');

      expect(result.items.find(i => i.ruleCode === '4.2.1')).toBeDefined();
    });

    it('should error on malformed product number (not 10 digits)', async () => {
      const seq = buildSequence({
        regulatoryActivity: {
          application: { productNumber: '123' },
        },
        sequenceNodes: [],
      });
      prisma.sequence.findUnique.mockResolvedValue(seq);

      const result = await service.validate('seq-1');

      expect(result.items.find(i => i.ruleCode === '4.2.4')).toBeDefined();
    });

    it('should error on malformed sequence number', async () => {
      const seq = buildSequence({
        sequenceNumber: '12',
        sequenceNodes: [],
      });
      prisma.sequence.findUnique.mockResolvedValue(seq);

      const result = await service.validate('seq-1');

      expect(result.items.find(i => i.ruleCode === '4.2.7')).toBeDefined();
    });

    it('should error on missing contact info', async () => {
      const seq = buildSequence({
        contactName: null,
        contactPhone: null,
        contactEmail: null,
        sequenceNodes: [],
      });
      prisma.sequence.findUnique.mockResolvedValue(seq);

      const result = await service.validate('seq-1');

      expect(result.items.find(i => i.ruleCode === '4.2.9')).toBeDefined();
    });

    it('should error on missing description', async () => {
      const seq = buildSequence({
        description: null,
        sequenceNodes: [],
      });
      prisma.sequence.findUnique.mockResolvedValue(seq);

      const result = await service.validate('seq-1');

      expect(result.items.find(i => i.ruleCode === '4.2.9')).toBeDefined();
    });
  });

  // ==============================================================
  // 1.3 Lifecycle Scenario Tests
  // ==============================================================

  describe('Lifecycle scenario: first submission (0000)', () => {
    it('should pass when all operations are NEW', async () => {
      const seq = buildSequence({
        sequenceNumber: '0000',
        sequenceNodes: [
          buildLeaf({ operation: 'NEW', ctdSectionNumber: '2.3.S.1' }),
          buildLeaf({ operation: 'NEW', ctdSectionNumber: '2.3.S.2' }),
        ],
      });
      prisma.sequence.findUnique.mockResolvedValue(seq);

      const result = await service.validate('seq-1');

      const firstSeqErrors = result.items.filter(
        i => i.ruleCode === '3.10' && i.severity === ValidationSeverity.ERROR,
      );
      expect(firstSeqErrors).toHaveLength(0);
    });

    it('should error when first submission has REPLACE operation', async () => {
      const seq = buildSequence({
        sequenceNumber: '0000',
        sequenceNodes: [
          buildLeaf({ operation: 'REPLACE', ctdSectionNumber: '2.3.S.1' }),
        ],
      });
      prisma.sequence.findUnique.mockResolvedValue(seq);

      const result = await service.validate('seq-1');

      const error = result.items.find(i => i.ruleCode === '3.10');
      expect(error).toBeDefined();
      expect(error!.description).toContain('new');
    });

    it('should error when first submission has DELETE operation', async () => {
      const seq = buildSequence({
        sequenceNumber: '0000',
        sequenceNodes: [
          buildLeaf({
            operation: 'DELETE',
            ctdSectionNumber: '2.3.S.1',
            fileAttachments: [],
          }),
        ],
      });
      prisma.sequence.findUnique.mockResolvedValue(seq);

      const result = await service.validate('seq-1');

      const error = result.items.find(i => i.ruleCode === '3.10');
      expect(error).toBeDefined();
    });

    it('should error when module 1 leaf has non-NEW on first submission', async () => {
      const seq = buildSequence({
        sequenceNumber: '0000',
        sequenceNodes: [
          buildLeaf({
            operation: 'REPLACE',
            ctdSectionNumber: '1.2',
            elementName: 'application-form',
            templateNode: { module: 1, requiresStf: false, elementName: 'application-form', allowsExtension: false, ctdSectionNumber: '1.2', titleZh: '申请表' },
          }),
        ],
      });
      prisma.sequence.findUnique.mockResolvedValue(seq);

      const result = await service.validate('seq-1');

      const error = result.items.find(i => i.ruleCode === '4.1.11');
      expect(error).toBeDefined();
    });
  });

  describe('Lifecycle scenario: subsequent submission with REPLACE', () => {
    it('should pass REPLACE when prior node exists', async () => {
      const seq = buildSequence({
        sequenceNumber: '0001',
        sequenceNodes: [
          buildLeaf({ operation: 'REPLACE', ctdSectionNumber: '2.3.S.1' }),
        ],
      });
      prisma.sequence.findUnique.mockResolvedValue(seq);
      prisma.sequence.findMany.mockResolvedValue([{ id: 'seq-0' }]);
      prisma.sequenceNode.findFirst.mockResolvedValue({ id: 'prev-node' });

      const result = await service.validate('seq-1');

      const modifiedFileError = result.items.find(i => i.ruleCode === '3.11');
      expect(modifiedFileError).toBeUndefined();
    });

    it('should error REPLACE when no prior node exists', async () => {
      const seq = buildSequence({
        sequenceNumber: '0001',
        sequenceNodes: [
          buildLeaf({ operation: 'REPLACE', ctdSectionNumber: '2.3.S.1' }),
        ],
      });
      prisma.sequence.findUnique.mockResolvedValue(seq);
      prisma.sequence.findMany.mockResolvedValue([{ id: 'seq-0' }]);
      prisma.sequenceNode.findFirst.mockResolvedValue(null);

      const result = await service.validate('seq-1');

      const error = result.items.find(i => i.ruleCode === '3.11');
      expect(error).toBeDefined();
      expect(error!.description).toContain('被修改文件对象必须存在');
    });
  });

  describe('Lifecycle scenario: DELETE operation', () => {
    it('should error when DELETE has file attachments', async () => {
      const seq = buildSequence({
        sequenceNumber: '0001',
        sequenceNodes: [
          buildLeaf({
            operation: 'DELETE',
            ctdSectionNumber: '2.3.S.1',
            fileAttachments: [{
              id: 'f-1',
              fileSize: 1024,
              fileType: 'pdf',
              storedName: 'test.pdf',
              ectdRelativePath: 'm2/test.pdf',
              pdfAnalysis: null,
            }],
          }),
        ],
      });
      prisma.sequence.findUnique.mockResolvedValue(seq);
      prisma.sequence.findMany.mockResolvedValue([{ id: 'seq-0' }]);
      prisma.sequenceNode.findFirst.mockResolvedValue({ id: 'prev' });

      const result = await service.validate('seq-1');

      const error = result.items.find(i => i.ruleCode === '3.8');
      expect(error).toBeDefined();
      expect(error!.description).toContain('删除');
    });

    it('should pass when DELETE has no file attachments', async () => {
      const seq = buildSequence({
        sequenceNumber: '0001',
        sequenceNodes: [
          buildLeaf({
            operation: 'DELETE',
            ctdSectionNumber: '2.3.S.1',
            fileAttachments: [],
          }),
        ],
      });
      prisma.sequence.findUnique.mockResolvedValue(seq);
      prisma.sequence.findMany.mockResolvedValue([{ id: 'seq-0' }]);
      prisma.sequenceNode.findFirst.mockResolvedValue({ id: 'prev' });

      const result = await service.validate('seq-1');

      const error = result.items.find(i => i.ruleCode === '3.8');
      expect(error).toBeUndefined();
    });
  });

  describe('Lifecycle scenario: non-delete without files', () => {
    it('should error when NEW leaf has no files', async () => {
      const seq = buildSequence({
        sequenceNumber: '0000',
        sequenceNodes: [
          buildLeaf({
            operation: 'NEW',
            ctdSectionNumber: '2.3.S.1',
            fileAttachments: [],
          }),
        ],
      });
      prisma.sequence.findUnique.mockResolvedValue(seq);

      const result = await service.validate('seq-1');

      const error = result.items.find(i => i.ruleCode === '3.7');
      expect(error).toBeDefined();
    });
  });

  // ==============================================================
  // 1.4 Boundary Case Tests
  // ==============================================================

  describe('Boundary: file naming', () => {
    it('should error on files with uppercase or special chars', async () => {
      const seq = buildSequence({
        sequenceNodes: [
          buildLeaf({
            fileAttachments: [{
              id: 'f-bad',
              fileSize: 1024,
              fileType: 'pdf',
              originalName: 'Test File.pdf',
              storedName: 'Test File.pdf',
              ectdRelativePath: 'm2/23-qos/Test File.pdf',
              pdfAnalysis: null,
            }],
          }),
        ],
      });
      prisma.sequence.findUnique.mockResolvedValue(seq);

      const result = await service.validate('seq-1');

      const namingError = result.items.find(i => i.ruleCode === '2.5');
      expect(namingError).toBeDefined();
    });

    it('should pass on compliant file names', async () => {
      const seq = buildSequence({
        sequenceNodes: [
          buildLeaf({
            fileAttachments: [{
              id: 'f-ok',
              fileSize: 1024,
              fileType: 'pdf',
              originalName: 'study-report-001.pdf',
              storedName: 'study-report-001.pdf',
              ectdRelativePath: 'm2/23-qos/study-report-001.pdf',
              pdfAnalysis: null,
            }],
          }),
        ],
      });
      prisma.sequence.findUnique.mockResolvedValue(seq);

      const result = await service.validate('seq-1');

      const namingError = result.items.filter(
        i => i.ruleCode === '2.5' && i.severity === ValidationSeverity.ERROR,
      );
      expect(namingError).toHaveLength(0);
    });
  });

  describe('Boundary: path length', () => {
    it('should error when path exceeds 180 characters', async () => {
      const longPath = 'm2/23-qos/' + 'a'.repeat(171) + '.pdf'; // > 180
      const seq = buildSequence({
        sequenceNodes: [
          buildLeaf({
            fileAttachments: [{
              id: 'f-long',
              fileSize: 1024,
              fileType: 'pdf',
              originalName: 'a'.repeat(64) + '.pdf',
              storedName: 'a'.repeat(64) + '.pdf',
              ectdRelativePath: longPath,
              pdfAnalysis: null,
            }],
          }),
        ],
      });
      prisma.sequence.findUnique.mockResolvedValue(seq);

      const result = await service.validate('seq-1');

      const pathError = result.items.find(
        i => i.ruleCode === '2.5' && i.description.includes('180'),
      );
      expect(pathError).toBeDefined();
    });

    it('should error when single name exceeds 64 characters', async () => {
      const longName = 'a'.repeat(65) + '.pdf';
      const seq = buildSequence({
        sequenceNodes: [
          buildLeaf({
            fileAttachments: [{
              id: 'f-longname',
              fileSize: 1024,
              fileType: 'pdf',
              originalName: longName,
              storedName: longName,
              ectdRelativePath: `m2/${longName}`,
              pdfAnalysis: null,
            }],
          }),
        ],
      });
      prisma.sequence.findUnique.mockResolvedValue(seq);

      const result = await service.validate('seq-1');

      const nameError = result.items.find(
        i => i.ruleCode === '2.5' && i.description.includes('64'),
      );
      expect(nameError).toBeDefined();
    });
  });

  describe('Boundary: file size', () => {
    it('should error when PDF exceeds 200MB', async () => {
      const seq = buildSequence({
        sequenceNodes: [
          buildLeaf({
            fileAttachments: [{
              id: 'f-big',
              fileSize: 201 * 1024 * 1024,
              fileType: 'pdf',
              originalName: 'big.pdf',
              storedName: 'big.pdf',
              ectdRelativePath: 'm2/23-qos/big.pdf',
              pdfAnalysis: null,
            }],
          }),
        ],
      });
      prisma.sequence.findUnique.mockResolvedValue(seq);

      const result = await service.validate('seq-1');

      const sizeError = result.items.find(i => i.ruleCode === '2.2');
      expect(sizeError).toBeDefined();
      expect(sizeError!.detail).toContain('200MB');
    });

    it('should allow XPT files up to 4GB', async () => {
      const seq = buildSequence({
        sequenceNodes: [
          buildLeaf({
            fileAttachments: [{
              id: 'f-xpt',
              fileSize: 500 * 1024 * 1024, // 500MB < 4GB
              fileType: 'xpt',
              originalName: 'data.xpt',
              storedName: 'data.xpt',
              ectdRelativePath: 'm5/52-tab-list/data.xpt',
              pdfAnalysis: null,
            }],
          }),
        ],
      });
      prisma.sequence.findUnique.mockResolvedValue(seq);

      const result = await service.validate('seq-1');

      const sizeError = result.items.find(i => i.ruleCode === '2.2');
      expect(sizeError).toBeUndefined();
    });
  });

  describe('Boundary: path separators', () => {
    it('should error on backslash in file path', async () => {
      const seq = buildSequence({
        sequenceNodes: [
          buildLeaf({
            fileAttachments: [{
              id: 'f-backslash',
              fileSize: 1024,
              fileType: 'pdf',
              originalName: 'test.pdf',
              storedName: 'test.pdf',
              ectdRelativePath: 'm2\\23-qos\\test.pdf',
              pdfAnalysis: null,
            }],
          }),
        ],
      });
      prisma.sequence.findUnique.mockResolvedValue(seq);

      const result = await service.validate('seq-1');

      const pathError = result.items.find(i => i.ruleCode === '3.12');
      expect(pathError).toBeDefined();
    });

    it('should error on absolute path', async () => {
      const seq = buildSequence({
        sequenceNodes: [
          buildLeaf({
            fileAttachments: [{
              id: 'f-abs',
              fileSize: 1024,
              fileType: 'pdf',
              originalName: 'test.pdf',
              storedName: 'test.pdf',
              ectdRelativePath: '/m2/23-qos/test.pdf',
              pdfAnalysis: null,
            }],
          }),
        ],
      });
      prisma.sequence.findUnique.mockResolvedValue(seq);

      const result = await service.validate('seq-1');

      const pathError = result.items.find(i => i.ruleCode === '3.12');
      expect(pathError).toBeDefined();
    });
  });

  // ==============================================================
  // 1.4 PDF Compliance via Validator
  // ==============================================================

  describe('PDF validation rules via validator', () => {
    it('should error on encrypted PDF', async () => {
      const seq = buildSequence({
        sequenceNodes: [
          buildLeaf({
            fileAttachments: [{
              id: 'f-enc',
              fileSize: 1024,
              fileType: 'pdf',
              storedName: 'encrypted.pdf',
              ectdRelativePath: 'm2/23-qos/encrypted.pdf',
              pdfAnalysis: {
                pdfVersion: '1.7',
                isEncrypted: true,
                hasJavascript: false,
                hasExternalLinks: false,
                hasMultimedia: false,
                pageCount: 3,
                hasBookmarks: false,
                bookmarkZoomInherit: true,
                hasAttachments: false,
                fontsEmbedded: true,
              },
            }],
          }),
        ],
      });
      prisma.sequence.findUnique.mockResolvedValue(seq);

      const result = await service.validate('seq-1');

      expect(result.items.find(i => i.ruleCode === '6.19')).toBeDefined();
    });

    it('should error on PDF with JavaScript', async () => {
      const seq = buildSequence({
        sequenceNodes: [
          buildLeaf({
            fileAttachments: [{
              id: 'f-js',
              fileSize: 1024,
              fileType: 'pdf',
              storedName: 'js.pdf',
              ectdRelativePath: 'm2/23-qos/js.pdf',
              pdfAnalysis: {
                pdfVersion: '1.7',
                isEncrypted: false,
                hasJavascript: true,
                hasExternalLinks: false,
                hasMultimedia: false,
                pageCount: 1,
                hasBookmarks: false,
                bookmarkZoomInherit: true,
                hasAttachments: false,
                fontsEmbedded: true,
              },
            }],
          }),
        ],
      });
      prisma.sequence.findUnique.mockResolvedValue(seq);

      const result = await service.validate('seq-1');

      expect(result.items.find(i => i.ruleCode === '6.24')).toBeDefined();
    });

    it('should error on PDF > 5 pages without bookmarks', async () => {
      const seq = buildSequence({
        sequenceNodes: [
          buildLeaf({
            fileAttachments: [{
              id: 'f-nobm',
              fileSize: 1024,
              fileType: 'pdf',
              storedName: 'long.pdf',
              ectdRelativePath: 'm2/23-qos/long.pdf',
              pdfAnalysis: {
                pdfVersion: '1.7',
                isEncrypted: false,
                hasJavascript: false,
                hasExternalLinks: false,
                hasMultimedia: false,
                pageCount: 10,
                hasBookmarks: false,
                bookmarkZoomInherit: true,
                hasAttachments: false,
                fontsEmbedded: true,
              },
            }],
          }),
        ],
      });
      prisma.sequence.findUnique.mockResolvedValue(seq);

      const result = await service.validate('seq-1');

      expect(result.items.find(i => i.ruleCode === '6.23')).toBeDefined();
    });

    it('should error on PDF with external links', async () => {
      const seq = buildSequence({
        sequenceNodes: [
          buildLeaf({
            fileAttachments: [{
              id: 'f-ext',
              fileSize: 1024,
              fileType: 'pdf',
              storedName: 'links.pdf',
              ectdRelativePath: 'm2/23-qos/links.pdf',
              pdfAnalysis: {
                pdfVersion: '1.7',
                isEncrypted: false,
                hasJavascript: false,
                hasExternalLinks: true,
                hasMultimedia: false,
                pageCount: 3,
                hasBookmarks: false,
                bookmarkZoomInherit: true,
                hasAttachments: false,
                fontsEmbedded: true,
              },
            }],
          }),
        ],
      });
      prisma.sequence.findUnique.mockResolvedValue(seq);

      const result = await service.validate('seq-1');

      expect(result.items.find(i => i.ruleCode === '6.10')).toBeDefined();
    });

    it('should error on PDF with multimedia', async () => {
      const seq = buildSequence({
        sequenceNodes: [
          buildLeaf({
            fileAttachments: [{
              id: 'f-mm',
              fileSize: 1024,
              fileType: 'pdf',
              storedName: 'media.pdf',
              ectdRelativePath: 'm2/23-qos/media.pdf',
              pdfAnalysis: {
                pdfVersion: '1.7',
                isEncrypted: false,
                hasJavascript: false,
                hasExternalLinks: false,
                hasMultimedia: true,
                pageCount: 3,
                hasBookmarks: true,
                bookmarkZoomInherit: true,
                hasAttachments: false,
                fontsEmbedded: true,
              },
            }],
          }),
        ],
      });
      prisma.sequence.findUnique.mockResolvedValue(seq);

      const result = await service.validate('seq-1');

      expect(result.items.find(i => i.ruleCode === '6.24')).toBeDefined();
    });

    it('should error on PDF with invalid version', async () => {
      const seq = buildSequence({
        sequenceNodes: [
          buildLeaf({
            fileAttachments: [{
              id: 'f-ver',
              fileSize: 1024,
              fileType: 'pdf',
              storedName: 'old.pdf',
              ectdRelativePath: 'm2/23-qos/old.pdf',
              pdfAnalysis: {
                pdfVersion: '1.3',
                isEncrypted: false,
                hasJavascript: false,
                hasExternalLinks: false,
                hasMultimedia: false,
                pageCount: 3,
                hasBookmarks: false,
                bookmarkZoomInherit: true,
                hasAttachments: false,
                fontsEmbedded: true,
              },
            }],
          }),
        ],
      });
      prisma.sequence.findUnique.mockResolvedValue(seq);

      const result = await service.validate('seq-1');

      expect(result.items.find(i => i.ruleCode === '6.16')).toBeDefined();
    });

    it('should error on PDF with attachments', async () => {
      const seq = buildSequence({
        sequenceNodes: [
          buildLeaf({
            fileAttachments: [{
              id: 'f-att',
              fileSize: 1024,
              fileType: 'pdf',
              storedName: 'attached.pdf',
              ectdRelativePath: 'm2/23-qos/attached.pdf',
              pdfAnalysis: {
                pdfVersion: '1.7',
                isEncrypted: false,
                hasJavascript: false,
                hasExternalLinks: false,
                hasMultimedia: false,
                pageCount: 3,
                hasBookmarks: false,
                bookmarkZoomInherit: true,
                hasAttachments: true,
                fontsEmbedded: true,
              },
            }],
          }),
        ],
      });
      prisma.sequence.findUnique.mockResolvedValue(seq);

      const result = await service.validate('seq-1');

      expect(result.items.find(i => i.ruleCode === '6.17')).toBeDefined();
    });

    it('should warn on unembedded fonts', async () => {
      const seq = buildSequence({
        sequenceNodes: [
          buildLeaf({
            fileAttachments: [{
              id: 'f-font',
              fileSize: 1024,
              fileType: 'pdf',
              storedName: 'nofont.pdf',
              ectdRelativePath: 'm2/23-qos/nofont.pdf',
              pdfAnalysis: {
                pdfVersion: '1.7',
                isEncrypted: false,
                hasJavascript: false,
                hasExternalLinks: false,
                hasMultimedia: false,
                pageCount: 3,
                hasBookmarks: false,
                bookmarkZoomInherit: true,
                hasAttachments: false,
                fontsEmbedded: false,
              },
            }],
          }),
        ],
      });
      prisma.sequence.findUnique.mockResolvedValue(seq);

      const result = await service.validate('seq-1');

      const warning = result.items.find(i => i.ruleCode === '6.26');
      expect(warning).toBeDefined();
      expect(warning!.severity).toBe(ValidationSeverity.WARNING);
    });
  });

  // ==============================================================
  // 1.4 STF Validation
  // ==============================================================

  describe('STF validation', () => {
    it('should error when STF-required node has no STF', async () => {
      const seq = buildSequence({
        sequenceNodes: [
          buildStfLeaf({
            studyTaggingFile: null,
          }),
        ],
      });
      prisma.sequence.findUnique.mockResolvedValue(seq);

      const result = await service.validate('seq-1');

      const stfError = result.items.find(i => i.ruleCode === '5.1');
      expect(stfError).toBeDefined();
    });

    it('should error when STF lacks study title', async () => {
      const seq = buildSequence({
        sequenceNodes: [
          buildStfLeaf({
            studyTaggingFile: {
              studyTitle: null,
              studyId: 'STUDY-001',
            },
          }),
        ],
      });
      prisma.sequence.findUnique.mockResolvedValue(seq);

      const result = await service.validate('seq-1');

      expect(result.items.find(i => i.ruleCode === '5.4')).toBeDefined(); // study title empty
    });

    it('should error when STF lacks study ID', async () => {
      const seq = buildSequence({
        sequenceNodes: [
          buildStfLeaf({
            studyTaggingFile: {
              studyTitle: '研究报告',
              studyId: null,
            },
          }),
        ],
      });
      prisma.sequence.findUnique.mockResolvedValue(seq);

      const result = await service.validate('seq-1');

      expect(result.items.find(i => i.ruleCode === '5.6')).toBeDefined();
    });

    it('should pass when STF has all required fields', async () => {
      const seq = buildSequence({
        sequenceNodes: [
          buildStfLeaf(),
        ],
      });
      prisma.sequence.findUnique.mockResolvedValue(seq);

      const result = await service.validate('seq-1');

      const stfErrors = result.items.filter(
        i => i.ruleCategory === 'STF' && i.severity === ValidationSeverity.ERROR,
      );
      expect(stfErrors).toHaveLength(0);
    });

    it('should warn when non-STF node has STF', async () => {
      const seq = buildSequence({
        sequenceNodes: [
          buildLeaf({
            ctdSectionNumber: '2.3.S.1',
            templateNode: { module: 2, requiresStf: false, elementName: 'general-properties', allowsExtension: false, ctdSectionNumber: '2.3.S.1', titleZh: '一般性质' },
            studyTaggingFile: { studyTitle: 'test', studyId: 'S-1', categories: { 'cat-1': 'v' }, fileTags: [{ name: 'tag-1' }] },
          }),
        ],
      });
      prisma.sequence.findUnique.mockResolvedValue(seq);

      const result = await service.validate('seq-1');

      expect(result.items.find(i => i.ruleCode === '5.14')).toBeDefined();
    });

    it('should warn when non-STF node uses APPEND', async () => {
      const seq = buildSequence({
        sequenceNumber: '0001',
        sequenceNodes: [
          buildLeaf({
            operation: 'APPEND',
            ctdSectionNumber: '2.3.S.1',
            templateNode: { module: 2, requiresStf: false, elementName: 'general-properties', allowsExtension: false, ctdSectionNumber: '2.3.S.1', titleZh: '一般性质' },
          }),
        ],
      });
      prisma.sequence.findUnique.mockResolvedValue(seq);
      prisma.sequence.findMany.mockResolvedValue([{ id: 'seq-0' }]);
      prisma.sequenceNode.findFirst.mockResolvedValue({ id: 'prev' });

      const result = await service.validate('seq-1');

      expect(result.items.find(i => i.ruleCode === '3.23')).toBeDefined();
    });
  });

  // ==============================================================
  // Validation report persistence
  // ==============================================================

  describe('Validation report', () => {
    it('should persist report with correct totals', async () => {
      const seq = buildSequence({
        sequenceNumber: '0000',
        sequenceNodes: [
          buildLeaf({
            operation: 'REPLACE', // error: should be NEW in 0000
            fileAttachments: [],   // error: no files for non-DELETE
          }),
        ],
      });
      prisma.sequence.findUnique.mockResolvedValue(seq);

      const result = await service.validate('seq-1');

      expect(result.totalErrors).toBeGreaterThan(0);
      expect(result.isPassed).toBe(false);
      expect(prisma.validationReport.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          sequenceId: 'seq-1',
          isPassed: false,
          totalErrors: result.totalErrors,
        }),
      });
    });

    it('should return non-existent sequence error', async () => {
      prisma.sequence.findUnique.mockResolvedValue(null);

      const result = await service.validate('nonexistent');

      expect(result.isPassed).toBe(false);
      expect(result.totalErrors).toBe(1);
      expect(result.items[0].ruleCode).toBe('0.0');
    });
  });

  // ==============================================================
  // File extension validation
  // ==============================================================

  describe('File extension validation', () => {
    it('should warn on non-standard file extensions', async () => {
      const seq = buildSequence({
        sequenceNodes: [
          buildLeaf({
            fileAttachments: [{
              id: 'f-doc',
              fileSize: 1024,
              fileType: 'docx',
              originalName: 'test.docx',
              storedName: 'test.docx',
              ectdRelativePath: 'm2/23-qos/test.docx',
              pdfAnalysis: null,
            }],
          }),
        ],
      });
      prisma.sequence.findUnique.mockResolvedValue(seq);

      const result = await service.validate('seq-1');

      const extWarning = result.items.find(i => i.ruleCode === '2.4');
      expect(extWarning).toBeDefined();
      expect(extWarning!.severity).toBe(ValidationSeverity.ERROR);
    });

    it('should not warn on valid extensions (pdf, xml, xpt, txt, xsl)', async () => {
      const validExts = ['pdf', 'xml', 'xpt', 'txt', 'xsl'];
      for (const ext of validExts) {
        const seq = buildSequence({
          sequenceNodes: [
            buildLeaf({
              fileAttachments: [{
                id: `f-${ext}`,
                fileSize: 1024,
                fileType: ext,
                originalName: `test.${ext}`,
                storedName: `test.${ext}`,
                ectdRelativePath: `m2/23-qos/test.${ext}`,
                pdfAnalysis: null,
              }],
            }),
          ],
        });
        prisma.sequence.findUnique.mockResolvedValue(seq);

        const result = await service.validate('seq-1');

        const extWarning = result.items.find(i => i.ruleCode === '2.4');
        expect(extWarning).toBeUndefined();
      }
    });
  });
});
