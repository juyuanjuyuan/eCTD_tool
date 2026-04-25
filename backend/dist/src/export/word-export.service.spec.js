"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const word_export_service_1 = require("./word-export.service");
describe('WordExportService', () => {
    let service;
    beforeEach(() => {
        service = new word_export_service_1.WordExportService();
    });
    describe('exportDocument', () => {
        it('should export empty document', async () => {
            const content = { type: 'doc', content: [] };
            const buffer = await service.exportDocument(content);
            expect(buffer).toBeInstanceOf(Buffer);
            expect(buffer.length).toBeGreaterThan(0);
            expect(buffer[0]).toBe(0x50);
            expect(buffer[1]).toBe(0x4B);
        });
        it('should export document with paragraph', async () => {
            const content = {
                type: 'doc',
                content: [
                    {
                        type: 'paragraph',
                        content: [
                            { type: 'text', text: '这是一段中文测试内容' },
                        ],
                    },
                ],
            };
            const buffer = await service.exportDocument(content);
            expect(buffer).toBeInstanceOf(Buffer);
            expect(buffer.length).toBeGreaterThan(100);
        });
        it('should export document with headings H1-H6', async () => {
            const content = {
                type: 'doc',
                content: [
                    { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: '一级标题' }] },
                    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '二级标题' }] },
                    { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: '三级标题' }] },
                    { type: 'heading', attrs: { level: 4 }, content: [{ type: 'text', text: '四级标题' }] },
                    { type: 'heading', attrs: { level: 5 }, content: [{ type: 'text', text: '五级标题' }] },
                    { type: 'heading', attrs: { level: 6 }, content: [{ type: 'text', text: '六级标题' }] },
                ],
            };
            const buffer = await service.exportDocument(content);
            expect(buffer).toBeInstanceOf(Buffer);
            expect(buffer.length).toBeGreaterThan(100);
        });
        it('should export document with formatted text (bold, italic, underline, strike)', async () => {
            const content = {
                type: 'doc',
                content: [
                    {
                        type: 'paragraph',
                        content: [
                            { type: 'text', text: '加粗', marks: [{ type: 'bold' }] },
                            { type: 'text', text: '斜体', marks: [{ type: 'italic' }] },
                            { type: 'text', text: '下划线', marks: [{ type: 'underline' }] },
                            { type: 'text', text: '删除线', marks: [{ type: 'strike' }] },
                        ],
                    },
                ],
            };
            const buffer = await service.exportDocument(content);
            expect(buffer).toBeInstanceOf(Buffer);
        });
        it('should export document with bullet list', async () => {
            const content = {
                type: 'doc',
                content: [
                    {
                        type: 'bulletList',
                        content: [
                            {
                                type: 'listItem',
                                content: [
                                    { type: 'paragraph', content: [{ type: 'text', text: '项目一' }] },
                                ],
                            },
                            {
                                type: 'listItem',
                                content: [
                                    { type: 'paragraph', content: [{ type: 'text', text: '项目二' }] },
                                ],
                            },
                        ],
                    },
                ],
            };
            const buffer = await service.exportDocument(content);
            expect(buffer).toBeInstanceOf(Buffer);
        });
        it('should export document with ordered list', async () => {
            const content = {
                type: 'doc',
                content: [
                    {
                        type: 'orderedList',
                        content: [
                            {
                                type: 'listItem',
                                content: [
                                    { type: 'paragraph', content: [{ type: 'text', text: '第一点' }] },
                                ],
                            },
                            {
                                type: 'listItem',
                                content: [
                                    { type: 'paragraph', content: [{ type: 'text', text: '第二点' }] },
                                ],
                            },
                        ],
                    },
                ],
            };
            const buffer = await service.exportDocument(content);
            expect(buffer).toBeInstanceOf(Buffer);
        });
        it('should export document with table', async () => {
            const content = {
                type: 'doc',
                content: [
                    {
                        type: 'table',
                        content: [
                            {
                                type: 'tableRow',
                                content: [
                                    {
                                        type: 'tableHeader',
                                        attrs: { colspan: 1, rowspan: 1 },
                                        content: [{ type: 'paragraph', content: [{ type: 'text', text: '列标题' }] }],
                                    },
                                ],
                            },
                            {
                                type: 'tableRow',
                                content: [
                                    {
                                        type: 'tableCell',
                                        attrs: { colspan: 1, rowspan: 1 },
                                        content: [{ type: 'paragraph', content: [{ type: 'text', text: '数据' }] }],
                                    },
                                ],
                            },
                        ],
                    },
                ],
            };
            const buffer = await service.exportDocument(content);
            expect(buffer).toBeInstanceOf(Buffer);
        });
        it('should export document with table containing colspan/rowspan', async () => {
            const content = {
                type: 'doc',
                content: [
                    {
                        type: 'table',
                        content: [
                            {
                                type: 'tableRow',
                                content: [
                                    {
                                        type: 'tableCell',
                                        attrs: { colspan: 2, rowspan: 1 },
                                        content: [{ type: 'paragraph', content: [{ type: 'text', text: '合并列' }] }],
                                    },
                                ],
                            },
                            {
                                type: 'tableRow',
                                content: [
                                    {
                                        type: 'tableCell',
                                        attrs: { colspan: 1, rowspan: 2 },
                                        content: [{ type: 'paragraph', content: [{ type: 'text', text: '合并行' }] }],
                                    },
                                    {
                                        type: 'tableCell',
                                        attrs: { colspan: 1, rowspan: 1 },
                                        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'A' }] }],
                                    },
                                ],
                            },
                        ],
                    },
                ],
            };
            const buffer = await service.exportDocument(content);
            expect(buffer).toBeInstanceOf(Buffer);
        });
        it('should export document with blockquote', async () => {
            const content = {
                type: 'doc',
                content: [
                    {
                        type: 'blockquote',
                        content: [
                            { type: 'paragraph', content: [{ type: 'text', text: '引用内容' }] },
                        ],
                    },
                ],
            };
            const buffer = await service.exportDocument(content);
            expect(buffer).toBeInstanceOf(Buffer);
        });
        it('should export document with horizontal rule', async () => {
            const content = {
                type: 'doc',
                content: [
                    { type: 'paragraph', content: [{ type: 'text', text: '上面' }] },
                    { type: 'horizontalRule' },
                    { type: 'paragraph', content: [{ type: 'text', text: '下面' }] },
                ],
            };
            const buffer = await service.exportDocument(content);
            expect(buffer).toBeInstanceOf(Buffer);
        });
        it('should export document with image placeholder', async () => {
            const content = {
                type: 'doc',
                content: [
                    { type: 'image', attrs: { src: 'http://example.com/img.png' } },
                ],
            };
            const buffer = await service.exportDocument(content);
            expect(buffer).toBeInstanceOf(Buffer);
        });
        it('should export document with link', async () => {
            const content = {
                type: 'doc',
                content: [
                    {
                        type: 'paragraph',
                        content: [
                            {
                                type: 'text',
                                text: '点击这里',
                                marks: [{ type: 'link', attrs: { href: 'https://example.com' } }],
                            },
                        ],
                    },
                ],
            };
            const buffer = await service.exportDocument(content);
            expect(buffer).toBeInstanceOf(Buffer);
        });
        it('should export document with hardBreak', async () => {
            const content = {
                type: 'doc',
                content: [
                    {
                        type: 'paragraph',
                        content: [
                            { type: 'text', text: '第一行' },
                            { type: 'hardBreak' },
                            { type: 'text', text: '第二行' },
                        ],
                    },
                ],
            };
            const buffer = await service.exportDocument(content);
            expect(buffer).toBeInstanceOf(Buffer);
        });
        it('should handle text alignment (center, right, justify)', async () => {
            const content = {
                type: 'doc',
                content: [
                    { type: 'paragraph', attrs: { textAlign: 'center' }, content: [{ type: 'text', text: '居中' }] },
                    { type: 'paragraph', attrs: { textAlign: 'right' }, content: [{ type: 'text', text: '右对齐' }] },
                    { type: 'paragraph', attrs: { textAlign: 'justify' }, content: [{ type: 'text', text: '两端对齐' }] },
                ],
            };
            const buffer = await service.exportDocument(content);
            expect(buffer).toBeInstanceOf(Buffer);
        });
        it('should apply header text from options', async () => {
            const content = {
                type: 'doc',
                content: [
                    { type: 'paragraph', content: [{ type: 'text', text: '内容' }] },
                ],
            };
            const buffer = await service.exportDocument(content, { headerText: '模块三 质量' });
            expect(buffer).toBeInstanceOf(Buffer);
        });
        it('should handle null content gracefully', async () => {
            const content = { type: 'doc' };
            const buffer = await service.exportDocument(content);
            expect(buffer).toBeInstanceOf(Buffer);
        });
        it('should handle unknown node types gracefully', async () => {
            const content = {
                type: 'doc',
                content: [
                    { type: 'unknownType', content: [
                            { type: 'paragraph', content: [{ type: 'text', text: 'nested' }] },
                        ] },
                ],
            };
            const buffer = await service.exportDocument(content);
            expect(buffer).toBeInstanceOf(Buffer);
        });
        it('should handle nested lists', async () => {
            const content = {
                type: 'doc',
                content: [
                    {
                        type: 'bulletList',
                        content: [
                            {
                                type: 'listItem',
                                content: [
                                    { type: 'paragraph', content: [{ type: 'text', text: '顶层' }] },
                                    {
                                        type: 'orderedList',
                                        content: [
                                            {
                                                type: 'listItem',
                                                content: [
                                                    { type: 'paragraph', content: [{ type: 'text', text: '嵌套项' }] },
                                                ],
                                            },
                                        ],
                                    },
                                ],
                            },
                        ],
                    },
                ],
            };
            const buffer = await service.exportDocument(content);
            expect(buffer).toBeInstanceOf(Buffer);
        });
        it('should produce complex document with all node types combined', async () => {
            const content = {
                type: 'doc',
                content: [
                    { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: '文档标题' }] },
                    { type: 'paragraph', content: [{ type: 'text', text: '正文内容。' }] },
                    { type: 'bulletList', content: [
                            { type: 'listItem', content: [
                                    { type: 'paragraph', content: [{ type: 'text', text: '列表项' }] },
                                ] },
                        ] },
                    { type: 'horizontalRule' },
                    { type: 'blockquote', content: [
                            { type: 'paragraph', content: [{ type: 'text', text: '引用' }] },
                        ] },
                    { type: 'table', content: [
                            { type: 'tableRow', content: [
                                    { type: 'tableCell', attrs: { colspan: 1, rowspan: 1 }, content: [
                                            { type: 'paragraph', content: [{ type: 'text', text: '单元格' }] },
                                        ] },
                                ] },
                        ] },
                ],
            };
            const buffer = await service.exportDocument(content, {
                headerText: '3.2.S',
                sectionTitle: '原料药',
            });
            expect(buffer).toBeInstanceOf(Buffer);
            expect(buffer.length).toBeGreaterThan(1000);
        });
    });
});
//# sourceMappingURL=word-export.service.spec.js.map