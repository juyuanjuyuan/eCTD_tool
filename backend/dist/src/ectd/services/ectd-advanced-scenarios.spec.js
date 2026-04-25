"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const testing_1 = require("@nestjs/testing");
const validator_service_1 = require("./validator.service");
const lifecycle_service_1 = require("./lifecycle.service");
const index_xml_service_1 = require("./index-xml.service");
const cn_regional_xml_service_1 = require("./cn-regional-xml.service");
const prisma_service_1 = require("../../prisma/prisma.service");
const md5_service_1 = require("./md5.service");
const client_1 = require("@prisma/client");
function buildApplication(overrides = {}) {
    return {
        id: 'app-1',
        applicationNumber: 'x202600001',
        applicationTypeCode: 'cnapt2',
        productTypeCode: 'cnprt1',
        productNumber: '2026000001',
        ...overrides,
    };
}
function buildRegulatoryActivity(overrides = {}) {
    const { application: appOverrides, ...raOverrides } = overrides;
    return {
        id: 'ra-1',
        applicationId: 'app-1',
        regulatoryActivityTypeCode: 'cnrat1',
        relatedSequence: '0000',
        application: buildApplication(appOverrides || {}),
        ...raOverrides,
    };
}
function buildSequence(overrides = {}) {
    const { regulatoryActivity: raOverrides, ...seqOverrides } = overrides;
    const ra = buildRegulatoryActivity(raOverrides || {});
    return {
        id: 'seq-1',
        sequenceNumber: '0000',
        sequenceTypeCode: 'cnsqt1',
        status: 'DRAFT',
        contactName: '张三',
        contactPhone: '13800000000',
        contactEmail: 'test@example.com',
        description: '首次提交申报资料',
        regulatoryActivityId: 'ra-1',
        regulatoryActivity: {
            ...ra,
            sequences: [{ id: 'seq-1', sequenceNumber: '0000' }],
        },
        sequenceNodes: [],
        ...seqOverrides,
    };
}
function buildLeaf(overrides = {}) {
    return {
        id: `node-${Math.random().toString(36).substr(2, 8)}`,
        isLeaf: true,
        ctdSectionNumber: '2.3.S.1',
        title: '一般性质',
        elementName: 'general-properties',
        parentId: null,
        operation: 'NEW',
        status: 'COMPLETED',
        substance: undefined,
        manufacturer: undefined,
        productName: undefined,
        dosageForm: undefined,
        indication: undefined,
        templateNodeId: 'tmpl-1',
        templateNode: { module: 2, requiresStf: false, elementName: 'general-properties', allowsExtension: false, ctdSectionNumber: '2.3.S.1', titleZh: '一般性质' },
        children: [],
        fileAttachments: [
            {
                id: 'file-1',
                fileSize: 1024 * 1024,
                fileType: 'pdf',
                originalName: 'test.pdf',
                storedName: 'test.pdf',
                ectdRelativePath: 'm2/23-qos/test.pdf',
                pdfAnalysis: {
                    pdfVersion: '1.7',
                    isEncrypted: false,
                    hasJavascript: false,
                    hasExternalLinks: false,
                    hasMultimedia: false,
                    pageCount: 3,
                    hasBookmarks: false,
                    bookmarkZoomInherit: true,
                    hasAttachments: false,
                    fontsEmbedded: true,
                },
            },
        ],
        document: null,
        studyTaggingFile: null,
        ...overrides,
    };
}
describe('eCTD Advanced Scenarios', () => {
    let validatorService;
    let prisma;
    beforeEach(async () => {
        prisma = {
            sequence: {
                findUnique: jest.fn(),
                findMany: jest.fn().mockResolvedValue([]),
                update: jest.fn().mockResolvedValue({}),
            },
            sequenceNode: {
                findFirst: jest.fn(),
                findUnique: jest.fn(),
                findMany: jest.fn(),
            },
            validationReport: {
                create: jest.fn().mockImplementation(({ data }) => ({
                    id: 'report-1',
                    ...data,
                })),
            },
            ctdCompletenessRule: {
                findMany: jest.fn().mockResolvedValue([]),
            },
            cvDependency: {
                findFirst: jest.fn().mockResolvedValue({ id: 'dep1', sequenceTypeCode: null }),
            },
            fileAttachment: {
                findUnique: jest.fn(),
            },
        };
        const module = await testing_1.Test.createTestingModule({
            providers: [
                validator_service_1.ValidatorService,
                { provide: prisma_service_1.PrismaService, useValue: prisma },
                { provide: md5_service_1.Md5Service, useValue: new md5_service_1.Md5Service() },
            ],
        }).compile();
        validatorService = module.get(validator_service_1.ValidatorService);
    });
    describe('Lifecycle: Withdraw sequence (cnsqt3)', () => {
        let lifecycleService;
        const lifecyclePrisma = {
            sequence: { findUnique: jest.fn(), findMany: jest.fn() },
            sequenceNode: { findUnique: jest.fn(), findFirst: jest.fn(), findMany: jest.fn() },
        };
        beforeEach(() => {
            lifecycleService = new lifecycle_service_1.LifecycleService(lifecyclePrisma);
            jest.clearAllMocks();
        });
        it('should generate correct 4-step withdraw operations for mixed sequence', async () => {
            lifecyclePrisma.sequenceNode.findMany.mockResolvedValue([
                { templateNodeId: 'tpl1', operation: client_1.LeafOperation.NEW, isLeaf: true },
                { templateNodeId: 'tpl2', operation: client_1.LeafOperation.REPLACE, isLeaf: true },
                { templateNodeId: 'tpl3', operation: client_1.LeafOperation.DELETE, isLeaf: true },
                { templateNodeId: 'tpl4', operation: client_1.LeafOperation.APPEND, isLeaf: true },
            ]);
            const ops = await lifecycleService.generateWithdrawOperations('seq1');
            expect(ops).toHaveLength(4);
            expect(ops[0]).toEqual(expect.objectContaining({
                templateNodeId: 'tpl1',
                operation: client_1.LeafOperation.DELETE,
            }));
            expect(ops[1]).toEqual(expect.objectContaining({
                templateNodeId: 'tpl2',
                operation: client_1.LeafOperation.NEW,
            }));
            expect(ops[2]).toEqual(expect.objectContaining({
                templateNodeId: 'tpl3',
                operation: client_1.LeafOperation.NEW,
            }));
            expect(ops[3]).toEqual(expect.objectContaining({
                templateNodeId: 'tpl4',
                operation: client_1.LeafOperation.DELETE,
            }));
        });
        it('should include descriptive notes for each withdraw step', async () => {
            lifecyclePrisma.sequenceNode.findMany.mockResolvedValue([
                { templateNodeId: 'tpl1', operation: client_1.LeafOperation.NEW, isLeaf: true },
                { templateNodeId: 'tpl2', operation: client_1.LeafOperation.REPLACE, isLeaf: true },
            ]);
            const ops = await lifecycleService.generateWithdrawOperations('seq1');
            expect(ops[0].note).toContain('撤回');
            expect(ops[1].note).toContain('撤回');
        });
        it('should validate withdraw sequence type code via validator', async () => {
            const seq = buildSequence({
                sequenceTypeCode: 'cnsqt3',
                sequenceNodes: [
                    buildLeaf({ operation: 'DELETE', fileAttachments: [] }),
                ],
            });
            prisma.sequence.findUnique.mockResolvedValue(seq);
            const result = await validatorService.validate('seq-1');
            const sqtError = result.items.find(i => i.ruleCode === '4.2.8');
            expect(sqtError).toBeUndefined();
        });
    });
    describe('Lifecycle: Format conversion sequence (cnsqt4)', () => {
        it('should accept cnsqt4 as valid sequence type', async () => {
            const seq = buildSequence({
                sequenceTypeCode: 'cnsqt4',
                sequenceNodes: [
                    buildLeaf({ operation: 'REPLACE' }),
                ],
            });
            prisma.sequence.findUnique.mockResolvedValue(seq);
            prisma.sequence.findMany.mockResolvedValue([{ id: 'seq-0' }]);
            prisma.sequenceNode.findFirst.mockResolvedValue({ id: 'prev-node' });
            const result = await validatorService.validate('seq-1');
            const sqtError = result.items.find(i => i.ruleCode === '4.2.8');
            expect(sqtError).toBeUndefined();
        });
        it('should allow REPLACE operations in format conversion sequence', async () => {
            const seq = buildSequence({
                sequenceNumber: '0001',
                sequenceTypeCode: 'cnsqt4',
                sequenceNodes: [
                    buildLeaf({ operation: 'REPLACE', ctdSectionNumber: '2.3.S.1' }),
                ],
            });
            prisma.sequence.findUnique.mockResolvedValue(seq);
            prisma.sequence.findMany.mockResolvedValue([{ id: 'seq-0' }]);
            prisma.sequenceNode.findFirst.mockResolvedValue({ id: 'prev-node' });
            const result = await validatorService.validate('seq-1');
            const lifecycleErrors = result.items.filter(i => i.ruleCode === '3.10' && i.severity === client_1.ValidationSeverity.ERROR);
            expect(lifecycleErrors).toHaveLength(0);
        });
    });
    describe('Lifecycle: File reuse across sequences', () => {
        it('should accept referenced files with valid paths', async () => {
            const seq = buildSequence({
                sequenceNumber: '0001',
                sequenceNodes: [
                    buildLeaf({
                        operation: 'NEW',
                        fileAttachments: [
                            {
                                id: 'ref-file',
                                fileSize: 1024,
                                fileType: 'pdf',
                                originalName: 'reused-doc.pdf',
                                storedName: 'reused-doc.pdf',
                                ectdRelativePath: 'm2/23-qos/reused-doc.pdf',
                                isReference: true,
                                pdfAnalysis: {
                                    pdfVersion: '1.7', isEncrypted: false, hasJavascript: false,
                                    hasExternalLinks: false, hasMultimedia: false, pageCount: 3,
                                    hasBookmarks: false, bookmarkZoomInherit: true,
                                    hasAttachments: false, fontsEmbedded: true,
                                },
                            },
                        ],
                    }),
                ],
            });
            prisma.sequence.findUnique.mockResolvedValue(seq);
            const result = await validatorService.validate('seq-1');
            const namingErrors = result.items.filter(i => i.ruleCode === '2.5' && i.severity === client_1.ValidationSeverity.ERROR);
            expect(namingErrors).toHaveLength(0);
        });
        it('should validate referenced file paths are compliant', async () => {
            const seq = buildSequence({
                sequenceNodes: [
                    buildLeaf({
                        fileAttachments: [
                            {
                                id: 'ref-bad',
                                fileSize: 1024,
                                fileType: 'pdf',
                                originalName: 'Bad File.pdf',
                                storedName: 'Bad File.pdf',
                                ectdRelativePath: 'm2/23-qos/Bad File.pdf',
                                isReference: true,
                                pdfAnalysis: null,
                            },
                        ],
                    }),
                ],
            });
            prisma.sequence.findUnique.mockResolvedValue(seq);
            const result = await validatorService.validate('seq-1');
            const namingError = result.items.find(i => i.ruleCode === '2.5');
            expect(namingError).toBeDefined();
        });
    });
    describe('Lifecycle: Backbone attribute update (3.2.S/3.2.P rebuild)', () => {
        it('should validate NEW operations for rebuilt sections after attribute change', async () => {
            const seq = buildSequence({
                sequenceNumber: '0001',
                sequenceNodes: [
                    buildLeaf({
                        operation: 'NEW',
                        ctdSectionNumber: '3.2.S.1',
                        templateNode: { module: 3, requiresStf: false, elementName: 'm3-2-s-1', allowsExtension: false, ctdSectionNumber: '3.2.S.1', titleZh: '基本信息' },
                        fileAttachments: [{
                                id: 'f-rebuilt',
                                fileSize: 1024,
                                fileType: 'pdf',
                                originalName: 'rebuilt-section.pdf',
                                storedName: 'rebuilt-section.pdf',
                                ectdRelativePath: 'm3/32-body-data/rebuilt-section.pdf',
                                pdfAnalysis: {
                                    pdfVersion: '1.7', isEncrypted: false, hasJavascript: false,
                                    hasExternalLinks: false, hasMultimedia: false, pageCount: 3,
                                    hasBookmarks: false, bookmarkZoomInherit: true,
                                    hasAttachments: false, fontsEmbedded: true,
                                },
                            }],
                    }),
                ],
            });
            prisma.sequence.findUnique.mockResolvedValue(seq);
            const result = await validatorService.validate('seq-1');
            const deleteOrRebuildErrors = result.items.filter(i => i.ruleCode === '3.10' && i.description?.includes('3.2.S.1'));
            expect(deleteOrRebuildErrors).toHaveLength(0);
        });
        it('should validate backbone attributes in index.xml for updated substance', async () => {
            const indexMockPrisma = {
                sequence: { findUnique: jest.fn(), findMany: jest.fn() },
                sequenceNode: { findMany: jest.fn() },
            };
            const md5 = new md5_service_1.Md5Service();
            const indexService = new index_xml_service_1.IndexXmlService(indexMockPrisma, md5);
            indexMockPrisma.sequence.findUnique.mockResolvedValue({ id: 'seq-rebuild', sequenceNumber: '0000', regulatoryActivityId: 'ra-1', regulatoryActivity: { applicationId: 'app-1' } });
            indexMockPrisma.sequence.findMany.mockResolvedValue([]);
            indexMockPrisma.sequenceNode.findMany.mockResolvedValue([
                {
                    id: 'mod3', elementName: 'm3-quality', ctdSectionNumber: '3', title: '质量',
                    operation: null, isLeaf: false, parentId: null,
                    substance: null, manufacturer: null, productName: null, dosageForm: null, indication: null,
                    templateNode: { module: 3 }, fileAttachments: [],
                },
                {
                    id: 'ds-new', elementName: 'm3-2-s-drug-substance', ctdSectionNumber: '3.2.S', title: '原料药',
                    operation: null, isLeaf: false, parentId: 'mod3',
                    substance: 'NewSubstanceName', manufacturer: 'NewManufacturer',
                    productName: null, dosageForm: null, indication: null,
                    templateNode: { module: 3 }, fileAttachments: [],
                },
                {
                    id: 'ds-leaf', elementName: 'm3-2-s-1', ctdSectionNumber: '3.2.S.1', title: '基本信息',
                    operation: 'NEW', isLeaf: true, parentId: 'ds-new',
                    substance: null, manufacturer: null, productName: null, dosageForm: null, indication: null,
                    templateNode: { module: 3 },
                    fileAttachments: [{ ectdRelativePath: 'm3/32-body-data/s1-info.pdf', md5Checksum: 'xyz', xmlLang: 'zh' }],
                },
            ]);
            const xml = await indexService.generateIndexXml('seq-rebuild');
            expect(xml).toContain('substance="NewSubstanceName"');
            expect(xml).toContain('manufacturer="NewManufacturer"');
        });
    });
    describe('Boundary: xml:lang handling', () => {
        it('should accept zh (Chinese) as valid xml:lang', async () => {
            const seq = buildSequence({
                sequenceNodes: [
                    buildLeaf({
                        fileAttachments: [{
                                id: 'f-zh', fileSize: 1024, fileType: 'pdf',
                                originalName: 'chinese-doc.pdf', storedName: 'chinese-doc.pdf',
                                ectdRelativePath: 'm2/23-qos/chinese-doc.pdf',
                                pdfAnalysis: {
                                    pdfVersion: '1.7', isEncrypted: false, hasJavascript: false,
                                    hasExternalLinks: false, hasMultimedia: false, pageCount: 3,
                                    hasBookmarks: false, bookmarkZoomInherit: true,
                                    hasAttachments: false, fontsEmbedded: true,
                                },
                            }],
                    }),
                ],
            });
            prisma.sequence.findUnique.mockResolvedValue(seq);
            const result = await validatorService.validate('seq-1');
            const langErrors = result.items.filter(i => i.severity === client_1.ValidationSeverity.ERROR && i.description?.includes('lang'));
            expect(langErrors).toHaveLength(0);
        });
        it('should generate xml:lang="en" for English reference documents in index.xml', async () => {
            const indexPrisma = {
                sequence: { findUnique: jest.fn(), findMany: jest.fn() },
                sequenceNode: { findMany: jest.fn() },
            };
            const md5 = new md5_service_1.Md5Service();
            const indexService = new index_xml_service_1.IndexXmlService(indexPrisma, md5);
            indexPrisma.sequence.findUnique.mockResolvedValue({ id: 'seq1', sequenceNumber: '0000', regulatoryActivityId: 'ra-1', regulatoryActivity: { applicationId: 'app-1' } });
            indexPrisma.sequence.findMany.mockResolvedValue([]);
            indexPrisma.sequenceNode.findMany.mockResolvedValue([
                {
                    id: 'mod2', elementName: 'm2-summaries', ctdSectionNumber: '2', title: '模块二',
                    operation: null, isLeaf: false, parentId: null,
                    substance: null, manufacturer: null, productName: null, dosageForm: null, indication: null,
                    templateNode: { module: 2 }, fileAttachments: [],
                },
                {
                    id: 'en-leaf', elementName: 'm2-3-ref', ctdSectionNumber: '2.3.1', title: 'English Reference',
                    operation: 'NEW', isLeaf: true, parentId: 'mod2',
                    substance: null, manufacturer: null, productName: null, dosageForm: null, indication: null,
                    templateNode: { module: 2 },
                    fileAttachments: [
                        { ectdRelativePath: 'm2/23-qos/english-ref.pdf', md5Checksum: 'en1', xmlLang: 'en' },
                    ],
                },
            ]);
            const xml = await indexService.generateIndexXml('seq1');
            expect(xml).toContain('xml:lang="en"');
        });
        it('should handle mixed zh and en documents in same sequence', async () => {
            const indexPrisma = {
                sequence: { findUnique: jest.fn(), findMany: jest.fn() },
                sequenceNode: { findMany: jest.fn() },
            };
            const md5 = new md5_service_1.Md5Service();
            const indexService = new index_xml_service_1.IndexXmlService(indexPrisma, md5);
            indexPrisma.sequence.findUnique.mockResolvedValue({ id: 'seq1', sequenceNumber: '0000', regulatoryActivityId: 'ra-1', regulatoryActivity: { applicationId: 'app-1' } });
            indexPrisma.sequence.findMany.mockResolvedValue([]);
            indexPrisma.sequenceNode.findMany.mockResolvedValue([
                {
                    id: 'mod2', elementName: 'm2-summaries', ctdSectionNumber: '2', title: '模块二',
                    operation: null, isLeaf: false, parentId: null,
                    substance: null, manufacturer: null, productName: null, dosageForm: null, indication: null,
                    templateNode: { module: 2 }, fileAttachments: [],
                },
                {
                    id: 'zh-leaf', elementName: 'm2-3-qos', ctdSectionNumber: '2.3', title: '质量综述',
                    operation: 'NEW', isLeaf: true, parentId: 'mod2',
                    substance: null, manufacturer: null, productName: null, dosageForm: null, indication: null,
                    templateNode: { module: 2 },
                    fileAttachments: [
                        { ectdRelativePath: 'm2/23-qos/qos-zh.pdf', md5Checksum: 'zh1', xmlLang: 'zh' },
                    ],
                },
                {
                    id: 'en-leaf', elementName: 'm2-4-nonclin', ctdSectionNumber: '2.4', title: 'Nonclinical Overview',
                    operation: 'NEW', isLeaf: true, parentId: 'mod2',
                    substance: null, manufacturer: null, productName: null, dosageForm: null, indication: null,
                    templateNode: { module: 2 },
                    fileAttachments: [
                        { ectdRelativePath: 'm2/24-nonclin/overview-en.pdf', md5Checksum: 'en1', xmlLang: 'en' },
                    ],
                },
            ]);
            const xml = await indexService.generateIndexXml('seq1');
            expect(xml).toContain('xml:lang="zh"');
            expect(xml).toContain('xml:lang="en"');
        });
    });
    describe('Boundary: Extension nodes (3.2.R)', () => {
        it('should generate node-extension elements in index.xml for bioproduct', async () => {
            const indexPrisma = {
                sequence: { findUnique: jest.fn(), findMany: jest.fn() },
                sequenceNode: { findMany: jest.fn() },
            };
            const md5 = new md5_service_1.Md5Service();
            const indexService = new index_xml_service_1.IndexXmlService(indexPrisma, md5);
            indexPrisma.sequence.findUnique.mockResolvedValue({ id: 'seq1', sequenceNumber: '0000', regulatoryActivityId: 'ra-1', regulatoryActivity: { applicationId: 'app-1' } });
            indexPrisma.sequence.findMany.mockResolvedValue([]);
            indexPrisma.sequenceNode.findMany.mockResolvedValue([
                {
                    id: 'mod3', elementName: 'm3-quality', ctdSectionNumber: '3', title: '质量',
                    operation: null, isLeaf: false, parentId: null,
                    substance: null, manufacturer: null, productName: null, dosageForm: null, indication: null,
                    templateNode: { module: 3 }, fileAttachments: [],
                },
                {
                    id: 'ext-r', elementName: 'node-extension', ctdSectionNumber: '3.2.R', title: '区域性信息',
                    operation: null, isLeaf: false, parentId: 'mod3',
                    substance: null, manufacturer: null, productName: null, dosageForm: null, indication: null,
                    templateNode: { module: 3 }, fileAttachments: [],
                },
                {
                    id: 'ext-r1', elementName: 'm3-2-r-1', ctdSectionNumber: '3.2.R.1', title: '生物制品特有资料',
                    operation: 'NEW', isLeaf: true, parentId: 'ext-r',
                    substance: null, manufacturer: null, productName: null, dosageForm: null, indication: null,
                    templateNode: { module: 3 },
                    fileAttachments: [
                        { ectdRelativePath: 'm3/32-body-data/r1-bio.pdf', md5Checksum: 'r1hash', xmlLang: 'zh' },
                    ],
                },
            ]);
            const xml = await indexService.generateIndexXml('seq1');
            expect(xml).toContain('<node-extension>');
            expect(xml).toContain('</node-extension>');
            expect(xml).toContain('r1-bio.pdf');
            expect(xml).toContain('<title>生物制品特有资料</title>');
        });
        it('should validate extension node with correct product type (cnprt2 bioproduct)', async () => {
            const seq = buildSequence({
                regulatoryActivity: {
                    application: { productTypeCode: 'cnprt2' },
                },
                sequenceNodes: [
                    buildLeaf({
                        ctdSectionNumber: '3.2.R.1',
                        templateNode: { module: 3, requiresStf: false, elementName: 'm3-2-r-1', allowsExtension: false, ctdSectionNumber: '3.2.R.1', titleZh: '生物制品特有资料' },
                    }),
                ],
            });
            prisma.sequence.findUnique.mockResolvedValue(seq);
            const result = await validatorService.validate('seq-1');
            const prtError = result.items.find(i => i.ruleCode === '4.2.3');
            expect(prtError).toBeUndefined();
        });
    });
    describe('Boundary: Empty section filtering', () => {
        it('should not generate XML elements for sections without active leaves', async () => {
            const indexPrisma = {
                sequence: { findUnique: jest.fn(), findMany: jest.fn() },
                sequenceNode: { findMany: jest.fn() },
            };
            const md5 = new md5_service_1.Md5Service();
            const indexService = new index_xml_service_1.IndexXmlService(indexPrisma, md5);
            indexPrisma.sequence.findUnique.mockResolvedValue({ id: 'seq1', sequenceNumber: '0000', regulatoryActivityId: 'ra-1', regulatoryActivity: { applicationId: 'app-1' } });
            indexPrisma.sequence.findMany.mockResolvedValue([]);
            indexPrisma.sequenceNode.findMany.mockResolvedValue([
                {
                    id: 'mod2', elementName: 'm2-summaries', ctdSectionNumber: '2', title: '模块二',
                    operation: null, isLeaf: false, parentId: null,
                    substance: null, manufacturer: null, productName: null, dosageForm: null, indication: null,
                    templateNode: { module: 2 }, fileAttachments: [],
                },
                {
                    id: 'sec23', elementName: 'm2-3-qos', ctdSectionNumber: '2.3', title: '质量综述',
                    operation: null, isLeaf: false, parentId: 'mod2',
                    substance: null, manufacturer: null, productName: null, dosageForm: null, indication: null,
                    templateNode: { module: 2 }, fileAttachments: [],
                },
                {
                    id: 'empty-leaf', elementName: 'm2-3-1', ctdSectionNumber: '2.3.1', title: '空章节',
                    operation: null, isLeaf: true, parentId: 'sec23',
                    substance: null, manufacturer: null, productName: null, dosageForm: null, indication: null,
                    templateNode: { module: 2 }, fileAttachments: [],
                },
            ]);
            const xml = await indexService.generateIndexXml('seq1');
            expect(xml).not.toContain('m2-summaries');
            expect(xml).not.toContain('m2-3-qos');
            expect(xml).not.toContain('m2-3-1');
        });
        it('should not generate XML for cn-regional empty sections', async () => {
            const cnPrisma = {
                sequence: { findUnique: jest.fn(), findMany: jest.fn() },
                sequenceNode: { findMany: jest.fn() },
            };
            const md5 = new md5_service_1.Md5Service();
            const cnService = new cn_regional_xml_service_1.CnRegionalXmlService(cnPrisma, md5);
            cnPrisma.sequence.findMany.mockResolvedValue([]);
            cnPrisma.sequence.findUnique.mockResolvedValue({
                id: 'seq1', sequenceNumber: '0000',
                sequenceTypeCode: 'cnsqt1', sequenceTypeVersion: '1.0',
                description: '首次提交', contactName: '张三',
                contactPhone: '010-12345678', contactEmail: 'test@example.com',
                regulatoryActivity: {
                    relatedSequence: '', regulatoryActivityTypeCode: 'cnrat1',
                    regulatoryActivityTypeVersion: '1.0',
                    application: {
                        applicationNumber: 'x202600001', applicationTypeCode: 'cnapt2',
                        applicationTypeVersion: '1.0', productTypeCode: 'cnprt1',
                        productTypeVersion: '1.0', productNumber: '2026000001',
                    },
                },
            });
            cnPrisma.sequenceNode.findMany.mockResolvedValue([
                {
                    id: 's1', elementName: 'cn-1-3', ctdSectionNumber: '1.3', title: '综述资料',
                    operation: null, isLeaf: false, parentId: null,
                    templateNode: { module: 1 }, fileAttachments: [],
                },
                {
                    id: 's1-1', elementName: 'cn-1-3-1', ctdSectionNumber: '1.3.1', title: '药品说明书',
                    operation: null, isLeaf: true, parentId: 's1',
                    templateNode: { module: 1 }, fileAttachments: [],
                },
            ]);
            const xml = await cnService.generateCnRegionalXml('seq1');
            expect(xml).not.toContain('cn-1-3');
            expect(xml).not.toContain('cn-1-3-1');
        });
        it('should include section when at least one child has active leaf', async () => {
            const indexPrisma = {
                sequence: { findUnique: jest.fn(), findMany: jest.fn() },
                sequenceNode: { findMany: jest.fn() },
            };
            const md5 = new md5_service_1.Md5Service();
            const indexService = new index_xml_service_1.IndexXmlService(indexPrisma, md5);
            indexPrisma.sequence.findUnique.mockResolvedValue({ id: 'seq1', sequenceNumber: '0000', regulatoryActivityId: 'ra-1', regulatoryActivity: { applicationId: 'app-1' } });
            indexPrisma.sequence.findMany.mockResolvedValue([]);
            indexPrisma.sequenceNode.findMany.mockResolvedValue([
                {
                    id: 'mod2', elementName: 'm2-summaries', ctdSectionNumber: '2', title: '模块二',
                    operation: null, isLeaf: false, parentId: null,
                    substance: null, manufacturer: null, productName: null, dosageForm: null, indication: null,
                    templateNode: { module: 2 }, fileAttachments: [],
                },
                {
                    id: 'empty', elementName: 'm2-3-1', ctdSectionNumber: '2.3.1', title: '空章节',
                    operation: null, isLeaf: true, parentId: 'mod2',
                    substance: null, manufacturer: null, productName: null, dosageForm: null, indication: null,
                    templateNode: { module: 2 }, fileAttachments: [],
                },
                {
                    id: 'active', elementName: 'm2-3-2', ctdSectionNumber: '2.3.2', title: '有内容章节',
                    operation: 'NEW', isLeaf: true, parentId: 'mod2',
                    substance: null, manufacturer: null, productName: null, dosageForm: null, indication: null,
                    templateNode: { module: 2 },
                    fileAttachments: [{ ectdRelativePath: 'm2/23-qos/doc.pdf', md5Checksum: 'h1', xmlLang: 'zh' }],
                },
            ]);
            const xml = await indexService.generateIndexXml('seq1');
            expect(xml).toContain('m2-summaries');
            expect(xml).toContain('<title>有内容章节</title>');
            expect(xml).toContain('m2/23-qos/doc.pdf');
            expect(xml).not.toContain('空章节');
        });
    });
    describe('Boundary: Large number of leaf elements (200+ files)', () => {
        it('should generate valid index.xml with 200+ leaves', async () => {
            const indexPrisma = {
                sequence: { findUnique: jest.fn(), findMany: jest.fn() },
                sequenceNode: { findMany: jest.fn() },
            };
            const md5 = new md5_service_1.Md5Service();
            const indexService = new index_xml_service_1.IndexXmlService(indexPrisma, md5);
            indexPrisma.sequence.findUnique.mockResolvedValue({ id: 'seq-large', sequenceNumber: '0000', regulatoryActivityId: 'ra-1', regulatoryActivity: { applicationId: 'app-1' } });
            indexPrisma.sequence.findMany.mockResolvedValue([]);
            const nodes = [
                {
                    id: 'mod3', elementName: 'm3-quality', ctdSectionNumber: '3', title: '质量',
                    operation: null, isLeaf: false, parentId: null,
                    substance: null, manufacturer: null, productName: null, dosageForm: null, indication: null,
                    templateNode: { module: 3 }, fileAttachments: [],
                },
            ];
            for (let i = 0; i < 220; i++) {
                nodes.push({
                    id: `leaf-${i}`,
                    elementName: `m3-leaf-${i}`,
                    ctdSectionNumber: `3.${i}`,
                    title: `叶节点 ${i}`,
                    operation: 'NEW',
                    isLeaf: true,
                    parentId: 'mod3',
                    substance: null, manufacturer: null, productName: null, dosageForm: null, indication: null,
                    templateNode: { module: 3 },
                    fileAttachments: [
                        { ectdRelativePath: `m3/32-body/file-${i}.pdf`, md5Checksum: `hash${i}`, xmlLang: 'zh' },
                    ],
                });
            }
            indexPrisma.sequenceNode.findMany.mockResolvedValue(nodes);
            const xml = await indexService.generateIndexXml('seq-large');
            expect(xml).toContain('m3-quality');
            expect(xml).toContain('<title>叶节点 0</title>');
            expect(xml).toContain('<title>叶节点 219</title>');
            expect(xml).toContain('file-0.pdf');
            expect(xml).toContain('file-219.pdf');
            const operationMatches = xml.match(/operation="new"/g) || [];
            expect(operationMatches.length).toBe(220);
            const idMatches = xml.match(/ID="([^"]+)"/g) || [];
            const ids = idMatches.map(m => m.replace(/ID="|"/g, ''));
            expect(new Set(ids).size).toBe(ids.length);
        });
        it('should validate sequence with 200+ leaves without errors on valid data', async () => {
            const leaves = [];
            for (let i = 0; i < 210; i++) {
                leaves.push(buildLeaf({
                    id: `node-${i}`,
                    ctdSectionNumber: `2.${i}`,
                    templateNodeId: `tmpl-${i}`,
                    templateNode: { module: 2, requiresStf: false, elementName: `elem-${i}`, allowsExtension: false, ctdSectionNumber: `2.${i}`, titleZh: `叶节点 ${i}` },
                    fileAttachments: [{
                            id: `file-${i}`,
                            fileSize: 1024,
                            fileType: 'pdf',
                            originalName: `file-${i}.pdf`,
                            storedName: `file-${i}.pdf`,
                            ectdRelativePath: `m2/23-qos/file-${i}.pdf`,
                            pdfAnalysis: {
                                pdfVersion: '1.7', isEncrypted: false, hasJavascript: false,
                                hasExternalLinks: false, hasMultimedia: false, pageCount: 3,
                                hasBookmarks: false, bookmarkZoomInherit: true,
                                hasAttachments: false, fontsEmbedded: true,
                            },
                        }],
                }));
            }
            const seq = buildSequence({ sequenceNodes: leaves });
            prisma.sequence.findUnique.mockResolvedValue(seq);
            const result = await validatorService.validate('seq-1');
            const errors = result.items.filter(i => i.severity === client_1.ValidationSeverity.ERROR);
            expect(errors).toHaveLength(0);
        });
    });
});
//# sourceMappingURL=ectd-advanced-scenarios.spec.js.map