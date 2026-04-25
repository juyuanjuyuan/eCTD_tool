"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const testing_1 = require("@nestjs/testing");
const ctd_template_service_1 = require("./ctd-template.service");
const prisma_service_1 = require("../prisma/prisma.service");
const redis_cache_service_1 = require("../common/redis-cache.service");
const common_1 = require("@nestjs/common");
describe('CtdTemplateService', () => {
    let service;
    let prisma;
    let cache;
    const mockTemplateNodes = [
        { id: 't-m2', parentId: null, elementName: 'module-2', ctdSectionNumber: '2', titleZh: '模块二', isLeaf: false, sortOrder: 1, allowsExtension: false },
        { id: 't-23s', parentId: 't-m2', elementName: 'drug-substance', ctdSectionNumber: '2.3.S', titleZh: '原料药', isLeaf: false, sortOrder: 2, allowsExtension: false },
        { id: 't-23s1', parentId: 't-23s', elementName: 'general-properties', ctdSectionNumber: '2.3.S.1', titleZh: '一般性质', isLeaf: true, sortOrder: 3, allowsExtension: false },
        { id: 't-32r', parentId: null, elementName: 'regional-info', ctdSectionNumber: '3.2.R', titleZh: '区域信息', isLeaf: false, sortOrder: 100, allowsExtension: true },
    ];
    beforeEach(async () => {
        prisma = {
            ctdTemplateNode: {
                findMany: jest.fn().mockResolvedValue(mockTemplateNodes),
            },
            ctdCompletenessRule: {
                findMany: jest.fn().mockResolvedValue([]),
            },
            sequence: {
                findUnique: jest.fn(),
                findMany: jest.fn().mockResolvedValue([]),
                update: jest.fn().mockResolvedValue({}),
            },
            sequenceNode: {
                create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...data })),
                findFirst: jest.fn(),
                findMany: jest.fn().mockResolvedValue([]),
                update: jest.fn().mockResolvedValue({}),
                delete: jest.fn().mockResolvedValue({}),
                aggregate: jest.fn().mockResolvedValue({ _max: { sortOrder: 5 } }),
            },
            $transaction: jest.fn().mockImplementation((ops) => Promise.all(ops)),
        };
        cache = {
            get: jest.fn().mockResolvedValue(null),
            set: jest.fn().mockResolvedValue(undefined),
        };
        const module = await testing_1.Test.createTestingModule({
            providers: [
                ctd_template_service_1.CtdTemplateService,
                { provide: prisma_service_1.PrismaService, useValue: prisma },
                { provide: redis_cache_service_1.RedisCacheService, useValue: cache },
            ],
        }).compile();
        service = module.get(ctd_template_service_1.CtdTemplateService);
    });
    describe('getTemplateTree', () => {
        it('should build tree from flat query', async () => {
            const result = (await service.getTemplateTree());
            expect(result).toHaveLength(2);
            expect(result[0].elementName).toBe('module-2');
            expect(result[0].children).toHaveLength(1);
            expect(result[0].children[0].children).toHaveLength(1);
        });
        it('should return cached result if available', async () => {
            const cachedTree = [{ id: 'cached' }];
            cache.get.mockResolvedValue(cachedTree);
            const result = await service.getTemplateTree();
            expect(result).toBe(cachedTree);
            expect(prisma.ctdTemplateNode.findMany).not.toHaveBeenCalled();
        });
        it('should cache result with 24h TTL', async () => {
            await service.getTemplateTree();
            expect(cache.set).toHaveBeenCalledWith('ctd:template-tree', expect.any(Array), 86400);
        });
    });
    describe('getTemplateTreeWithRules', () => {
        it('should annotate nodes with required/forbidden flags', async () => {
            prisma.ctdCompletenessRule.findMany.mockResolvedValue([
                { templateNodeId: 't-23s1', ruleType: 'REQUIRED' },
            ]);
            const result = (await service.getTemplateTreeWithRules('cnapt2', 'cnrat1'));
            const m2 = result.find((n) => n.elementName === 'module-2');
            const s = m2.children[0];
            const s1 = s.children[0];
            expect(s1.isRequired).toBe(true);
            expect(s1.isForbidden).toBe(false);
        });
        it('should mark forbidden nodes', async () => {
            prisma.ctdCompletenessRule.findMany.mockResolvedValue([
                { templateNodeId: 't-23s1', ruleType: 'FORBIDDEN' },
            ]);
            const result = (await service.getTemplateTreeWithRules('cnapt3', 'cnrat8'));
            const m2 = result.find((n) => n.elementName === 'module-2');
            const s1 = m2.children[0].children[0];
            expect(s1.isForbidden).toBe(true);
            expect(s1.isRequired).toBe(false);
        });
        it('should use cache with appType+ratType key', async () => {
            await service.getTemplateTreeWithRules('cnapt1', 'cnrat2');
            expect(cache.get).toHaveBeenCalledWith('ctd:template-tree:cnapt1:cnrat2');
        });
    });
    describe('initializeSequenceNodes', () => {
        const mockSequence = {
            id: 'seq-1',
            sequenceNumber: '0000',
            regulatoryActivity: {
                id: 'ra-1',
                regulatoryActivityTypeCode: 'cnrat1',
                application: {
                    applicationTypeCode: 'cnapt2',
                    productTypeCode: 'cnprt1',
                },
            },
            sequenceNodes: [],
        };
        it('should create nodes for all template nodes', async () => {
            prisma.sequence.findUnique.mockResolvedValue(mockSequence);
            const result = await service.initializeSequenceNodes('seq-1');
            expect(result.nodeCount).toBe(4);
            expect(prisma.$transaction).toHaveBeenCalled();
        });
        it('should throw if sequence not found', async () => {
            prisma.sequence.findUnique.mockResolvedValue(null);
            await expect(service.initializeSequenceNodes('nonexistent'))
                .rejects.toThrow(common_1.NotFoundException);
        });
        it('should throw if already initialized', async () => {
            prisma.sequence.findUnique.mockResolvedValue({
                ...mockSequence,
                sequenceNodes: [{ id: 'existing-node' }],
            });
            await expect(service.initializeSequenceNodes('seq-1'))
                .rejects.toThrow(common_1.BadRequestException);
        });
        it('should set operation=NEW for leaf nodes on first sequence', async () => {
            prisma.sequence.findUnique.mockResolvedValue(mockSequence);
            await service.initializeSequenceNodes('seq-1');
            const txCalls = prisma.$transaction.mock.calls[0][0];
            const createCalls = prisma.sequenceNode.create.mock.calls;
            const leafCreates = createCalls.filter((c) => c[0].data.isLeaf === true);
            for (const call of leafCreates) {
                expect(call[0].data.operation).toBe('NEW');
            }
        });
        it('should update sequence status to EDITING', async () => {
            prisma.sequence.findUnique.mockResolvedValue(mockSequence);
            await service.initializeSequenceNodes('seq-1');
            expect(prisma.sequence.update).toHaveBeenCalledWith({
                where: { id: 'seq-1' },
                data: { status: 'EDITING' },
            });
        });
    });
    describe('getSequenceNodeTree', () => {
        it('should build tree from sequence nodes', async () => {
            prisma.sequence.findUnique.mockResolvedValue({ id: 'seq-1' });
            prisma.sequenceNode.findMany.mockResolvedValue([
                { id: 'n-1', parentId: null, sortOrder: 1, elementName: 'module-2' },
                { id: 'n-2', parentId: 'n-1', sortOrder: 2, elementName: 'section' },
            ]);
            const result = await service.getSequenceNodeTree('seq-1');
            expect(result).toHaveLength(1);
            expect(result[0].children).toHaveLength(1);
        });
        it('should throw if sequence not found', async () => {
            prisma.sequence.findUnique.mockResolvedValue(null);
            await expect(service.getSequenceNodeTree('nonexistent'))
                .rejects.toThrow(common_1.NotFoundException);
        });
    });
    describe('updateSequenceNode', () => {
        it('should update node properties', async () => {
            prisma.sequenceNode.findFirst.mockResolvedValue({ id: 'n-1', sequenceId: 'seq-1' });
            prisma.sequenceNode.update.mockResolvedValue({ id: 'n-1', status: 'COMPLETED' });
            const result = await service.updateSequenceNode('seq-1', 'n-1', { status: 'COMPLETED' });
            expect(result.status).toBe('COMPLETED');
        });
        it('should throw if node not found', async () => {
            prisma.sequenceNode.findFirst.mockResolvedValue(null);
            await expect(service.updateSequenceNode('seq-1', 'n-x', {}))
                .rejects.toThrow(common_1.NotFoundException);
        });
    });
    describe('updateBackboneAttributes', () => {
        it('should update substance on 2.3.S section', async () => {
            prisma.sequenceNode.findFirst.mockResolvedValue({
                id: 'n-1',
                sequenceId: 'seq-1',
                ctdSectionNumber: '2.3.S',
                substance: null,
                manufacturer: null,
            });
            prisma.sequenceNode.update.mockResolvedValue({ id: 'n-1', substance: '阿莫西林' });
            await service.updateBackboneAttributes('seq-1', 'n-1', { substance: '阿莫西林' });
            expect(prisma.sequenceNode.update).toHaveBeenCalledWith({
                where: { id: 'n-1' },
                data: { substance: '阿莫西林' },
            });
        });
        it('should update productName on 2.3.P section', async () => {
            prisma.sequenceNode.findFirst.mockResolvedValue({
                id: 'n-2',
                sequenceId: 'seq-1',
                ctdSectionNumber: '2.3.P',
            });
            prisma.sequenceNode.update.mockResolvedValue({ id: 'n-2', productName: '阿莫西林胶囊' });
            await service.updateBackboneAttributes('seq-1', 'n-2', { productName: '阿莫西林胶囊' });
            expect(prisma.sequenceNode.update).toHaveBeenCalledWith({
                where: { id: 'n-2' },
                data: { productName: '阿莫西林胶囊' },
            });
        });
        it('should throw for unsupported section', async () => {
            prisma.sequenceNode.findFirst.mockResolvedValue({
                id: 'n-3',
                sequenceId: 'seq-1',
                ctdSectionNumber: '2.2',
            });
            await expect(service.updateBackboneAttributes('seq-1', 'n-3', { substance: 'test' })).rejects.toThrow(common_1.BadRequestException);
        });
        it('should mark child leaves for rebuild when substance changes on non-first sequence', async () => {
            prisma.sequenceNode.findFirst.mockResolvedValue({
                id: 'n-s',
                sequenceId: 'seq-1',
                ctdSectionNumber: '2.3.S',
                substance: '旧原料',
                manufacturer: null,
            });
            prisma.sequence.findUnique.mockResolvedValue({
                id: 'seq-1',
                sequenceNumber: '0001',
            });
            prisma.sequenceNode.findMany
                .mockResolvedValueOnce([
                { id: 'leaf-1', isLeaf: true, parentId: 'n-s', templateNodeId: 't-1' },
            ])
                .mockResolvedValueOnce([
                { id: 'n-s', parentId: null },
                { id: 'leaf-1', parentId: 'n-s' },
            ]);
            prisma.sequenceNode.update.mockResolvedValue({});
            await service.updateBackboneAttributes('seq-1', 'n-s', { substance: '新原料' });
            expect(prisma.sequenceNode.update).toHaveBeenCalledWith({
                where: { id: 'leaf-1' },
                data: { operation: 'NEW' },
            });
        });
    });
    describe('createExtensionNode', () => {
        it('should create extension node for biological products', async () => {
            prisma.sequenceNode.findFirst
                .mockResolvedValueOnce({
                id: 'n-32r',
                templateNodeId: 't-32r',
                templateNode: { allowsExtension: true },
            })
                .mockResolvedValueOnce(null);
            prisma.sequence.findUnique.mockResolvedValue({
                id: 'seq-1',
                regulatoryActivity: {
                    application: { productTypeCode: 'cnprt2' },
                },
            });
            await service.createExtensionNode('seq-1', 'n-32r', { extensionType: '3.2.R.1' });
            expect(prisma.sequenceNode.create).toHaveBeenCalledWith({
                data: expect.objectContaining({
                    elementName: 'node-extension',
                    ctdSectionNumber: '3.2.R.1',
                    title: '3.2.R.1工艺验证',
                    operation: 'NEW',
                    isLeaf: true,
                }),
            });
        });
        it('should reject for non-biological products (cnprt1)', async () => {
            prisma.sequenceNode.findFirst.mockResolvedValue({
                id: 'n-32r',
                templateNode: { allowsExtension: true },
            });
            prisma.sequence.findUnique.mockResolvedValue({
                id: 'seq-1',
                regulatoryActivity: {
                    application: { productTypeCode: 'cnprt1' },
                },
            });
            await expect(service.createExtensionNode('seq-1', 'n-32r', { extensionType: '3.2.R.1' })).rejects.toThrow(common_1.ForbiddenException);
        });
        it('should reject for non-extension parent node', async () => {
            prisma.sequenceNode.findFirst.mockResolvedValue({
                id: 'n-1',
                templateNode: { allowsExtension: false },
            });
            await expect(service.createExtensionNode('seq-1', 'n-1', { extensionType: '3.2.R.1' })).rejects.toThrow(common_1.BadRequestException);
        });
        it('should reject duplicate extension', async () => {
            prisma.sequenceNode.findFirst
                .mockResolvedValueOnce({
                id: 'n-32r',
                templateNodeId: 't-32r',
                templateNode: { allowsExtension: true },
            })
                .mockResolvedValueOnce({ id: 'existing' });
            prisma.sequence.findUnique.mockResolvedValue({
                id: 'seq-1',
                regulatoryActivity: {
                    application: { productTypeCode: 'cnprt2' },
                },
            });
            await expect(service.createExtensionNode('seq-1', 'n-32r', { extensionType: '3.2.R.1' })).rejects.toThrow(common_1.BadRequestException);
        });
        it('should reject invalid extension type', async () => {
            prisma.sequenceNode.findFirst.mockResolvedValueOnce({
                id: 'n-32r',
                templateNodeId: 't-32r',
                templateNode: { allowsExtension: true },
            }).mockResolvedValueOnce(null);
            prisma.sequence.findUnique.mockResolvedValue({
                id: 'seq-1',
                regulatoryActivity: {
                    application: { productTypeCode: 'cnprt2' },
                },
            });
            await expect(service.createExtensionNode('seq-1', 'n-32r', { extensionType: '3.2.R.99' })).rejects.toThrow(common_1.BadRequestException);
        });
    });
    describe('deleteExtensionNode', () => {
        it('should delete extension node', async () => {
            prisma.sequenceNode.findFirst.mockResolvedValue({
                id: 'ext-1',
                elementName: 'node-extension',
            });
            await service.deleteExtensionNode('seq-1', 'ext-1');
            expect(prisma.sequenceNode.delete).toHaveBeenCalledWith({
                where: { id: 'ext-1' },
            });
        });
        it('should throw if not found', async () => {
            prisma.sequenceNode.findFirst.mockResolvedValue(null);
            await expect(service.deleteExtensionNode('seq-1', 'nonexistent'))
                .rejects.toThrow(common_1.NotFoundException);
        });
    });
    describe('checkCompleteness', () => {
        it('should return completeness results', async () => {
            prisma.sequence.findUnique.mockResolvedValue({
                id: 'seq-1',
                regulatoryActivity: {
                    regulatoryActivityTypeCode: 'cnrat1',
                    application: { applicationTypeCode: 'cnapt2' },
                },
            });
            prisma.sequenceNode.findMany.mockResolvedValue([
                { id: 'n-1', templateNodeId: 't-1', isLeaf: true, status: 'COMPLETED', isRequired: true, ctdSectionNumber: '2.3.S.1' },
                { id: 'n-2', templateNodeId: 't-2', isLeaf: true, status: 'EMPTY', isRequired: true, ctdSectionNumber: '2.3.P.1' },
            ]);
            prisma.ctdCompletenessRule.findMany.mockResolvedValue([
                {
                    templateNodeId: 't-1',
                    ruleType: 'REQUIRED',
                    severity: 'ERROR',
                    templateNode: { elementName: 'gen-prop', ctdSectionNumber: '2.3.S.1', titleZh: '一般性质' },
                },
                {
                    templateNodeId: 't-2',
                    ruleType: 'REQUIRED',
                    severity: 'ERROR',
                    templateNode: { elementName: 'desc', ctdSectionNumber: '2.3.P.1', titleZh: '剂型与产品组成' },
                },
            ]);
            const result = await service.checkCompleteness('seq-1');
            expect(result.requiredSections).toBe(2);
            expect(result.completedRequired).toBe(1);
            expect(result.missingRequired).toHaveLength(1);
            expect(result.missingRequired[0].section).toBe('2.3.P.1');
        });
        it('should detect forbidden violations', async () => {
            prisma.sequence.findUnique.mockResolvedValue({
                id: 'seq-1',
                regulatoryActivity: {
                    regulatoryActivityTypeCode: 'cnrat8',
                    application: { applicationTypeCode: 'cnapt3' },
                },
            });
            prisma.sequenceNode.findMany.mockResolvedValue([
                { id: 'n-1', templateNodeId: 't-1', isLeaf: true, status: 'EDITING', isRequired: false, ctdSectionNumber: '4.2.1' },
            ]);
            prisma.ctdCompletenessRule.findMany.mockResolvedValue([
                {
                    templateNodeId: 't-1',
                    ruleType: 'FORBIDDEN',
                    severity: 'WARNING',
                    templateNode: { elementName: 'pharma', ctdSectionNumber: '4.2.1', titleZh: '药理学' },
                },
            ]);
            const result = await service.checkCompleteness('seq-1');
            expect(result.forbiddenViolations).toHaveLength(1);
            expect(result.forbiddenViolations[0].section).toBe('4.2.1');
        });
    });
    describe('previewRequiredSections', () => {
        it('should return required and forbidden section lists', async () => {
            prisma.sequence.findUnique.mockResolvedValue({
                id: 'seq-1',
                regulatoryActivity: {
                    regulatoryActivityTypeCode: 'cnrat1',
                    application: { applicationTypeCode: 'cnapt2', productTypeCode: 'cnprt1' },
                },
            });
            prisma.ctdCompletenessRule.findMany.mockResolvedValue([
                {
                    ruleType: 'REQUIRED',
                    severity: 'ERROR',
                    templateNode: { ctdSectionNumber: '1.2', titleZh: '申请表', module: 1, elementName: 'app-form' },
                },
                {
                    ruleType: 'FORBIDDEN',
                    severity: 'WARNING',
                    templateNode: { ctdSectionNumber: '4.2.1', titleZh: '药理学', module: 4, elementName: 'pharma' },
                },
            ]);
            const result = await service.previewRequiredSections('seq-1');
            expect(result.requiredSections).toHaveLength(1);
            expect(result.forbiddenSections).toHaveLength(1);
            expect(result.totalRequired).toBe(1);
            expect(result.applicationTypeCode).toBe('cnapt2');
        });
    });
    describe('getExtensionNodeOptions', () => {
        it('should return all 6 extension node types', () => {
            const options = service.getExtensionNodeOptions();
            expect(options).toHaveLength(6);
            expect(options[0].type).toBe('3.2.R.1');
            expect(options[0].titleZh).toContain('工艺验证');
            expect(options[5].type).toBe('3.2.R.6');
        });
        it('should define NMPA V1.1 3.2.R.1~3.2.R.6 sub-sections exhaustively', () => {
            const options = service.getExtensionNodeOptions();
            const byType = new Map(options.map((o) => [o.type, o]));
            expect(byType.get('3.2.R.1').titleZh).toBe('3.2.R.1工艺验证');
            expect(byType.get('3.2.R.2').titleZh).toBe('3.2.R.2批记录');
            expect(byType.get('3.2.R.3').titleZh).toBe('3.2.R.3分析方法验证报告');
            expect(byType.get('3.2.R.4').titleZh).toBe('3.2.R.4稳定性图谱');
            expect(byType.get('3.2.R.5').titleZh).toBe('3.2.R.5可比性方案');
            expect(byType.get('3.2.R.6').titleZh).toBe('3.2.R.6其他');
            for (const opt of options) {
                expect(opt.titleEn).toBeTruthy();
            }
        });
        it('template fixture should mark 3.2.R as an extension point', () => {
            const r = mockTemplateNodes.find((n) => n.ctdSectionNumber === '3.2.R');
            expect(r).toBeDefined();
            expect(r.allowsExtension).toBe(true);
        });
    });
});
//# sourceMappingURL=ctd-template.service.spec.js.map