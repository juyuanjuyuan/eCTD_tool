import { PDFComplianceService } from './pdf-compliance.service';
import { PDFDocument, PDFName, PDFDict, PDFArray, PDFString } from 'pdf-lib';

describe('PDFComplianceService', () => {
  let service: PDFComplianceService;

  beforeEach(() => {
    service = new PDFComplianceService();
  });

  // Helper to create a minimal valid PDF buffer
  async function createMinimalPdf(options: {
    pageCount?: number;
    version?: string;
  } = {}): Promise<Buffer> {
    const pdfDoc = await PDFDocument.create();
    const pages = options.pageCount || 1;
    for (let i = 0; i < pages; i++) {
      pdfDoc.addPage();
    }
    const bytes = await pdfDoc.save();
    let buffer = Buffer.from(bytes);

    // Override PDF version in header if specified
    if (options.version) {
      const header = `%PDF-${options.version}`;
      buffer.write(header, 0, 'ascii');
    }

    return buffer;
  }

  describe('checkCompliance - basic valid PDF', () => {
    it('should pass for a compliant PDF with 1 page', async () => {
      const buffer = await createMinimalPdf({ version: '1.7' });

      const result = await service.checkCompliance(buffer);

      expect(result.isCompliant).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.summary.pageCount).toBe(1);
      expect(result.summary.pdfVersion).toBe('1.7');
    });

    it('should pass for PDF versions 1.4-1.7', async () => {
      for (const version of ['1.4', '1.5', '1.6', '1.7']) {
        const buffer = await createMinimalPdf({ version });
        const result = await service.checkCompliance(buffer);
        expect(result.errors.filter(e => e.ruleId === '6.18')).toHaveLength(0);
      }
    });
  });

  describe('checkCompliance - 6.18 PDF Version', () => {
    it('should error for unsupported PDF version 2.0', async () => {
      const buffer = await createMinimalPdf({ version: '2.0' });

      const result = await service.checkCompliance(buffer);

      const versionError = result.errors.find(e => e.ruleId === '6.18');
      expect(versionError).toBeDefined();
      expect(versionError!.severity).toBe('error');
      expect(versionError!.message).toContain('2.0');
    });

    it('should error for PDF version 1.3', async () => {
      const buffer = await createMinimalPdf({ version: '1.3' });

      const result = await service.checkCompliance(buffer);

      const versionError = result.errors.find(e => e.ruleId === '6.18');
      expect(versionError).toBeDefined();
    });
  });

  describe('checkCompliance - 6.0 invalid PDF', () => {
    it('should error for unparseable buffer', async () => {
      const buffer = Buffer.from('not a pdf file');

      const result = await service.checkCompliance(buffer);

      expect(result.isCompliant).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].ruleId).toBe('6.0');
    });
  });

  describe('checkCompliance - 6.19 Encryption', () => {
    it('should detect /Encrypt in PDF header', async () => {
      // Create a buffer with /Encrypt in the first 4KB
      const pdfDoc = await PDFDocument.create();
      pdfDoc.addPage();
      const bytes = await pdfDoc.save();
      const buffer = Buffer.from(bytes);

      // Manually inject /Encrypt marker into the buffer within first 4096 bytes
      const encryptPos = buffer.indexOf('trailer', 0, 'ascii');
      if (encryptPos > 0 && encryptPos < 4000) {
        // Inject /Encrypt near the beginning
        const modifiedBuffer = Buffer.concat([
          Buffer.from('%PDF-1.7\n/Encrypt '),
          buffer.subarray(9),
        ]);
        const result = await service.checkCompliance(modifiedBuffer);
        const encError = result.errors.find(e => e.ruleId === '6.19');
        expect(encError).toBeDefined();
      }
    });
  });

  describe('checkCompliance - 6.1 Bookmarks', () => {
    it('should error when >5 pages without bookmarks', async () => {
      const buffer = await createMinimalPdf({ pageCount: 6, version: '1.7' });

      const result = await service.checkCompliance(buffer);

      const bookmarkError = result.errors.find(e => e.ruleId === '6.1');
      expect(bookmarkError).toBeDefined();
      expect(bookmarkError!.message).toContain('5');
    });

    it('should not error when <=5 pages without bookmarks', async () => {
      const buffer = await createMinimalPdf({ pageCount: 5, version: '1.7' });

      const result = await service.checkCompliance(buffer);

      const bookmarkError = result.errors.find(e => e.ruleId === '6.1');
      expect(bookmarkError).toBeUndefined();
    });

    it('should not error when 3 pages without bookmarks', async () => {
      const buffer = await createMinimalPdf({ pageCount: 3, version: '1.7' });

      const result = await service.checkCompliance(buffer);

      const bookmarkError = result.errors.find(e => e.ruleId === '6.1');
      expect(bookmarkError).toBeUndefined();
    });
  });

  describe('checkCompliance - summary', () => {
    it('should return correct summary fields', async () => {
      const buffer = await createMinimalPdf({ pageCount: 3, version: '1.6' });

      const result = await service.checkCompliance(buffer);

      expect(result.summary.pageCount).toBe(3);
      expect(result.summary.pdfVersion).toBe('1.6');
      expect(result.summary.fileSizeMB).toBeGreaterThanOrEqual(0);
      expect(typeof result.summary.hasBookmarks).toBe('boolean');
      expect(typeof result.summary.hasEncryption).toBe('boolean');
    });

    it('should calculate fileSizeMB correctly', async () => {
      const buffer = await createMinimalPdf({ version: '1.7' });

      const result = await service.checkCompliance(buffer);

      const expectedMB = Math.round((buffer.length / (1024 * 1024)) * 100) / 100;
      expect(result.summary.fileSizeMB).toBe(expectedMB);
    });
  });

  describe('checkCompliance - 6.W1 file size warning', () => {
    it('should not warn for small files', async () => {
      const buffer = await createMinimalPdf({ version: '1.7' });

      const result = await service.checkCompliance(buffer);

      const sizeWarning = result.warnings.find(w => w.ruleId === '6.W1');
      expect(sizeWarning).toBeUndefined();
    });
  });

  describe('checkCompliance - isCompliant flag', () => {
    it('should be true when no errors', async () => {
      const buffer = await createMinimalPdf({ version: '1.7' });

      const result = await service.checkCompliance(buffer);

      expect(result.isCompliant).toBe(true);
    });

    it('should be false when there are errors', async () => {
      const buffer = await createMinimalPdf({ pageCount: 10, version: '2.0' });

      const result = await service.checkCompliance(buffer);

      expect(result.isCompliant).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });
});
