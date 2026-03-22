import { Injectable } from '@nestjs/common';
import { PDFDocument, PDFName, PDFDict, PDFArray, PDFString, PDFHexString } from 'pdf-lib';

export interface ComplianceIssue {
  ruleId: string;
  severity: 'error' | 'warning';
  message: string;
  detail?: string;
}

export interface ComplianceResult {
  isCompliant: boolean;
  errors: ComplianceIssue[];
  warnings: ComplianceIssue[];
  summary: {
    pdfVersion: string;
    pageCount: number;
    hasBookmarks: boolean;
    hasEncryption: boolean;
    fileSizeMB: number;
  };
}

// Max file size 200MB (V1.1 下调)
const MAX_FILE_SIZE_MB = 200;

@Injectable()
export class PDFComplianceService {
  /**
   * Run full eCTD compliance check on a PDF buffer.
   * Implements validation rules 6.x from eCTD验证标准V1.1.
   */
  async checkCompliance(pdfBuffer: Buffer): Promise<ComplianceResult> {
    const errors: ComplianceIssue[] = [];
    const warnings: ComplianceIssue[] = [];

    let pdfDoc: PDFDocument;
    let pdfVersion = 'unknown';

    // Try to load PDF
    try {
      pdfDoc = await PDFDocument.load(pdfBuffer, {
        ignoreEncryption: true,
        updateMetadata: false,
      });
    } catch (e: any) {
      return {
        isCompliant: false,
        errors: [
          {
            ruleId: '6.0',
            severity: 'error',
            message: 'PDF 文件无法解析',
            detail: e.message,
          },
        ],
        warnings: [],
        summary: {
          pdfVersion: 'unknown',
          pageCount: 0,
          hasBookmarks: false,
          hasEncryption: false,
          fileSizeMB: pdfBuffer.length / (1024 * 1024),
        },
      };
    }

    const pageCount = pdfDoc.getPageCount();
    const fileSizeMB = pdfBuffer.length / (1024 * 1024);

    // ==================== 6.18: PDF Version ====================
    // Allowed: 1.4, 1.5, 1.6, 1.7, PDF/A-1, PDF/A-2
    pdfVersion = this.extractPDFVersion(pdfBuffer);
    const allowedVersions = ['1.4', '1.5', '1.6', '1.7'];
    const versionNum = pdfVersion.replace('PDF-', '').replace('pdf-', '');
    if (!allowedVersions.includes(versionNum) && !pdfVersion.includes('PDF/A')) {
      errors.push({
        ruleId: '6.18',
        severity: 'error',
        message: `PDF 版本 ${pdfVersion} 不在允许范围内`,
        detail: '允许的版本: 1.4, 1.5, 1.6, 1.7, PDF/A-1, PDF/A-2',
      });
    }

    // ==================== 6.19: Encryption ====================
    const hasEncryption = this.checkEncryption(pdfBuffer);
    if (hasEncryption) {
      errors.push({
        ruleId: '6.19',
        severity: 'error',
        message: 'PDF 包含加密或安全限制',
        detail: 'eCTD 不允许 PDF 加密或设置密码保护',
      });
    }

    // ==================== 6.20: JavaScript ====================
    const hasJavaScript = this.checkJavaScript(pdfDoc);
    if (hasJavaScript) {
      errors.push({
        ruleId: '6.20',
        severity: 'error',
        message: 'PDF 包含 JavaScript',
        detail: 'eCTD 不允许 PDF 中包含 JavaScript 代码',
      });
    }

    // ==================== 6.21: External Links ====================
    const externalLinks = this.checkExternalLinks(pdfDoc);
    if (externalLinks.length > 0) {
      errors.push({
        ruleId: '6.21',
        severity: 'error',
        message: `PDF 包含 ${externalLinks.length} 个外部链接`,
        detail: `外部链接: ${externalLinks.slice(0, 5).join(', ')}${externalLinks.length > 5 ? '...' : ''}`,
      });
    }

    // ==================== 6.22: Multimedia ====================
    const hasMultimedia = this.checkMultimedia(pdfDoc);
    if (hasMultimedia) {
      errors.push({
        ruleId: '6.22',
        severity: 'error',
        message: 'PDF 包含音频、视频或 3D 对象',
        detail: 'eCTD 不允许 PDF 中包含多媒体内容',
      });
    }

    // ==================== 6.1: Bookmarks ====================
    const hasBookmarks = this.checkBookmarks(pdfDoc);
    if (pageCount > 5 && !hasBookmarks) {
      errors.push({
        ruleId: '6.1',
        severity: 'error',
        message: '超过 5 页的 PDF 必须包含书签',
        detail: `当前 PDF 有 ${pageCount} 页但没有书签`,
      });
    }

    // ==================== 6.23: Bookmark Zoom ====================
    if (hasBookmarks) {
      const badZoomBookmarks = this.checkBookmarkZoom(pdfDoc);
      if (badZoomBookmarks > 0) {
        errors.push({
          ruleId: '6.23',
          severity: 'error',
          message: `${badZoomBookmarks} 个书签的放大率不是 Inherit Zoom`,
          detail: '所有书签必须使用 Inherit Zoom (Fit) 放大率',
        });
      }
    }

    // ==================== Attachments ====================
    const hasAttachments = this.checkAttachments(pdfDoc);
    if (hasAttachments) {
      errors.push({
        ruleId: '6.24',
        severity: 'error',
        message: 'PDF 包含附件或嵌入式文件',
        detail: 'eCTD 不允许 PDF 包含附件',
      });
    }

    // ==================== Warning Level Checks ====================

    // File size
    if (fileSizeMB > MAX_FILE_SIZE_MB) {
      warnings.push({
        ruleId: '6.W1',
        severity: 'warning',
        message: `PDF 文件大小 ${fileSizeMB.toFixed(1)}MB 超过 ${MAX_FILE_SIZE_MB}MB 限制`,
      });
    }

    // Font embedding check
    const unembeddedFonts = this.checkFontEmbedding(pdfDoc);
    if (unembeddedFonts.length > 0) {
      warnings.push({
        ruleId: '6.W2',
        severity: 'warning',
        message: `${unembeddedFonts.length} 个字体未嵌入`,
        detail: `未嵌入字体: ${unembeddedFonts.join(', ')}`,
      });
    }

    return {
      isCompliant: errors.length === 0,
      errors,
      warnings,
      summary: {
        pdfVersion,
        pageCount,
        hasBookmarks,
        hasEncryption,
        fileSizeMB: Math.round(fileSizeMB * 100) / 100,
      },
    };
  }

  // ==================== Implementation of checks ====================

  private extractPDFVersion(buffer: Buffer): string {
    // PDF version is in the first line: %PDF-1.7
    const header = buffer.subarray(0, 20).toString('ascii');
    const match = header.match(/%PDF-(\d+\.\d+)/);
    return match ? match[1] : 'unknown';
  }

  private checkEncryption(buffer: Buffer): boolean {
    // Look for /Encrypt dictionary in the raw PDF
    const content = buffer.toString('ascii', 0, Math.min(buffer.length, 4096));
    return content.includes('/Encrypt');
  }

  private checkJavaScript(pdfDoc: PDFDocument): boolean {
    try {
      const catalog = pdfDoc.catalog;

      // Check /Names -> /JavaScript
      const names = catalog.lookup(PDFName.of('Names'));
      if (names instanceof PDFDict) {
        const js = names.lookup(PDFName.of('JavaScript'));
        if (js) return true;
      }

      // Check /AA (additional actions) on catalog
      const aa = catalog.lookup(PDFName.of('AA'));
      if (aa) return true;

      // Check /OpenAction for JavaScript
      const openAction = catalog.lookup(PDFName.of('OpenAction'));
      if (openAction instanceof PDFDict) {
        const s = openAction.lookup(PDFName.of('S'));
        if (s && s.toString() === '/JavaScript') return true;
      }

      return false;
    } catch {
      return false;
    }
  }

  private checkExternalLinks(pdfDoc: PDFDocument): string[] {
    const externalLinks: string[] = [];
    try {
      const pages = pdfDoc.getPages();
      for (const page of pages) {
        const annots = page.node.lookup(PDFName.of('Annots'));
        if (!(annots instanceof PDFArray)) continue;

        for (let i = 0; i < annots.size(); i++) {
          const annot = annots.lookup(i);
          if (!(annot instanceof PDFDict)) continue;

          // Check for URI action
          const a = annot.lookup(PDFName.of('A'));
          if (a instanceof PDFDict) {
            const s = a.lookup(PDFName.of('S'));
            if (s && s.toString() === '/URI') {
              const uri = a.lookup(PDFName.of('URI'));
              if (uri instanceof PDFString || uri instanceof PDFHexString) {
                externalLinks.push(uri.decodeText());
              }
            }
          }
        }
      }
    } catch {
      // Ignore parsing errors
    }
    return externalLinks;
  }

  private checkMultimedia(pdfDoc: PDFDocument): boolean {
    try {
      const catalog = pdfDoc.catalog;
      // Check for RichMedia annotations
      const names = catalog.lookup(PDFName.of('Names'));
      if (names instanceof PDFDict) {
        const embeddedFiles = names.lookup(PDFName.of('EmbeddedFiles'));
        if (embeddedFiles) {
          // Could contain multimedia — flag for review
          // We'll check more specifically via annotations
        }
      }

      // Check pages for RichMedia/Screen/Sound/Movie annotations
      const pages = pdfDoc.getPages();
      for (const page of pages) {
        const annots = page.node.lookup(PDFName.of('Annots'));
        if (!(annots instanceof PDFArray)) continue;

        for (let i = 0; i < annots.size(); i++) {
          const annot = annots.lookup(i);
          if (!(annot instanceof PDFDict)) continue;
          const subtype = annot.lookup(PDFName.of('Subtype'));
          if (subtype) {
            const st = subtype.toString();
            if (
              st === '/RichMedia' ||
              st === '/Screen' ||
              st === '/Sound' ||
              st === '/Movie' ||
              st === '/3D'
            ) {
              return true;
            }
          }
        }
      }
      return false;
    } catch {
      return false;
    }
  }

  private checkBookmarks(pdfDoc: PDFDocument): boolean {
    try {
      const outlines = pdfDoc.catalog.lookup(PDFName.of('Outlines'));
      if (!(outlines instanceof PDFDict)) return false;
      const first = outlines.lookup(PDFName.of('First'));
      return !!first;
    } catch {
      return false;
    }
  }

  private checkBookmarkZoom(pdfDoc: PDFDocument): number {
    let badZoomCount = 0;
    try {
      const outlines = pdfDoc.catalog.lookup(PDFName.of('Outlines'));
      if (!(outlines instanceof PDFDict)) return 0;

      const traverseOutline = (entry: any) => {
        if (!(entry instanceof PDFDict)) return;

        // Check Dest array for zoom type
        const dest = entry.lookup(PDFName.of('Dest'));
        if (dest instanceof PDFArray && dest.size() >= 2) {
          const fitType = dest.lookup(1);
          if (fitType) {
            const ft = fitType.toString();
            // /Fit and /FitH are acceptable as Inherit Zoom equivalents
            if (ft !== '/Fit' && ft !== '/FitH' && ft !== '/FitV' && ft !== '/FitB') {
              // /XYZ with null zoom is also acceptable
              if (ft === '/XYZ') {
                // Check if zoom is null (inherit)
                if (dest.size() >= 5) {
                  const zoom = dest.lookup(4);
                  if (zoom && zoom.toString() !== 'null') {
                    badZoomCount++;
                  }
                }
              } else {
                badZoomCount++;
              }
            }
          }
        }

        // Traverse next sibling and first child
        const next = entry.lookup(PDFName.of('Next'));
        if (next) traverseOutline(pdfDoc.context.lookup(next));
        const first = entry.lookup(PDFName.of('First'));
        if (first) traverseOutline(pdfDoc.context.lookup(first));
      };

      const first = outlines.lookup(PDFName.of('First'));
      if (first) traverseOutline(pdfDoc.context.lookup(first));
    } catch {
      // Ignore traversal errors
    }
    return badZoomCount;
  }

  private checkAttachments(pdfDoc: PDFDocument): boolean {
    try {
      const catalog = pdfDoc.catalog;
      const names = catalog.lookup(PDFName.of('Names'));
      if (names instanceof PDFDict) {
        const embeddedFiles = names.lookup(PDFName.of('EmbeddedFiles'));
        if (embeddedFiles) return true;
      }

      // Also check /AF (associated files)
      const af = catalog.lookup(PDFName.of('AF'));
      if (af instanceof PDFArray && af.size() > 0) return true;

      return false;
    } catch {
      return false;
    }
  }

  private checkFontEmbedding(pdfDoc: PDFDocument): string[] {
    const unembedded: string[] = [];
    try {
      const pages = pdfDoc.getPages();
      for (const page of pages) {
        const resources = page.node.lookup(PDFName.of('Resources'));
        if (!(resources instanceof PDFDict)) continue;

        const fonts = resources.lookup(PDFName.of('Font'));
        if (!(fonts instanceof PDFDict)) continue;

        const fontEntries = fonts.entries();
        for (const [, fontRef] of fontEntries) {
          const font = pdfDoc.context.lookup(fontRef);
          if (!(font instanceof PDFDict)) continue;

          const baseFont = font.lookup(PDFName.of('BaseFont'));
          const fontDesc = font.lookup(PDFName.of('FontDescriptor'));

          if (fontDesc instanceof PDFDict) {
            const fontFile = fontDesc.lookup(PDFName.of('FontFile'));
            const fontFile2 = fontDesc.lookup(PDFName.of('FontFile2'));
            const fontFile3 = fontDesc.lookup(PDFName.of('FontFile3'));

            if (!fontFile && !fontFile2 && !fontFile3) {
              // Font not embedded
              const name = baseFont ? baseFont.toString().replace('/', '') : 'Unknown';
              // Standard 14 fonts don't need embedding
              const standard14 = [
                'Courier', 'Courier-Bold', 'Courier-BoldOblique', 'Courier-Oblique',
                'Helvetica', 'Helvetica-Bold', 'Helvetica-BoldOblique', 'Helvetica-Oblique',
                'Times-Roman', 'Times-Bold', 'Times-BoldItalic', 'Times-Italic',
                'Symbol', 'ZapfDingbats',
              ];
              if (!standard14.includes(name) && !unembedded.includes(name)) {
                unembedded.push(name);
              }
            }
          }
        }
      }
    } catch {
      // Ignore errors
    }
    return unembedded;
  }
}
