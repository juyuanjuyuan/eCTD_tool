"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.PDFExportService = void 0;
const common_1 = require("@nestjs/common");
const puppeteer = __importStar(require("puppeteer"));
const pdf_lib_1 = require("pdf-lib");
let PDFExportService = class PDFExportService {
    browser = null;
    pagePool = [];
    maxPoolSize = parseInt(process.env.PUPPETEER_POOL_SIZE || '3', 10);
    pageWaiters = [];
    async onModuleDestroy() {
        for (const page of this.pagePool) {
            await page.close().catch(() => { });
        }
        this.pagePool.length = 0;
        await this.browser?.close();
    }
    async acquirePage() {
        if (this.pagePool.length > 0) {
            return this.pagePool.pop();
        }
        if (!this.browser) {
            this.browser = await puppeteer.launch({
                headless: true,
                args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
            });
        }
        return this.browser.newPage();
    }
    releasePage(page) {
        if (this.pageWaiters.length > 0) {
            const waiter = this.pageWaiters.shift();
            waiter(page);
            return;
        }
        if (this.pagePool.length < this.maxPoolSize) {
            this.pagePool.push(page);
        }
        else {
            page.close().catch(() => { });
        }
    }
    async exportToPDF(contentHtml, headings, options = {}) {
        const page = await this.acquirePage();
        try {
            const fullHtml = this.wrapWithEctdCss(contentHtml, options);
            await page.setContent(fullHtml, { waitUntil: 'networkidle0', timeout: 30000 });
            const pageHeadings = await this.extractHeadingsFromPage(page);
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
            const processedPdf = await this.postProcessPDF(Buffer.from(pdfBytes), pageHeadings.length > 0 ? pageHeadings : headings);
            return processedPdf;
        }
        finally {
            this.releasePage(page);
        }
    }
    async extractHeadingsFromPage(page) {
        return page.evaluate(() => {
            const headings = [];
            const els = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
            els.forEach((el) => {
                const level = parseInt(el.tagName.substring(1), 10);
                headings.push({
                    text: el.textContent?.trim() || '',
                    level,
                    pageIndex: 0,
                });
            });
            return headings;
        });
    }
    async postProcessPDF(pdfBuffer, headings) {
        const pdfDoc = await pdf_lib_1.PDFDocument.load(pdfBuffer);
        const pageCount = pdfDoc.getPageCount();
        if (headings.length > 0 && pageCount > 0) {
            this.addBookmarks(pdfDoc, headings, pageCount);
        }
        const catalog = pdfDoc.catalog;
        catalog.set(pdfDoc.context.obj('PageMode'), pdfDoc.context.obj('UseOutlines'));
        pdfDoc.setTitle('eCTD Document');
        pdfDoc.setProducer('eCTD Tool');
        const resultBytes = await pdfDoc.save();
        return Buffer.from(resultBytes);
    }
    addBookmarks(pdfDoc, headings, pageCount) {
        if (headings.length === 0)
            return;
        const context = pdfDoc.context;
        const pages = pdfDoc.getPages();
        const assignedHeadings = headings.map((h, i) => ({
            ...h,
            pageIndex: Math.min(Math.floor((i / headings.length) * pageCount), pageCount - 1),
        }));
        const outlineItems = [];
        for (const heading of assignedHeadings) {
            const page = pages[heading.pageIndex];
            if (!page)
                continue;
            const pageRef = pdfDoc.getPage(heading.pageIndex).ref;
            const destArray = context.obj([pageRef, context.obj('Fit')]);
            const outlineItemDict = {
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
        if (outlineItems.length === 0)
            return;
        for (let i = 0; i < outlineItems.length; i++) {
            const item = outlineItems[i];
            const dict = context.lookup(item.ref);
            if (i > 0) {
                dict.set(context.obj('Prev'), outlineItems[i - 1].ref);
            }
            if (i < outlineItems.length - 1) {
                dict.set(context.obj('Next'), outlineItems[i + 1].ref);
            }
        }
        const outlineDict = {
            Type: context.obj('Outlines'),
            First: outlineItems[0].ref,
            Last: outlineItems[outlineItems.length - 1].ref,
            Count: context.obj(outlineItems.length),
        };
        const outlineRef = context.register(context.obj(outlineDict));
        for (const item of outlineItems) {
            const dict = context.lookup(item.ref);
            dict.set(context.obj('Parent'), outlineRef);
        }
        pdfDoc.catalog.set(context.obj('Outlines'), outlineRef);
    }
    wrapWithEctdCss(content, options) {
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
    stripExternalLinks(html) {
        const removedLinks = [];
        const stripped = html.replace(/<a\s+([^>]*?)href=["']((?:https?:\/\/|mailto:)[^"']*?)["']([^>]*?)>(.*?)<\/a>/gi, (_match, beforeHref, href, afterHref, text) => {
            removedLinks.push(href);
            return `<span style="color:#1890ff">${text}</span>`;
        });
        return { html: stripped, removedLinks };
    }
};
exports.PDFExportService = PDFExportService;
exports.PDFExportService = PDFExportService = __decorate([
    (0, common_1.Injectable)()
], PDFExportService);
//# sourceMappingURL=pdf-export.service.js.map