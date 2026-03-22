import { Injectable } from '@nestjs/common';
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  Header,
  Footer,
  PageNumber,
  AlignmentType,
  WidthType,
  TabStopPosition,
  TabStopType,
  LevelFormat,
  convertMillimetersToTwip,
  ExternalHyperlink,
  ImageRun,
} from 'docx';

interface ExportOptions {
  headerText?: string;
  sectionTitle?: string;
}

// TipTap JSON node type
interface TipTapNode {
  type: string;
  attrs?: Record<string, any>;
  content?: TipTapNode[];
  marks?: Array<{ type: string; attrs?: Record<string, any> }>;
  text?: string;
}

// eCTD font sizes in half-points (docx uses half-points)
const FONT_SIZE_BODY = 24; // 12pt = 24 half-points (小四号)
const FONT_SIZE_TABLE = 21; // 10.5pt = 21 half-points (五号)
const FONT_SIZE_H1 = 44; // 22pt
const FONT_SIZE_H2 = 32; // 16pt
const FONT_SIZE_H3 = 28; // 14pt
const FONT_SIZE_H4 = 24; // 12pt
const FONT_SIZE_H5 = 21; // 10.5pt
const FONT_SIZE_H6 = 21; // 10.5pt

const FONT_BODY = '宋体';
const FONT_HEADING = '黑体';
const LINE_SPACING = 360; // 1.5x line spacing (240 = single)

@Injectable()
export class WordExportService {
  async exportDocument(
    contentJson: TipTapNode,
    options: ExportOptions = {},
  ): Promise<Buffer> {
    const children = this.convertContent(contentJson);

    const doc = new Document({
      styles: {
        default: {
          document: {
            run: { font: FONT_BODY, size: FONT_SIZE_BODY, color: '000000' },
            paragraph: {
              spacing: { line: LINE_SPACING },
            },
          },
          heading1: {
            run: { font: FONT_HEADING, size: FONT_SIZE_H1, bold: true, color: '000000' },
            paragraph: { spacing: { before: 480, after: 240 } },
          },
          heading2: {
            run: { font: FONT_HEADING, size: FONT_SIZE_H2, bold: true, color: '000000' },
            paragraph: { spacing: { before: 400, after: 200 } },
          },
          heading3: {
            run: { font: FONT_HEADING, size: FONT_SIZE_H3, bold: true, color: '000000' },
            paragraph: { spacing: { before: 320, after: 160 } },
          },
          heading4: {
            run: { font: FONT_HEADING, size: FONT_SIZE_H4, bold: true, color: '000000' },
            paragraph: { spacing: { before: 240, after: 120 } },
          },
          heading5: {
            run: { font: FONT_HEADING, size: FONT_SIZE_H5, bold: true, color: '000000' },
            paragraph: { spacing: { before: 200, after: 100 } },
          },
          heading6: {
            run: { font: FONT_HEADING, size: FONT_SIZE_H6, bold: true, color: '000000' },
            paragraph: { spacing: { before: 160, after: 80 } },
          },
        },
      },
      numbering: {
        config: [
          {
            reference: 'ordered-list',
            levels: [
              { level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.START },
              { level: 1, format: LevelFormat.DECIMAL, text: '%1.%2.', alignment: AlignmentType.START },
              { level: 2, format: LevelFormat.DECIMAL, text: '%1.%2.%3.', alignment: AlignmentType.START },
            ],
          },
          {
            reference: 'bullet-list',
            levels: [
              { level: 0, format: LevelFormat.BULLET, text: '\u2022', alignment: AlignmentType.START },
              { level: 1, format: LevelFormat.BULLET, text: '\u25E6', alignment: AlignmentType.START },
              { level: 2, format: LevelFormat.BULLET, text: '\u25AA', alignment: AlignmentType.START },
            ],
          },
        ],
      },
      sections: [
        {
          properties: {
            page: {
              size: {
                width: convertMillimetersToTwip(210), // A4
                height: convertMillimetersToTwip(297),
              },
              margin: {
                top: convertMillimetersToTwip(20),
                right: convertMillimetersToTwip(20),
                bottom: convertMillimetersToTwip(20),
                left: convertMillimetersToTwip(20),
              },
            },
          },
          headers: {
            default: new Header({
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: options.headerText || options.sectionTitle || '',
                      font: FONT_BODY,
                      size: 18, // 9pt
                      color: '888888',
                    }),
                  ],
                  alignment: AlignmentType.RIGHT,
                  tabStops: [
                    { type: TabStopType.RIGHT, position: TabStopPosition.MAX },
                  ],
                }),
              ],
            }),
          },
          footers: {
            default: new Footer({
              children: [
                new Paragraph({
                  children: [
                    new TextRun({ children: [PageNumber.CURRENT] }),
                    new TextRun(' / '),
                    new TextRun({ children: [PageNumber.TOTAL_PAGES] }),
                  ],
                  alignment: AlignmentType.CENTER,
                }),
              ],
            }),
          },
          children,
        },
      ],
    });

    return Buffer.from(await Packer.toBuffer(doc));
  }

  // ==================== Content Conversion ====================

  private convertContent(content: TipTapNode): (Paragraph | Table)[] {
    if (!content?.content) return [];
    const result: (Paragraph | Table)[] = [];
    for (const node of content.content) {
      result.push(...this.convertNode(node));
    }
    return result;
  }

  private convertNode(node: TipTapNode): (Paragraph | Table)[] {
    switch (node.type) {
      case 'heading':
        return [this.convertHeading(node)];
      case 'paragraph':
        return [this.convertParagraph(node)];
      case 'bulletList':
        return this.convertList(node, 'bullet-list');
      case 'orderedList':
        return this.convertList(node, 'ordered-list');
      case 'table':
        return [this.convertTable(node)];
      case 'blockquote':
        return this.convertBlockquote(node);
      case 'horizontalRule':
        return [this.convertHorizontalRule()];
      case 'image':
        return [this.convertImagePlaceholder(node)];
      default:
        // Unknown node type — try to extract text
        if (node.content) {
          return node.content.flatMap((child) => this.convertNode(child));
        }
        return [];
    }
  }

  // ==================== Headings ====================

  private convertHeading(node: TipTapNode): Paragraph {
    const level = node.attrs?.level || 1;
    const headingMap: Record<number, (typeof HeadingLevel)[keyof typeof HeadingLevel]> = {
      1: HeadingLevel.HEADING_1,
      2: HeadingLevel.HEADING_2,
      3: HeadingLevel.HEADING_3,
      4: HeadingLevel.HEADING_4,
      5: HeadingLevel.HEADING_5,
      6: HeadingLevel.HEADING_6,
    };

    return new Paragraph({
      heading: headingMap[level] || HeadingLevel.HEADING_1,
      children: this.convertInlineContent(node.content, { isHeading: true }),
    });
  }

  // ==================== Paragraphs ====================

  private convertParagraph(node: TipTapNode): Paragraph {
    const alignment = this.getAlignment(node.attrs?.textAlign);
    return new Paragraph({
      children: this.convertInlineContent(node.content),
      spacing: { line: LINE_SPACING },
      alignment,
    });
  }

  // ==================== Lists ====================

  private convertList(node: TipTapNode, reference: string, level = 0): Paragraph[] {
    const result: Paragraph[] = [];
    for (const listItem of node.content || []) {
      for (const child of listItem.content || []) {
        if (child.type === 'paragraph') {
          result.push(
            new Paragraph({
              children: this.convertInlineContent(child.content),
              numbering: { reference, level },
              spacing: { line: LINE_SPACING },
            }),
          );
        } else if (child.type === 'bulletList' || child.type === 'orderedList') {
          const childRef = child.type === 'bulletList' ? 'bullet-list' : 'ordered-list';
          result.push(...this.convertList(child, childRef, level + 1));
        }
      }
    }
    return result;
  }

  // ==================== Tables ====================

  private convertTable(node: TipTapNode): Table {
    const rows: TableRow[] = [];

    for (const rowNode of node.content || []) {
      const cells: TableCell[] = [];
      for (const cellNode of rowNode.content || []) {
        const isHeader = cellNode.type === 'tableHeader';
        const paragraphs = (cellNode.content || []).map((p) =>
          new Paragraph({
            children: this.convertInlineContent(p.content, { fontSize: FONT_SIZE_TABLE }),
            spacing: { line: 280 },
          }),
        );

        const colspan = cellNode.attrs?.colspan || 1;
        const rowspan = cellNode.attrs?.rowspan || 1;

        cells.push(
          new TableCell({
            children: paragraphs.length > 0 ? paragraphs : [new Paragraph('')],
            width: { size: 0, type: WidthType.AUTO },
            columnSpan: colspan > 1 ? colspan : undefined,
            rowSpan: rowspan > 1 ? rowspan : undefined,
            shading: isHeader ? { fill: 'F5F5F5' } : undefined,
          }),
        );
      }
      rows.push(new TableRow({ children: cells }));
    }

    return new Table({
      rows,
      width: { size: 100, type: WidthType.PERCENTAGE },
    });
  }

  // ==================== Blockquote ====================

  private convertBlockquote(node: TipTapNode): Paragraph[] {
    const result: Paragraph[] = [];
    for (const child of node.content || []) {
      if (child.type === 'paragraph') {
        result.push(
          new Paragraph({
            children: this.convertInlineContent(child.content),
            spacing: { line: LINE_SPACING },
            indent: { left: convertMillimetersToTwip(10) },
            border: {
              left: { style: 'single' as any, size: 6, color: 'CCCCCC', space: 8 },
            },
          }),
        );
      }
    }
    return result;
  }

  // ==================== Horizontal Rule ====================

  private convertHorizontalRule(): Paragraph {
    return new Paragraph({
      border: { bottom: { style: 'single' as any, size: 6, color: 'CCCCCC' } },
      spacing: { before: 240, after: 240 },
    });
  }

  // ==================== Image Placeholder ====================

  private convertImagePlaceholder(node: TipTapNode): Paragraph {
    const src = node.attrs?.src || '';
    return new Paragraph({
      children: [
        new TextRun({
          text: `[图片: ${src}]`,
          font: FONT_BODY,
          size: FONT_SIZE_BODY,
          color: '888888',
          italics: true,
        }),
      ],
      spacing: { line: LINE_SPACING },
    });
  }

  // ==================== Inline Content ====================

  private convertInlineContent(
    content: TipTapNode[] | undefined,
    options: { isHeading?: boolean; fontSize?: number } = {},
  ): (TextRun | ExternalHyperlink)[] {
    if (!content) return [new TextRun('')];

    const result: (TextRun | ExternalHyperlink)[] = [];

    for (const item of content) {
      if (item.type === 'text') {
        const marks = item.marks || [];
        const isBold = marks.some((m) => m.type === 'bold');
        const isItalic = marks.some((m) => m.type === 'italic');
        const isUnderline = marks.some((m) => m.type === 'underline');
        const isStrike = marks.some((m) => m.type === 'strike');
        const linkMark = marks.find((m) => m.type === 'link');

        const font = options.isHeading ? FONT_HEADING : FONT_BODY;
        const size = options.fontSize || (options.isHeading ? undefined : FONT_SIZE_BODY);

        const run = new TextRun({
          text: item.text || '',
          bold: isBold,
          italics: isItalic,
          underline: isUnderline ? {} : undefined,
          strike: isStrike,
          font,
          size,
          color: linkMark ? '1890FF' : '000000',
        });

        if (linkMark?.attrs?.href) {
          result.push(
            new ExternalHyperlink({
              children: [run],
              link: linkMark.attrs.href,
            }),
          );
        } else {
          result.push(run);
        }
      } else if (item.type === 'hardBreak') {
        result.push(new TextRun({ break: 1 }));
      }
    }

    return result.length > 0 ? result : [new TextRun('')];
  }

  // ==================== Helpers ====================

  private getAlignment(textAlign?: string): (typeof AlignmentType)[keyof typeof AlignmentType] | undefined {
    switch (textAlign) {
      case 'center':
        return AlignmentType.CENTER;
      case 'right':
        return AlignmentType.RIGHT;
      case 'justify':
        return AlignmentType.JUSTIFIED;
      default:
        return undefined;
    }
  }
}
