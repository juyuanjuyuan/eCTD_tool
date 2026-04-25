"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const ectd_controller_1 = require("./ectd.controller");
describe('EctdController', () => {
    let controller;
    let cnRegionalXml;
    let indexXml;
    let lifecycle;
    let validator;
    let packageAssembler;
    let md5Service;
    beforeEach(() => {
        cnRegionalXml = { generateCnRegionalXml: jest.fn().mockResolvedValue('<cn-regional/>') };
        indexXml = { generateIndexXml: jest.fn().mockResolvedValue('<ectd/>') };
        lifecycle = {
            validateOperation: jest.fn().mockResolvedValue({ isValid: true }),
            checkParallelConflicts: jest.fn().mockResolvedValue([]),
            generateWithdrawOperations: jest.fn().mockResolvedValue([]),
        };
        validator = {
            validate: jest.fn().mockResolvedValue({ isPassed: true }),
            getLatestReport: jest.fn().mockResolvedValue({ id: 'report-1' }),
            getReport: jest.fn().mockResolvedValue({ id: 'report-1' }),
        };
        const { PassThrough } = require('stream');
        const mockStream = new PassThrough();
        process.nextTick(() => mockStream.end(Buffer.from('PK\x03\x04')));
        packageAssembler = {
            previewStructure: jest.fn().mockResolvedValue(['path/file.pdf']),
            assemblePackage: jest.fn().mockResolvedValue({
                buffer: Buffer.from('zip'),
                fileName: 'package.zip',
            }),
            assemblePackageStream: jest.fn().mockResolvedValue({
                stream: mockStream,
                fileName: 'package.zip',
            }),
        };
        md5Service = {};
        controller = new ectd_controller_1.EctdController(cnRegionalXml, indexXml, lifecycle, validator, packageAssembler, md5Service);
    });
    it('should preview cn-regional XML', async () => {
        const result = await controller.previewCnRegionalXml('seq-1');
        expect(result.xml).toBe('<cn-regional/>');
    });
    it('should preview index XML', async () => {
        const result = await controller.previewIndexXml('seq-1');
        expect(result.xml).toBe('<ectd/>');
    });
    it('should validate operation', async () => {
        const result = await controller.validateOperation('seq-1', 'node-1', { operation: 'new' });
        expect(lifecycle.validateOperation).toHaveBeenCalledWith('seq-1', 'node-1', 'NEW');
    });
    it('should check parallel conflicts', async () => {
        const result = await controller.checkParallelConflicts('seq-1');
        expect(result).toEqual([]);
    });
    it('should preview withdraw', async () => {
        const result = await controller.previewWithdraw('seq-1');
        expect(lifecycle.generateWithdrawOperations).toHaveBeenCalledWith('seq-1');
    });
    it('should run validation', async () => {
        const result = await controller.runValidation('seq-1');
        expect(result.isPassed).toBe(true);
    });
    it('should get latest report', async () => {
        const result = await controller.getLatestReport('seq-1');
        expect(result).not.toBeNull();
        expect(result.id).toBe('report-1');
    });
    it('should get report by id', async () => {
        const result = await controller.getReport('report-1');
        expect(result).not.toBeNull();
        expect(result.id).toBe('report-1');
    });
    it('should preview package structure', async () => {
        const result = await controller.previewPackage('seq-1');
        expect(result.paths).toContain('path/file.pdf');
    });
    it('should export package via streaming', async () => {
        const { PassThrough } = require('stream');
        const mockPassThrough = new PassThrough();
        process.nextTick(() => mockPassThrough.end(Buffer.from('PK')));
        packageAssembler.assemblePackageStream.mockResolvedValue({
            stream: mockPassThrough,
            fileName: 'test.zip',
        });
        const mockRes = {
            set: jest.fn(),
            send: jest.fn(),
        };
        mockPassThrough.pipe = jest.fn();
        await controller.exportPackage('seq-1', mockRes);
        expect(mockRes.set).toHaveBeenCalledWith(expect.objectContaining({
            'Content-Type': 'application/zip',
        }));
    });
});
//# sourceMappingURL=ectd.controller.spec.js.map