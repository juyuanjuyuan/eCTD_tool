import { Test, TestingModule } from '@nestjs/testing';
import { ExportService } from './export.service';
import { PrismaService } from '../prisma/prisma.service';
import { WordExportService } from './word-export.service';
import { PDFExportService } from './pdf-export.service';
import { PDFComplianceService } from './pdf-compliance.service';
import { NotFoundException, BadRequestException } from '@nestjs/common';

describe('ExportService', () => {
  let service: ExportService;
  let prisma: Record<string, any>;
  let wordExport: Record<string, any>;
  let pdfExport: Record<string, any>;
  let pdfCompliance: Record<string, any>;
  let exportQueue: Record<string, any>;

  const mockNode = {
    id: 'node-1',
    ctdSectionNumber: '2.3.S.1',
    title: '一般性质',
  };

  const mockDocument = {
    id: 'doc-1',
    nodeId: 'node-1',
    contentJson: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '测试' }] }] },
    contentHtml: '<p>测试</p>',
  };

  beforeEach(async () => {
    prisma = {
      sequenceNode: {
        findUnique: jest.fn().mockResolvedValue(mockNode),
      },
      document: {
        findUnique: jest.fn().mockResolvedValue(mockDocument),
      },
    };

    wordExport = {
      exportDocument: jest.fn().mockResolvedValue(Buffer.from('docx-content')),
    };

    pdfExport = {
      exportToPDF: jest.fn().mockResolvedValue(Buffer.from('pdf-content')),
      stripExternalLinks: jest.fn().mockReturnValue({ html: '<p>测试</p>', removedLinks: [] }),
    };

    pdfCompliance = {
      checkCompliance: jest.fn().mockResolvedValue({
        isCompliant: true,
        errors: [],
        warnings: [],
        summary: { pdfVersion: '1.7', pageCount: 1, hasBookmarks: false, hasEncryption: false, fileSizeMB: 0.01 },
      }),
    };

    exportQueue = {
      add: jest.fn().mockResolvedValue({ id: 'job-123' }),
      getJob: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExportService,
        { provide: PrismaService, useValue: prisma },
        { provide: WordExportService, useValue: wordExport },
        { provide: PDFExportService, useValue: pdfExport },
        { provide: PDFComplianceService, useValue: pdfCompliance },
        { provide: 'EXPORT_QUEUE', useValue: exportQueue },
      ],
    }).compile();

    service = module.get<ExportService>(ExportService);
  });

  describe('exportWordSingle', () => {
    it('should export Word document', async () => {
      const result = await service.exportWordSingle('node-1');

      expect(result.status).toBe('completed');
      expect(result.buffer).toBeDefined();
      expect(result.fileName).toContain('2-3-S-1');
      expect(result.contentType).toContain('wordprocessingml');
      expect(wordExport.exportDocument).toHaveBeenCalledWith(
        mockDocument.contentJson,
        expect.objectContaining({
          headerText: '2.3.S.1 一般性质',
        }),
      );
    });

    it('should use custom headerText', async () => {
      await service.exportWordSingle('node-1', '自定义页眉');

      expect(wordExport.exportDocument).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          headerText: '自定义页眉',
        }),
      );
    });

    it('should throw when document content is empty', async () => {
      prisma.document.findUnique.mockResolvedValue({ ...mockDocument, contentJson: null });

      await expect(service.exportWordSingle('node-1')).rejects.toThrow(BadRequestException);
    });

    it('should throw when node not found', async () => {
      prisma.sequenceNode.findUnique.mockResolvedValue(null);

      await expect(service.exportWordSingle('nonexistent')).rejects.toThrow(NotFoundException);
    });

    it('should throw when document not found', async () => {
      prisma.document.findUnique.mockResolvedValue(null);

      await expect(service.exportWordSingle('node-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('exportPdfSingle', () => {
    it('should export PDF with compliance check', async () => {
      const result = await service.exportPdfSingle('node-1');

      expect(result.status).toBe('completed');
      expect(result.buffer).toBeDefined();
      expect(result.contentType).toBe('application/pdf');
      expect(result.complianceResult).toBeDefined();
      expect(result.complianceResult!.isCompliant).toBe(true);
      expect(pdfExport.stripExternalLinks).toHaveBeenCalledWith('<p>测试</p>');
    });

    it('should still return buffer even when compliance fails', async () => {
      pdfCompliance.checkCompliance.mockResolvedValue({
        isCompliant: false,
        errors: [{ ruleId: '6.1', severity: 'error', message: 'no bookmarks' }],
        warnings: [],
        summary: {},
      });

      const result = await service.exportPdfSingle('node-1');

      expect(result.status).toBe('compliance_warning');
      expect(result.complianceResult!.isCompliant).toBe(false);
    });

    it('should throw when contentHtml is empty', async () => {
      prisma.document.findUnique.mockResolvedValue({ ...mockDocument, contentHtml: null });

      await expect(service.exportPdfSingle('node-1')).rejects.toThrow(BadRequestException);
    });

    it('should return removed links', async () => {
      pdfExport.stripExternalLinks.mockReturnValue({
        html: '<p>text</p>',
        removedLinks: ['http://example.com'],
      });

      const result = await service.exportPdfSingle('node-1');

      expect(result.removedLinks).toEqual(['http://example.com']);
    });
  });

  describe('exportWordBatch', () => {
    it('should enqueue batch Word export job', async () => {
      const result = await service.exportWordBatch('seq-1', ['n1', 'n2']);

      expect(result.taskId).toBe('job-123');
      expect(exportQueue.add).toHaveBeenCalledWith('word-batch', {
        sequenceId: 'seq-1',
        nodeIds: ['n1', 'n2'],
        headerText: undefined,
        format: 'word',
      });
    });
  });

  describe('exportPdfBatch', () => {
    it('should enqueue batch PDF export job', async () => {
      const result = await service.exportPdfBatch('seq-1', ['n1'], '页眉');

      expect(result.taskId).toBe('job-123');
      expect(exportQueue.add).toHaveBeenCalledWith('pdf-batch', {
        sequenceId: 'seq-1',
        nodeIds: ['n1'],
        headerText: '页眉',
        format: 'pdf',
      });
    });
  });

  describe('getTaskStatus', () => {
    it('should return completed job status', async () => {
      exportQueue.getJob.mockResolvedValue({
        getState: jest.fn().mockResolvedValue('completed'),
        progress: jest.fn().mockReturnValue(100),
        returnvalue: { success: true },
        failedReason: null,
      });

      const result = await service.getTaskStatus('job-1');

      expect(result.status).toBe('completed');
      expect(result.progress).toBe(100);
      expect(result.result).toEqual({ success: true });
    });

    it('should return failed job status with error', async () => {
      exportQueue.getJob.mockResolvedValue({
        getState: jest.fn().mockResolvedValue('failed'),
        progress: jest.fn().mockReturnValue(50),
        returnvalue: null,
        failedReason: '导出失败',
      });

      const result = await service.getTaskStatus('job-2');

      expect(result.status).toBe('failed');
      expect(result.error).toBe('导出失败');
    });

    it('should throw when job not found', async () => {
      exportQueue.getJob.mockResolvedValue(null);

      await expect(service.getTaskStatus('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getDownloadUrl', () => {
    it('should throw when job not completed', async () => {
      exportQueue.getJob.mockResolvedValue({
        getState: jest.fn().mockResolvedValue('active'),
      });

      await expect(service.getDownloadUrl('job-1')).rejects.toThrow(BadRequestException);
    });

    it('should throw when no download object name', async () => {
      exportQueue.getJob.mockResolvedValue({
        getState: jest.fn().mockResolvedValue('completed'),
        returnvalue: {},
      });

      await expect(service.getDownloadUrl('job-1')).rejects.toThrow(NotFoundException);
    });

    it('should throw when job not found', async () => {
      exportQueue.getJob.mockResolvedValue(null);

      await expect(service.getDownloadUrl('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('checkUploadedPdfCompliance', () => {
    it('should delegate to PDFComplianceService', async () => {
      const buf = Buffer.from('pdf');
      const expected = { isCompliant: true, errors: [], warnings: [], summary: {} };
      pdfCompliance.checkCompliance.mockResolvedValue(expected);

      const result = await service.checkUploadedPdfCompliance(buf);

      expect(result).toEqual(expected);
      expect(pdfCompliance.checkCompliance).toHaveBeenCalledWith(buf);
    });
  });
});
