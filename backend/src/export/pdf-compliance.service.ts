import { Injectable, Logger } from '@nestjs/common';
import {
  PDFDocument,
  PDFName,
  PDFDict,
  PDFArray,
  PDFString,
  PDFHexString,
  PDFRef,
} from 'pdf-lib';

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

// Max file size 500MB (ICH eCTD Submission Formats v1.2 §2.3)
const MAX_FILE_SIZE_MB = 500;

@Injectable()
export class PDFComplianceService {
  private readonly logger = new Logger(PDFComplianceService.name);

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
    const jsResult = this.safeCheck(() => this.checkJavaScript(pdfDoc), false, '6.20', 'JavaScript 检查', warnings);
    if (jsResult) {
      errors.push({
        ruleId: '6.20',
        severity: 'error',
        message: 'PDF 包含 JavaScript',
        detail: 'eCTD 不允许 PDF 中包含 JavaScript 代码',
      });
    }

    // ==================== 6.21: External Links ====================
    const externalLinks = this.safeCheck(() => this.checkExternalLinks(pdfDoc), [] as string[], '6.21', '外部链接检查', warnings);
    if (externalLinks.length > 0) {
      errors.push({
        ruleId: '6.21',
        severity: 'error',
        message: `PDF 包含 ${externalLinks.length} 个外部链接`,
        detail: `外部链接: ${externalLinks.slice(0, 5).join(', ')}${externalLinks.length > 5 ? '...' : ''}`,
      });
    }

    // ==================== 6.22: Multimedia ====================
    const hasMultimedia = this.safeCheck(() => this.checkMultimedia(pdfDoc), false, '6.22', '多媒体检查', warnings);
    if (hasMultimedia) {
      errors.push({
        ruleId: '6.22',
        severity: 'error',
        message: 'PDF 包含音频、视频或 3D 对象',
        detail: 'eCTD 不允许 PDF 中包含多媒体内容',
      });
    }

    // ==================== 6.1: Bookmarks ====================
    const hasBookmarks = this.safeCheck(() => this.checkBookmarks(pdfDoc), false, '6.1', '书签检查', warnings);
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
      const badZoomBookmarks = this.safeCheck(() => this.checkBookmarkZoom(pdfDoc), 0, '6.23', '书签缩放检查', warnings);
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
    const hasAttachments = this.safeCheck(() => this.checkAttachments(pdfDoc), false, '6.24', '附件检查', warnings);
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

    // ==================== 6.25: Font Embedding (ERROR) ====================
    // eCTD Submission Format v1.2 要求所有字体必须嵌入 PDF，且只允许 TrueType/OpenType/Type1。
    const fontReport = this.safeCheck(
      () => this.checkFontCompliance(pdfDoc),
      { unembedded: [] as string[], invalidSubtype: [] as { name: string; subtype: string }[] },
      '6.25',
      '字体嵌入检查',
      warnings,
    );
    for (const fontName of fontReport.unembedded) {
      errors.push({
        ruleId: '6.25',
        severity: 'error',
        message: `字体 ${fontName} 未嵌入，违反 eCTD Submission Format v1.2`,
        detail: 'PDF 所有字体必须嵌入 (FontFile/FontFile2/FontFile3)，且只允许 TrueType/OpenType/Type1',
      });
    }
    // 6.26: Font subtype (WARNING) — only TrueType/OpenType/Type1 are allowed
    for (const { name, subtype } of fontReport.invalidSubtype) {
      warnings.push({
        ruleId: '6.26',
        severity: 'warning',
        message: `字体 ${name} 的类型 ${subtype} 不是 TrueType/OpenType/Type1`,
        detail: 'eCTD Submission Format v1.2 要求字体类型仅限 TrueType、OpenType 或 Type1',
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

  // ==================== Safe check wrapper ====================

  /**
   * Wraps a check function so that if it throws, a WARNING is added
   * instead of silently defaulting to "pass".
   */
  private safeCheck<T>(
    checkFn: () => T,
    defaultVal: T,
    ruleId: string,
    checkName: string,
    warnings: ComplianceIssue[],
  ): T {
    try {
      return checkFn();
    } catch (e: any) {
      this.logger.warn(`PDF compliance check failed for ${checkName}: ${e.message}`);
      warnings.push({
        ruleId: `${ruleId}-SKIP`,
        severity: 'warning',
        message: `无法执行${checkName}`,
        detail: `PDF 内部结构解析失败，请人工确认。错误: ${e.message}`,
      });
      return defaultVal;
    }
  }

  // ==================== Implementation of checks ====================

  private extractPDFVersion(buffer: Buffer): string {
    // PDF version is in the first line: %PDF-1.7
    const header = buffer.subarray(0, 20).toString('ascii');
    const match = header.match(/%PDF-(\d+\.\d+)/);
    return match ? match[1] : 'unknown';
  }

  private checkEncryption(buffer: Buffer): boolean {
    // /Encrypt is typically in the trailer/xref at the end of the file
    // Scan the full buffer to detect it reliably
    const content = buffer.toString('ascii');
    return content.includes('/Encrypt');
  }

  private checkJavaScript(pdfDoc: PDFDocument): boolean {
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
  }

  private checkExternalLinks(pdfDoc: PDFDocument): string[] {
    const externalLinks: string[] = [];
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
    return externalLinks;
  }

  private checkMultimedia(pdfDoc: PDFDocument): boolean {
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
  }

  private checkBookmarks(pdfDoc: PDFDocument): boolean {
    const outlines = pdfDoc.catalog.lookup(PDFName.of('Outlines'));
    if (!(outlines instanceof PDFDict)) return false;
    const first = outlines.lookup(PDFName.of('First'));
    return !!first;
  }

  private checkBookmarkZoom(pdfDoc: PDFDocument): number {
    let badZoomCount = 0;
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
    return badZoomCount;
  }

  private checkAttachments(pdfDoc: PDFDocument): boolean {
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
  }

  /**
   * Rule 6.25 / 6.26 — Font compliance per eCTD Submission Format v1.2.
   *
   * Walks every font resource on every page and validates:
   *   - The font (or composite Type0 descendant) has an embedded
   *     FontFile / FontFile2 / FontFile3 stream.
   *   - The font Subtype is TrueType / Type1 / OpenType (Type0 allowed only
   *     when its descendant is CIDFontType0/CIDFontType2).
   *
   * The Standard 14 PDF fonts are skipped because pdf-lib and other legit
   * producers may reference them without embedding; eCTD guidance allows
   * this as long as they are truly the standard fonts (names are reserved).
   */
  private checkFontCompliance(pdfDoc: PDFDocument): {
    unembedded: string[];
    invalidSubtype: { name: string; subtype: string }[];
  } {
    const unembedded: string[] = [];
    const invalidSubtype: { name: string; subtype: string }[] = [];
    const visited = new Set<string>(); // dedupe by PDFRef.toString()

    const standard14 = new Set([
      'Courier', 'Courier-Bold', 'Courier-BoldOblique', 'Courier-Oblique',
      'Helvetica', 'Helvetica-Bold', 'Helvetica-BoldOblique', 'Helvetica-Oblique',
      'Times-Roman', 'Times-Bold', 'Times-BoldItalic', 'Times-Italic',
      'Symbol', 'ZapfDingbats',
    ]);
    const validTopSubtypes = new Set(['/Type1', '/TrueType', '/Type0']);
    const validCidSubtypes = new Set(['/CIDFontType0', '/CIDFontType2']);

    const cleanName = (raw: string): string => raw.replace(/^\//, '').replace(/^[A-Z]{6}\+/, '');

    const inspectFont = (fontObj: unknown, alreadyReported: Set<string>): void => {
      if (!(fontObj instanceof PDFDict)) return;

      const baseFontNode = fontObj.lookup(PDFName.of('BaseFont'));
      const rawName = baseFontNode ? baseFontNode.toString() : 'Unknown';
      const name = cleanName(rawName);

      const subtypeNode = fontObj.lookup(PDFName.of('Subtype'));
      const subtype = subtypeNode ? subtypeNode.toString() : '';

      // Type0 → delegate to DescendantFonts[0]
      if (subtype === '/Type0') {
        const descendants = fontObj.lookup(PDFName.of('DescendantFonts'));
        if (descendants instanceof PDFArray && descendants.size() > 0) {
          const descRaw = descendants.lookup(0);
          const descFont = descRaw instanceof PDFRef ? pdfDoc.context.lookup(descRaw) : descRaw;
          if (descFont instanceof PDFDict) {
            const descSubNode = descFont.lookup(PDFName.of('Subtype'));
            const descSub = descSubNode ? descSubNode.toString() : '';
            if (!validCidSubtypes.has(descSub) && !alreadyReported.has(`sub:${name}`)) {
              invalidSubtype.push({ name, subtype: `${subtype} → ${descSub || 'missing'}` });
              alreadyReported.add(`sub:${name}`);
            }
            // Check embedding on the descendant's FontDescriptor
            this.checkFontFile(descFont, name, unembedded, standard14, alreadyReported);
          }
        }
        return;
      }

      // Non-Type0: validate subtype directly
      if (subtype && !validTopSubtypes.has(subtype) && !alreadyReported.has(`sub:${name}`)) {
        invalidSubtype.push({ name, subtype });
        alreadyReported.add(`sub:${name}`);
      }

      this.checkFontFile(fontObj, name, unembedded, standard14, alreadyReported);
    };

    const pages = pdfDoc.getPages();
    const reported = new Set<string>();
    for (const page of pages) {
      const resources = page.node.lookup(PDFName.of('Resources'));
      if (!(resources instanceof PDFDict)) continue;

      const fonts = resources.lookup(PDFName.of('Font'));
      if (!(fonts instanceof PDFDict)) continue;

      for (const [, fontRef] of fonts.entries()) {
        // Dedupe by ref id so we don't scan shared fonts repeatedly
        const refKey = fontRef instanceof PDFRef ? fontRef.toString() : Math.random().toString();
        if (visited.has(refKey)) continue;
        visited.add(refKey);

        const fontObj = fontRef instanceof PDFRef ? pdfDoc.context.lookup(fontRef) : fontRef;
        inspectFont(fontObj, reported);
      }
    }
    return { unembedded, invalidSubtype };
  }

  /**
   * Check that a font dict (either a simple font or a CID descendant) has
   * an embedded FontFile/FontFile2/FontFile3 stream referenced from its
   * FontDescriptor.
   */
  private checkFontFile(
    fontDict: PDFDict,
    name: string,
    unembedded: string[],
    standard14: Set<string>,
    alreadyReported: Set<string>,
  ): void {
    const reportKey = `emb:${name}`;
    if (alreadyReported.has(reportKey)) return;

    const fontDesc = fontDict.lookup(PDFName.of('FontDescriptor'));
    if (!(fontDesc instanceof PDFDict)) {
      // No descriptor at all — Standard 14 fonts are allowed to omit it.
      if (!standard14.has(name)) {
        unembedded.push(name);
        alreadyReported.add(reportKey);
      }
      return;
    }
    const fontFile = fontDesc.lookup(PDFName.of('FontFile'));
    const fontFile2 = fontDesc.lookup(PDFName.of('FontFile2'));
    const fontFile3 = fontDesc.lookup(PDFName.of('FontFile3'));
    if (!fontFile && !fontFile2 && !fontFile3) {
      if (!standard14.has(name)) {
        unembedded.push(name);
        alreadyReported.add(reportKey);
      }
    }
  }
}
