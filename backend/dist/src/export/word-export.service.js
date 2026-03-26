"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WordExportService = void 0;
const common_1 = require("@nestjs/common");
const docx_1 = require("docx");
const FONT_SIZE_BODY = 24;
const FONT_SIZE_TABLE = 21;
const FONT_SIZE_H1 = 44;
const FONT_SIZE_H2 = 32;
const FONT_SIZE_H3 = 28;
const FONT_SIZE_H4 = 24;
const FONT_SIZE_H5 = 21;
const FONT_SIZE_H6 = 21;
const FONT_BODY = '宋体';
const FONT_HEADING = '黑体';
const LINE_SPACING = 360;
let WordExportService = class WordExportService {
    async exportDocument(contentJson, options = {}) {
        const children = this.convertContent(contentJson);
        const doc = new docx_1.Document({
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
                            { level: 0, format: docx_1.LevelFormat.DECIMAL, text: '%1.', alignment: docx_1.AlignmentType.START },
                            { level: 1, format: docx_1.LevelFormat.DECIMAL, text: '%1.%2.', alignment: docx_1.AlignmentType.START },
                            { level: 2, format: docx_1.LevelFormat.DECIMAL, text: '%1.%2.%3.', alignment: docx_1.AlignmentType.START },
                        ],
                    },
                    {
                        reference: 'bullet-list',
                        levels: [
                            { level: 0, format: docx_1.LevelFormat.BULLET, text: '\u2022', alignment: docx_1.AlignmentType.START },
                            { level: 1, format: docx_1.LevelFormat.BULLET, text: '\u25E6', alignment: docx_1.AlignmentType.START },
                            { level: 2, format: docx_1.LevelFormat.BULLET, text: '\u25AA', alignment: docx_1.AlignmentType.START },
                        ],
                    },
                ],
            },
            sections: [
                {
                    properties: {
                        page: {
                            size: {
                                width: (0, docx_1.convertMillimetersToTwip)(210),
                                height: (0, docx_1.convertMillimetersToTwip)(297),
                            },
                            margin: {
                                top: (0, docx_1.convertMillimetersToTwip)(20),
                                right: (0, docx_1.convertMillimetersToTwip)(20),
                                bottom: (0, docx_1.convertMillimetersToTwip)(20),
                                left: (0, docx_1.convertMillimetersToTwip)(20),
                            },
                        },
                    },
                    headers: {
                        default: new docx_1.Header({
                            children: [
                                new docx_1.Paragraph({
                                    children: [
                                        new docx_1.TextRun({
                                            text: options.headerText || options.sectionTitle || '',
                                            font: FONT_BODY,
                                            size: 18,
                                            color: '888888',
                                        }),
                                    ],
                                    alignment: docx_1.AlignmentType.RIGHT,
                                    tabStops: [
                                        { type: docx_1.TabStopType.RIGHT, position: docx_1.TabStopPosition.MAX },
                                    ],
                                }),
                            ],
                        }),
                    },
                    footers: {
                        default: new docx_1.Footer({
                            children: [
                                new docx_1.Paragraph({
                                    children: [
                                        new docx_1.TextRun({ children: [docx_1.PageNumber.CURRENT] }),
                                        new docx_1.TextRun(' / '),
                                        new docx_1.TextRun({ children: [docx_1.PageNumber.TOTAL_PAGES] }),
                                    ],
                                    alignment: docx_1.AlignmentType.CENTER,
                                }),
                            ],
                        }),
                    },
                    children,
                },
            ],
        });
        return Buffer.from(await docx_1.Packer.toBuffer(doc));
    }
    convertContent(content) {
        if (!content?.content)
            return [];
        const result = [];
        for (const node of content.content) {
            result.push(...this.convertNode(node));
        }
        return result;
    }
    convertNode(node) {
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
                if (node.content) {
                    return node.content.flatMap((child) => this.convertNode(child));
                }
                return [];
        }
    }
    convertHeading(node) {
        const level = node.attrs?.level || 1;
        const headingMap = {
            1: docx_1.HeadingLevel.HEADING_1,
            2: docx_1.HeadingLevel.HEADING_2,
            3: docx_1.HeadingLevel.HEADING_3,
            4: docx_1.HeadingLevel.HEADING_4,
            5: docx_1.HeadingLevel.HEADING_5,
            6: docx_1.HeadingLevel.HEADING_6,
        };
        return new docx_1.Paragraph({
            heading: headingMap[level] || docx_1.HeadingLevel.HEADING_1,
            children: this.convertInlineContent(node.content, { isHeading: true }),
        });
    }
    convertParagraph(node) {
        const alignment = this.getAlignment(node.attrs?.textAlign);
        return new docx_1.Paragraph({
            children: this.convertInlineContent(node.content),
            spacing: { line: LINE_SPACING },
            alignment,
        });
    }
    convertList(node, reference, level = 0) {
        const result = [];
        for (const listItem of node.content || []) {
            for (const child of listItem.content || []) {
                if (child.type === 'paragraph') {
                    result.push(new docx_1.Paragraph({
                        children: this.convertInlineContent(child.content),
                        numbering: { reference, level },
                        spacing: { line: LINE_SPACING },
                    }));
                }
                else if (child.type === 'bulletList' || child.type === 'orderedList') {
                    const childRef = child.type === 'bulletList' ? 'bullet-list' : 'ordered-list';
                    result.push(...this.convertList(child, childRef, level + 1));
                }
            }
        }
        return result;
    }
    convertTable(node) {
        const rows = [];
        for (const rowNode of node.content || []) {
            const cells = [];
            for (const cellNode of rowNode.content || []) {
                const isHeader = cellNode.type === 'tableHeader';
                const paragraphs = (cellNode.content || []).map((p) => new docx_1.Paragraph({
                    children: this.convertInlineContent(p.content, { fontSize: FONT_SIZE_TABLE }),
                    spacing: { line: 280 },
                }));
                const colspan = cellNode.attrs?.colspan || 1;
                const rowspan = cellNode.attrs?.rowspan || 1;
                cells.push(new docx_1.TableCell({
                    children: paragraphs.length > 0 ? paragraphs : [new docx_1.Paragraph('')],
                    width: { size: 0, type: docx_1.WidthType.AUTO },
                    columnSpan: colspan > 1 ? colspan : undefined,
                    rowSpan: rowspan > 1 ? rowspan : undefined,
                    shading: isHeader ? { fill: 'F5F5F5' } : undefined,
                }));
            }
            rows.push(new docx_1.TableRow({ children: cells }));
        }
        return new docx_1.Table({
            rows,
            width: { size: 100, type: docx_1.WidthType.PERCENTAGE },
        });
    }
    convertBlockquote(node) {
        const result = [];
        for (const child of node.content || []) {
            if (child.type === 'paragraph') {
                result.push(new docx_1.Paragraph({
                    children: this.convertInlineContent(child.content),
                    spacing: { line: LINE_SPACING },
                    indent: { left: (0, docx_1.convertMillimetersToTwip)(10) },
                    border: {
                        left: { style: 'single', size: 6, color: 'CCCCCC', space: 8 },
                    },
                }));
            }
        }
        return result;
    }
    convertHorizontalRule() {
        return new docx_1.Paragraph({
            border: { bottom: { style: 'single', size: 6, color: 'CCCCCC' } },
            spacing: { before: 240, after: 240 },
        });
    }
    convertImagePlaceholder(node) {
        const src = node.attrs?.src || '';
        return new docx_1.Paragraph({
            children: [
                new docx_1.TextRun({
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
    convertInlineContent(content, options = {}) {
        if (!content)
            return [new docx_1.TextRun('')];
        const result = [];
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
                const run = new docx_1.TextRun({
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
                    result.push(new docx_1.ExternalHyperlink({
                        children: [run],
                        link: linkMark.attrs.href,
                    }));
                }
                else {
                    result.push(run);
                }
            }
            else if (item.type === 'hardBreak') {
                result.push(new docx_1.TextRun({ break: 1 }));
            }
        }
        return result.length > 0 ? result : [new docx_1.TextRun('')];
    }
    getAlignment(textAlign) {
        switch (textAlign) {
            case 'center':
                return docx_1.AlignmentType.CENTER;
            case 'right':
                return docx_1.AlignmentType.RIGHT;
            case 'justify':
                return docx_1.AlignmentType.JUSTIFIED;
            default:
                return undefined;
        }
    }
};
exports.WordExportService = WordExportService;
exports.WordExportService = WordExportService = __decorate([
    (0, common_1.Injectable)()
], WordExportService);
//# sourceMappingURL=word-export.service.js.map