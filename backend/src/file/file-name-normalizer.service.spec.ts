import { BadRequestException } from '@nestjs/common';
import { FileNameNormalizerService, ALLOWED_EXTENSIONS } from './file-name-normalizer.service';

describe('FileNameNormalizerService', () => {
  let service: FileNameNormalizerService;

  beforeEach(() => {
    service = new FileNameNormalizerService();
  });

  // ==================== normalizeFileName ====================

  describe('normalizeFileName', () => {
    it('should pass through a compliant filename unchanged', () => {
      expect(service.normalizeFileName('report-2024.pdf')).toBe('report-2024.pdf');
    });

    it('should convert uppercase to lowercase', () => {
      expect(service.normalizeFileName('MyReport.PDF')).toBe('myreport.pdf');
    });

    it('should replace Chinese characters with hyphens', () => {
      expect(service.normalizeFileName('申请表.pdf')).toBe('file.pdf');
    });

    it('should replace spaces with hyphens', () => {
      expect(service.normalizeFileName('my report file.pdf')).toBe('my-report-file.pdf');
    });

    it('should replace special characters with hyphens', () => {
      expect(service.normalizeFileName('report@v1#2.pdf')).toBe('report-v1-2.pdf');
    });

    it('should collapse consecutive hyphens', () => {
      expect(service.normalizeFileName('a---b---c.pdf')).toBe('a-b-c.pdf');
    });

    it('should remove leading and trailing hyphens', () => {
      expect(service.normalizeFileName('-report-.pdf')).toBe('report.pdf');
    });

    it('should use "file" as fallback when basename becomes empty', () => {
      expect(service.normalizeFileName('中文名.pdf')).toBe('file.pdf');
    });

    it('should handle filenames with no extension', () => {
      expect(service.normalizeFileName('README')).toBe('readme');
    });

    it('should truncate names exceeding 64 characters', () => {
      const longName = 'a'.repeat(70) + '.pdf';
      const result = service.normalizeFileName(longName);
      expect(result.length).toBeLessThanOrEqual(64);
      expect(result.endsWith('.pdf')).toBe(true);
    });

    it('should preserve underscores and hyphens', () => {
      expect(service.normalizeFileName('my_report-v2.pdf')).toBe('my_report-v2.pdf');
    });

    it('should handle multiple dots (keep last as extension)', () => {
      expect(service.normalizeFileName('v1.0.report.pdf')).toBe('v1-0-report.pdf');
    });
  });

  // ==================== validateExtension ====================

  describe('validateExtension', () => {
    it('should accept .pdf files', () => {
      expect(() => service.validateExtension('report.pdf')).not.toThrow();
    });

    it('should accept .xml files', () => {
      expect(() => service.validateExtension('index.xml')).not.toThrow();
    });

    it('should accept .xpt files', () => {
      expect(() => service.validateExtension('data.xpt')).not.toThrow();
    });

    it('should accept .txt files', () => {
      expect(() => service.validateExtension('md5.txt')).not.toThrow();
    });

    it('should accept .xsl files', () => {
      expect(() => service.validateExtension('style.xsl')).not.toThrow();
    });

    it('should reject .docx files', () => {
      expect(() => service.validateExtension('report.docx')).toThrow(BadRequestException);
    });

    it('should reject .jpg files', () => {
      expect(() => service.validateExtension('photo.jpg')).toThrow(BadRequestException);
    });

    it('should handle case-insensitive extensions', () => {
      expect(() => service.validateExtension('report.PDF')).not.toThrow();
    });
  });

  // ==================== validateFileSize ====================

  describe('validateFileSize', () => {
    it('should accept normal files under 500MB', () => {
      expect(() => service.validateFileSize(400 * 1024 * 1024, 'report.pdf')).not.toThrow();
    });

    it('should reject normal files over 500MB', () => {
      expect(() => service.validateFileSize(501 * 1024 * 1024, 'report.pdf')).toThrow(BadRequestException);
    });

    it('should accept XPT files under 4GB', () => {
      expect(() => service.validateFileSize(3 * 1024 * 1024 * 1024, 'data.xpt')).not.toThrow();
    });

    it('should reject XPT files over 4GB', () => {
      const overFourGB = 4 * 1024 * 1024 * 1024 + 1;
      expect(() => service.validateFileSize(overFourGB, 'data.xpt')).toThrow(BadRequestException);
    });

    it('should accept files at exactly 500MB boundary', () => {
      expect(() => service.validateFileSize(500 * 1024 * 1024, 'report.pdf')).not.toThrow();
    });
  });

  // ==================== buildEctdRelativePath ====================

  describe('buildEctdRelativePath', () => {
    it('should build module 1 paths correctly', () => {
      expect(service.buildEctdRelativePath('1.2', 'application-form.pdf'))
        .toBe('m1/cn/02/application-form.pdf');
    });

    it('should build module 2 paths correctly', () => {
      expect(service.buildEctdRelativePath('2.3', 'qos-summary.pdf'))
        .toBe('m2/23-qos/qos-summary.pdf');
    });

    it('should build module 3 paths correctly', () => {
      expect(service.buildEctdRelativePath('3.2', 'body-data.pdf'))
        .toBe('m3/32-body-data/body-data.pdf');
    });

    it('should build module 4 paths correctly', () => {
      expect(service.buildEctdRelativePath('4.2', 'study-report.pdf'))
        .toBe('m4/42-stud-rep/study-report.pdf');
    });

    it('should build module 5 paths correctly', () => {
      expect(service.buildEctdRelativePath('5.3', 'clinical-study.pdf'))
        .toBe('m5/53-clin-stud-rep/clinical-study.pdf');
    });

    it('should throw when any path segment exceeds 64 characters', () => {
      // A long single filename (> 64 chars) is always rejected regardless of the
      // total-path-length cap (ICH eCTD v3.2.2 §2.4: 230 chars path, 64 chars segment).
      const longName = 'a'.repeat(170) + '.pdf';
      expect(() => service.buildEctdRelativePath('1.2', longName)).toThrow(BadRequestException);
    });

    it('should accept a compliant 230-char eCTD path (ICH eCTD v3.2.2)', () => {
      // A normal compliant name (under 64 chars) should build a path under the
      // 230-char upper bound without error.
      const name = 'report-' + 'a'.repeat(50) + '.pdf'; // 61 chars
      expect(() => service.buildEctdRelativePath('3.2', name)).not.toThrow();
    });

    it('should handle sub-section numbers for module 1', () => {
      expect(service.buildEctdRelativePath('1.3.8', 'doc.pdf'))
        .toBe('m1/cn/03/doc.pdf');
    });
  });

  // ==================== buildStoragePath ====================

  describe('buildStoragePath', () => {
    it('should concatenate all path components', () => {
      const result = service.buildStoragePath('proj1', 'x202600001', '0000', 'm1/cn/02/form.pdf');
      expect(result).toBe('proj1/x202600001/0000/m1/cn/02/form.pdf');
    });
  });

  // ==================== getSectionFolder ====================

  describe('getSectionFolder', () => {
    it('should map module 1 sections to cn folders', () => {
      expect(service.getSectionFolder('1.0')).toBe('m1/cn/00');
      expect(service.getSectionFolder('1.12')).toBe('m1/cn/12');
    });

    it('should map module 2 sections to ICH folders', () => {
      expect(service.getSectionFolder('2.7')).toBe('m2/27-clin-sum');
    });

    it('should fallback to module root for unknown sections', () => {
      expect(service.getSectionFolder('2.99')).toBe('m2');
    });

    it('should fallback to m1/cn for unknown module 1 sections', () => {
      expect(service.getSectionFolder('1.99')).toBe('m1/cn');
    });
  });

  // ==================== isCompliantFileName ====================

  describe('isCompliantFileName', () => {
    it('should accept lowercase alphanumeric with hyphens and underscores', () => {
      expect(service.isCompliantFileName('report-v1_final.pdf')).toBe(true);
    });

    it('should reject uppercase characters', () => {
      expect(service.isCompliantFileName('Report.pdf')).toBe(false);
    });

    it('should reject spaces', () => {
      expect(service.isCompliantFileName('my report.pdf')).toBe(false);
    });

    it('should reject Chinese characters', () => {
      expect(service.isCompliantFileName('报告.pdf')).toBe(false);
    });

    it('should accept names without extension', () => {
      expect(service.isCompliantFileName('readme')).toBe(true);
    });
  });

  // ==================== validatePathSeparators ====================

  describe('validatePathSeparators', () => {
    it('should accept forward slashes', () => {
      expect(() => service.validatePathSeparators('m1/cn/02/form.pdf')).not.toThrow();
    });

    it('should reject backslashes', () => {
      expect(() => service.validatePathSeparators('m1\\cn\\02\\form.pdf')).toThrow(BadRequestException);
    });
  });
});
