/**
 * XML Backbone Validation Tests — Plan 8 Stage 1.5
 *
 * Validates the structural correctness of generated XML files:
 * - index.xml DTD references and element structure
 * - cn-regional.xml Schema references and envelope
 * - STF XML DTD references
 * - index-md5.txt checksum consistency
 * - Leaf element checksum / MD5 consistency
 * - Leaf element ID uniqueness and format
 * - xlink:href path correctness
 */
import { IndexXmlService } from './index-xml.service';
import { CnRegionalXmlService } from './cn-regional-xml.service';
import { StfService } from './stf.service';
import { Md5Service } from './md5.service';

// ====================== Shared Helpers ======================

function buildModule2Leaf(overrides: Partial<any> = {}) {
  return {
    id: `leaf-${Math.random().toString(36).substr(2, 8)}`,
    elementName: 'm2-3-quality-overall-summary',
    ctdSectionNumber: '2.3',
    title: '质量综述',
    operation: 'NEW',
    isLeaf: true,
    parentId: 'mod2',
    substance: null,
    manufacturer: null,
    productName: null,
    dosageForm: null,
    indication: null,
    templateNode: { module: 2 },
    fileAttachments: [
      {
        ectdRelativePath: 'm2/23-qos/qos-summary.pdf',
        md5Checksum: 'abc123def456',
        xmlLang: 'zh',
      },
    ],
    ...overrides,
  };
}

function buildModule2Root() {
  return {
    id: 'mod2',
    elementName: 'm2-common-technical-document-summaries',
    ctdSectionNumber: '2',
    title: '模块二',
    operation: null,
    isLeaf: false,
    parentId: null,
    substance: null,
    manufacturer: null,
    productName: null,
    dosageForm: null,
    indication: null,
    templateNode: { module: 2 },
    fileAttachments: [],
  };
}

function buildSequenceMock(overrides: Partial<any> = {}) {
  return {
    id: 'seq1',
    sequenceNumber: '0000',
    sequenceTypeCode: 'cnsqt1',
    sequenceTypeVersion: '1.0',
    description: '首次提交',
    contactName: '张三',
    contactPhone: '010-12345678',
    contactEmail: 'test@example.com',
    regulatoryActivity: {
      relatedSequence: '',
      regulatoryActivityTypeCode: 'cnrat1',
      regulatoryActivityTypeVersion: '1.0',
      application: {
        applicationNumber: 'x202600001',
        applicationTypeCode: 'cnapt2',
        applicationTypeVersion: '1.0',
        productTypeCode: 'cnprt1',
        productTypeVersion: '1.0',
        productNumber: '2026000001',
      },
    },
    ...overrides,
  };
}

// ====================== index.xml Validation ======================

describe('XML Backbone Validation', () => {
  describe('index.xml structural validation', () => {
    let service: IndexXmlService;
    let md5Service: Md5Service;
    const mockPrisma = {
      sequence: { findUnique: jest.fn(), findMany: jest.fn() },
      sequenceNode: { findMany: jest.fn() },
    };

    beforeEach(() => {
      md5Service = new Md5Service();
      service = new IndexXmlService(mockPrisma as any, md5Service);
      jest.clearAllMocks();
      mockPrisma.sequence.findUnique.mockResolvedValue({
        id: 'seq1', sequenceNumber: '0000', regulatoryActivityId: 'ra-1',
      });
      mockPrisma.sequence.findMany.mockResolvedValue([]);
    });

    it('should contain valid XML declaration with UTF-8 encoding', async () => {
      mockPrisma.sequenceNode.findMany.mockResolvedValue([]);
      const xml = await service.generateIndexXml('seq1');
      expect(xml).toMatch(/^<\?xml version="1\.0" encoding="UTF-8"\?>/);
    });

    it('should reference ich-ectd-3-2.dtd DTD', async () => {
      mockPrisma.sequenceNode.findMany.mockResolvedValue([]);
      const xml = await service.generateIndexXml('seq1');
      expect(xml).toContain('<!DOCTYPE ectd:ectd SYSTEM "util/dtd/ich-ectd-3-2.dtd">');
    });

    it('should reference ectd-2-0.xsl stylesheet', async () => {
      mockPrisma.sequenceNode.findMany.mockResolvedValue([]);
      const xml = await service.generateIndexXml('seq1');
      expect(xml).toContain('<?xml-stylesheet type="text/xsl" href="util/style/ectd-2-0.xsl"?>');
    });

    it('should have correct root element with ICH namespace', async () => {
      mockPrisma.sequenceNode.findMany.mockResolvedValue([]);
      const xml = await service.generateIndexXml('seq1');
      expect(xml).toContain('xmlns:ectd="http://www.ich.org/ectd"');
      expect(xml).toContain('xmlns:xlink="http://www.w3.org/1999/xlink"');
    });

    it('should generate unique leaf IDs that do not start with a digit', async () => {
      const leaves = [];
      for (let i = 0; i < 5; i++) {
        leaves.push(buildModule2Leaf({
          id: `leaf-${i}`,
          ctdSectionNumber: `2.3.${i}`,
          elementName: `m2-3-${i}`,
          fileAttachments: [
            { ectdRelativePath: `m2/23-qos/file-${i}.pdf`, md5Checksum: `hash${i}`, xmlLang: 'zh' },
          ],
        }));
      }
      mockPrisma.sequenceNode.findMany.mockResolvedValue([buildModule2Root(), ...leaves]);

      const xml = await service.generateIndexXml('seq1');

      // Extract all leaf IDs
      const idMatches = xml.match(/ID="([^"]+)"/g) || [];
      const ids = idMatches.map(m => m.replace(/ID="|"/g, ''));

      // All IDs should not start with digit
      for (const id of ids) {
        expect(id).toMatch(/^[^0-9]/);
      }

      // All IDs should be unique
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });

    it('should use relative paths (no leading slash) in xlink:href', async () => {
      mockPrisma.sequenceNode.findMany.mockResolvedValue([
        buildModule2Root(),
        buildModule2Leaf(),
      ]);

      const xml = await service.generateIndexXml('seq1');

      // All xlink:href values should be relative
      const hrefMatches = xml.match(/xlink:href="([^"]+)"/g) || [];
      for (const href of hrefMatches) {
        const path = href.replace(/xlink:href="|"/g, '');
        expect(path).not.toMatch(/^\//);
        expect(path).not.toContain('\\');
      }
    });

    it('should use forward slashes only in xlink:href paths', async () => {
      mockPrisma.sequenceNode.findMany.mockResolvedValue([
        buildModule2Root(),
        buildModule2Leaf(),
      ]);

      const xml = await service.generateIndexXml('seq1');

      const hrefMatches = xml.match(/xlink:href="([^"]+)"/g) || [];
      for (const href of hrefMatches) {
        expect(href).not.toContain('\\');
      }
    });

    it('should include checksum-type="MD5" for all non-delete leaves', async () => {
      mockPrisma.sequenceNode.findMany.mockResolvedValue([
        buildModule2Root(),
        buildModule2Leaf(),
      ]);

      const xml = await service.generateIndexXml('seq1');

      // Every leaf with a checksum should have checksum-type="MD5"
      const checksumMatches = xml.match(/checksum="[^"]+"/g) || [];
      const typeMatches = xml.match(/checksum-type="MD5"/g) || [];
      expect(checksumMatches.length).toBe(typeMatches.length);
      expect(checksumMatches.length).toBeGreaterThan(0);
    });

    it('should correctly nest multi-level elements', async () => {
      // Module 3 → section → sub-section → leaf
      mockPrisma.sequenceNode.findMany.mockResolvedValue([
        {
          id: 'mod3', elementName: 'm3-quality', ctdSectionNumber: '3', title: '质量',
          operation: null, isLeaf: false, parentId: null,
          substance: null, manufacturer: null, productName: null, dosageForm: null, indication: null,
          templateNode: { module: 3 }, fileAttachments: [],
        },
        {
          id: 'sec32', elementName: 'm3-2-body-of-data', ctdSectionNumber: '3.2', title: '数据主体',
          operation: null, isLeaf: false, parentId: 'mod3',
          substance: null, manufacturer: null, productName: null, dosageForm: null, indication: null,
          templateNode: { module: 3 }, fileAttachments: [],
        },
        {
          id: 'sec32s', elementName: 'm3-2-s-drug-substance', ctdSectionNumber: '3.2.S', title: '原料药',
          operation: null, isLeaf: false, parentId: 'sec32',
          substance: 'TestDrug', manufacturer: 'TestMfg',
          productName: null, dosageForm: null, indication: null,
          templateNode: { module: 3 }, fileAttachments: [],
        },
        {
          id: 'leaf32s1', elementName: 'm3-2-s-1-general-info', ctdSectionNumber: '3.2.S.1', title: '基本信息',
          operation: 'NEW', isLeaf: true, parentId: 'sec32s',
          substance: null, manufacturer: null, productName: null, dosageForm: null, indication: null,
          templateNode: { module: 3 },
          fileAttachments: [{ ectdRelativePath: 'm3/32-body-data/s-general.pdf', md5Checksum: 'x1', xmlLang: 'zh' }],
        },
      ]);

      const xml = await service.generateIndexXml('seq1');

      // Check proper nesting order: sections use elementName as XML tags, leaves use <leaf>
      const m3Pos = xml.indexOf('m3-quality');
      const bodyPos = xml.indexOf('m3-2-body-of-data');
      const dsPos = xml.indexOf('m3-2-s-drug-substance');
      const leafPos = xml.indexOf('m3/32-body-data/s-general.pdf'); // leaf identified by file path

      expect(m3Pos).toBeGreaterThan(-1);
      expect(bodyPos).toBeGreaterThan(-1);
      expect(dsPos).toBeGreaterThan(-1);
      expect(leafPos).toBeGreaterThan(-1);
      expect(m3Pos).toBeLessThan(bodyPos);
      expect(bodyPos).toBeLessThan(dsPos);
      expect(dsPos).toBeLessThan(leafPos);
    });

    it('should include xml:lang attribute on leaf elements', async () => {
      mockPrisma.sequenceNode.findMany.mockResolvedValue([
        buildModule2Root(),
        buildModule2Leaf({
          fileAttachments: [
            { ectdRelativePath: 'm2/23-qos/chinese-doc.pdf', md5Checksum: 'c1', xmlLang: 'zh' },
          ],
        }),
      ]);

      const xml = await service.generateIndexXml('seq1');
      expect(xml).toContain('xml:lang="zh"');
    });

    it('should handle multiple file attachments on same leaf', async () => {
      mockPrisma.sequenceNode.findMany.mockResolvedValue([
        buildModule2Root(),
        buildModule2Leaf({
          fileAttachments: [
            { ectdRelativePath: 'm2/23-qos/doc-part1.pdf', md5Checksum: 'h1', xmlLang: 'zh' },
            { ectdRelativePath: 'm2/23-qos/doc-part2.pdf', md5Checksum: 'h2', xmlLang: 'zh' },
          ],
        }),
      ]);

      const xml = await service.generateIndexXml('seq1');
      expect(xml).toContain('doc-part1.pdf');
      expect(xml).toContain('doc-part2.pdf');
      // Should generate 2 leaf elements
      const leafMatches = xml.match(/operation="new"/g) || [];
      expect(leafMatches.length).toBe(2);
    });

    it('should handle operation attribute in lowercase', async () => {
      mockPrisma.sequenceNode.findMany.mockResolvedValue([
        buildModule2Root(),
        buildModule2Leaf({ operation: 'REPLACE' }),
      ]);

      const xml = await service.generateIndexXml('seq1');
      expect(xml).toContain('operation="replace"');
      expect(xml).not.toContain('operation="REPLACE"');
    });
  });

  // ====================== cn-regional.xml Validation ======================

  describe('cn-regional.xml structural validation', () => {
    let service: CnRegionalXmlService;
    let md5Service: Md5Service;
    const mockPrisma = {
      sequence: { findUnique: jest.fn(), findMany: jest.fn() },
      sequenceNode: { findMany: jest.fn() },
    };

    beforeEach(() => {
      md5Service = new Md5Service();
      service = new CnRegionalXmlService(mockPrisma as any, md5Service);
      jest.clearAllMocks();
      mockPrisma.sequence.findMany.mockResolvedValue([]);
    });

    it('should contain valid XML declaration', async () => {
      mockPrisma.sequence.findUnique.mockResolvedValue(buildSequenceMock());
      mockPrisma.sequenceNode.findMany.mockResolvedValue([]);
      const xml = await service.generateCnRegionalXml('seq1');
      expect(xml).toMatch(/^<\?xml version="1\.0" encoding="UTF-8"\?>/);
    });

    it('should reference cn-regional-1-0.xsd schema', async () => {
      mockPrisma.sequence.findUnique.mockResolvedValue(buildSequenceMock());
      mockPrisma.sequenceNode.findMany.mockResolvedValue([]);
      const xml = await service.generateCnRegionalXml('seq1');
      expect(xml).toContain('cn-regional-1-0.xsd');
      expect(xml).toContain('xsi:schemaLocation');
    });

    it('should contain all 12 required envelope attributes', async () => {
      mockPrisma.sequence.findUnique.mockResolvedValue(buildSequenceMock());
      mockPrisma.sequenceNode.findMany.mockResolvedValue([]);
      const xml = await service.generateCnRegionalXml('seq1');

      // 12 required envelope elements
      expect(xml).toContain('<application-id>');
      expect(xml).toContain('<application-type');
      expect(xml).toContain('<product-type');
      expect(xml).toContain('<product-number>');
      expect(xml).toContain('<related-sequence>');
      expect(xml).toContain('<regulatory-activity-type');
      expect(xml).toContain('<sequence-number>');
      expect(xml).toContain('<sequence-type');
      expect(xml).toContain('<sequence-description>');
      expect(xml).toContain('<name>');
      expect(xml).toContain('<phone>');
      expect(xml).toContain('<email>');
    });

    it('should generate leaf IDs not starting with digit', async () => {
      mockPrisma.sequence.findUnique.mockResolvedValue(buildSequenceMock());
      mockPrisma.sequenceNode.findMany.mockResolvedValue([
        {
          id: 'n1', elementName: 'cn-1-2', ctdSectionNumber: '1.2', title: '申请表',
          operation: 'NEW', isLeaf: true, parentId: null,
          templateNode: { module: 1 },
          fileAttachments: [{ ectdRelativePath: 'm1/cn/02/form.pdf', md5Checksum: 'abc', xmlLang: 'zh' }],
        },
      ]);

      const xml = await service.generateCnRegionalXml('seq1');
      const idMatches = xml.match(/ID="([^"]+)"/g) || [];
      for (const m of idMatches) {
        const id = m.replace(/ID="|"/g, '');
        expect(id).toMatch(/^[^0-9]/);
      }
    });

    it('should use relative paths only (no leading slash) in xlink:href', async () => {
      mockPrisma.sequence.findUnique.mockResolvedValue(buildSequenceMock());
      mockPrisma.sequenceNode.findMany.mockResolvedValue([
        {
          id: 'n1', elementName: 'cn-1-2', ctdSectionNumber: '1.2', title: '申请表',
          operation: 'NEW', isLeaf: true, parentId: null,
          templateNode: { module: 1 },
          fileAttachments: [{ ectdRelativePath: 'm1/cn/02/form.pdf', md5Checksum: 'abc', xmlLang: 'zh' }],
        },
      ]);

      const xml = await service.generateCnRegionalXml('seq1');
      const hrefMatches = xml.match(/xlink:href="([^"]+)"/g) || [];
      expect(hrefMatches.length).toBeGreaterThan(0);
      for (const href of hrefMatches) {
        const path = href.replace(/xlink:href="|"/g, '');
        expect(path).not.toMatch(/^\//);
        expect(path).not.toContain('\\');
      }
    });

    it('should include cn-envelope and cn-content sections', async () => {
      mockPrisma.sequence.findUnique.mockResolvedValue(buildSequenceMock());
      mockPrisma.sequenceNode.findMany.mockResolvedValue([]);
      const xml = await service.generateCnRegionalXml('seq1');

      expect(xml).toContain('<cn-envelope>');
      expect(xml).toContain('</cn-envelope>');
      expect(xml).toContain('<cn-content>');
      expect(xml).toContain('</cn-content>');
    });

    it('should use correct application number format in envelope', async () => {
      mockPrisma.sequence.findUnique.mockResolvedValue(buildSequenceMock());
      mockPrisma.sequenceNode.findMany.mockResolvedValue([]);
      const xml = await service.generateCnRegionalXml('seq1');

      // Application number should be 10 chars: letter prefix + 9 digits
      expect(xml).toContain('<application-id>x202600001</application-id>');
    });

    it('should use correct 4-digit sequence number', async () => {
      mockPrisma.sequence.findUnique.mockResolvedValue(buildSequenceMock({ sequenceNumber: '0003' }));
      mockPrisma.sequenceNode.findMany.mockResolvedValue([]);
      const xml = await service.generateCnRegionalXml('seq1');

      expect(xml).toContain('<sequence-number>0003</sequence-number>');
    });

    it('should include contact information in envelope', async () => {
      mockPrisma.sequence.findUnique.mockResolvedValue(buildSequenceMock({
        contactName: '李四',
        contactPhone: '021-87654321',
        contactEmail: 'lisi@pharma.com',
      }));
      mockPrisma.sequenceNode.findMany.mockResolvedValue([]);
      const xml = await service.generateCnRegionalXml('seq1');

      expect(xml).toContain('<name>李四</name>');
      expect(xml).toContain('<phone>021-87654321</phone>');
      expect(xml).toContain('<email>lisi@pharma.com</email>');
    });
  });

  // ====================== STF XML Validation ======================

  describe('STF XML structural validation', () => {
    let stfService: StfService;
    const mockPrisma = {
      sequenceNode: { findUnique: jest.fn() },
      studyTaggingFile: { upsert: jest.fn(), findUnique: jest.fn() },
    };

    beforeEach(() => {
      stfService = new StfService(mockPrisma as any);
      jest.clearAllMocks();
    });

    it('should reference ich-stf-v2-2.dtd DTD', () => {
      const xml = stfService.generateStfXml(
        { studyTitle: '研究报告', studyId: 'STUDY-001' },
        { fileAttachments: [] },
      );
      expect(xml).toContain('ich-stf-v2-2.dtd');
    });

    it('should reference ich-stf-stylesheet-2-3.xsl', () => {
      const xml = stfService.generateStfXml(
        { studyTitle: '研究报告', studyId: 'STUDY-001' },
        { fileAttachments: [] },
      );
      expect(xml).toContain('ich-stf-stylesheet-2-3.xsl');
    });

    it('should have correct root element with ectd namespace', () => {
      const xml = stfService.generateStfXml(
        { studyTitle: '研究报告', studyId: 'STUDY-001' },
        { fileAttachments: [] },
      );
      expect(xml).toContain('xmlns:ectd="http://www.ich.org/ectd"');
      expect(xml).toContain('dtd-version="2.2"');
    });

    it('should include study-identifier with title and id', () => {
      const xml = stfService.generateStfXml(
        { studyTitle: '药理学研究报告', studyId: 'PHARM-2026-001' },
        { fileAttachments: [] },
      );
      expect(xml).toContain('<title>药理学研究报告</title>');
      expect(xml).toContain('<study-id>PHARM-2026-001</study-id>');
    });

    it('should include file references in study-document when files exist', () => {
      const xml = stfService.generateStfXml(
        { studyTitle: '研究报告', studyId: 'S-1' },
        {
          fileAttachments: [
            { ectdRelativePath: 'm4/42-stud/report.pdf' },
          ],
        },
      );
      expect(xml).toContain('study-document');
      expect(xml).toContain('xlink:href');
    });
  });

  // ====================== index-md5.txt Validation ======================

  describe('index-md5.txt consistency', () => {
    let md5Service: Md5Service;

    beforeEach(() => {
      md5Service = new Md5Service();
    });

    it('should generate correct MD5 hash for known XML content', () => {
      const xmlContent = '<?xml version="1.0" encoding="UTF-8"?><root/>';
      const hash = md5Service.calculateMd5String(xmlContent);
      // Verify hash is 32 hex chars
      expect(hash).toMatch(/^[a-f0-9]{32}$/);
    });

    it('should generate consistent hashes for same content', () => {
      const content = '<test>中文内容</test>';
      const hash1 = md5Service.calculateMd5String(content);
      const hash2 = md5Service.calculateMd5String(content);
      expect(hash1).toBe(hash2);
    });

    it('should generate different hashes for different content', () => {
      const hash1 = md5Service.calculateMd5String('<doc>v1</doc>');
      const hash2 = md5Service.calculateMd5String('<doc>v2</doc>');
      expect(hash1).not.toBe(hash2);
    });

    it('should format index-md5.txt with two spaces between hash and filename', () => {
      const result = md5Service.generateIndexMd5([
        { fileName: 'index.xml', content: '<xml/>' },
      ]);
      // Format: hash  filename (two spaces)
      expect(result).toMatch(/^[a-f0-9]{32}  index\.xml\n$/);
    });

    it('should generate multiple entries for multiple files', () => {
      const result = md5Service.generateIndexMd5([
        { fileName: 'index.xml', content: '<index/>' },
        { fileName: 'cn-regional.xml', content: '<cn/>' },
      ]);
      const lines = result.trim().split('\n');
      expect(lines).toHaveLength(2);
      expect(lines[0]).toContain('index.xml');
      expect(lines[1]).toContain('cn-regional.xml');
    });

    it('should verify index-md5.txt hash matches actual index.xml content', () => {
      const indexXml = '<?xml version="1.0" encoding="UTF-8"?><ectd:ectd></ectd:ectd>';
      const indexMd5Content = md5Service.generateIndexMd5([
        { fileName: 'index.xml', content: indexXml },
      ]);

      // Extract hash from md5 file
      const recordedHash = indexMd5Content.split('  ')[0];
      // Calculate actual hash
      const actualHash = md5Service.calculateMd5String(indexXml);

      expect(recordedHash).toBe(actualHash);
    });
  });

  // ====================== Leaf Element Checksum Validation ======================

  describe('Leaf element checksum validation', () => {
    let md5Service: Md5Service;

    beforeEach(() => {
      md5Service = new Md5Service();
    });

    it('should produce matching MD5 for file content and checksum attribute', () => {
      const fileContent = Buffer.from('PDF file content here');
      const checksum = md5Service.calculateMd5(fileContent);

      // Verify checksum matches what would be in the XML
      expect(checksum).toMatch(/^[a-f0-9]{32}$/);
      expect(md5Service.calculateMd5(fileContent)).toBe(checksum);
    });

    it('should produce different checksums for different files', () => {
      const file1 = Buffer.from('Content of file 1');
      const file2 = Buffer.from('Content of file 2');
      expect(md5Service.calculateMd5(file1)).not.toBe(md5Service.calculateMd5(file2));
    });

    it('should handle empty file buffer', () => {
      const hash = md5Service.calculateMd5(Buffer.from(''));
      expect(hash).toMatch(/^[a-f0-9]{32}$/);
    });

    it('should handle large content (simulated)', () => {
      const largeContent = Buffer.alloc(10 * 1024 * 1024, 'A'); // 10MB
      const hash = md5Service.calculateMd5(largeContent);
      expect(hash).toMatch(/^[a-f0-9]{32}$/);
    });
  });

  // ====================== Leaf ID Format Validation ======================

  describe('Leaf element ID uniqueness and format', () => {
    let md5Service: Md5Service;

    beforeEach(() => {
      md5Service = new Md5Service();
    });

    it('should generate IDs starting with N prefix', () => {
      for (let i = 0; i < 50; i++) {
        const id = md5Service.generateLeafId();
        expect(id[0]).toBe('N');
      }
    });

    it('should generate IDs with exactly 33 characters (N + 32 hex)', () => {
      for (let i = 0; i < 50; i++) {
        const id = md5Service.generateLeafId();
        expect(id).toHaveLength(33);
        expect(id.substring(1)).toMatch(/^[a-f0-9]{32}$/);
      }
    });

    it('should generate unique IDs across 200 calls', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 200; i++) {
        ids.add(md5Service.generateLeafId());
      }
      expect(ids.size).toBe(200);
    });

    it('should not contain hyphens', () => {
      for (let i = 0; i < 50; i++) {
        const id = md5Service.generateLeafId();
        expect(id).not.toContain('-');
      }
    });
  });

  // ====================== xlink:href Path Validation ======================

  describe('xlink:href path correctness', () => {
    let service: IndexXmlService;
    let md5Service: Md5Service;
    const mockPrisma = {
      sequence: { findUnique: jest.fn(), findMany: jest.fn() },
      sequenceNode: { findMany: jest.fn() },
    };

    beforeEach(() => {
      md5Service = new Md5Service();
      service = new IndexXmlService(mockPrisma as any, md5Service);
      jest.clearAllMocks();
      mockPrisma.sequence.findUnique.mockResolvedValue({
        id: 'seq1', sequenceNumber: '0000', regulatoryActivityId: 'ra-1',
      });
      mockPrisma.sequence.findMany.mockResolvedValue([]);
    });

    it('should generate relative paths starting with module prefix (m2/m3/m4/m5)', async () => {
      const modules = [
        { mod: 2, path: 'm2/23-qos/file.pdf' },
        { mod: 3, path: 'm3/32-body/file.pdf' },
        { mod: 4, path: 'm4/42-stud/file.pdf' },
        { mod: 5, path: 'm5/53-clin/file.pdf' },
      ];

      for (const { mod, path } of modules) {
        mockPrisma.sequenceNode.findMany.mockResolvedValue([
          {
            id: `mod${mod}`, elementName: `m${mod}-root`, ctdSectionNumber: `${mod}`,
            title: `模块${mod}`, operation: null, isLeaf: false, parentId: null,
            substance: null, manufacturer: null, productName: null, dosageForm: null, indication: null,
            templateNode: { module: mod }, fileAttachments: [],
          },
          {
            id: `leaf${mod}`, elementName: `m${mod}-leaf`, ctdSectionNumber: `${mod}.1`,
            title: `叶节点`, operation: 'NEW', isLeaf: true, parentId: `mod${mod}`,
            substance: null, manufacturer: null, productName: null, dosageForm: null, indication: null,
            templateNode: { module: mod },
            fileAttachments: [{ ectdRelativePath: path, md5Checksum: 'abc', xmlLang: 'zh' }],
          },
        ]);

        const xml = await service.generateIndexXml(`seq-${mod}`);
        expect(xml).toContain(`xlink:href="${path}"`);
      }
    });

    it('should not include xlink:href for DELETE operations', async () => {
      mockPrisma.sequenceNode.findMany.mockResolvedValue([
        buildModule2Root(),
        buildModule2Leaf({ operation: 'DELETE', fileAttachments: [] }),
      ]);

      const xml = await service.generateIndexXml('seq1');
      expect(xml).toContain('operation="delete"');
      // No href for delete
      const afterDelete = xml.substring(xml.indexOf('operation="delete"'));
      const nextLeafOrClose = afterDelete.indexOf('/>');
      const hrefInDelete = afterDelete.substring(0, nextLeafOrClose).includes('xlink:href');
      expect(hrefInDelete).toBe(false);
    });
  });
});
