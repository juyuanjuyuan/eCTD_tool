"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const testing_1 = require("@nestjs/testing");
const document_service_1 = require("./document.service");
const prisma_service_1 = require("../prisma/prisma.service");
const common_1 = require("@nestjs/common");
describe('DocumentService', () => {
    let service;
    let prisma;
    const mockNode = {
        id: 'node-1',
        status: 'EMPTY',
        approvalStatus: null,
    };
    const mockDocument = {
        id: 'doc-1',
        nodeId: 'node-1',
        contentJson: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '测试内容' }] }] },
        contentHtml: '<p>测试内容</p>',
        contentText: '测试内容',
        wordCount: 4,
        version: 3,
        xmlLang: 'zh',
        createdBy: 'user-1',
        updatedBy: 'user-1',
        createdAt: new Date(),
        updatedAt: new Date(),
    };
    beforeEach(async () => {
        prisma = {
            sequenceNode: {
                findUnique: jest.fn(),
                update: jest.fn(),
            },
            document: {
                findUnique: jest.fn(),
                create: jest.fn(),
                update: jest.fn(),
            },
            documentVersion: {
                findMany: jest.fn(),
                findFirst: jest.fn(),
                create: jest.fn(),
            },
        };
        const module = await testing_1.Test.createTestingModule({
            providers: [
                document_service_1.DocumentService,
                { provide: prisma_service_1.PrismaService, useValue: prisma },
            ],
        }).compile();
        service = module.get(document_service_1.DocumentService);
    });
    describe('getDocument', () => {
        it('should return existing document', async () => {
            prisma.sequenceNode.findUnique.mockResolvedValue(mockNode);
            prisma.document.findUnique.mockResolvedValue(mockDocument);
            const result = await service.getDocument('node-1');
            expect(result).toEqual(mockDocument);
        });
        it('should return empty doc structure when no document exists', async () => {
            prisma.sequenceNode.findUnique.mockResolvedValue(mockNode);
            prisma.document.findUnique.mockResolvedValue(null);
            const result = await service.getDocument('node-1');
            expect(result.id).toBeNull();
            expect(result.nodeId).toBe('node-1');
            expect(result.contentJson).toBeNull();
            expect(result.contentHtml).toBe('');
            expect(result.wordCount).toBe(0);
            expect(result.xmlLang).toBe('zh');
        });
        it('should throw NotFoundException when node does not exist', async () => {
            prisma.sequenceNode.findUnique.mockResolvedValue(null);
            await expect(service.getDocument('nonexistent')).rejects.toThrow(common_1.NotFoundException);
        });
    });
    describe('saveDocument', () => {
        const saveDto = {
            contentJson: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello World 你好世界' }] }] },
            contentHtml: '<p>Hello World 你好世界</p>',
            xmlLang: 'zh',
        };
        it('should create new document when none exists', async () => {
            prisma.sequenceNode.findUnique.mockResolvedValue(mockNode);
            prisma.document.findUnique.mockResolvedValue(null);
            prisma.document.create.mockResolvedValue({ ...mockDocument, version: 1 });
            prisma.sequenceNode.update.mockResolvedValue({});
            const result = await service.saveDocument('node-1', saveDto, 'user-1');
            expect(prisma.document.create).toHaveBeenCalled();
            expect(result.version).toBe(1);
        });
        it('should update existing document', async () => {
            prisma.sequenceNode.findUnique.mockResolvedValue({ ...mockNode, status: 'EDITING' });
            prisma.document.findUnique.mockResolvedValue(mockDocument);
            prisma.document.update.mockResolvedValue({ ...mockDocument, version: 4 });
            const result = await service.saveDocument('node-1', saveDto, 'user-1');
            expect(prisma.document.update).toHaveBeenCalledWith({
                where: { nodeId: 'node-1' },
                data: expect.objectContaining({
                    version: { increment: 1 },
                }),
            });
            expect(result.version).toBe(4);
        });
        it('should update node status from EMPTY to EDITING', async () => {
            prisma.sequenceNode.findUnique.mockResolvedValue(mockNode);
            prisma.document.findUnique.mockResolvedValue(null);
            prisma.document.create.mockResolvedValue({ ...mockDocument, version: 1 });
            prisma.sequenceNode.update.mockResolvedValue({});
            await service.saveDocument('node-1', saveDto);
            expect(prisma.sequenceNode.update).toHaveBeenCalledWith({
                where: { id: 'node-1' },
                data: { status: 'EDITING' },
            });
        });
        it('should not update node status when already EDITING', async () => {
            prisma.sequenceNode.findUnique.mockResolvedValue({ ...mockNode, status: 'EDITING' });
            prisma.document.findUnique.mockResolvedValue(mockDocument);
            prisma.document.update.mockResolvedValue(mockDocument);
            await service.saveDocument('node-1', saveDto);
            expect(prisma.sequenceNode.update).not.toHaveBeenCalled();
        });
        it('should throw ForbiddenException when node is APPROVED', async () => {
            prisma.sequenceNode.findUnique.mockResolvedValue({
                ...mockNode,
                approvalStatus: 'APPROVED',
            });
            await expect(service.saveDocument('node-1', saveDto)).rejects.toThrow(common_1.ForbiddenException);
        });
        it('should throw NotFoundException when node does not exist', async () => {
            prisma.sequenceNode.findUnique.mockResolvedValue(null);
            await expect(service.saveDocument('nonexistent', saveDto)).rejects.toThrow(common_1.NotFoundException);
        });
        it('should count Chinese characters and English words separately', async () => {
            const chineseDto = {
                contentHtml: '<p>中文字符测试 and English words here</p>',
            };
            prisma.sequenceNode.findUnique.mockResolvedValue(mockNode);
            prisma.document.findUnique.mockResolvedValue(null);
            prisma.document.create.mockImplementation(({ data }) => Promise.resolve({ ...data, id: 'doc-new' }));
            prisma.sequenceNode.update.mockResolvedValue({});
            await service.saveDocument('node-1', chineseDto);
            const createCall = prisma.document.create.mock.calls[0][0];
            expect(createCall.data.wordCount).toBe(10);
        });
    });
    describe('getVersions', () => {
        it('should return version history', async () => {
            prisma.document.findUnique.mockResolvedValue(mockDocument);
            const versions = [
                { id: 'v-3', version: 3, wordCount: 10, xmlLang: 'zh', createdBy: 'user-1', createdAt: new Date() },
                { id: 'v-2', version: 2, wordCount: 5, xmlLang: 'zh', createdBy: 'user-1', createdAt: new Date() },
            ];
            prisma.documentVersion.findMany.mockResolvedValue(versions);
            const result = await service.getVersions('node-1');
            expect(result).toEqual(versions);
            expect(prisma.documentVersion.findMany).toHaveBeenCalledWith({
                where: { documentId: 'doc-1' },
                orderBy: { version: 'desc' },
                select: expect.objectContaining({
                    id: true,
                    version: true,
                    wordCount: true,
                }),
            });
        });
        it('should return empty array when no document exists', async () => {
            prisma.document.findUnique.mockResolvedValue(null);
            const result = await service.getVersions('node-1');
            expect(result).toEqual([]);
        });
    });
    describe('getVersion', () => {
        it('should return specific version', async () => {
            prisma.document.findUnique.mockResolvedValue(mockDocument);
            const version = { id: 'v-2', version: 2, contentHtml: '<p>v2</p>' };
            prisma.documentVersion.findFirst.mockResolvedValue(version);
            const result = await service.getVersion('node-1', 2);
            expect(result).toEqual(version);
        });
        it('should throw NotFoundException when document not found', async () => {
            prisma.document.findUnique.mockResolvedValue(null);
            await expect(service.getVersion('node-1', 1)).rejects.toThrow(common_1.NotFoundException);
        });
        it('should throw NotFoundException when version not found', async () => {
            prisma.document.findUnique.mockResolvedValue(mockDocument);
            prisma.documentVersion.findFirst.mockResolvedValue(null);
            await expect(service.getVersion('node-1', 99)).rejects.toThrow(common_1.NotFoundException);
        });
    });
    describe('createVersionSnapshot', () => {
        it('should create snapshot of current document', async () => {
            prisma.document.findUnique.mockResolvedValue(mockDocument);
            prisma.documentVersion.create.mockResolvedValue({
                id: 'v-new',
                version: 3,
                documentId: 'doc-1',
            });
            const result = await service.createVersionSnapshot('node-1', 'user-2');
            expect(prisma.documentVersion.create).toHaveBeenCalledWith({
                data: expect.objectContaining({
                    documentId: 'doc-1',
                    version: 3,
                    wordCount: 4,
                    xmlLang: 'zh',
                    createdBy: 'user-2',
                }),
            });
            expect(result.version).toBe(3);
        });
        it('should throw NotFoundException when document not found', async () => {
            prisma.document.findUnique.mockResolvedValue(null);
            await expect(service.createVersionSnapshot('node-1')).rejects.toThrow(common_1.NotFoundException);
        });
    });
    describe('restoreVersion', () => {
        const oldVersion = {
            id: 'v-1',
            version: 1,
            contentJson: { type: 'doc', content: [] },
            contentHtml: '<p>old content</p>',
            wordCount: 2,
            xmlLang: 'zh',
        };
        it('should save current state and restore old version', async () => {
            prisma.document.findUnique.mockResolvedValue(mockDocument);
            prisma.documentVersion.findFirst.mockResolvedValue(oldVersion);
            prisma.documentVersion.create.mockResolvedValue({});
            prisma.document.update.mockResolvedValue({ ...mockDocument, version: 4 });
            const result = await service.restoreVersion('node-1', 1, 'user-1');
            expect(prisma.documentVersion.create).toHaveBeenCalledWith({
                data: expect.objectContaining({
                    documentId: 'doc-1',
                    version: 3,
                }),
            });
            expect(prisma.document.update).toHaveBeenCalledWith({
                where: { nodeId: 'node-1' },
                data: expect.objectContaining({
                    contentHtml: '<p>old content</p>',
                    version: { increment: 1 },
                }),
            });
        });
        it('should throw NotFoundException when version not found', async () => {
            prisma.document.findUnique.mockResolvedValue(mockDocument);
            prisma.documentVersion.findFirst.mockResolvedValue(null);
            await expect(service.restoreVersion('node-1', 99)).rejects.toThrow(common_1.NotFoundException);
        });
    });
});
//# sourceMappingURL=document.service.spec.js.map