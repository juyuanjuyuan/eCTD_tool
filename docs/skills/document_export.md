# Word/PDF 文档导出

## 1. Word 导出 (docx 库)

### 1.1 安装

```bash
npm install docx
```

### 1.2 基础导出服务

```typescript
// export/word-export.service.ts
import { Injectable } from '@nestjs/common';
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  Table, TableRow, TableCell, ImageRun,
  Header, Footer, PageNumber, NumberFormat,
  AlignmentType, WidthType, BorderStyle,
  TableOfContents,
} from 'docx';

@Injectable()
export class WordExportService {

  async exportDocument(content: TipTapJSON, options: ExportOptions): Promise<Buffer> {
    const children = this.convertTipTapToDocx(content);

    const doc = new Document({
      sections: [{
        properties: {
          page: {
            size: { width: 11906, height: 16838 }, // A4
            margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
          },
        },
        headers: {
          default: new Header({
            children: [new Paragraph({
              children: [new TextRun({ text: options.headerText, size: 18, font: '宋体' })],
              alignment: AlignmentType.RIGHT,
            })],
          }),
        },
        footers: {
          default: new Footer({
            children: [new Paragraph({
              children: [new TextRun({ children: [PageNumber.CURRENT] })],
              alignment: AlignmentType.CENTER,
            })],
          }),
        },
        children: [
          // 目录
          new TableOfContents("目录", { hyperlink: true }),
          ...children,
        ],
      }],
    });

    return await Packer.toBuffer(doc);
  }

  private convertTipTapToDocx(content: TipTapJSON): (Paragraph | Table)[] {
    const result = [];
    for (const node of content.content || []) {
      switch (node.type) {
        case 'heading':
          result.push(this.convertHeading(node));
          break;
        case 'paragraph':
          result.push(this.convertParagraph(node));
          break;
        case 'bulletList':
        case 'orderedList':
          result.push(...this.convertList(node));
          break;
        case 'table':
          result.push(this.convertTable(node));
          break;
        case 'blockquote':
          result.push(...this.convertBlockquote(node));
          break;
      }
    }
    return result;
  }

  private convertHeading(node: any): Paragraph {
    const level = node.attrs?.level || 1;
    const headingMap = {
      1: HeadingLevel.HEADING_1,
      2: HeadingLevel.HEADING_2,
      3: HeadingLevel.HEADING_3,
      4: HeadingLevel.HEADING_4,
      5: HeadingLevel.HEADING_5,
      6: HeadingLevel.HEADING_6,
    };

    return new Paragraph({
      heading: headingMap[level],
      children: this.convertInlineContent(node.content),
    });
  }

  private convertParagraph(node: any): Paragraph {
    return new Paragraph({
      children: this.convertInlineContent(node.content),
      spacing: { line: 360 }, // 1.5倍行距
    });
  }

  private convertInlineContent(content: any[]): TextRun[] {
    if (!content) return [new TextRun('')];
    return content.map(item => {
      const marks = item.marks || [];
      return new TextRun({
        text: item.text || '',
        bold: marks.some(m => m.type === 'bold'),
        italics: marks.some(m => m.type === 'italic'),
        underline: marks.some(m => m.type === 'underline') ? {} : undefined,
        strike: marks.some(m => m.type === 'strike'),
        font: '宋体',
        size: 24, // 12pt
      });
    });
  }

  private convertTable(node: any): Table {
    const rows = (node.content || []).map((row: any, rowIndex: number) => {
      const cells = (row.content || []).map((cell: any) => {
        return new TableCell({
          children: (cell.content || []).map(p => this.convertParagraph(p)),
          width: { size: 100 / row.content.length, type: WidthType.PERCENTAGE },
        });
      });
      return new TableRow({ children: cells });
    });
    return new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE } });
  }
}
```

## 2. PDF 导出 (Puppeteer)

### 2.1 安装

```bash
npm install puppeteer
```

### 2.2 PDF 导出服务

```typescript
// export/pdf-export.service.ts
import { Injectable } from '@nestjs/common';
import * as puppeteer from 'puppeteer';

@Injectable()
export class PDFExportService {
  private browser: puppeteer.Browser;

  async onModuleInit() {
    this.browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
  }

  async exportToPDF(html: string, options: PDFExportOptions): Promise<Buffer> {
    const page = await this.browser.newPage();

    try {
      // 设置 HTML 内容
      await page.setContent(this.wrapHtml(html, options), {
        waitUntil: 'networkidle0',
      });

      // 生成 PDF
      const pdfBuffer = await page.pdf({
        format: 'A4',
        margin: { top: '2cm', right: '2cm', bottom: '2cm', left: '2cm' },
        printBackground: true,
        displayHeaderFooter: true,
        headerTemplate: `<div style="font-size:9px;text-align:right;width:100%;padding-right:2cm;">
          ${options.headerText || ''}
        </div>`,
        footerTemplate: `<div style="font-size:9px;text-align:center;width:100%;">
          <span class="pageNumber"></span> / <span class="totalPages"></span>
        </div>`,
        tagged: true, // 生成 tagged PDF (可搜索)
      });

      return Buffer.from(pdfBuffer);
    } finally {
      await page.close();
    }
  }

  private wrapHtml(content: string, options: PDFExportOptions): string {
    return `<!DOCTYPE html>
    <html lang="zh-CN">
    <head>
      <meta charset="UTF-8">
      <style>
        body {
          font-family: 'SimSun', 'Times New Roman', serif;
          font-size: 12pt;
          line-height: 1.5;
          color: #000;
        }
        h1 { font-family: 'SimHei', sans-serif; font-size: 22pt; }
        h2 { font-family: 'SimHei', sans-serif; font-size: 16pt; }
        h3 { font-family: 'SimHei', sans-serif; font-size: 14pt; }
        table { border-collapse: collapse; width: 100%; }
        td, th { border: 1px solid #000; padding: 6px; }
        img { max-width: 100%; }
      </style>
    </head>
    <body>${content}</body>
    </html>`;
  }

  async onModuleDestroy() {
    await this.browser?.close();
  }
}
```

### 2.3 eCTD PDF 合规检查

```typescript
// PDF 必须满足 eCTD 要求:
// - 版本: 1.4, 1.5, 1.6, 1.7, PDF/A-1, PDF/A-2
// - 不加密，不设置安全限制
// - >5页必须有书签
// - 书签指向相对路径
// - 不包含 JavaScript
// - 不包含附件
// - 不包含外部链接（网页、邮箱）
// - 标准字体或嵌入字体
// - 文本可搜索 (OCR)
// - 初始视图显示书签
```

## 3. 异步导出任务

```typescript
// export/export.processor.ts
import { Process, Processor } from '@nestjs/bull';
import { Job } from 'bull';

@Processor('export')
export class ExportProcessor {
  constructor(
    private wordExport: WordExportService,
    private pdfExport: PDFExportService,
  ) {}

  @Process('word')
  async handleWordExport(job: Job) {
    const { nodeIds, sequenceId, options } = job.data;
    await job.progress(10);

    for (let i = 0; i < nodeIds.length; i++) {
      // 获取文档内容 → 导出 → 存储到 MinIO
      await job.progress(((i + 1) / nodeIds.length) * 100);
    }

    return { downloadUrl: '...' };
  }

  @Process('pdf')
  async handlePDFExport(job: Job) {
    // 类似 Word 导出流程
  }
}
```
