"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const export_controller_1 = require("./export.controller");
describe('ExportController', () => {
    let controller;
    let exportService;
    let mockRes;
    beforeEach(() => {
        exportService = {
            exportWordSingle: jest.fn().mockResolvedValue({
                status: 'completed',
                buffer: Buffer.from('docx'),
                fileName: 'test.docx',
                contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            }),
            exportPdfSingle: jest.fn().mockResolvedValue({
                status: 'completed',
                buffer: Buffer.from('pdf'),
                fileName: 'test.pdf',
                contentType: 'application/pdf',
                complianceResult: { isCompliant: true },
            }),
            exportWordBatch: jest.fn().mockResolvedValue({ taskId: 'job-1' }),
            exportPdfBatch: jest.fn().mockResolvedValue({ taskId: 'job-2' }),
            getTaskStatus: jest.fn().mockResolvedValue({ status: 'completed' }),
            getDownloadUrl: jest.fn().mockResolvedValue({ url: 'https://download' }),
        };
        mockRes = {
            setHeader: jest.fn(),
            send: jest.fn(),
            status: jest.fn().mockReturnThis(),
            json: jest.fn(),
        };
        controller = new export_controller_1.ExportController(exportService);
    });
    it('should export Word document', async () => {
        await controller.exportWord('seq-1', { nodeId: 'node-1' }, mockRes);
        expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Type', expect.stringContaining('wordprocessingml'));
        expect(mockRes.send).toHaveBeenCalled();
    });
    it('should return 500 when Word export has no buffer', async () => {
        exportService.exportWordSingle.mockResolvedValue({ buffer: null });
        await controller.exportWord('seq-1', { nodeId: 'node-1' }, mockRes);
        expect(mockRes.status).toHaveBeenCalledWith(500);
    });
    it('should export PDF document', async () => {
        await controller.exportPdf('seq-1', { nodeId: 'node-1' }, mockRes);
        expect(mockRes.send).toHaveBeenCalled();
    });
    it('should return compliance errors as JSON when PDF is non-compliant', async () => {
        exportService.exportPdfSingle.mockResolvedValue({
            buffer: Buffer.from('pdf'),
            complianceResult: { isCompliant: false, errors: [{ ruleId: '6.1' }] },
            removedLinks: [],
        });
        await controller.exportPdf('seq-1', { nodeId: 'node-1' }, mockRes);
        expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
            status: 'compliance_error',
        }));
    });
    it('should export Word batch', async () => {
        const result = await controller.exportWordBatch('seq-1', {
            nodeIds: ['n1', 'n2'],
        });
        expect(result.taskId).toBe('job-1');
    });
    it('should export PDF batch', async () => {
        const result = await controller.exportPdfBatch('seq-1', {
            nodeIds: ['n1'],
        });
        expect(result.taskId).toBe('job-2');
    });
    it('should get task status', async () => {
        const result = await controller.getTaskStatus('task-1');
        expect(result.status).toBe('completed');
    });
    it('should download result', async () => {
        const result = await controller.downloadResult('task-1');
        expect(result.url).toBe('https://download');
    });
});
//# sourceMappingURL=export.controller.spec.js.map