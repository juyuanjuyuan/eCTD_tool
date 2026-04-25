"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const common_1 = require("@nestjs/common");
jest.mock('minio', () => ({
    Client: jest.fn(),
}));
jest.mock('archiver', () => {
    const fn = jest.fn(() => {
        const archive = {
            _pipedWritable: null,
            on: jest.fn().mockImplementation(function (event, cb) {
                if (event === 'error')
                    archive._errorCb = cb;
                return archive;
            }),
            pipe: jest.fn().mockImplementation(function (writable) {
                archive._pipedWritable = writable;
                return archive;
            }),
            append: jest.fn().mockReturnThis(),
            file: jest.fn().mockReturnThis(),
            finalize: jest.fn().mockImplementation(function () {
                if (archive._pipedWritable) {
                    archive._pipedWritable.write(Buffer.from('ZIP'));
                    archive._pipedWritable.end();
                }
            }),
        };
        return archive;
    });
    return { __esModule: true, default: fn };
});
jest.mock('fs', () => ({
    existsSync: jest.fn().mockReturnValue(false),
}));
const package_assembler_service_1 = require("./package-assembler.service");
describe('PackageAssemblerService', () => {
    let service;
    let prisma;
    let cnRegionalXml;
    let indexXml;
    let md5Service;
    let minioService;
    const mockSequence = {
        id: 'seq-1',
        sequenceNumber: '0000',
        status: 'DRAFT',
        regulatoryActivity: {
            application: {
                applicationNumber: 'x202600001',
            },
        },
        sequenceNodes: [
            {
                id: 'node-1',
                isLeaf: true,
                ctdSectionNumber: '2.3.S.1',
                operation: 'NEW',
                templateNode: { module: 2 },
                fileAttachments: [
                    {
                        id: 'att-1',
                        ectdRelativePath: 'm2/23-qos/test.pdf',
                        isReference: false,
                        referenceFileId: null,
                        storagePath: 'proj/x202600001/0000/m2/test.pdf',
                    },
                ],
                studyTaggingFile: null,
            },
            {
                id: 'node-2',
                isLeaf: false,
                ctdSectionNumber: '2.3',
                operation: null,
                templateNode: { module: 2 },
                fileAttachments: [],
                studyTaggingFile: null,
            },
            {
                id: 'node-3',
                isLeaf: true,
                ctdSectionNumber: '4.2.1',
                operation: 'NEW',
                templateNode: { module: 4 },
                fileAttachments: [
                    {
                        id: 'att-2',
                        ectdRelativePath: 'm4/42-stud-rep/report.pdf',
                        isReference: false,
                        referenceFileId: null,
                        storagePath: 'proj/x202600001/0000/m4/report.pdf',
                    },
                ],
                studyTaggingFile: {
                    stfXmlContent: '<?xml version="1.0"?><stf/>',
                },
            },
        ],
    };
    beforeEach(() => {
        prisma = {
            sequenceNode: {
                findMany: jest.fn().mockResolvedValue([]),
            },
            sequence: {
                findUnique: jest.fn().mockResolvedValue(mockSequence),
                update: jest.fn().mockResolvedValue({}),
            },
        };
        cnRegionalXml = {
            generateCnRegionalXml: jest.fn().mockResolvedValue('<cn-regional/>'),
        };
        indexXml = {
            generateIndexXml: jest.fn().mockResolvedValue('<ectd/>'),
        };
        md5Service = {
            generateIndexMd5: jest.fn().mockReturnValue('md5:index.xml\nmd5:cn-regional.xml'),
        };
        minioService = {
            fileExists: jest.fn().mockResolvedValue(true),
            getFile: jest.fn().mockResolvedValue(Buffer.from('file-content')),
        };
        service = new package_assembler_service_1.PackageAssemblerService(prisma, cnRegionalXml, indexXml, md5Service, minioService);
    });
    describe('assemblePackage', () => {
        it('should assemble a complete eCTD package', async () => {
            const result = await service.assemblePackage('seq-1');
            expect(result.buffer).toBeInstanceOf(Buffer);
            expect(result.buffer.length).toBeGreaterThan(0);
            expect(result.fileName).toBe('x202600001_0000_ectd.zip');
            expect(cnRegionalXml.generateCnRegionalXml).toHaveBeenCalledWith('seq-1');
            expect(indexXml.generateIndexXml).toHaveBeenCalledWith('seq-1');
            expect(prisma.sequence.update).toHaveBeenCalledWith({
                where: { id: 'seq-1' },
                data: { status: 'EXPORTED' },
            });
        });
        it('should throw when sequence not found', async () => {
            prisma.sequence.findUnique.mockResolvedValue(null);
            await expect(service.assemblePackage('x')).rejects.toThrow(common_1.BadRequestException);
        });
        it('should skip DELETE operation nodes', async () => {
            prisma.sequence.findUnique.mockResolvedValue({
                ...mockSequence,
                sequenceNodes: [
                    {
                        ...mockSequence.sequenceNodes[0],
                        operation: 'DELETE',
                    },
                ],
            });
            const result = await service.assemblePackage('seq-1');
            expect(result.buffer).toBeInstanceOf(Buffer);
            expect(minioService.getFile).not.toHaveBeenCalled();
        });
        it('should skip reference files', async () => {
            prisma.sequence.findUnique.mockResolvedValue({
                ...mockSequence,
                sequenceNodes: [
                    {
                        ...mockSequence.sequenceNodes[0],
                        fileAttachments: [
                            {
                                id: 'ref-1',
                                ectdRelativePath: 'm2/23-qos/ref.pdf',
                                isReference: true,
                                referenceFileId: 'original-1',
                                storagePath: 'path',
                            },
                        ],
                    },
                ],
            });
            const result = await service.assemblePackage('seq-1');
            expect(result.buffer).toBeInstanceOf(Buffer);
            expect(minioService.getFile).not.toHaveBeenCalled();
        });
        it('should handle MinIO read failure gracefully', async () => {
            minioService.fileExists.mockRejectedValue(new Error('connection error'));
            const result = await service.assemblePackage('seq-1');
            expect(result.buffer).toBeInstanceOf(Buffer);
        });
        it('should skip nodes with no file attachments (empty sections)', async () => {
            prisma.sequence.findUnique.mockResolvedValue({
                ...mockSequence,
                sequenceNodes: [
                    {
                        id: 'empty-node',
                        isLeaf: true,
                        ctdSectionNumber: '3.2.S.1',
                        operation: 'NEW',
                        templateNode: { module: 3 },
                        fileAttachments: [],
                        studyTaggingFile: null,
                    },
                ],
            });
            const result = await service.assemblePackage('seq-1');
            expect(result.buffer).toBeInstanceOf(Buffer);
            expect(minioService.getFile).not.toHaveBeenCalled();
        });
    });
    describe('previewStructure', () => {
        it('should return sorted file paths', async () => {
            const paths = await service.previewStructure('seq-1');
            expect(paths).toContain('x202600001/0000/index.xml');
            expect(paths).toContain('x202600001/0000/index-md5.txt');
            expect(paths).toContain('x202600001/0000/m1/cn/cn-regional.xml');
            expect(paths).toContain('x202600001/0000/m2/23-qos/test.pdf');
            expect(paths.some((p) => p.includes('stf-'))).toBe(true);
        });
        it('should return empty when sequence not found', async () => {
            prisma.sequence.findUnique.mockResolvedValue(null);
            const result = await service.previewStructure('x');
            expect(result).toEqual([]);
        });
        it('should exclude DELETE operation nodes', async () => {
            prisma.sequence.findUnique.mockResolvedValue({
                ...mockSequence,
                sequenceNodes: [
                    { ...mockSequence.sequenceNodes[0], operation: 'DELETE' },
                ],
            });
            const paths = await service.previewStructure('seq-1');
            expect(paths.some((p) => p.includes('test.pdf'))).toBe(false);
        });
        it('should exclude reference files from preview', async () => {
            prisma.sequence.findUnique.mockResolvedValue({
                ...mockSequence,
                sequenceNodes: [
                    {
                        ...mockSequence.sequenceNodes[0],
                        fileAttachments: [
                            { ectdRelativePath: 'm2/ref.pdf', isReference: true },
                        ],
                    },
                ],
            });
            const paths = await service.previewStructure('seq-1');
            expect(paths.some((p) => p.includes('ref.pdf'))).toBe(false);
        });
        it('should exclude empty leaf nodes', async () => {
            prisma.sequence.findUnique.mockResolvedValue({
                ...mockSequence,
                sequenceNodes: [
                    {
                        id: 'empty',
                        isLeaf: true,
                        ctdSectionNumber: '3.2.S.1',
                        operation: 'NEW',
                        templateNode: { module: 3 },
                        fileAttachments: [],
                        studyTaggingFile: null,
                    },
                ],
            });
            const paths = await service.previewStructure('seq-1');
            expect(paths.some((p) => p.includes('3.2'))).toBe(false);
        });
        it('should include util directory paths', async () => {
            const paths = await service.previewStructure('seq-1');
            expect(paths.some((p) => p.includes('util/dtd'))).toBe(true);
            expect(paths.some((p) => p.includes('util/style'))).toBe(true);
        });
    });
});
//# sourceMappingURL=package-assembler.service.spec.js.map