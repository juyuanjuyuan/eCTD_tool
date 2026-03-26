import { ValidatorService, ValidationItemInput } from './validator.service';
import { Md5Service } from './md5.service';
import { ValidationSeverity } from '@prisma/client';

// ==================== Mock Setup ====================

const mockPrisma = {
  sequence: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
  },
  sequenceNode: {
    findFirst: jest.fn(),
  },
  validationReport: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
  },
  ctdCompletenessRule: {
    findMany: jest.fn(),
  },
  cvDependency: {
    findFirst: jest.fn(),
  },
  fileAttachment: {
    findUnique: jest.fn(),
  },
};

/** Helper to build a minimal sequence with sensible defaults */
function buildSequence(overrides: any = {}) {
  return {
    id: 'seq1',
    sequenceNumber: '0000',
    sequenceTypeCode: 'cnsqt1',
    sequenceTypeVersion: '1.0',
    contactName: '张三',
    contactPhone: '010-12345678',
    contactEmail: 'test@example.com',
    description: '首次提交',
    regulatoryActivityId: 'ra1',
    regulatoryActivity: {
      id: 'ra1',
      applicationId: 'app1',
      regulatoryActivityTypeCode: 'cnrat1',
      relatedSequence: '0000',
      application: {
        id: 'app1',
        applicationNumber: 'x202600001',
        applicationTypeCode: 'cnapt2',
        productTypeCode: 'cnprt1',
        productNumber: '2026000001',
      },
      sequences: [{ id: 'seq1', sequenceNumber: '0000' }],
    },
    sequenceNodes: [],
    ...overrides,
  };
}

function buildLeafNode(overrides: any = {}) {
  return {
    id: 'node1',
    isLeaf: true,
    operation: 'NEW',
    ctdSectionNumber: '2.3',
    title: '质量综述',
    elementName: 'm2-3-qos',
    status: 'COMPLETED',
    parentId: null,
    templateNodeId: 'tpl1',
    templateNode: { module: 2, requiresStf: false, elementName: 'm2-3-qos', allowsExtension: false, ctdSectionNumber: '2.3', titleZh: '质量综述' },
    fileAttachments: [],
    document: null,
    studyTaggingFile: null,
    children: [],
    substance: undefined,
    manufacturer: undefined,
    productName: undefined,
    dosageForm: undefined,
    indication: undefined,
    ...overrides,
  };
}

describe('ValidatorService', () => {
  let service: ValidatorService;
  let md5Service: Md5Service;

  beforeEach(() => {
    md5Service = new Md5Service();
    service = new ValidatorService(mockPrisma as any, md5Service);
    jest.clearAllMocks();

    // Default mocks
    mockPrisma.validationReport.create.mockResolvedValue({ id: 'report1' });
    mockPrisma.sequence.update.mockResolvedValue({});
    mockPrisma.ctdCompletenessRule.findMany.mockResolvedValue([]);
    mockPrisma.cvDependency.findFirst.mockResolvedValue({ id: 'dep1', sequenceTypeCode: null });
    mockPrisma.sequence.findMany.mockResolvedValue([]);
  });

  // ==================== validate: sequence not found ====================

  describe('validate - sequence not found', () => {
    it('should return error when sequence does not exist', async () => {
      mockPrisma.sequence.findUnique.mockResolvedValue(null);

      const result = await service.validate('nonexistent');
      expect(result.isPassed).toBe(false);
      expect(result.totalErrors).toBe(1);
      expect(result.items[0].ruleCode).toBe('0.0');
    });
  });

  // ==================== Category 1: Basic Identification ====================

  describe('validate - Category 1: Basic Identification', () => {
    it('should produce INFO items for file count, size, and empty sections', async () => {
      const seq = buildSequence({
        sequenceNodes: [
          buildLeafNode({
            fileAttachments: [{ fileSize: 1024, originalName: 'test.pdf', fileType: 'pdf' }],
          }),
          buildLeafNode({
            id: 'node2',
            status: 'EMPTY',
            operation: null,
            fileAttachments: [],
          }),
        ],
      });
      mockPrisma.sequence.findUnique.mockResolvedValue(seq);

      const result = await service.validate('seq1');

      const infoItems = result.items.filter((i) => i.severity === ValidationSeverity.INFO);
      expect(infoItems.length).toBeGreaterThanOrEqual(3);

      const fileCountItem = infoItems.find((i) => i.ruleCode === '1.1');
      expect(fileCountItem).toBeDefined();
      expect(fileCountItem!.description).toContain('1 个文件');

      const emptyItem = infoItems.find((i) => i.ruleCode === '1.3');
      expect(emptyItem).toBeDefined();
      expect(emptyItem!.description).toContain('1 个空缺');
    });
  });

  // ==================== Category 2: File/Folder Validation ====================

  describe('validate - Category 2: File Structure', () => {
    it('should flag files exceeding 200MB', async () => {
      const seq = buildSequence({
        sequenceNodes: [
          buildLeafNode({
            fileAttachments: [{
              fileSize: 201 * 1024 * 1024,
              fileType: 'pdf',
              originalName: 'big.pdf',
              storedName: 'big.pdf',
              ectdRelativePath: 'm2/23-qos/big.pdf',
            }],
          }),
        ],
      });
      mockPrisma.sequence.findUnique.mockResolvedValue(seq);

      const result = await service.validate('seq1');
      const error = result.items.find((i) => i.ruleCode === '2.2');
      expect(error).toBeDefined();
      expect(error!.severity).toBe(ValidationSeverity.ERROR);
    });

    it('should flag invalid file extensions (ERROR per CDE 2.4)', async () => {
      const seq = buildSequence({
        sequenceNodes: [
          buildLeafNode({
            fileAttachments: [{
              fileSize: 1024,
              fileType: 'docx',
              originalName: 'doc.docx',
              storedName: 'doc.docx',
              ectdRelativePath: 'm2/23-qos/doc.docx',
            }],
          }),
        ],
      });
      mockPrisma.sequence.findUnique.mockResolvedValue(seq);

      const result = await service.validate('seq1');
      const error = result.items.find((i) => i.ruleCode === '2.4');
      expect(error).toBeDefined();
      expect(error!.severity).toBe(ValidationSeverity.ERROR);
    });

    it('should flag non-compliant file names (uppercase)', async () => {
      const seq = buildSequence({
        sequenceNodes: [
          buildLeafNode({
            fileAttachments: [{
              fileSize: 1024,
              fileType: 'pdf',
              originalName: 'Report.pdf',
              storedName: 'Report',
              ectdRelativePath: 'm2/23-qos/Report.pdf',
            }],
          }),
        ],
      });
      mockPrisma.sequence.findUnique.mockResolvedValue(seq);

      const result = await service.validate('seq1');
      const error = result.items.find((i) => i.ruleCode === '2.5' && i.description.includes('命名'));
      expect(error).toBeDefined();
    });

    it('should flag paths exceeding 180 characters', async () => {
      const longPath = 'm2/23-qos/' + 'a'.repeat(175) + '.pdf';
      const seq = buildSequence({
        sequenceNodes: [
          buildLeafNode({
            fileAttachments: [{
              fileSize: 1024,
              fileType: 'pdf',
              originalName: 'test.pdf',
              storedName: 'test',
              ectdRelativePath: longPath,
            }],
          }),
        ],
      });
      mockPrisma.sequence.findUnique.mockResolvedValue(seq);

      const result = await service.validate('seq1');
      const error = result.items.find((i) => i.ruleCode === '2.5' && i.description.includes('180'));
      expect(error).toBeDefined();
    });

    it('should flag non-4-digit sequence folder name (2.9)', async () => {
      const seq = buildSequence({ sequenceNumber: '01', sequenceNodes: [] });
      mockPrisma.sequence.findUnique.mockResolvedValue(seq);

      const result = await service.validate('seq1');
      const error = result.items.find((i) => i.ruleCode === '2.9');
      expect(error).toBeDefined();
    });

    it('should pass for valid files', async () => {
      const seq = buildSequence({
        sequenceNodes: [
          buildLeafNode({
            fileAttachments: [{
              fileSize: 1024,
              fileType: 'pdf',
              originalName: 'report.pdf',
              storedName: 'report',
              ectdRelativePath: 'm2/23-qos/report.pdf',
            }],
          }),
        ],
      });
      mockPrisma.sequence.findUnique.mockResolvedValue(seq);

      const result = await service.validate('seq1');
      const fileErrors = result.items.filter(
        (i) => i.ruleCategory === '文件/文件夹' && i.severity === ValidationSeverity.ERROR,
      );
      expect(fileErrors).toHaveLength(0);
    });
  });

  // ==================== Category 3: ICH Backbone Validation ====================

  describe('validate - Category 3: ICH Backbone', () => {
    it('should flag non-NEW operations on first sequence (3.10)', async () => {
      const seq = buildSequence({
        sequenceNumber: '0000',
        sequenceNodes: [
          buildLeafNode({ operation: 'REPLACE' }),
        ],
      });
      mockPrisma.sequence.findUnique.mockResolvedValue(seq);

      const result = await service.validate('seq1');
      const error = result.items.find((i) => i.ruleCode === '3.10');
      expect(error).toBeDefined();
      expect(error!.severity).toBe(ValidationSeverity.ERROR);
    });

    it('should allow all NEW operations on first sequence', async () => {
      const seq = buildSequence({
        sequenceNumber: '0000',
        sequenceNodes: [
          buildLeafNode({
            operation: 'NEW',
            fileAttachments: [{ ectdRelativePath: 'm2/23-qos/report.pdf', md5Checksum: 'abc', fileType: 'pdf' }],
          }),
        ],
      });
      mockPrisma.sequence.findUnique.mockResolvedValue(seq);

      const result = await service.validate('seq1');
      const backboneErrors = result.items.filter(
        (i) => i.ruleCategory === 'ICH骨架文件' && i.severity === ValidationSeverity.ERROR,
      );
      expect(backboneErrors).toHaveLength(0);
    });

    it('should flag DELETE operations that have file attachments (3.8)', async () => {
      const seq = buildSequence({
        sequenceNodes: [
          buildLeafNode({
            operation: 'DELETE',
            fileAttachments: [{ ectdRelativePath: 'm2/23-qos/report.pdf' }],
          }),
        ],
      });
      mockPrisma.sequence.findUnique.mockResolvedValue(seq);

      const result = await service.validate('seq1');
      const error = result.items.find((i) => i.ruleCode === '3.8');
      expect(error).toBeDefined();
    });

    it('should flag non-delete leaves without files (3.7)', async () => {
      const seq = buildSequence({
        sequenceNodes: [
          buildLeafNode({ operation: 'NEW', fileAttachments: [] }),
        ],
      });
      mockPrisma.sequence.findUnique.mockResolvedValue(seq);

      const result = await service.validate('seq1');
      const error = result.items.find((i) => i.ruleCode === '3.7');
      expect(error).toBeDefined();
    });

    it('should flag paths with backslashes (3.12)', async () => {
      const seq = buildSequence({
        sequenceNodes: [
          buildLeafNode({
            fileAttachments: [{ ectdRelativePath: 'm2\\23-qos\\report.pdf', md5Checksum: 'abc', fileType: 'pdf' }],
          }),
        ],
      });
      mockPrisma.sequence.findUnique.mockResolvedValue(seq);

      const result = await service.validate('seq1');
      const error = result.items.find((i) => i.ruleCode === '3.12');
      expect(error).toBeDefined();
    });

    it('should flag absolute paths (3.12)', async () => {
      const seq = buildSequence({
        sequenceNodes: [
          buildLeafNode({
            fileAttachments: [{ ectdRelativePath: '/m2/23-qos/report.pdf', md5Checksum: 'abc', fileType: 'pdf' }],
          }),
        ],
      });
      mockPrisma.sequence.findUnique.mockResolvedValue(seq);

      const result = await service.validate('seq1');
      const error = result.items.find((i) => i.ruleCode === '3.12');
      expect(error).toBeDefined();
    });

    it('should flag replace without prior node (3.11)', async () => {
      const seq = buildSequence({
        sequenceNumber: '0001',
        sequenceNodes: [
          buildLeafNode({
            operation: 'REPLACE',
            fileAttachments: [{ ectdRelativePath: 'm2/23-qos/report.pdf', md5Checksum: 'abc', fileType: 'pdf' }],
          }),
        ],
      });
      mockPrisma.sequence.findUnique.mockResolvedValue(seq);
      mockPrisma.sequence.findMany.mockResolvedValue([{ id: 'seq0', sequenceNumber: '0000' }]);
      mockPrisma.sequenceNode.findFirst.mockResolvedValue(null); // no prior node

      const result = await service.validate('seq1');
      const error = result.items.find((i) => i.ruleCode === '3.11');
      expect(error).toBeDefined();
    });

    it('should flag empty leaf title (3.18)', async () => {
      const seq = buildSequence({
        sequenceNodes: [
          buildLeafNode({
            title: '',
            fileAttachments: [{ ectdRelativePath: 'm2/23-qos/report.pdf', fileType: 'pdf' }],
          }),
        ],
      });
      mockPrisma.sequence.findUnique.mockResolvedValue(seq);

      const result = await service.validate('seq1');
      const error = result.items.find((i) => i.ruleCode === '3.18');
      expect(error).toBeDefined();
      expect(error!.severity).toBe(ValidationSeverity.ERROR);
    });

    it('should warn about leaf title with leading/trailing spaces (3.20)', async () => {
      const seq = buildSequence({
        sequenceNodes: [
          buildLeafNode({
            title: ' 质量综述 ',
            fileAttachments: [{ ectdRelativePath: 'm2/23-qos/report.pdf', fileType: 'pdf' }],
          }),
        ],
      });
      mockPrisma.sequence.findUnique.mockResolvedValue(seq);

      const result = await service.validate('seq1');
      const warning = result.items.find((i) => i.ruleCode === '3.20');
      expect(warning).toBeDefined();
      expect(warning!.severity).toBe(ValidationSeverity.WARNING);
    });

    it('should warn about append on non-STF files (3.23)', async () => {
      const seq = buildSequence({
        sequenceNumber: '0001',
        sequenceNodes: [
          buildLeafNode({
            operation: 'APPEND',
            templateNode: { module: 2, requiresStf: false, elementName: 'm2-qos', allowsExtension: false, ctdSectionNumber: '2.3', titleZh: '质量综述' },
            fileAttachments: [{ ectdRelativePath: 'm2/23-qos/report.pdf', fileType: 'pdf' }],
          }),
        ],
      });
      mockPrisma.sequence.findUnique.mockResolvedValue(seq);
      mockPrisma.sequence.findMany.mockResolvedValue([{ id: 'seq0', sequenceNumber: '0000' }]);
      mockPrisma.sequenceNode.findFirst.mockResolvedValue({ operation: 'NEW' });

      const result = await service.validate('seq1');
      const warning = result.items.find((i) => i.ruleCode === '3.23');
      expect(warning).toBeDefined();
    });

    it('should flag node extension for non-biologics (3.16)', async () => {
      const seq = buildSequence({
        sequenceNodes: [
          buildLeafNode({
            templateNode: { module: 3, requiresStf: false, elementName: 'm3-2-r-ext-1', allowsExtension: true, ctdSectionNumber: '3.2.R', titleZh: '扩展' },
            fileAttachments: [{ ectdRelativePath: 'm3/32-body-data/ext.pdf', fileType: 'pdf' }],
          }),
        ],
      });
      // productTypeCode is cnprt1 (not biologics)
      mockPrisma.sequence.findUnique.mockResolvedValue(seq);

      const result = await service.validate('seq1');
      const error = result.items.find((i) => i.ruleCode === '3.16');
      expect(error).toBeDefined();
      expect(error!.severity).toBe(ValidationSeverity.ERROR);
    });
  });

  // ==================== Category 4.1: Regional Backbone ====================

  describe('validate - Category 4.1: Regional Backbone', () => {
    it('should flag non-NEW module 1 operations on first sequence (4.1.11)', async () => {
      const seq = buildSequence({
        sequenceNumber: '0000',
        sequenceNodes: [
          buildLeafNode({
            operation: 'REPLACE',
            templateNode: { module: 1, requiresStf: false, elementName: 'cn-1-2', allowsExtension: false, ctdSectionNumber: '1.2', titleZh: '申请表' },
            ctdSectionNumber: '1.2',
            elementName: 'cn-1-2',
          }),
        ],
      });
      mockPrisma.sequence.findUnique.mockResolvedValue(seq);

      const result = await service.validate('seq1');
      const error = result.items.find((i) => i.ruleCode === '4.1.11');
      expect(error).toBeDefined();
    });

    it('should flag 说明函 with non-NEW operation (4.1.14)', async () => {
      const seq = buildSequence({
        sequenceNumber: '0001',
        sequenceNodes: [
          buildLeafNode({
            operation: 'REPLACE',
            templateNode: { module: 1, requiresStf: false, elementName: 'cn-1-0', allowsExtension: false, ctdSectionNumber: 'cn-1-0', titleZh: '说明函' },
            ctdSectionNumber: 'cn-1-0',
            elementName: 'cn-1-0',
            fileAttachments: [{ ectdRelativePath: 'm1/cn-cover-letter.pdf', fileType: 'pdf' }],
          }),
        ],
      });
      mockPrisma.sequence.findUnique.mockResolvedValue(seq);
      mockPrisma.sequence.findMany.mockResolvedValue([{ id: 'seq0', sequenceNumber: '0000' }]);
      mockPrisma.sequenceNode.findFirst.mockResolvedValue({ operation: 'NEW' });

      const result = await service.validate('seq1');
      const error = result.items.find((i) => i.ruleCode === '4.1.14');
      expect(error).toBeDefined();
    });

    it('should flag node extension in regional backbone (4.1.16)', async () => {
      const seq = buildSequence({
        sequenceNodes: [
          buildLeafNode({
            templateNode: { module: 1, requiresStf: false, elementName: 'cn-1-ext-1', allowsExtension: false, ctdSectionNumber: '1.ext', titleZh: '扩展' },
            elementName: 'cn-1-ext-1',
            fileAttachments: [{ ectdRelativePath: 'm1/ext.pdf', fileType: 'pdf' }],
          }),
        ],
      });
      mockPrisma.sequence.findUnique.mockResolvedValue(seq);

      const result = await service.validate('seq1');
      const error = result.items.find((i) => i.ruleCode === '4.1.16');
      expect(error).toBeDefined();
    });
  });

  // ==================== Category 4.2: Envelope Information ====================

  describe('validate - Category 4.2: Envelope Information', () => {
    it('should flag invalid application number format (4.2.1)', async () => {
      const seq = buildSequence({ sequenceNodes: [] });
      seq.regulatoryActivity.application.applicationNumber = 'INVALID';
      mockPrisma.sequence.findUnique.mockResolvedValue(seq);

      const result = await service.validate('seq1');
      const error = result.items.find((i) => i.ruleCode === '4.2.1');
      expect(error).toBeDefined();
    });

    it('should accept valid application number (x + 9 digits)', async () => {
      const seq = buildSequence({ sequenceNodes: [] });
      mockPrisma.sequence.findUnique.mockResolvedValue(seq);

      const result = await service.validate('seq1');
      const error = result.items.find((i) => i.ruleCode === '4.2.1');
      expect(error).toBeUndefined();
    });

    it('should flag invalid application type code (4.2.2)', async () => {
      const seq = buildSequence({ sequenceNodes: [] });
      seq.regulatoryActivity.application.applicationTypeCode = 'invalid';
      mockPrisma.sequence.findUnique.mockResolvedValue(seq);

      const result = await service.validate('seq1');
      const error = result.items.find((i) => i.ruleCode === '4.2.2');
      expect(error).toBeDefined();
    });

    it('should flag invalid product type code (4.2.3)', async () => {
      const seq = buildSequence({ sequenceNodes: [] });
      seq.regulatoryActivity.application.productTypeCode = 'invalid';
      mockPrisma.sequence.findUnique.mockResolvedValue(seq);

      const result = await service.validate('seq1');
      const error = result.items.find((i) => i.ruleCode === '4.2.3');
      expect(error).toBeDefined();
    });

    it('should flag empty product number (4.2.4)', async () => {
      const seq = buildSequence({ sequenceNodes: [] });
      seq.regulatoryActivity.application.productNumber = '';
      mockPrisma.sequence.findUnique.mockResolvedValue(seq);

      const result = await service.validate('seq1');
      const error = result.items.find((i) => i.ruleCode === '4.2.4');
      expect(error).toBeDefined();
    });

    it('should flag invalid regulatory activity type (4.2.6)', async () => {
      const seq = buildSequence({ sequenceNodes: [] });
      seq.regulatoryActivity.regulatoryActivityTypeCode = 'invalid';
      mockPrisma.sequence.findUnique.mockResolvedValue(seq);

      const result = await service.validate('seq1');
      const error = result.items.find((i) => i.ruleCode === '4.2.6');
      expect(error).toBeDefined();
    });

    it('should flag invalid sequence type code (4.2.8)', async () => {
      const seq = buildSequence({ sequenceNodes: [] });
      seq.sequenceTypeCode = 'invalid';
      mockPrisma.sequence.findUnique.mockResolvedValue(seq);

      const result = await service.validate('seq1');
      const error = result.items.find((i) => i.ruleCode === '4.2.8');
      expect(error).toBeDefined();
    });

    it('should flag invalid sequence number format (4.2.7)', async () => {
      const seq = buildSequence({ sequenceNodes: [] });
      seq.sequenceNumber = '01'; // not 4 digits
      mockPrisma.sequence.findUnique.mockResolvedValue(seq);

      const result = await service.validate('seq1');
      const error = result.items.find((i) => i.ruleCode === '4.2.7');
      expect(error).toBeDefined();
    });

    it('should flag empty description (4.2.9)', async () => {
      const seq = buildSequence({ sequenceNodes: [], description: '' });
      mockPrisma.sequence.findUnique.mockResolvedValue(seq);

      const result = await service.validate('seq1');
      const error = result.items.find((i) => i.ruleCode === '4.2.9');
      expect(error).toBeDefined();
    });

    it('should flag missing contact info', async () => {
      const seq = buildSequence({ sequenceNodes: [], contactName: '', contactPhone: '' });
      mockPrisma.sequence.findUnique.mockResolvedValue(seq);

      const result = await service.validate('seq1');
      const error = result.items.find((i) => i.ruleCode === '4.2.9' && i.description.includes('联系人'));
      expect(error).toBeDefined();
    });

    it('should flag related-sequence > current sequence (4.2.5)', async () => {
      const seq = buildSequence({ sequenceNodes: [] });
      seq.regulatoryActivity.relatedSequence = '0005';
      mockPrisma.sequence.findUnique.mockResolvedValue(seq);

      const result = await service.validate('seq1');
      const error = result.items.find((i) => i.ruleCode === '4.2.5');
      expect(error).toBeDefined();
    });

    it('should flag depend-apt-rat-sqt mismatch (4.2.10)', async () => {
      const seq = buildSequence({ sequenceNodes: [] });
      mockPrisma.sequence.findUnique.mockResolvedValue(seq);
      mockPrisma.cvDependency.findFirst.mockResolvedValue(null); // no dependency found

      const result = await service.validate('seq1');
      const error = result.items.find((i) => i.ruleCode === '4.2.10');
      expect(error).toBeDefined();
    });

    it('should pass with all valid envelope info', async () => {
      const seq = buildSequence({ sequenceNodes: [] });
      mockPrisma.sequence.findUnique.mockResolvedValue(seq);

      const result = await service.validate('seq1');
      const envelopeErrors = result.items.filter(
        (i) => i.ruleCode.startsWith('4.2.') && i.severity === ValidationSeverity.ERROR,
      );
      expect(envelopeErrors).toHaveLength(0);
    });
  });

  // ==================== Category 4.3: Completeness Rules ====================

  describe('validate - Category 4.3: Completeness', () => {
    it('should flag missing REQUIRED sections', async () => {
      const seq = buildSequence({
        sequenceNodes: [
          buildLeafNode({
            id: 'node1',
            templateNodeId: 'tpl1',
            status: 'EMPTY',
            fileAttachments: [],
            document: null,
          }),
        ],
      });
      mockPrisma.sequence.findUnique.mockResolvedValue(seq);
      mockPrisma.ctdCompletenessRule.findMany.mockResolvedValue([
        {
          templateNodeId: 'tpl1',
          ruleType: 'REQUIRED',
          severity: 'ERROR',
          templateNode: { elementName: 'test', ctdSectionNumber: '1.2', titleZh: '申请表' },
        },
      ]);

      const result = await service.validate('seq1');
      const error = result.items.find(
        (i) => i.ruleCode === '4.3' && i.description.includes('必填章节缺失'),
      );
      expect(error).toBeDefined();
    });

    it('should not flag completed REQUIRED sections', async () => {
      const seq = buildSequence({
        sequenceNodes: [
          buildLeafNode({
            id: 'node1',
            templateNodeId: 'tpl1',
            status: 'COMPLETED',
            fileAttachments: [{ id: 'f1' }],
          }),
        ],
      });
      mockPrisma.sequence.findUnique.mockResolvedValue(seq);
      mockPrisma.ctdCompletenessRule.findMany.mockResolvedValue([
        {
          templateNodeId: 'tpl1',
          ruleType: 'REQUIRED',
          severity: 'ERROR',
          templateNode: { elementName: 'test', ctdSectionNumber: '1.2', titleZh: '申请表' },
        },
      ]);

      const result = await service.validate('seq1');
      const errors = result.items.filter(
        (i) => i.ruleCode === '4.3' && i.description.includes('必填章节缺失'),
      );
      expect(errors).toHaveLength(0);
    });

    it('should flag non-empty FORBIDDEN sections', async () => {
      const seq = buildSequence({
        sequenceNodes: [
          buildLeafNode({
            id: 'node1',
            templateNodeId: 'tpl1',
            status: 'COMPLETED',
          }),
        ],
      });
      mockPrisma.sequence.findUnique.mockResolvedValue(seq);
      mockPrisma.ctdCompletenessRule.findMany.mockResolvedValue([
        {
          templateNodeId: 'tpl1',
          ruleType: 'FORBIDDEN',
          severity: 'WARNING',
          templateNode: { elementName: 'test', ctdSectionNumber: '5.3', titleZh: '临床研究' },
        },
      ]);

      const result = await service.validate('seq1');
      const warning = result.items.find(
        (i) => i.ruleCode === '4.3' && i.description.includes('不应包含'),
      );
      expect(warning).toBeDefined();
    });
  });

  // ==================== Category 5: STF Validation ====================

  describe('validate - Category 5: STF', () => {
    it('should flag missing STF on requiresStf nodes (5.1)', async () => {
      const seq = buildSequence({
        sequenceNodes: [
          buildLeafNode({
            templateNode: { module: 4, requiresStf: true, elementName: 'm4-study', allowsExtension: false, ctdSectionNumber: '4.2.1', titleZh: '研究报告' },
            ctdSectionNumber: '4.2.1',
            studyTaggingFile: null,
            fileAttachments: [{ ectdRelativePath: 'm4/42-stud-rep/study.pdf', fileType: 'pdf' }],
          }),
        ],
      });
      mockPrisma.sequence.findUnique.mockResolvedValue(seq);

      const result = await service.validate('seq1');
      const error = result.items.find((i) => i.ruleCode === '5.1');
      expect(error).toBeDefined();
      expect(error!.severity).toBe(ValidationSeverity.ERROR);
    });

    it('should warn about empty study-id (5.6)', async () => {
      const seq = buildSequence({
        sequenceNodes: [
          buildLeafNode({
            templateNode: { module: 4, requiresStf: true, elementName: 'm4-study', allowsExtension: false, ctdSectionNumber: '4.2.1', titleZh: '研究报告' },
            ctdSectionNumber: '4.2.1',
            studyTaggingFile: { studyTitle: 'Study Title', studyId: '', categories: {}, fileTags: [] },
            fileAttachments: [{ ectdRelativePath: 'm4/42-stud-rep/study.pdf', fileType: 'pdf' }],
          }),
        ],
      });
      mockPrisma.sequence.findUnique.mockResolvedValue(seq);

      const result = await service.validate('seq1');
      const warning = result.items.find((i) => i.ruleCode === '5.6');
      expect(warning).toBeDefined();
    });

    it('should warn about STF title mismatch with leaf title (5.7)', async () => {
      const seq = buildSequence({
        sequenceNodes: [
          buildLeafNode({
            title: '研究报告A',
            templateNode: { module: 4, requiresStf: true, elementName: 'm4-study', allowsExtension: false, ctdSectionNumber: '4.2.1', titleZh: '研究报告' },
            ctdSectionNumber: '4.2.1',
            studyTaggingFile: { studyTitle: 'Different Title', studyId: 'ST001', categories: { type: 'test' }, fileTags: [{ name: 'tag1' }] },
            fileAttachments: [{ ectdRelativePath: 'm4/42-stud-rep/study.pdf', fileType: 'pdf' }],
          }),
        ],
      });
      mockPrisma.sequence.findUnique.mockResolvedValue(seq);

      const result = await service.validate('seq1');
      const warning = result.items.find((i) => i.ruleCode === '5.7');
      expect(warning).toBeDefined();
    });

    it('should warn about STF on non-STF nodes (5.14)', async () => {
      const seq = buildSequence({
        sequenceNodes: [
          buildLeafNode({
            templateNode: { module: 2, requiresStf: false, elementName: 'm2-qos', allowsExtension: false, ctdSectionNumber: '2.3', titleZh: '质量综述' },
            studyTaggingFile: { studyTitle: 'Test', studyId: 'ST001', categories: {}, fileTags: [] },
          }),
        ],
      });
      mockPrisma.sequence.findUnique.mockResolvedValue(seq);

      const result = await service.validate('seq1');
      const warning = result.items.find((i) => i.ruleCode === '5.14');
      expect(warning).toBeDefined();
      expect(warning!.severity).toBe(ValidationSeverity.WARNING);
    });

    it('should skip STF validation for DELETE operation', async () => {
      const seq = buildSequence({
        sequenceNodes: [
          buildLeafNode({
            operation: 'DELETE',
            templateNode: { module: 4, requiresStf: true, elementName: 'm4-study', allowsExtension: false, ctdSectionNumber: '4.2.1', titleZh: '研究报告' },
            ctdSectionNumber: '4.2.1',
            studyTaggingFile: null,
            fileAttachments: [],
          }),
        ],
      });
      mockPrisma.sequence.findUnique.mockResolvedValue(seq);

      const result = await service.validate('seq1');
      const stfError = result.items.find((i) => i.ruleCode === '5.1');
      expect(stfError).toBeUndefined();
    });

    it('should flag STF in 5.3.7 section (5.16)', async () => {
      const seq = buildSequence({
        sequenceNodes: [
          buildLeafNode({
            templateNode: { module: 5, requiresStf: true, elementName: 'm5-3-7', allowsExtension: false, ctdSectionNumber: '5.3.7', titleZh: '病例报告表' },
            ctdSectionNumber: '5.3.7',
            studyTaggingFile: { studyTitle: 'CRF', studyId: 'ST001', categories: { type: 'test' }, fileTags: [{ name: 'tag1' }] },
            fileAttachments: [{ ectdRelativePath: 'm5/53-clin-stud-rep/crf.pdf', fileType: 'pdf' }],
          }),
        ],
      });
      mockPrisma.sequence.findUnique.mockResolvedValue(seq);

      const result = await service.validate('seq1');
      const error = result.items.find((i) => i.ruleCode === '5.16');
      expect(error).toBeDefined();
      expect(error!.severity).toBe(ValidationSeverity.ERROR);
    });
  });

  // ==================== Category 6: PDF Analysis ====================

  describe('validate - Category 6: PDF Analysis', () => {
    function buildPdfNode(pdfAnalysis: any) {
      return buildLeafNode({
        fileAttachments: [{
          fileSize: 1024,
          fileType: 'pdf',
          storedName: 'report.pdf',
          ectdRelativePath: 'm2/23-qos/report.pdf',
          pdfAnalysis,
        }],
      });
    }

    it('should warn about invalid PDF version (6.16 - WARNING)', async () => {
      const seq = buildSequence({
        sequenceNodes: [
          buildPdfNode({
            pdfVersion: '2.0',
            isEncrypted: false,
            hasJavascript: false,
            hasExternalLinks: false,
            hasMultimedia: false,
            pageCount: 3,
            hasBookmarks: false,
            hasAttachments: false,
            fontsEmbedded: true,
            isTextSearchable: true,
          }),
        ],
      });
      mockPrisma.sequence.findUnique.mockResolvedValue(seq);

      const result = await service.validate('seq1');
      const warning = result.items.find((i) => i.ruleCode === '6.16');
      expect(warning).toBeDefined();
      expect(warning!.severity).toBe(ValidationSeverity.WARNING);
    });

    it('should accept valid PDF versions (1.4-1.7)', async () => {
      for (const ver of ['1.4', '1.5', '1.6', '1.7']) {
        const seq = buildSequence({
          sequenceNodes: [
            buildPdfNode({
              pdfVersion: ver,
              isEncrypted: false,
              hasJavascript: false,
              hasExternalLinks: false,
              hasMultimedia: false,
              pageCount: 3,
              hasBookmarks: false,
              hasAttachments: false,
              fontsEmbedded: true,
              isTextSearchable: true,
            }),
          ],
        });
        mockPrisma.sequence.findUnique.mockResolvedValue(seq);
        mockPrisma.validationReport.create.mockResolvedValue({ id: `report-${ver}` });

        const result = await service.validate('seq1');
        const warning = result.items.find((i) => i.ruleCode === '6.16');
        expect(warning).toBeUndefined();
      }
    });

    it('should flag encrypted PDF (6.19)', async () => {
      const seq = buildSequence({
        sequenceNodes: [
          buildPdfNode({
            pdfVersion: '1.7',
            isEncrypted: true,
            hasJavascript: false,
            hasExternalLinks: false,
            hasMultimedia: false,
            pageCount: 3,
            hasBookmarks: false,
            hasAttachments: false,
            fontsEmbedded: true,
            isTextSearchable: true,
          }),
        ],
      });
      mockPrisma.sequence.findUnique.mockResolvedValue(seq);

      const result = await service.validate('seq1');
      const error = result.items.find((i) => i.ruleCode === '6.19');
      expect(error).toBeDefined();
    });

    it('should warn about PDF with JavaScript (6.24)', async () => {
      const seq = buildSequence({
        sequenceNodes: [
          buildPdfNode({
            pdfVersion: '1.7',
            isEncrypted: false,
            hasJavascript: true,
            hasExternalLinks: false,
            hasMultimedia: false,
            pageCount: 3,
            hasBookmarks: false,
            hasAttachments: false,
            fontsEmbedded: true,
            isTextSearchable: true,
          }),
        ],
      });
      mockPrisma.sequence.findUnique.mockResolvedValue(seq);

      const result = await service.validate('seq1');
      const warning = result.items.find((i) => i.ruleCode === '6.24');
      expect(warning).toBeDefined();
      expect(warning!.severity).toBe(ValidationSeverity.WARNING);
    });

    it('should flag PDF with external links (6.10)', async () => {
      const seq = buildSequence({
        sequenceNodes: [
          buildPdfNode({
            pdfVersion: '1.7',
            isEncrypted: false,
            hasJavascript: false,
            hasExternalLinks: true,
            hasMultimedia: false,
            pageCount: 3,
            hasBookmarks: false,
            hasAttachments: false,
            fontsEmbedded: true,
            isTextSearchable: true,
          }),
        ],
      });
      mockPrisma.sequence.findUnique.mockResolvedValue(seq);

      const result = await service.validate('seq1');
      const error = result.items.find((i) => i.ruleCode === '6.10');
      expect(error).toBeDefined();
      expect(error!.severity).toBe(ValidationSeverity.ERROR);
    });

    it('should warn about PDF with multimedia (6.24)', async () => {
      const seq = buildSequence({
        sequenceNodes: [
          buildPdfNode({
            pdfVersion: '1.7',
            isEncrypted: false,
            hasJavascript: false,
            hasExternalLinks: false,
            hasMultimedia: true,
            pageCount: 3,
            hasBookmarks: false,
            hasAttachments: false,
            fontsEmbedded: true,
            isTextSearchable: true,
          }),
        ],
      });
      mockPrisma.sequence.findUnique.mockResolvedValue(seq);

      const result = await service.validate('seq1');
      const warning = result.items.find((i) => i.ruleCode === '6.24');
      expect(warning).toBeDefined();
    });

    it('should flag PDF >5 pages without bookmarks (6.23)', async () => {
      const seq = buildSequence({
        sequenceNodes: [
          buildPdfNode({
            pdfVersion: '1.7',
            isEncrypted: false,
            hasJavascript: false,
            hasExternalLinks: false,
            hasMultimedia: false,
            pageCount: 10,
            hasBookmarks: false,
            hasAttachments: false,
            fontsEmbedded: true,
            isTextSearchable: true,
          }),
        ],
      });
      mockPrisma.sequence.findUnique.mockResolvedValue(seq);

      const result = await service.validate('seq1');
      const error = result.items.find((i) => i.ruleCode === '6.23');
      expect(error).toBeDefined();
    });

    it('should not flag PDF ≤5 pages without bookmarks', async () => {
      const seq = buildSequence({
        sequenceNodes: [
          buildPdfNode({
            pdfVersion: '1.7',
            isEncrypted: false,
            hasJavascript: false,
            hasExternalLinks: false,
            hasMultimedia: false,
            pageCount: 5,
            hasBookmarks: false,
            hasAttachments: false,
            fontsEmbedded: true,
            isTextSearchable: true,
          }),
        ],
      });
      mockPrisma.sequence.findUnique.mockResolvedValue(seq);

      const result = await service.validate('seq1');
      const error = result.items.find((i) => i.ruleCode === '6.23');
      expect(error).toBeUndefined();
    });

    it('should warn about bookmarks without inherit zoom (6.8)', async () => {
      const seq = buildSequence({
        sequenceNodes: [
          buildPdfNode({
            pdfVersion: '1.7',
            isEncrypted: false,
            hasJavascript: false,
            hasExternalLinks: false,
            hasMultimedia: false,
            pageCount: 10,
            hasBookmarks: true,
            bookmarkZoomInherit: false,
            hasAttachments: false,
            fontsEmbedded: true,
            isTextSearchable: true,
          }),
        ],
      });
      mockPrisma.sequence.findUnique.mockResolvedValue(seq);

      const result = await service.validate('seq1');
      const warning = result.items.find((i) => i.ruleCode === '6.8');
      expect(warning).toBeDefined();
      expect(warning!.severity).toBe(ValidationSeverity.WARNING);
    });

    it('should flag PDF with attachments (6.17)', async () => {
      const seq = buildSequence({
        sequenceNodes: [
          buildPdfNode({
            pdfVersion: '1.7',
            isEncrypted: false,
            hasJavascript: false,
            hasExternalLinks: false,
            hasMultimedia: false,
            pageCount: 3,
            hasBookmarks: false,
            hasAttachments: true,
            fontsEmbedded: true,
            isTextSearchable: true,
          }),
        ],
      });
      mockPrisma.sequence.findUnique.mockResolvedValue(seq);

      const result = await service.validate('seq1');
      const error = result.items.find((i) => i.ruleCode === '6.17');
      expect(error).toBeDefined();
    });

    it('should warn about non-embedded fonts (6.26)', async () => {
      const seq = buildSequence({
        sequenceNodes: [
          buildPdfNode({
            pdfVersion: '1.7',
            isEncrypted: false,
            hasJavascript: false,
            hasExternalLinks: false,
            hasMultimedia: false,
            pageCount: 3,
            hasBookmarks: false,
            hasAttachments: false,
            fontsEmbedded: false,
            isTextSearchable: true,
          }),
        ],
      });
      mockPrisma.sequence.findUnique.mockResolvedValue(seq);

      const result = await service.validate('seq1');
      const warning = result.items.find((i) => i.ruleCode === '6.26');
      expect(warning).toBeDefined();
      expect(warning!.severity).toBe(ValidationSeverity.WARNING);
    });

    it('should warn about non-searchable PDF text (6.25)', async () => {
      const seq = buildSequence({
        sequenceNodes: [
          buildPdfNode({
            pdfVersion: '1.7',
            isEncrypted: false,
            hasJavascript: false,
            hasExternalLinks: false,
            hasMultimedia: false,
            pageCount: 3,
            hasBookmarks: false,
            hasAttachments: false,
            fontsEmbedded: true,
            isTextSearchable: false,
          }),
        ],
      });
      mockPrisma.sequence.findUnique.mockResolvedValue(seq);

      const result = await service.validate('seq1');
      const warning = result.items.find((i) => i.ruleCode === '6.25');
      expect(warning).toBeDefined();
    });

    it('should flag unreadable PDF with 0 pages (6.1)', async () => {
      const seq = buildSequence({
        sequenceNodes: [
          buildPdfNode({
            pdfVersion: '1.7',
            isEncrypted: false,
            hasJavascript: false,
            hasExternalLinks: false,
            hasMultimedia: false,
            pageCount: 0,
            hasBookmarks: false,
            hasAttachments: false,
            fontsEmbedded: true,
            isTextSearchable: true,
          }),
        ],
      });
      mockPrisma.sequence.findUnique.mockResolvedValue(seq);

      const result = await service.validate('seq1');
      const error = result.items.find((i) => i.ruleCode === '6.1');
      expect(error).toBeDefined();
      expect(error!.severity).toBe(ValidationSeverity.ERROR);
    });

    it('should pass a fully compliant PDF', async () => {
      const seq = buildSequence({
        sequenceNodes: [
          buildPdfNode({
            pdfVersion: '1.7',
            isEncrypted: false,
            hasJavascript: false,
            hasExternalLinks: false,
            hasMultimedia: false,
            pageCount: 10,
            hasBookmarks: true,
            bookmarkZoomInherit: true,
            hasAttachments: false,
            fontsEmbedded: true,
            isTextSearchable: true,
          }),
        ],
      });
      mockPrisma.sequence.findUnique.mockResolvedValue(seq);

      const result = await service.validate('seq1');
      const pdfErrors = result.items.filter(
        (i) => i.ruleCategory === 'PDF分析' && i.severity === ValidationSeverity.ERROR,
      );
      expect(pdfErrors).toHaveLength(0);
    });
  });

  // ==================== Overall validation result ====================

  describe('validate - overall result', () => {
    it('should mark isPassed=true when no errors', async () => {
      const seq = buildSequence({ sequenceNodes: [] });
      mockPrisma.sequence.findUnique.mockResolvedValue(seq);

      const result = await service.validate('seq1');
      expect(result.isPassed).toBe(true);
      expect(result.totalErrors).toBe(0);
    });

    it('should mark isPassed=false when errors exist', async () => {
      const seq = buildSequence({ sequenceNodes: [], description: '' });
      mockPrisma.sequence.findUnique.mockResolvedValue(seq);

      const result = await service.validate('seq1');
      expect(result.isPassed).toBe(false);
      expect(result.totalErrors).toBeGreaterThan(0);
    });

    it('should persist report to database', async () => {
      const seq = buildSequence({ sequenceNodes: [] });
      mockPrisma.sequence.findUnique.mockResolvedValue(seq);

      await service.validate('seq1');
      expect(mockPrisma.validationReport.create).toHaveBeenCalledTimes(1);
      expect(mockPrisma.sequence.update).toHaveBeenCalledWith({
        where: { id: 'seq1' },
        data: { status: 'VALIDATING' },
      });
    });
  });

  // ==================== getReport / getLatestReport ====================

  describe('getReport', () => {
    it('should query by report ID', async () => {
      mockPrisma.validationReport.findUnique.mockResolvedValue({ id: 'r1', items: [] });
      const result = await service.getReport('r1');
      expect(mockPrisma.validationReport.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'r1' } }),
      );
      expect(result).toBeDefined();
    });
  });

  describe('getLatestReport', () => {
    it('should query by sequence ID with latest first', async () => {
      mockPrisma.validationReport.findFirst.mockResolvedValue({ id: 'r1', items: [] });
      const result = await service.getLatestReport('seq1');
      expect(mockPrisma.validationReport.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { sequenceId: 'seq1' },
          orderBy: { createdAt: 'desc' },
        }),
      );
      expect(result).toBeDefined();
    });
  });
});
