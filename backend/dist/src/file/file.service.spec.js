"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const testing_1 = require("@nestjs/testing");
const file_service_1 = require("./file.service");
const prisma_service_1 = require("../prisma/prisma.service");
const minio_service_1 = require("./minio.service");
const file_name_normalizer_service_1 = require("./file-name-normalizer.service");
const pdf_compliance_service_1 = require("../export/pdf-compliance.service");
const common_1 = require("@nestjs/common");
describe('FileService', () => {
    let service;
    let prisma;
    let minio;
    let normalizer;
    let pdfCompliance;
    const mockNode = {
        id: 'node-1',
        ctdSectionNumber: '2.3.S.1',
        status: 'EMPTY',
        sequence: {
            sequenceNumber: '0000',
            regulatoryActivity: {
                application: {
                    applicationNumber: 'x202600001',
                    project: { id: 'proj-1' },
                },
            },
        },
    };
    const mockFile = {
        originalname: 'test-document.pdf',
        buffer: Buffer.from('pdf-content'),
        size: 1024,
        fieldname: 'file',
        encoding: '7bit',
        mimetype: 'application/pdf',
        destination: '',
        filename: '',
        path: '',
        stream: null,
    };
    const mockAttachment = {
        id: 'att-1',
        sequenceNodeId: 'node-1',
        originalName: 'test-document.pdf',
        storedName: 'test-document.pdf',
        storagePath: 'proj-1/x202600001/0000/m2/23s/test-document.pdf',
        ectdRelativePath: 'm2/23s/test-document.pdf',
        fileType: '.pdf',
        fileSize: BigInt(1024),
        md5Checksum: 'abc123',
        xmlLang: 'zh',
        isReference: false,
        referenceFileId: null,
        uploadedBy: null,
    };
    beforeEach(async () => {
        prisma = {
            sequenceNode: {
                findUnique: jest.fn().mockResolvedValue(mockNode),
                update: jest.fn().mockResolvedValue({}),
            },
            fileAttachment: {
                create: jest.fn().mockResolvedValue(mockAttachment),
                findMany: jest.fn().mockResolvedValue([]),
                findFirst: jest.fn().mockResolvedValue(mockAttachment),
                findUnique: jest.fn().mockResolvedValue(mockAttachment),
                delete: jest.fn().mockResolvedValue({}),
                count: jest.fn().mockResolvedValue(0),
            },
            filePdfAnalysis: {
                create: jest.fn().mockResolvedValue({ id: 'analysis-1' }),
                deleteMany: jest.fn().mockResolvedValue({}),
            },
        };
        minio = {
            uploadFile: jest.fn().mockResolvedValue('abc123'),
            deleteFile: jest.fn().mockResolvedValue(undefined),
            getPresignedDownloadUrl: jest.fn().mockResolvedValue('https://download-url'),
            getPresignedPreviewUrl: jest.fn().mockResolvedValue('https://preview-url'),
        };
        normalizer = {
            validateExtension: jest.fn(),
            validateFileSize: jest.fn(),
            normalizeFileName: jest.fn().mockReturnValue('test-document.pdf'),
            buildEctdRelativePath: jest.fn().mockReturnValue('m2/23s/test-document.pdf'),
            buildStoragePath: jest.fn().mockReturnValue('proj-1/x202600001/0000/m2/23s/test-document.pdf'),
        };
        pdfCompliance = {
            checkCompliance: jest.fn().mockResolvedValue({
                isCompliant: true,
                errors: [],
                warnings: [],
                summary: {
                    pdfVersion: '1.7',
                    pageCount: 1,
                    hasBookmarks: false,
                    hasEncryption: false,
                },
            }),
        };
        const module = await testing_1.Test.createTestingModule({
            providers: [
                file_service_1.FileService,
                { provide: prisma_service_1.PrismaService, useValue: prisma },
                { provide: minio_service_1.MinioService, useValue: minio },
                { provide: file_name_normalizer_service_1.FileNameNormalizerService, useValue: normalizer },
                { provide: pdf_compliance_service_1.PDFComplianceService, useValue: pdfCompliance },
            ],
        }).compile();
        service = module.get(file_service_1.FileService);
    });
    describe('uploadFile', () => {
        it('should upload a PDF file and run compliance', async () => {
            const result = await service.uploadFile('node-1', mockFile, 'user-1');
            expect(normalizer.validateExtension).toHaveBeenCalledWith('test-document.pdf');
            expect(normalizer.validateFileSize).toHaveBeenCalledWith(1024, 'test-document.pdf');
            expect(minio.uploadFile).toHaveBeenCalled();
            expect(prisma.fileAttachment.create).toHaveBeenCalled();
            expect(pdfCompliance.checkCompliance).toHaveBeenCalled();
            expect(result.fileSize).toBe('1024');
        });
        it('should update node status from EMPTY to EDITING', async () => {
            await service.uploadFile('node-1', mockFile);
            expect(prisma.sequenceNode.update).toHaveBeenCalledWith({
                where: { id: 'node-1' },
                data: { status: 'EDITING' },
            });
        });
        it('should not update node status if not EMPTY', async () => {
            prisma.sequenceNode.findUnique.mockResolvedValue({ ...mockNode, status: 'EDITING' });
            await service.uploadFile('node-1', mockFile);
            expect(prisma.sequenceNode.update).not.toHaveBeenCalled();
        });
        it('should not run compliance for non-PDF files', async () => {
            const xmlFile = { ...mockFile, originalname: 'data.xml' };
            await service.uploadFile('node-1', xmlFile);
            expect(pdfCompliance.checkCompliance).not.toHaveBeenCalled();
        });
        it('should throw when node not found', async () => {
            prisma.sequenceNode.findUnique.mockResolvedValue(null);
            await expect(service.uploadFile('node-1', mockFile)).rejects.toThrow(common_1.NotFoundException);
        });
    });
    describe('uploadFiles', () => {
        it('should upload multiple files', async () => {
            const files = [mockFile, { ...mockFile, originalname: 'second.pdf' }];
            const results = await service.uploadFiles('node-1', files);
            expect(results).toHaveLength(2);
        });
    });
    describe('listFiles', () => {
        it('should return serialized files', async () => {
            prisma.fileAttachment.findMany.mockResolvedValue([mockAttachment]);
            const result = await service.listFiles('node-1');
            expect(result).toHaveLength(1);
            expect(result[0].fileSize).toBe('1024');
        });
    });
    describe('getFile', () => {
        it('should return file detail', async () => {
            prisma.fileAttachment.findFirst.mockResolvedValue(mockAttachment);
            const result = await service.getFile('node-1', 'att-1');
            expect(result.id).toBe('att-1');
        });
        it('should throw when file not found', async () => {
            prisma.fileAttachment.findFirst.mockResolvedValue(null);
            await expect(service.getFile('node-1', 'x')).rejects.toThrow(common_1.NotFoundException);
        });
    });
    describe('deleteFile', () => {
        it('should delete file and clean up MinIO', async () => {
            const result = await service.deleteFile('node-1', 'att-1');
            expect(minio.deleteFile).toHaveBeenCalledWith(mockAttachment.storagePath);
            expect(prisma.filePdfAnalysis.deleteMany).toHaveBeenCalled();
            expect(prisma.fileAttachment.delete).toHaveBeenCalled();
            expect(result.success).toBe(true);
        });
        it('should throw when file not found', async () => {
            prisma.fileAttachment.findFirst.mockResolvedValue(null);
            await expect(service.deleteFile('node-1', 'x')).rejects.toThrow(common_1.NotFoundException);
        });
        it('should throw when file has references', async () => {
            prisma.fileAttachment.count.mockResolvedValue(2);
            await expect(service.deleteFile('node-1', 'att-1')).rejects.toThrow(common_1.BadRequestException);
        });
        it('should not call MinIO delete for reference files', async () => {
            prisma.fileAttachment.findFirst.mockResolvedValue({ ...mockAttachment, isReference: true });
            await service.deleteFile('node-1', 'att-1');
            expect(minio.deleteFile).not.toHaveBeenCalled();
        });
        it('should handle MinIO delete failure gracefully', async () => {
            minio.deleteFile.mockRejectedValue(new Error('network error'));
            const result = await service.deleteFile('node-1', 'att-1');
            expect(result.success).toBe(true);
        });
    });
    describe('getDownloadUrl', () => {
        it('should return presigned download URL', async () => {
            const result = await service.getDownloadUrl('node-1', 'att-1');
            expect(result.url).toBe('https://download-url');
            expect(result.originalName).toBe('test-document.pdf');
        });
        it('should follow reference chain for reference files', async () => {
            prisma.fileAttachment.findFirst.mockResolvedValue({
                ...mockAttachment,
                isReference: true,
                referenceFileId: 'original-att',
            });
            prisma.fileAttachment.findUnique.mockResolvedValue({
                storagePath: 'original/path.pdf',
                isReference: false,
            });
            await service.getDownloadUrl('node-1', 'att-1');
            expect(minio.getPresignedDownloadUrl).toHaveBeenCalledWith('original/path.pdf');
        });
        it('should throw when file not found', async () => {
            prisma.fileAttachment.findFirst.mockResolvedValue(null);
            await expect(service.getDownloadUrl('node-1', 'x')).rejects.toThrow(common_1.NotFoundException);
        });
    });
    describe('getPreviewUrl', () => {
        it('should return presigned preview URL', async () => {
            const result = await service.getPreviewUrl('node-1', 'att-1');
            expect(result.url).toBe('https://preview-url');
        });
        it('should throw when file not found', async () => {
            prisma.fileAttachment.findFirst.mockResolvedValue(null);
            await expect(service.getPreviewUrl('node-1', 'x')).rejects.toThrow(common_1.NotFoundException);
        });
    });
    describe('createFileReference', () => {
        const mockSourceFile = {
            id: 'source-att',
            originalName: 'source.pdf',
            storedName: 'source.pdf',
            storagePath: 'proj-1/x202600001/0000/m2/source.pdf',
            ectdRelativePath: 'm2/source.pdf',
            fileType: '.pdf',
            fileSize: BigInt(2048),
            md5Checksum: 'def456',
            xmlLang: 'zh',
            sequenceNode: {
                sequence: {
                    sequenceNumber: '0000',
                    status: 'EXPORTED',
                    regulatoryActivity: {
                        application: { id: 'app-1' },
                    },
                },
            },
        };
        const mockTargetNode = {
            id: 'node-2',
            sequence: {
                sequenceNumber: '0001',
                regulatoryActivity: {
                    application: { id: 'app-1' },
                },
            },
        };
        it('should create file reference within same application', async () => {
            prisma.fileAttachment.findUnique.mockResolvedValue(mockSourceFile);
            prisma.sequenceNode.findUnique.mockResolvedValue(mockTargetNode);
            prisma.fileAttachment.create.mockResolvedValue({
                ...mockAttachment,
                isReference: true,
                referenceFileId: 'source-att',
            });
            const result = await service.createFileReference('node-2', 'source-att', 'user-1');
            expect(result.isReference).toBe(true);
            expect(prisma.fileAttachment.create).toHaveBeenCalledWith({
                data: expect.objectContaining({
                    isReference: true,
                    referenceFileId: 'source-att',
                }),
            });
        });
        it('should throw when source file not found', async () => {
            prisma.fileAttachment.findUnique.mockResolvedValue(null);
            await expect(service.createFileReference('node-2', 'x', 'u')).rejects.toThrow(common_1.NotFoundException);
        });
        it('should throw for cross-application reference', async () => {
            prisma.fileAttachment.findUnique.mockResolvedValue(mockSourceFile);
            prisma.sequenceNode.findUnique.mockResolvedValue({
                ...mockTargetNode,
                sequence: {
                    ...mockTargetNode.sequence,
                    regulatoryActivity: { application: { id: 'app-2' } },
                },
            });
            await expect(service.createFileReference('node-2', 'source-att')).rejects.toThrow(common_1.BadRequestException);
        });
        it('should throw when referencing draft sequence', async () => {
            prisma.fileAttachment.findUnique.mockResolvedValue({
                ...mockSourceFile,
                sequenceNode: {
                    sequence: {
                        ...mockSourceFile.sequenceNode.sequence,
                        status: 'DRAFT',
                    },
                },
            });
            prisma.sequenceNode.findUnique.mockResolvedValue(mockTargetNode);
            await expect(service.createFileReference('node-2', 'source-att')).rejects.toThrow(common_1.BadRequestException);
        });
        it('should throw when source sequence number >= target', async () => {
            prisma.fileAttachment.findUnique.mockResolvedValue({
                ...mockSourceFile,
                sequenceNode: {
                    sequence: {
                        ...mockSourceFile.sequenceNode.sequence,
                        sequenceNumber: '0002',
                    },
                },
            });
            prisma.sequenceNode.findUnique.mockResolvedValue(mockTargetNode);
            await expect(service.createFileReference('node-2', 'source-att')).rejects.toThrow(common_1.BadRequestException);
        });
        it('should throw when target node not found', async () => {
            prisma.fileAttachment.findUnique.mockResolvedValue(mockSourceFile);
            prisma.sequenceNode.findUnique.mockResolvedValue(null);
            await expect(service.createFileReference('node-2', 'source-att')).rejects.toThrow(common_1.NotFoundException);
        });
    });
    describe('listReferenceableFiles', () => {
        it('should return files from prior sequences', async () => {
            prisma.sequenceNode.findUnique.mockResolvedValue({
                id: 'node-2',
                sequence: {
                    sequenceNumber: '0001',
                    regulatoryActivity: {
                        application: {
                            regulatoryActivities: [
                                {
                                    sequences: [
                                        { id: 'seq-0', sequenceNumber: '0000', status: 'EXPORTED' },
                                        { id: 'seq-1', sequenceNumber: '0001', status: 'DRAFT' },
                                    ],
                                },
                            ],
                        },
                    },
                },
            });
            prisma.fileAttachment.findMany.mockResolvedValue([
                {
                    ...mockAttachment,
                    sequenceNode: {
                        ctdSectionNumber: '2.3.S.1',
                        title: '一般性质',
                        sequence: { sequenceNumber: '0000' },
                    },
                },
            ]);
            const result = await service.listReferenceableFiles('node-2');
            expect(result).toHaveLength(1);
            expect(result[0].sectionNumber).toBe('2.3.S.1');
            expect(result[0].sequenceNumber).toBe('0000');
        });
        it('should return empty when no prior sequences', async () => {
            prisma.sequenceNode.findUnique.mockResolvedValue({
                id: 'node-1',
                sequence: {
                    sequenceNumber: '0000',
                    regulatoryActivity: {
                        application: {
                            regulatoryActivities: [
                                { sequences: [{ id: 'seq-0', sequenceNumber: '0000', status: 'DRAFT' }] },
                            ],
                        },
                    },
                },
            });
            const result = await service.listReferenceableFiles('node-1');
            expect(result).toEqual([]);
        });
        it('should throw when node not found', async () => {
            prisma.sequenceNode.findUnique.mockResolvedValue(null);
            await expect(service.listReferenceableFiles('x')).rejects.toThrow(common_1.NotFoundException);
        });
    });
    describe('uploadEditorImage', () => {
        it('should upload image and return URL', async () => {
            const imageFile = {
                ...mockFile,
                originalname: 'diagram.png',
            };
            const result = await service.uploadEditorImage('seq-1', imageFile);
            expect(result.url).toBe('https://preview-url');
            expect(minio.uploadFile).toHaveBeenCalled();
        });
        it('should throw for non-image extensions', async () => {
            const docFile = { ...mockFile, originalname: 'file.doc' };
            await expect(service.uploadEditorImage('seq-1', docFile)).rejects.toThrow(common_1.BadRequestException);
        });
        it('should accept various image formats', async () => {
            for (const ext of ['.png', '.jpg', '.jpeg', '.gif', '.svg']) {
                const f = { ...mockFile, originalname: `img${ext}` };
                await expect(service.uploadEditorImage('seq-1', f)).resolves.toBeDefined();
            }
        });
    });
});
//# sourceMappingURL=file.service.spec.js.map