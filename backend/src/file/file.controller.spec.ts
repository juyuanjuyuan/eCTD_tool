import { FileController } from './file.controller';
import { BadRequestException } from '@nestjs/common';

describe('FileController', () => {
  let controller: FileController;
  let service: Record<string, any>;

  beforeEach(() => {
    service = {
      uploadFile: jest.fn().mockResolvedValue({ id: 'att-1' }),
      uploadFiles: jest.fn().mockResolvedValue([{ id: 'att-1' }]),
      listFiles: jest.fn().mockResolvedValue([]),
      getFile: jest.fn().mockResolvedValue({ id: 'att-1' }),
      deleteFile: jest.fn().mockResolvedValue({ success: true }),
      getDownloadUrl: jest.fn().mockResolvedValue({ url: 'https://download' }),
      getPreviewUrl: jest.fn().mockResolvedValue({ url: 'https://preview' }),
      createFileReference: jest.fn().mockResolvedValue({ id: 'ref-1' }),
      listReferenceableFiles: jest.fn().mockResolvedValue([]),
      uploadEditorImage: jest.fn().mockResolvedValue({ url: 'https://img' }),
    };
    controller = new FileController(service as any);
  });

  it('should upload file', async () => {
    const file = { originalname: 'test.pdf' } as Express.Multer.File;
    await controller.uploadFile('node-1', file, { user: { id: 'user-1' } });
    expect(service.uploadFile).toHaveBeenCalledWith('node-1', file, 'user-1');
  });

  it('should throw when no file uploaded', async () => {
    await expect(
      controller.uploadFile('node-1', undefined as any, {}),
    ).rejects.toThrow(BadRequestException);
  });

  it('should upload multiple files', async () => {
    const files = [{ originalname: 'a.pdf' }] as Express.Multer.File[];
    await controller.uploadFiles('node-1', files, { user: { id: 'u' } });
    expect(service.uploadFiles).toHaveBeenCalled();
  });

  it('should throw when no files uploaded', async () => {
    await expect(
      controller.uploadFiles('node-1', [], {}),
    ).rejects.toThrow(BadRequestException);
  });

  it('should list files', async () => {
    await controller.listFiles('node-1');
    expect(service.listFiles).toHaveBeenCalledWith('node-1');
  });

  it('should get file', async () => {
    await controller.getFile('node-1', 'att-1');
    expect(service.getFile).toHaveBeenCalledWith('node-1', 'att-1');
  });

  it('should delete file', async () => {
    await controller.deleteFile('node-1', 'att-1');
    expect(service.deleteFile).toHaveBeenCalledWith('node-1', 'att-1');
  });

  it('should download file', async () => {
    const result = await controller.downloadFile('node-1', 'att-1');
    expect(result.url).toBe('https://download');
  });

  it('should preview file', async () => {
    const result = await controller.previewFile('node-1', 'att-1');
    expect(result.url).toBe('https://preview');
  });

  it('should create reference', async () => {
    await controller.createReference('node-1', { sourceFileId: 'src-1' } as any, { user: { id: 'u' } });
    expect(service.createFileReference).toHaveBeenCalledWith('node-1', 'src-1', 'u');
  });

  it('should list referenceable files', async () => {
    await controller.listReferenceableFiles('node-1');
    expect(service.listReferenceableFiles).toHaveBeenCalledWith('node-1');
  });

  it('should upload editor image', async () => {
    const file = { originalname: 'img.png' } as Express.Multer.File;
    await controller.uploadEditorImage('seq-1', file);
    expect(service.uploadEditorImage).toHaveBeenCalledWith('seq-1', file);
  });

  it('should throw when no image uploaded', async () => {
    await expect(
      controller.uploadEditorImage('seq-1', undefined as any),
    ).rejects.toThrow(BadRequestException);
  });
});
