"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const cn_regional_xml_service_1 = require("./cn-regional-xml.service");
const md5_service_1 = require("./md5.service");
const mockPrisma = {
    sequence: { findUnique: jest.fn(), findMany: jest.fn() },
    sequenceNode: { findMany: jest.fn() },
};
describe('CnRegionalXmlService', () => {
    let service;
    let md5Service;
    beforeEach(() => {
        md5Service = new md5_service_1.Md5Service();
        service = new cn_regional_xml_service_1.CnRegionalXmlService(mockPrisma, md5Service);
        jest.clearAllMocks();
        mockPrisma.sequence.findMany.mockResolvedValue([]);
    });
    describe('generateCnRegionalXml', () => {
        it('should throw if sequence not found', async () => {
            mockPrisma.sequence.findUnique.mockResolvedValue(null);
            await expect(service.generateCnRegionalXml('nonexistent')).rejects.toThrow('不存在');
        });
        it('should generate valid XML with cn-envelope and cn-content', async () => {
            mockPrisma.sequence.findUnique.mockResolvedValue({
                id: 'seq1',
                sequenceNumber: '0000',
                sequenceTypeCode: 'cnsqt1',
                sequenceTypeVersion: '1.0',
                description: '首次提交',
                contactName: '张三',
                contactPhone: '010-12345678',
                contactEmail: 'test@example.com',
                regulatoryActivity: {
                    relatedSequence: '',
                    regulatoryActivityTypeCode: 'cnrat1',
                    regulatoryActivityTypeVersion: '1.0',
                    application: {
                        applicationNumber: 'x202600001',
                        applicationTypeCode: 'cnapt2',
                        applicationTypeVersion: '1.0',
                        productTypeCode: 'cnprt1',
                        productTypeVersion: '1.0',
                        productNumber: '2026000001',
                    },
                },
            });
            mockPrisma.sequenceNode.findMany.mockResolvedValue([
                {
                    id: 'n1',
                    elementName: 'cn-1-2',
                    ctdSectionNumber: '1.2',
                    title: '申请表',
                    operation: 'NEW',
                    isLeaf: true,
                    parentId: null,
                    templateNode: { module: 1 },
                    fileAttachments: [
                        { ectdRelativePath: 'm1/cn/02/application-form.pdf', md5Checksum: 'abc123', xmlLang: 'zh' },
                    ],
                },
            ]);
            const xml = await service.generateCnRegionalXml('seq1');
            expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
            expect(xml).toContain('<cn_ectd');
            expect(xml).toContain('cn-regional-1-0.xsd');
            expect(xml).toContain('<application-id>x202600001</application-id>');
            expect(xml).toContain('code="cnapt2"');
            expect(xml).toContain('code="cnprt1"');
            expect(xml).toContain('<product-number>2026000001</product-number>');
            expect(xml).toContain('code="cnrat1"');
            expect(xml).toContain('<sequence-number>0000</sequence-number>');
            expect(xml).toContain('code="cnsqt1"');
            expect(xml).toContain('<name>张三</name>');
            expect(xml).toContain('<phone>010-12345678</phone>');
            expect(xml).toContain('<email>test@example.com</email>');
            expect(xml).toContain('<cn-content>');
            expect(xml).toContain('operation="new"');
            expect(xml).toContain('xlink:href="02/application-form.pdf"');
            expect(xml).toContain('xlink:type="simple"');
            expect(xml).toContain('checksum="abc123"');
            expect(xml).toContain('checksum-type="MD5"');
            expect(xml).toContain('<title>申请表</title>');
        });
        it('should not emit sections without active leaves (empty sections)', async () => {
            mockPrisma.sequence.findUnique.mockResolvedValue({
                id: 'seq1',
                sequenceNumber: '0000',
                sequenceTypeCode: 'cnsqt1',
                sequenceTypeVersion: '1.0',
                description: '首次提交',
                contactName: '张三',
                contactPhone: '010-12345678',
                contactEmail: 'test@example.com',
                regulatoryActivity: {
                    relatedSequence: '',
                    regulatoryActivityTypeCode: 'cnrat1',
                    regulatoryActivityTypeVersion: '1.0',
                    application: {
                        applicationNumber: 'x202600001',
                        applicationTypeCode: 'cnapt2',
                        applicationTypeVersion: '1.0',
                        productTypeCode: 'cnprt1',
                        productTypeVersion: '1.0',
                        productNumber: '2026000001',
                    },
                },
            });
            mockPrisma.sequenceNode.findMany.mockResolvedValue([
                {
                    id: 'section1',
                    elementName: 'cn-1-3',
                    ctdSectionNumber: '1.3',
                    title: '综述资料',
                    operation: null,
                    isLeaf: false,
                    parentId: null,
                    templateNode: { module: 1 },
                    fileAttachments: [],
                },
                {
                    id: 'leaf1',
                    elementName: 'cn-1-3-1',
                    ctdSectionNumber: '1.3.1',
                    title: '药品说明书',
                    operation: null,
                    isLeaf: true,
                    parentId: 'section1',
                    templateNode: { module: 1 },
                    fileAttachments: [],
                },
            ]);
            const xml = await service.generateCnRegionalXml('seq1');
            expect(xml).not.toContain('cn-1-3');
        });
        it('should generate delete operation without xlink:href', async () => {
            mockPrisma.sequence.findUnique.mockResolvedValue({
                id: 'seq1',
                sequenceNumber: '0001',
                sequenceTypeCode: 'cnsqt1',
                sequenceTypeVersion: '1.0',
                description: '补充提交',
                contactName: '张三',
                contactPhone: '010-12345678',
                contactEmail: 'test@example.com',
                regulatoryActivity: {
                    relatedSequence: '0000',
                    regulatoryActivityTypeCode: 'cnrat1',
                    regulatoryActivityTypeVersion: '1.0',
                    application: {
                        applicationNumber: 'x202600001',
                        applicationTypeCode: 'cnapt2',
                        applicationTypeVersion: '1.0',
                        productTypeCode: 'cnprt1',
                        productTypeVersion: '1.0',
                        productNumber: '2026000001',
                    },
                },
            });
            mockPrisma.sequenceNode.findMany.mockResolvedValue([
                {
                    id: 'n1',
                    elementName: 'cn-1-2',
                    ctdSectionNumber: '1.2',
                    title: '申请表',
                    operation: 'DELETE',
                    isLeaf: true,
                    parentId: null,
                    templateNode: { module: 1 },
                    fileAttachments: [],
                },
            ]);
            const xml = await service.generateCnRegionalXml('seq1');
            expect(xml).toContain('operation="delete"');
            expect(xml).not.toContain('xlink:href');
            expect(xml).not.toContain('checksum=');
        });
        it('should escape XML special characters in content', async () => {
            mockPrisma.sequence.findUnique.mockResolvedValue({
                id: 'seq1',
                sequenceNumber: '0000',
                sequenceTypeCode: 'cnsqt1',
                sequenceTypeVersion: '1.0',
                description: 'Test <& description>',
                contactName: 'Name & "Title"',
                contactPhone: '010-12345678',
                contactEmail: 'test@example.com',
                regulatoryActivity: {
                    relatedSequence: '',
                    regulatoryActivityTypeCode: 'cnrat1',
                    regulatoryActivityTypeVersion: '1.0',
                    application: {
                        applicationNumber: 'x202600001',
                        applicationTypeCode: 'cnapt2',
                        applicationTypeVersion: '1.0',
                        productTypeCode: 'cnprt1',
                        productTypeVersion: '1.0',
                        productNumber: '2026000001',
                    },
                },
            });
            mockPrisma.sequenceNode.findMany.mockResolvedValue([]);
            const xml = await service.generateCnRegionalXml('seq1');
            expect(xml).toContain('&amp;');
            expect(xml).toContain('&lt;');
            expect(xml).not.toContain('Test <& description>');
        });
    });
});
//# sourceMappingURL=cn-regional-xml.service.spec.js.map