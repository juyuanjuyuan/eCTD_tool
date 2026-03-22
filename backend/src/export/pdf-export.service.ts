import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import * as puppeteer from 'puppeteer';
import { PDFDocument } from 'pdf-lib';

interface PDFExportOptions {
  headerText?: string;
  sectionTitle?: string;
}

interface HeadingInfo {
  text: string;
  level: number;
  pageIndex: number;
}

@Injectable()
export class PDFExportService implements OnModuleInit, OnModuleDestroy {
  private browser: puppeteer.Browser | null = null;

  async onModuleInit() {
    this.browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--font-render-hinting=none',
      ],
    });
  }

  async onModuleDestroy() {
    await this.browser?.close();
  }

  // ==================== Main Export ====================

  async exportToPDF(
    contentHtml: string,
    headings: HeadingInfo[],
    options: PDFExportOptions = {},
  ): Promise<Buffer> {
    if (!this.browser) {
      this.browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
      });
    }

    const page = await this.browser.newPage();

    try {
      // Set content with eCTD compliant CSS
      const fullHtml = this.wrapWithEctdCss(contentHtml, options);
      await page.setContent(fullHtml, { waitUntil: 'networkidle0', timeout: 30000 });

      // Extract heading info from DOM for bookmarks
      const pageHeadings = await this.extractHeadingsFromPage(page);

      // Generate PDF
      const pdfBytes = await page.pdf({
        format: 'A4',
        margin: {
          top: '2cm',
          right: '2cm',
          bottom: '2cm',
          left: '2cm',
        },
        printBackground: true,
        displayHeaderFooter: true,
        headerTemplate: `
          <div style="font-family: SimSun, serif; font-size: 9px; text-align: right; width: 100%; padding: 0 2cm; color: #888;">
            ${options.headerText || options.sectionTitle || ''}
          </div>`,
        footerTemplate: `
          <div style="font-family: SimSun, serif; font-size: 9px; text-align: center; width: 100%; color: #888;">
            <span class="pageNumber"></span> / <span class="totalPages"></span>
          </div>`,
        tagged: true,
      });

      // Post-process with pdf-lib: add bookmarks, set viewer preferences
      const processedPdf = await this.postProcessPDF(
        Buffer.from(pdfBytes),
        pageHeadings.length > 0 ? pageHeadings : headings,
      );

      return processedPdf;
    } finally {
      await page.close();
    }
  }

  // ==================== Extract Headings from Rendered Page ====================

  private async extractHeadingsFromPage(page: puppeteer.Page): Promise<HeadingInfo[]> {
    return page.evaluate(() => {
      const headings: Array<{ text: string; level: number; pageIndex: number }> = [];
      const els = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
      els.forEach((el) => {
        const level = parseInt(el.tagName.substring(1), 10);
        headings.push({
          text: el.textContent?.trim() || '',
          level,
          pageIndex: 0, // Will be approximated in postProcess
        });
      });
      return headings;
    });
  }

  // ==================== Post-Process PDF with pdf-lib ====================

  private async postProcessPDF(
    pdfBuffer: Buffer,
    headings: HeadingInfo[],
  ): Promise<Buffer> {
    const pdfDoc = await PDFDocument.load(pdfBuffer);
    const pageCount = pdfDoc.getPageCount();

    // Add bookmarks/outline if >5 pages or headings exist
    if (headings.length > 0 && pageCount > 0) {
      this.addBookmarks(pdfDoc, headings, pageCount);
    }

    // Set viewer preferences for eCTD compliance
    // Display bookmarks panel on open
    const catalog = pdfDoc.catalog;
    catalog.set(
      pdfDoc.context.obj('PageMode'),
      pdfDoc.context.obj('UseOutlines'),
    );

    // Save with metadata
    pdfDoc.setTitle('eCTD Document');
    pdfDoc.setProducer('eCTD Tool');

    const resultBytes = await pdfDoc.save();
    return Buffer.from(resultBytes);
  }

  // ==================== Bookmarks ====================

  private addBookmarks(
    pdfDoc: PDFDocument,
    headings: HeadingInfo[],
    pageCount: number,
  ): void {
    if (headings.length === 0) return;

    const context = pdfDoc.context;
    const pages = pdfDoc.getPages();

    // Distribute headings across pages proportionally
    const assignedHeadings = headings.map((h, i) => ({
      ...h,
      pageIndex: Math.min(
        Math.floor((i / headings.length) * pageCount),
        pageCount - 1,
      ),
    }));

    // Build outline hierarchy
    // Create outline entries
    const outlineItems: Array<{
      title: string;
      level: number;
      pageRef: any;
      ref: any;
      children: any[];
    }> = [];

    for (const heading of assignedHeadings) {
      const page = pages[heading.pageIndex];
      if (!page) continue;

      const pageRef = pdfDoc.getPage(heading.pageIndex).ref;

      // Create outline item dictionary
      // Use /Fit destination (Inherit Zoom equivalent for bookmarks)
      const destArray = context.obj([pageRef, context.obj('Fit')]);

      const outlineItemDict: Record<string, any> = {
        Title: context.obj(heading.text),
        Dest: destArray,
      };

      const ref = context.register(context.obj(outlineItemDict));
      outlineItems.push({
        title: heading.text,
        level: heading.level,
        pageRef,
        ref,
        children: [],
      });
    }

    if (outlineItems.length === 0) return;

    // Build flat linked list (simplified — no nesting for reliability)
    for (let i = 0; i < outlineItems.length; i++) {
      const item = outlineItems[i];
      const dict = context.lookup(item.ref) as any;

      if (i > 0) {
        dict.set(context.obj('Prev'), outlineItems[i - 1].ref);
      }
      if (i < outlineItems.length - 1) {
        dict.set(context.obj('Next'), outlineItems[i + 1].ref);
      }
    }

    // Create root outline
    const outlineDict: Record<string, any> = {
      Type: context.obj('Outlines'),
      First: outlineItems[0].ref,
      Last: outlineItems[outlineItems.length - 1].ref,
      Count: context.obj(outlineItems.length),
    };

    const outlineRef = context.register(context.obj(outlineDict));

    // Set parent on each item
    for (const item of outlineItems) {
      const dict = context.lookup(item.ref) as any;
      dict.set(context.obj('Parent'), outlineRef);
    }

    // Set outline on catalog
    pdfDoc.catalog.set(context.obj('Outlines'), outlineRef);
  }

  // ==================== eCTD Compliant HTML Wrapper ====================

  private wrapWithEctdCss(content: string, options: PDFExportOptions): string {
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <style>
    /* eCTD 技术规范 3.4 — PDF 格式要求 */
    @page {
      size: A4;
      margin: 0;
    }

    body {
      font-family: 'SimSun', 'Songti SC', 'Times New Roman', serif;
      font-size: 12pt;
      line-height: 1.5;
      color: #000;
      margin: 0;
      padding: 0;
    }

    /* 标题 — 黑体 */
    h1 { font-family: 'SimHei', 'Heiti SC', sans-serif; font-size: 22pt; font-weight: bold; margin: 24pt 0 12pt; }
    h2 { font-family: 'SimHei', 'Heiti SC', sans-serif; font-size: 16pt; font-weight: bold; margin: 20pt 0 10pt; }
    h3 { font-family: 'SimHei', 'Heiti SC', sans-serif; font-size: 14pt; font-weight: bold; margin: 16pt 0 8pt; }
    h4 { font-family: 'SimHei', 'Heiti SC', sans-serif; font-size: 12pt; font-weight: bold; margin: 12pt 0 6pt; }
    h5 { font-family: 'SimHei', 'Heiti SC', sans-serif; font-size: 10.5pt; font-weight: bold; margin: 10pt 0 5pt; }
    h6 { font-family: 'SimHei', 'Heiti SC', sans-serif; font-size: 10.5pt; font-weight: bold; margin: 8pt 0 4pt; }

    p { margin: 0 0 6pt; }

    /* 表格 — 不小于五号字 */
    table {
      border-collapse: collapse;
      width: 100%;
      margin: 8pt 0;
      font-size: 10.5pt;
    }
    td, th {
      border: 0.5pt solid #000;
      padding: 4pt 6pt;
      vertical-align: top;
    }
    th {
      background: #f5f5f5;
      font-weight: bold;
      text-align: center;
    }

    /* 列表 */
    ul, ol { padding-left: 20pt; margin: 6pt 0; }
    li { margin: 2pt 0; }

    /* 引用块 */
    blockquote {
      border-left: 2pt solid #ccc;
      padding-left: 12pt;
      margin: 8pt 0;
      color: #333;
    }

    /* 图片 */
    img {
      max-width: 100%;
      height: auto;
      display: block;
      margin: 8pt 0;
    }

    /* 超链接 — eCTD: 蓝色文字，PDF中将被剥除外部链接 */
    a { color: #1890ff; text-decoration: underline; }

    /* 水平线 */
    hr {
      border: none;
      border-top: 0.5pt solid #ccc;
      margin: 12pt 0;
    }
  </style>
</head>
<body>
${content}
</body>
</html>`;
  }

  // ==================== Strip External Links from HTML ====================

  /**
   * Remove external links from HTML before PDF generation.
   * eCTD requires: no external URLs (http/https/mailto) in PDF.
   * Keeps link text but removes the href.
   * Returns stripped HTML and list of removed links.
   */
  stripExternalLinks(html: string): { html: string; removedLinks: string[] } {
    const removedLinks: string[] = [];

    // Match <a> tags with external hrefs
    const stripped = html.replace(
      /<a\s+([^>]*?)href=["']((?:https?:\/\/|mailto:)[^"']*?)["']([^>]*?)>(.*?)<\/a>/gi,
      (_match, beforeHref, href, afterHref, text) => {
        removedLinks.push(href);
        return `<span style="color:#1890ff">${text}</span>`;
      },
    );

    return { html: stripped, removedLinks };
  }
}
