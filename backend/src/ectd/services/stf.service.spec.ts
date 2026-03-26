import { StfService } from './stf.service';
import { NotFoundException } from '@nestjs/common';

const mockPrisma = {
  sequenceNode: { findUnique: jest.fn() },
  studyTaggingFile: { upsert: jest.fn(), findUnique: jest.fn() },
};

describe('StfService', () => {
  let service: StfService;

  beforeEach(() => {
    service = new StfService(mockPrisma as any);
    jest.clearAllMocks();
  });

  // ==================== generateStfXml ====================

  describe('generateStfXml', () => {
    it('should generate valid STF XML with DTD and XSL references', () => {
      const xml = service.generateStfXml(
        { studyTitle: 'Study A', studyId: 'ST001' },
        { fileAttachments: [] },
      );

      expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
      expect(xml).toContain('<!DOCTYPE ectd:study SYSTEM "../../util/dtd/ich-stf-v2-2.dtd">');
      expect(xml).toContain('ich-stf-stylesheet-2-3.xsl');
      expect(xml).toContain('xmlns:ectd="http://www.ich.org/ectd"');
      expect(xml).toContain('dtd-version="2.2"');
    });

    it('should include study-identifier with title and id', () => {
      const xml = service.generateStfXml(
        { studyTitle: 'Phase III Trial', studyId: 'PROTO-001' },
        { fileAttachments: [] },
      );

      expect(xml).toContain('<study-identifier>');
      expect(xml).toContain('<title>Phase III Trial</title>');
      expect(xml).toContain('<study-id>PROTO-001</study-id>');
      expect(xml).toContain('</study-identifier>');
    });

    it('should include categories', () => {
      const xml = service.generateStfXml(
        {
          studyTitle: 'Study A',
          studyId: 'ST001',
          categories: { species: 'human', 'route-of-admin': 'oral' },
        },
        { fileAttachments: [] },
      );

      expect(xml).toContain('category name="species" info-type="keyword">human</category>');
      expect(xml).toContain('category name="route-of-admin" info-type="keyword">oral</category>');
    });

    it('should skip empty category values', () => {
      const xml = service.generateStfXml(
        {
          studyTitle: 'Study A',
          studyId: 'ST001',
          categories: { species: 'human', 'route-of-admin': '' },
        },
        { fileAttachments: [] },
      );

      expect(xml).toContain('species');
      expect(xml).not.toContain('route-of-admin');
    });

    it('should include study-document with file references', () => {
      const xml = service.generateStfXml(
        {
          studyTitle: 'Study A',
          studyId: 'ST001',
          fileTags: [{ name: 'study-report-body', infoType: 'keyword' }],
        },
        {
          fileAttachments: [
            { ectdRelativePath: 'm4/42-stud-rep/study-report.pdf' },
          ],
        },
      );

      expect(xml).toContain('<study-document>');
      expect(xml).toContain('xlink:href="m4/42-stud-rep/study-report.pdf"');
      expect(xml).toContain('file-tag name="study-report-body" info-type="keyword"');
      expect(xml).toContain('</study-document>');
    });

    it('should not include study-document if no file attachments', () => {
      const xml = service.generateStfXml(
        { studyTitle: 'Study A', studyId: 'ST001' },
        { fileAttachments: [] },
      );

      expect(xml).not.toContain('<study-document>');
    });

    it('should escape XML special characters', () => {
      const xml = service.generateStfXml(
        { studyTitle: 'Study <A> & "B"', studyId: 'ST&001' },
        { fileAttachments: [] },
      );

      expect(xml).toContain('Study &lt;A&gt; &amp; &quot;B&quot;');
      expect(xml).toContain('ST&amp;001');
    });
  });

  // ==================== saveStf ====================

  describe('saveStf', () => {
    it('should throw NotFoundException if node not found', async () => {
      mockPrisma.sequenceNode.findUnique.mockResolvedValue(null);

      await expect(
        service.saveStf('node1', { studyTitle: 'Test', studyId: 'ST001' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should upsert STF data', async () => {
      mockPrisma.sequenceNode.findUnique.mockResolvedValue({
        id: 'node1',
        operation: 'NEW',
        templateNode: { requiresStf: true },
        fileAttachments: [],
      });
      mockPrisma.studyTaggingFile.upsert.mockResolvedValue({ id: 'stf1' });

      const result = await service.saveStf('node1', {
        studyTitle: 'Study A',
        studyId: 'ST001',
        categories: { species: 'human' },
      });

      expect(mockPrisma.studyTaggingFile.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { sequenceNodeId: 'node1' },
          create: expect.objectContaining({
            studyTitle: 'Study A',
            studyId: 'ST001',
          }),
        }),
      );
    });
  });

  // ==================== getStf ====================

  describe('getStf', () => {
    it('should query by node ID', async () => {
      mockPrisma.studyTaggingFile.findUnique.mockResolvedValue({
        id: 'stf1',
        studyTitle: 'Study A',
      });

      const result = await service.getStf('node1');
      expect(mockPrisma.studyTaggingFile.findUnique).toHaveBeenCalledWith({
        where: { sequenceNodeId: 'node1' },
      });
      expect(result!.studyTitle).toBe('Study A');
    });

    it('should return null for non-existent STF', async () => {
      mockPrisma.studyTaggingFile.findUnique.mockResolvedValue(null);
      const result = await service.getStf('node1');
      expect(result).toBeNull();
    });
  });
});
