"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const export_processor_1 = require("./export.processor");
describe('ExportProcessor', () => {
    let processor;
    let prisma;
    let wordExport;
    let pdfExport;
    let pdfCompliance;
    let minioService;
    const mockNode = {
        id: 'node-1',
        ctdSectionNumber: '2.3.S.1',
        title: '一般性质',
    };
    const mockDocument = {
        nodeId: 'node-1',
        contentJson: { type: 'doc', content: [] },
        contentHtml: '<p>测试</p>',
    };
    const mockJob = {
        id: 'job-1',
        data: {
            sequenceId: 'seq-1',
            nodeIds: ['node-1'],
            headerText: undefined,
            format: 'word',
        },
        progress: jest.fn(),
    };
    beforeEach(() => {
        prisma = {
            sequenceNode: { findUnique: jest.fn().mockResolvedValue(mockNode) },
            document: { findUnique: jest.fn().mockResolvedValue(mockDocument) },
        };
        wordExport = {
            exportDocument: jest.fn().mockResolvedValue(Buffer.from('docx')),
        };
        pdfExport = {
            exportToPDF: jest.fn().mockResolvedValue(Buffer.from('pdf')),
            stripExternalLinks: jest.fn().mockReturnValue({ html: '<p>测试</p>', removedLinks: [] }),
        };
        pdfCompliance = {
            checkCompliance: jest.fn().mockResolvedValue({
                isCompliant: true,
                errors: [],
                warnings: [],
                summary: {},
            }),
        };
        minioService = {
            uploadFile: jest.fn().mockResolvedValue('md5hash'),
        };
        processor = new export_processor_1.ExportProcessor(prisma, wordExport, pdfExport, pdfCompliance, minioService);
    });
    describe('handleWordBatch', () => {
        it('should process Word batch successfully', async () => {
            const result = await processor.handleWordBatch(mockJob);
            expect(result.format).toBe('word');
            expect(result.totalNodes).toBe(1);
            expect(result.successCount).toBe(1);
            expect(result.failCount).toBe(0);
            expect(result.files).toHaveLength(1);
            expect(result.files[0].fileName).toContain('2-3-S-1');
            expect(mockJob.progress).toHaveBeenCalledWith(100);
        });
        it('should handle missing document', async () => {
            prisma.document.findUnique.mockResolvedValue(null);
            const result = await processor.handleWordBatch(mockJob);
            expect(result.failCount).toBe(1);
            expect(result.files[0].error).toBeDefined();
        });
        it('should handle missing node', async () => {
            prisma.sequenceNode.findUnique.mockResolvedValue(null);
            const result = await processor.handleWordBatch(mockJob);
            expect(result.failCount).toBe(1);
        });
        it('should handle export error gracefully', async () => {
            wordExport.exportDocument.mockRejectedValue(new Error('export failed'));
            const result = await processor.handleWordBatch(mockJob);
            expect(result.failCount).toBe(1);
            expect(result.files[0].error).toBe('export failed');
        });
        it('should use custom headerText', async () => {
            const job = { ...mockJob, data: { ...mockJob.data, headerText: '自定义页眉' } };
            await processor.handleWordBatch(job);
            expect(wordExport.exportDocument).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ headerText: '自定义页眉' }));
        });
        it('should upload ZIP to MinIO', async () => {
            const result = await processor.handleWordBatch(mockJob);
            expect(result.downloadObjectName).toBeDefined();
            expect(minioService.uploadFile).toHaveBeenCalled();
        });
        it('should handle multiple nodes with mixed results', async () => {
            const job = {
                ...mockJob,
                data: { ...mockJob.data, nodeIds: ['node-1', 'node-2'] },
            };
            prisma.sequenceNode.findUnique
                .mockResolvedValueOnce(mockNode)
                .mockResolvedValueOnce(null);
            prisma.document.findUnique
                .mockResolvedValueOnce(mockDocument)
                .mockResolvedValueOnce(null);
            const result = await processor.handleWordBatch(job);
            expect(result.successCount).toBe(1);
            expect(result.failCount).toBe(1);
            expect(mockJob.progress).toHaveBeenCalledWith(50);
            expect(mockJob.progress).toHaveBeenCalledWith(100);
        });
    });
    describe('handlePdfBatch', () => {
        const pdfJob = {
            ...mockJob,
            data: { ...mockJob.data, format: 'pdf' },
        };
        it('should process PDF batch with compliance check', async () => {
            const result = await processor.handlePdfBatch(pdfJob);
            expect(result.format).toBe('pdf');
            expect(result.successCount).toBe(1);
            expect(result.files[0].complianceResult).toBeDefined();
            expect(pdfExport.stripExternalLinks).toHaveBeenCalled();
            expect(pdfCompliance.checkCompliance).toHaveBeenCalled();
        });
        it('should handle missing contentHtml', async () => {
            prisma.document.findUnique.mockResolvedValue({ ...mockDocument, contentHtml: null });
            const result = await processor.handlePdfBatch(pdfJob);
            expect(result.failCount).toBe(1);
        });
        it('should handle PDF export error', async () => {
            pdfExport.exportToPDF.mockRejectedValue(new Error('Puppeteer crashed'));
            const result = await processor.handlePdfBatch(pdfJob);
            expect(result.failCount).toBe(1);
            expect(result.files[0].error).toBe('Puppeteer crashed');
        });
        it('should work without MinIO service', async () => {
            const processorNoMinio = new export_processor_1.ExportProcessor(prisma, wordExport, pdfExport, pdfCompliance, undefined);
            const result = await processorNoMinio.handlePdfBatch(pdfJob);
            expect(result.successCount).toBe(1);
            expect(result.downloadObjectName).toBeUndefined();
        });
    });
});
//# sourceMappingURL=export.processor.spec.js.map