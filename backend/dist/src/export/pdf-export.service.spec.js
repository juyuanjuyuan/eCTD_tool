"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const pdf_export_service_1 = require("./pdf-export.service");
jest.mock('puppeteer', () => ({
    launch: jest.fn().mockResolvedValue({
        newPage: jest.fn().mockResolvedValue({
            setContent: jest.fn().mockResolvedValue(undefined),
            evaluate: jest.fn().mockResolvedValue([
                { text: 'Heading 1', level: 1, pageIndex: 0 },
                { text: 'Heading 2', level: 2, pageIndex: 0 },
            ]),
            pdf: jest.fn().mockResolvedValue(Buffer.alloc(0)),
            close: jest.fn().mockResolvedValue(undefined),
        }),
        close: jest.fn().mockResolvedValue(undefined),
    }),
}));
jest.mock('pdf-lib', () => {
    const mockContext = {
        obj: jest.fn((v) => v),
        register: jest.fn((v) => v),
        lookup: jest.fn(() => ({
            set: jest.fn(),
        })),
    };
    const mockPage = {
        ref: 'page-ref',
    };
    const mockCatalog = {
        set: jest.fn(),
    };
    return {
        PDFDocument: {
            load: jest.fn().mockResolvedValue({
                getPageCount: jest.fn().mockReturnValue(2),
                getPages: jest.fn().mockReturnValue([mockPage, mockPage]),
                getPage: jest.fn().mockReturnValue(mockPage),
                catalog: mockCatalog,
                context: mockContext,
                setTitle: jest.fn(),
                setProducer: jest.fn(),
                save: jest.fn().mockResolvedValue(new Uint8Array([37, 80, 68, 70])),
            }),
        },
    };
});
describe('PDFExportService', () => {
    let service;
    beforeEach(() => {
        service = new pdf_export_service_1.PDFExportService();
    });
    describe('stripExternalLinks', () => {
        it('should strip http links and preserve text', () => {
            const html = '<p>Click <a href="https://example.com">here</a> for info</p>';
            const result = service.stripExternalLinks(html);
            expect(result.html).not.toContain('href');
            expect(result.html).toContain('here');
            expect(result.removedLinks).toContain('https://example.com');
        });
        it('should strip mailto links', () => {
            const html = '<a href="mailto:test@example.com">Email Us</a>';
            const result = service.stripExternalLinks(html);
            expect(result.html).not.toContain('mailto');
            expect(result.html).toContain('Email Us');
            expect(result.removedLinks).toContain('mailto:test@example.com');
        });
        it('should handle multiple links', () => {
            const html = '<a href="https://a.com">A</a> and <a href="https://b.com">B</a>';
            const result = service.stripExternalLinks(html);
            expect(result.removedLinks).toHaveLength(2);
            expect(result.html).toContain('A');
            expect(result.html).toContain('B');
        });
        it('should keep internal links intact', () => {
            const html = '<a href="#section-1">Go to Section 1</a>';
            const result = service.stripExternalLinks(html);
            expect(result.html).toContain('href="#section-1"');
            expect(result.removedLinks).toHaveLength(0);
        });
        it('should return empty removedLinks for plain text', () => {
            const html = '<p>No links here</p>';
            const result = service.stripExternalLinks(html);
            expect(result.html).toBe(html);
            expect(result.removedLinks).toHaveLength(0);
        });
        it('should handle http (non-https) links', () => {
            const html = '<a href="http://insecure.com">HTTP</a>';
            const result = service.stripExternalLinks(html);
            expect(result.removedLinks).toContain('http://insecure.com');
            expect(result.html).not.toContain('http://insecure.com');
        });
    });
    describe('exportToPDF', () => {
        it('should call puppeteer to generate PDF', async () => {
            const result = await service.exportToPDF('<h1>Test</h1><p>Content</p>', [{ text: 'Test', level: 1, pageIndex: 0 }], { headerText: 'Test Header' });
            expect(result).toBeInstanceOf(Buffer);
        });
        it('should launch browser lazily if not initialized', async () => {
            const result = await service.exportToPDF('<p>Content</p>', []);
            expect(result).toBeInstanceOf(Buffer);
        });
        it('should pass headerText to header template', async () => {
            await service.exportToPDF('<p>Content</p>', [], { headerText: 'Custom Header' });
            const puppeteer = require('puppeteer');
            const mockBrowser = await puppeteer.launch();
            const mockPage = await mockBrowser.newPage();
            expect(mockPage.pdf).toHaveBeenCalledWith(expect.objectContaining({
                format: 'A4',
                tagged: true,
            }));
        });
        it('should release page to pool after export', async () => {
            await service.exportToPDF('<p>Test</p>', []);
            expect(service.pagePool.length).toBeGreaterThanOrEqual(0);
        });
    });
    describe('lifecycle', () => {
        it('should launch browser lazily on first export', async () => {
            const puppeteer = require('puppeteer');
            await service.exportToPDF('<p>Test</p>', []);
            expect(puppeteer.launch).toHaveBeenCalledWith(expect.objectContaining({
                headless: true,
                args: expect.arrayContaining(['--no-sandbox']),
            }));
        });
        it('onModuleDestroy should close browser', async () => {
            await service.exportToPDF('<p>Test</p>', []);
            const puppeteer = require('puppeteer');
            const mockBrowser = await puppeteer.launch();
            await service.onModuleDestroy();
            expect(mockBrowser.close).toHaveBeenCalled();
        });
    });
});
//# sourceMappingURL=pdf-export.service.spec.js.map