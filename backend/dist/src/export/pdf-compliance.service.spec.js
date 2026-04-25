"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const pdf_compliance_service_1 = require("./pdf-compliance.service");
const pdf_lib_1 = require("pdf-lib");
describe('PDFComplianceService', () => {
    let service;
    beforeEach(() => {
        service = new pdf_compliance_service_1.PDFComplianceService();
    });
    async function createMinimalPdf(options = {}) {
        const pdfDoc = await pdf_lib_1.PDFDocument.create();
        const pages = options.pageCount || 1;
        for (let i = 0; i < pages; i++) {
            pdfDoc.addPage();
        }
        const bytes = await pdfDoc.save();
        let buffer = Buffer.from(bytes);
        if (options.version) {
            const header = `%PDF-${options.version}`;
            buffer.write(header, 0, 'ascii');
        }
        return buffer;
    }
    describe('checkCompliance - basic valid PDF', () => {
        it('should pass for a compliant PDF with 1 page', async () => {
            const buffer = await createMinimalPdf({ version: '1.7' });
            const result = await service.checkCompliance(buffer);
            expect(result.isCompliant).toBe(true);
            expect(result.errors).toHaveLength(0);
            expect(result.summary.pageCount).toBe(1);
            expect(result.summary.pdfVersion).toBe('1.7');
        });
        it('should pass for PDF versions 1.4-1.7', async () => {
            for (const version of ['1.4', '1.5', '1.6', '1.7']) {
                const buffer = await createMinimalPdf({ version });
                const result = await service.checkCompliance(buffer);
                expect(result.errors.filter(e => e.ruleId === '6.18')).toHaveLength(0);
            }
        });
    });
    describe('checkCompliance - 6.18 PDF Version', () => {
        it('should error for unsupported PDF version 2.0', async () => {
            const buffer = await createMinimalPdf({ version: '2.0' });
            const result = await service.checkCompliance(buffer);
            const versionError = result.errors.find(e => e.ruleId === '6.18');
            expect(versionError).toBeDefined();
            expect(versionError.severity).toBe('error');
            expect(versionError.message).toContain('2.0');
        });
        it('should error for PDF version 1.3', async () => {
            const buffer = await createMinimalPdf({ version: '1.3' });
            const result = await service.checkCompliance(buffer);
            const versionError = result.errors.find(e => e.ruleId === '6.18');
            expect(versionError).toBeDefined();
        });
    });
    describe('checkCompliance - 6.0 invalid PDF', () => {
        it('should error for unparseable buffer', async () => {
            const buffer = Buffer.from('not a pdf file');
            const result = await service.checkCompliance(buffer);
            expect(result.isCompliant).toBe(false);
            expect(result.errors).toHaveLength(1);
            expect(result.errors[0].ruleId).toBe('6.0');
        });
    });
    describe('checkCompliance - 6.19 Encryption', () => {
        it('should detect /Encrypt in PDF header', async () => {
            const pdfDoc = await pdf_lib_1.PDFDocument.create();
            pdfDoc.addPage();
            const bytes = await pdfDoc.save();
            const buffer = Buffer.from(bytes);
            const encryptPos = buffer.indexOf('trailer', 0, 'ascii');
            if (encryptPos > 0 && encryptPos < 4000) {
                const modifiedBuffer = Buffer.concat([
                    Buffer.from('%PDF-1.7\n/Encrypt '),
                    buffer.subarray(9),
                ]);
                const result = await service.checkCompliance(modifiedBuffer);
                const encError = result.errors.find(e => e.ruleId === '6.19');
                expect(encError).toBeDefined();
            }
        });
    });
    describe('checkCompliance - 6.1 Bookmarks', () => {
        it('should error when >5 pages without bookmarks', async () => {
            const buffer = await createMinimalPdf({ pageCount: 6, version: '1.7' });
            const result = await service.checkCompliance(buffer);
            const bookmarkError = result.errors.find(e => e.ruleId === '6.1');
            expect(bookmarkError).toBeDefined();
            expect(bookmarkError.message).toContain('5');
        });
        it('should not error when <=5 pages without bookmarks', async () => {
            const buffer = await createMinimalPdf({ pageCount: 5, version: '1.7' });
            const result = await service.checkCompliance(buffer);
            const bookmarkError = result.errors.find(e => e.ruleId === '6.1');
            expect(bookmarkError).toBeUndefined();
        });
        it('should not error when 3 pages without bookmarks', async () => {
            const buffer = await createMinimalPdf({ pageCount: 3, version: '1.7' });
            const result = await service.checkCompliance(buffer);
            const bookmarkError = result.errors.find(e => e.ruleId === '6.1');
            expect(bookmarkError).toBeUndefined();
        });
    });
    describe('checkCompliance - summary', () => {
        it('should return correct summary fields', async () => {
            const buffer = await createMinimalPdf({ pageCount: 3, version: '1.6' });
            const result = await service.checkCompliance(buffer);
            expect(result.summary.pageCount).toBe(3);
            expect(result.summary.pdfVersion).toBe('1.6');
            expect(result.summary.fileSizeMB).toBeGreaterThanOrEqual(0);
            expect(typeof result.summary.hasBookmarks).toBe('boolean');
            expect(typeof result.summary.hasEncryption).toBe('boolean');
        });
        it('should calculate fileSizeMB correctly', async () => {
            const buffer = await createMinimalPdf({ version: '1.7' });
            const result = await service.checkCompliance(buffer);
            const expectedMB = Math.round((buffer.length / (1024 * 1024)) * 100) / 100;
            expect(result.summary.fileSizeMB).toBe(expectedMB);
        });
    });
    describe('checkCompliance - 6.W1 file size warning', () => {
        it('should not warn for small files', async () => {
            const buffer = await createMinimalPdf({ version: '1.7' });
            const result = await service.checkCompliance(buffer);
            const sizeWarning = result.warnings.find(w => w.ruleId === '6.W1');
            expect(sizeWarning).toBeUndefined();
        });
    });
    describe('checkCompliance - 6.25 Font Embedding', () => {
        async function createPdfWithCustomFont(embedded) {
            const pdfDoc = await pdf_lib_1.PDFDocument.create();
            const page = pdfDoc.addPage();
            const ctx = pdfDoc.context;
            const fontDescEntries = [
                [pdf_lib_1.PDFName.of('Type'), pdf_lib_1.PDFName.of('FontDescriptor')],
                [pdf_lib_1.PDFName.of('FontName'), pdf_lib_1.PDFName.of('CustomSans')],
                [pdf_lib_1.PDFName.of('Flags'), ctx.obj(32)],
                [pdf_lib_1.PDFName.of('FontBBox'), ctx.obj([0, 0, 1000, 1000])],
                [pdf_lib_1.PDFName.of('ItalicAngle'), ctx.obj(0)],
                [pdf_lib_1.PDFName.of('Ascent'), ctx.obj(800)],
                [pdf_lib_1.PDFName.of('Descent'), ctx.obj(-200)],
                [pdf_lib_1.PDFName.of('CapHeight'), ctx.obj(700)],
                [pdf_lib_1.PDFName.of('StemV'), ctx.obj(80)],
            ];
            if (embedded) {
                const fakeTtf = Buffer.from('FAKE_TRUETYPE_FONT_BYTES');
                const streamDict = ctx.obj({ Length1: fakeTtf.length });
                const stream = pdf_lib_1.PDFRawStream.of(streamDict, fakeTtf);
                const streamRef = ctx.register(stream);
                fontDescEntries.push([pdf_lib_1.PDFName.of('FontFile2'), streamRef]);
            }
            const fontDescDict = pdf_lib_1.PDFDict.fromMapWithContext(new Map(fontDescEntries), ctx);
            const fontDescRef = ctx.register(fontDescDict);
            const fontDict = pdf_lib_1.PDFDict.fromMapWithContext(new Map([
                [pdf_lib_1.PDFName.of('Type'), pdf_lib_1.PDFName.of('Font')],
                [pdf_lib_1.PDFName.of('Subtype'), pdf_lib_1.PDFName.of('TrueType')],
                [pdf_lib_1.PDFName.of('BaseFont'), pdf_lib_1.PDFName.of('CustomSans')],
                [pdf_lib_1.PDFName.of('FontDescriptor'), fontDescRef],
            ]), ctx);
            const fontRef = ctx.register(fontDict);
            const fontResources = pdf_lib_1.PDFDict.fromMapWithContext(new Map([[pdf_lib_1.PDFName.of('F1'), fontRef]]), ctx);
            const resources = pdf_lib_1.PDFDict.fromMapWithContext(new Map([[pdf_lib_1.PDFName.of('Font'), fontResources]]), ctx);
            page.node.set(pdf_lib_1.PDFName.of('Resources'), resources);
            const bytes = await pdfDoc.save();
            return Buffer.from(bytes);
        }
        it('should pass when the font is embedded (FontFile2 present)', async () => {
            const buffer = await createPdfWithCustomFont(true);
            const result = await service.checkCompliance(buffer);
            const fontError = result.errors.find((e) => e.ruleId === '6.25');
            expect(fontError).toBeUndefined();
        });
        it('should emit ERROR 6.25 when the font is not embedded', async () => {
            const buffer = await createPdfWithCustomFont(false);
            const result = await service.checkCompliance(buffer);
            const fontError = result.errors.find((e) => e.ruleId === '6.25');
            expect(fontError).toBeDefined();
            expect(fontError.severity).toBe('error');
            expect(fontError.message).toContain('CustomSans');
            expect(fontError.message).toContain('未嵌入');
            const skipWarning = result.warnings.find((w) => w.ruleId === '6.25-SKIP');
            expect(skipWarning).toBeUndefined();
        });
        it('should degrade to a SKIP warning when font parsing throws (safeCheck)', async () => {
            const buffer = await createPdfWithCustomFont(true);
            const spy = jest
                .spyOn(service, 'checkFontCompliance')
                .mockImplementation(() => {
                throw new Error('synthetic font table corruption');
            });
            const result = await service.checkCompliance(buffer);
            const skipWarning = result.warnings.find((w) => w.ruleId === '6.25-SKIP');
            expect(skipWarning).toBeDefined();
            expect(skipWarning.severity).toBe('warning');
            expect(skipWarning.detail).toContain('synthetic font table corruption');
            const fontError = result.errors.find((e) => e.ruleId === '6.25');
            expect(fontError).toBeUndefined();
            spy.mockRestore();
        });
    });
    describe('checkCompliance - isCompliant flag', () => {
        it('should be true when no errors', async () => {
            const buffer = await createMinimalPdf({ version: '1.7' });
            const result = await service.checkCompliance(buffer);
            expect(result.isCompliant).toBe(true);
        });
        it('should be false when there are errors', async () => {
            const buffer = await createMinimalPdf({ pageCount: 10, version: '2.0' });
            const result = await service.checkCompliance(buffer);
            expect(result.isCompliant).toBe(false);
            expect(result.errors.length).toBeGreaterThan(0);
        });
    });
});
//# sourceMappingURL=pdf-compliance.service.spec.js.map