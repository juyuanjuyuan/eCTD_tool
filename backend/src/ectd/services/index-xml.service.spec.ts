import { IndexXmlService } from './index-xml.service';
import { Md5Service } from './md5.service';

const mockPrisma = {
  sequence: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
  },
  sequenceNode: { findMany: jest.fn() },
};

describe('IndexXmlService', () => {
  let service: IndexXmlService;
  let md5Service: Md5Service;

  beforeEach(() => {
    md5Service = new Md5Service();
    service = new IndexXmlService(mockPrisma as any, md5Service);
    jest.clearAllMocks();
    // Default: sequence exists with sequenceNumber '0000' (first submission, no prior sequences)
    mockPrisma.sequence.findUnique.mockResolvedValue({
      id: 'seq1',
      sequenceNumber: '0000',
      regulatoryActivityId: 'ra-1',
      regulatoryActivity: { applicationId: 'app-1' },
    });
    mockPrisma.sequence.findMany.mockResolvedValue([]);
  });

  describe('generateIndexXml', () => {
    it('should generate valid XML with DTD and XSL references', async () => {
      mockPrisma.sequenceNode.findMany.mockResolvedValue([]);

      const xml = await service.generateIndexXml('seq1');

      expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
      expect(xml).toContain('<!DOCTYPE ectd:ectd SYSTEM "util/dtd/ich-ectd-3-2.dtd">');
      expect(xml).toContain('<?xml-stylesheet type="text/xsl" href="util/style/ectd-2-0.xsl"?>');
      expect(xml).toContain('<ectd:ectd xmlns:ectd="http://www.ich.org/ectd"');
      expect(xml).toContain('</ectd:ectd>');
    });

    it('should include leaf elements for modules 2-5', async () => {
      mockPrisma.sequenceNode.findMany.mockResolvedValue([
        {
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
        },
        {
          id: 'qos',
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
            { ectdRelativePath: 'm2/23-qos/qos-summary.pdf', md5Checksum: 'hash123', xmlLang: 'zh' },
          ],
        },
      ]);

      const xml = await service.generateIndexXml('seq1');

      expect(xml).toContain('m2-common-technical-document-summaries');
      expect(xml).toContain('operation="new"');
      expect(xml).toContain('xlink:href="m2/23-qos/qos-summary.pdf"');
      expect(xml).toContain('checksum="hash123"');
      expect(xml).toContain('checksum-type="MD5"');
      expect(xml).toContain('xml:lang="zh"');
      expect(xml).toContain('<title>质量综述</title>');
    });

    it('should filter out module 1 nodes', async () => {
      mockPrisma.sequenceNode.findMany.mockResolvedValue([
        {
          id: 'n1',
          elementName: 'cn-1-2',
          ctdSectionNumber: '1.2',
          title: '申请表',
          operation: 'NEW',
          isLeaf: true,
          parentId: null,
          substance: null, manufacturer: null, productName: null, dosageForm: null, indication: null,
          templateNode: { module: 1 },
          fileAttachments: [{ ectdRelativePath: 'm1/cn/02/form.pdf', md5Checksum: 'abc', xmlLang: 'zh' }],
        },
      ]);

      const xml = await service.generateIndexXml('seq1');
      expect(xml).not.toContain('cn-1-2');
      expect(xml).not.toContain('申请表');
    });

    it('should add backbone attributes for substance/manufacturer elements', async () => {
      mockPrisma.sequenceNode.findMany.mockResolvedValue([
        {
          id: 'mod3',
          elementName: 'm3-quality',
          ctdSectionNumber: '3',
          title: '质量',
          operation: null,
          isLeaf: false,
          parentId: null,
          substance: null, manufacturer: null, productName: null, dosageForm: null, indication: null,
          templateNode: { module: 3 },
          fileAttachments: [],
        },
        {
          id: 'ds',
          elementName: 'm3-2-s-drug-substance',
          ctdSectionNumber: '3.2.S',
          title: '原料药',
          operation: null,
          isLeaf: false,
          parentId: 'mod3',
          substance: 'Aspirin',
          manufacturer: 'PharmaCo',
          productName: null, dosageForm: null, indication: null,
          templateNode: { module: 3 },
          fileAttachments: [],
        },
        {
          id: 'ds-leaf',
          elementName: 'm3-2-s-1-general-info',
          ctdSectionNumber: '3.2.S.1',
          title: '基本信息',
          operation: 'NEW',
          isLeaf: true,
          parentId: 'ds',
          substance: null, manufacturer: null, productName: null, dosageForm: null, indication: null,
          templateNode: { module: 3 },
          fileAttachments: [
            { ectdRelativePath: 'm3/32-body-data/ds-general.pdf', md5Checksum: 'xyz', xmlLang: 'zh' },
          ],
        },
      ]);

      const xml = await service.generateIndexXml('seq1');

      expect(xml).toContain('substance="Aspirin"');
      expect(xml).toContain('manufacturer="PharmaCo"');
    });

    it('should add backbone attributes for product elements', async () => {
      mockPrisma.sequenceNode.findMany.mockResolvedValue([
        {
          id: 'mod3',
          elementName: 'm3-quality',
          ctdSectionNumber: '3',
          title: '质量',
          operation: null,
          isLeaf: false,
          parentId: null,
          substance: null, manufacturer: null, productName: null, dosageForm: null, indication: null,
          templateNode: { module: 3 },
          fileAttachments: [],
        },
        {
          id: 'dp',
          elementName: 'm3-2-p-drug-product',
          ctdSectionNumber: '3.2.P',
          title: '制剂',
          operation: null,
          isLeaf: false,
          parentId: 'mod3',
          substance: null,
          manufacturer: 'MfgCo',
          productName: 'Aspirin Tablet',
          dosageForm: 'tablet',
          indication: null,
          templateNode: { module: 3 },
          fileAttachments: [],
        },
        {
          id: 'dp-leaf',
          elementName: 'm3-2-p-1-description',
          ctdSectionNumber: '3.2.P.1',
          title: '描述',
          operation: 'NEW',
          isLeaf: true,
          parentId: 'dp',
          substance: null, manufacturer: null, productName: null, dosageForm: null, indication: null,
          templateNode: { module: 3 },
          fileAttachments: [
            { ectdRelativePath: 'm3/32-body-data/dp-desc.pdf', md5Checksum: 'xyz', xmlLang: 'zh' },
          ],
        },
      ]);

      const xml = await service.generateIndexXml('seq1');

      expect(xml).toContain('product-name="Aspirin Tablet"');
      expect(xml).toContain('dosageform="tablet"');
      expect(xml).toContain('manufacturer="MfgCo"');
    });

    it('should skip empty sections (no active leaves)', async () => {
      mockPrisma.sequenceNode.findMany.mockResolvedValue([
        {
          id: 'mod2',
          elementName: 'm2-summaries',
          ctdSectionNumber: '2',
          title: '模块二',
          operation: null,
          isLeaf: false,
          parentId: null,
          substance: null, manufacturer: null, productName: null, dosageForm: null, indication: null,
          templateNode: { module: 2 },
          fileAttachments: [],
        },
        {
          id: 'empty-leaf',
          elementName: 'm2-3-qos',
          ctdSectionNumber: '2.3',
          title: '质量综述',
          operation: null, // No operation = inactive
          isLeaf: true,
          parentId: 'mod2',
          substance: null, manufacturer: null, productName: null, dosageForm: null, indication: null,
          templateNode: { module: 2 },
          fileAttachments: [],
        },
      ]);

      const xml = await service.generateIndexXml('seq1');
      expect(xml).not.toContain('m2-summaries');
      expect(xml).not.toContain('m2-3-qos');
    });

    it('should handle delete operations without file references', async () => {
      mockPrisma.sequenceNode.findMany.mockResolvedValue([
        {
          id: 'mod2',
          elementName: 'm2-summaries',
          ctdSectionNumber: '2',
          title: '模块二',
          operation: null,
          isLeaf: false,
          parentId: null,
          substance: null, manufacturer: null, productName: null, dosageForm: null, indication: null,
          templateNode: { module: 2 },
          fileAttachments: [],
        },
        {
          id: 'del-leaf',
          elementName: 'm2-3-qos',
          ctdSectionNumber: '2.3',
          title: '质量综述',
          operation: 'DELETE',
          isLeaf: true,
          parentId: 'mod2',
          substance: null, manufacturer: null, productName: null, dosageForm: null, indication: null,
          templateNode: { module: 2 },
          fileAttachments: [],
        },
      ]);

      const xml = await service.generateIndexXml('seq1');

      expect(xml).toContain('operation="delete"');
      expect(xml).not.toContain('xlink:href');
      expect(xml).not.toContain('checksum=');
    });

    it('should handle node-extension elements with child leaves', async () => {
      mockPrisma.sequenceNode.findMany.mockResolvedValue([
        {
          id: 'mod3',
          elementName: 'm3-quality',
          ctdSectionNumber: '3',
          title: '质量',
          operation: null,
          isLeaf: false,
          parentId: null,
          substance: null, manufacturer: null, productName: null, dosageForm: null, indication: null,
          templateNode: { module: 3 },
          fileAttachments: [],
        },
        {
          id: 'ext',
          elementName: 'node-extension',
          ctdSectionNumber: '3.2.R',
          title: '扩展节点',
          operation: null,
          isLeaf: false,
          parentId: 'mod3',
          substance: null, manufacturer: null, productName: null, dosageForm: null, indication: null,
          templateNode: { module: 3 },
          fileAttachments: [],
        },
        {
          id: 'ext-leaf',
          elementName: 'm3-2-r-1',
          ctdSectionNumber: '3.2.R.1',
          title: '扩展文件',
          operation: 'NEW',
          isLeaf: true,
          parentId: 'ext',
          substance: null, manufacturer: null, productName: null, dosageForm: null, indication: null,
          templateNode: { module: 3 },
          fileAttachments: [
            { ectdRelativePath: 'm3/32-body-data/ext-doc.pdf', md5Checksum: 'ext123', xmlLang: 'zh' },
          ],
        },
      ]);

      const xml = await service.generateIndexXml('seq1');

      expect(xml).toContain('<node-extension>');
      expect(xml).toContain('<title>扩展节点</title>');
      expect(xml).toContain('</node-extension>');
    });
  });
});
