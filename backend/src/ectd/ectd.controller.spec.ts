import { EctdController } from './ectd.controller';

// NOTE: Plan 12 — STF endpoint tests removed from this spec. v2 STF endpoints
// live on StudyController and are covered in study.controller.spec.ts (P3).

describe('EctdController', () => {
  let controller: EctdController;
  let cnRegionalXml: Record<string, any>;
  let indexXml: Record<string, any>;
  let lifecycle: Record<string, any>;
  let validator: Record<string, any>;
  let packageAssembler: Record<string, any>;
  let md5Service: Record<string, any>;

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
    // End stream immediately to simulate a completed ZIP
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

    controller = new EctdController(
      cnRegionalXml as any,
      indexXml as any,
      lifecycle as any,
      validator as any,
      packageAssembler as any,
      md5Service as any,
    );
  });

  it('should preview cn-regional XML', async () => {
    const result = await controller.previewCnRegionalXml('seq-1');
    expect(result.xml).toBe('<cn-regional/>');
  });

  it('should preview index XML', async () => {
    const result = await controller.previewIndexXml('seq-1');
    expect(result.xml).toBe('<ectd/>');
  });

  // STF endpoint tests removed in Plan 12 — see study.controller.spec.ts (P3).

  it('should validate operation', async () => {
    const result = await controller.validateOperation('seq-1', 'node-1', { operation: 'new' } as any);
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
    expect(result!.id).toBe('report-1');
  });

  it('should get report by id', async () => {
    const result = await controller.getReport('report-1');
    expect(result).not.toBeNull();
    expect(result!.id).toBe('report-1');
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
    // Mock pipe to be a no-op (pipe is actually called on the stream, not on res)
    mockPassThrough.pipe = jest.fn();

    await controller.exportPackage('seq-1', mockRes as any);

    expect(mockRes.set).toHaveBeenCalledWith(expect.objectContaining({
      'Content-Type': 'application/zip',
    }));
  });
});
