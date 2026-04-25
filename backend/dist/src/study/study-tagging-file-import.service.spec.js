"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const common_1 = require("@nestjs/common");
const crypto_1 = require("crypto");
const study_tagging_file_import_service_1 = require("./study-tagging-file-import.service");
const study_tagging_file_service_1 = require("../ectd/services/study-tagging-file.service");
class FakePrisma {
    nodes = new Map();
    fileAttachments = new Map();
    studies = new Map();
    studyCategories = new Map();
    studyDocuments = new Map();
    seq = 0;
    newId(prefix) {
        this.seq += 1;
        return `${prefix}-${this.seq}`;
    }
    sequenceNode = {
        findUnique: async ({ where }) => {
            return this.nodes.get(where.id) ?? null;
        },
    };
    fileAttachment = {
        findMany: async ({ where }) => {
            const rows = Array.from(this.fileAttachments.values());
            if (where?.sequenceNodeId) {
                return rows.filter((r) => r.sequenceNodeId === where.sequenceNodeId);
            }
            return rows;
        },
        create: async ({ data, select }) => {
            const id = this.newId('file');
            const row = {
                id,
                sequenceNodeId: data.sequenceNodeId,
                originalName: data.originalName,
                storedName: data.storedName,
                storagePath: data.storagePath,
                ectdRelativePath: data.ectdRelativePath,
                fileType: data.fileType,
                fileSize: data.fileSize,
                md5Checksum: data.md5Checksum,
                xmlLang: data.xmlLang,
                isReference: data.isReference ?? false,
            };
            this.fileAttachments.set(id, row);
            return select ? { id } : row;
        },
    };
    study = {
        findUnique: async ({ where, include, select }) => {
            let row;
            if (where.id) {
                row = this.studies.get(where.id);
            }
            else if (where.sequenceNodeId_studyId) {
                row = Array.from(this.studies.values()).find((s) => s.sequenceNodeId === where.sequenceNodeId_studyId.sequenceNodeId &&
                    s.studyId === where.sequenceNodeId_studyId.studyId);
            }
            if (!row)
                return null;
            if (select) {
                const out = {};
                for (const k of Object.keys(select)) {
                    out[k] = row[k];
                }
                return out;
            }
            if (include) {
                return this.hydrateStudy(row);
            }
            return row;
        },
        findFirst: async ({ where, orderBy, select }) => {
            let rows = Array.from(this.studies.values()).filter((s) => {
                if (where.studyId && s.studyId !== where.studyId)
                    return false;
                if (where.sequenceNode?.templateNodeId &&
                    s.templateNodeId !== where.sequenceNode.templateNodeId) {
                    return false;
                }
                if (where.sequence?.applicationId && s.applicationId !== where.sequence.applicationId) {
                    return false;
                }
                if (where.sequence?.sequenceNumber?.lt &&
                    !(s.sequenceNumber < where.sequence.sequenceNumber.lt)) {
                    return false;
                }
                return true;
            });
            if (orderBy?.sequence?.sequenceNumber === 'desc') {
                rows = rows.sort((a, b) => (a.sequenceNumber < b.sequenceNumber ? 1 : -1));
            }
            const hit = rows[0];
            if (!hit)
                return null;
            if (select) {
                const out = {};
                for (const k of Object.keys(select))
                    out[k] = hit[k];
                return out;
            }
            return hit;
        },
        create: async ({ data, select }) => {
            const id = this.newId('study');
            const node = this.nodes.get(data.sequenceNodeId);
            const row = {
                id,
                sequenceId: data.sequenceId,
                sequenceNodeId: data.sequenceNodeId,
                ctdSectionNumber: data.ctdSectionNumber,
                studyId: data.studyId,
                title: data.title,
                operation: data.operation ?? 'NEW',
                modifiedFromId: data.modifiedFromId ?? null,
                stfXmlContent: null,
                stfChecksum: null,
                templateNodeId: node.templateNodeId,
                applicationId: node.sequence.applicationId,
                sequenceNumber: node.sequence.sequenceNumber,
            };
            this.studies.set(id, row);
            const cats = data.categories?.create ?? [];
            for (const c of cats) {
                const cid = this.newId('cat');
                this.studyCategories.set(cid, {
                    id: cid,
                    studyId: id,
                    name: c.name,
                    value: c.value,
                    infoType: c.infoType ?? 'ich',
                    sortOrder: c.sortOrder ?? 0,
                });
            }
            const docs = data.documents?.create ?? [];
            for (const d of docs) {
                const did = this.newId('doc');
                this.studyDocuments.set(did, {
                    id: did,
                    studyId: id,
                    fileAttachmentId: d.fileAttachmentId,
                    fileTag: d.fileTag,
                    fileTagInfoType: d.fileTagInfoType ?? 'ich',
                    sortOrder: d.sortOrder ?? 0,
                });
            }
            if (select) {
                const out = {};
                for (const k of Object.keys(select))
                    out[k] = row[k];
                return out;
            }
            return row;
        },
        update: async ({ where, data, select }) => {
            const row = this.studies.get(where.id);
            if (!row)
                throw new Error(`Study ${where.id} not found`);
            if (data.title !== undefined)
                row.title = data.title;
            if (data.operation !== undefined)
                row.operation = data.operation;
            if (data.modifiedFromId !== undefined)
                row.modifiedFromId = data.modifiedFromId;
            if (data.ctdSectionNumber !== undefined)
                row.ctdSectionNumber = data.ctdSectionNumber;
            if (data.stfXmlContent !== undefined)
                row.stfXmlContent = data.stfXmlContent;
            if (data.stfChecksum !== undefined)
                row.stfChecksum = data.stfChecksum;
            const cats = data.categories?.create ?? [];
            for (const c of cats) {
                const cid = this.newId('cat');
                this.studyCategories.set(cid, {
                    id: cid,
                    studyId: row.id,
                    name: c.name,
                    value: c.value,
                    infoType: c.infoType ?? 'ich',
                    sortOrder: c.sortOrder ?? 0,
                });
            }
            const docs = data.documents?.create ?? [];
            for (const d of docs) {
                const did = this.newId('doc');
                this.studyDocuments.set(did, {
                    id: did,
                    studyId: row.id,
                    fileAttachmentId: d.fileAttachmentId,
                    fileTag: d.fileTag,
                    fileTagInfoType: d.fileTagInfoType ?? 'ich',
                    sortOrder: d.sortOrder ?? 0,
                });
            }
            if (select) {
                const out = {};
                for (const k of Object.keys(select))
                    out[k] = row[k];
                return out;
            }
            return row;
        },
        delete: async ({ where }) => {
            const row = this.studies.get(where.id);
            if (!row)
                throw new Error(`Study ${where.id} not found`);
            this.studies.delete(where.id);
            for (const [cid, c] of this.studyCategories) {
                if (c.studyId === where.id)
                    this.studyCategories.delete(cid);
            }
            for (const [did, d] of this.studyDocuments) {
                if (d.studyId === where.id)
                    this.studyDocuments.delete(did);
            }
            return row;
        },
    };
    studyCategory = {
        deleteMany: async ({ where }) => {
            let n = 0;
            for (const [id, c] of this.studyCategories) {
                if (c.studyId === where.studyId) {
                    this.studyCategories.delete(id);
                    n += 1;
                }
            }
            return { count: n };
        },
    };
    studyDocument = {
        deleteMany: async ({ where }) => {
            let n = 0;
            for (const [id, d] of this.studyDocuments) {
                if (d.studyId === where.studyId) {
                    this.studyDocuments.delete(id);
                    n += 1;
                }
            }
            return { count: n };
        },
    };
    async $transaction(fn) {
        const snapshot = {
            studies: new Map(this.studies),
            categories: new Map(this.studyCategories),
            documents: new Map(this.studyDocuments),
            attachments: new Map(this.fileAttachments),
        };
        try {
            return await fn(this);
        }
        catch (err) {
            this.studies = snapshot.studies;
            this.studyCategories = snapshot.categories;
            this.studyDocuments = snapshot.documents;
            this.fileAttachments = snapshot.attachments;
            throw err;
        }
    }
    hydrateStudy(row) {
        const categories = Array.from(this.studyCategories.values())
            .filter((c) => c.studyId === row.id)
            .sort((a, b) => a.sortOrder - b.sortOrder);
        const documents = Array.from(this.studyDocuments.values())
            .filter((d) => d.studyId === row.id)
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map((d) => ({
            ...d,
            fileAttachment: this.fileAttachments.get(d.fileAttachmentId),
        }));
        return { ...row, categories, documents };
    }
}
const cvCategories = [
    {
        name: 'species',
        values: [
            { value: 'rat', realm: 'ich' },
            { value: 'mouse', realm: 'ich' },
        ],
    },
    {
        name: 'route-of-admin',
        values: [
            { value: 'oral', realm: 'ich' },
            { value: 'iv', realm: 'ich' },
        ],
    },
];
const cvFileTagsM4 = [
    { value: 'study-report-body', realm: 'ich' },
    { value: 'protocol', realm: 'ich' },
];
const cvFileTagsM5 = [
    { value: 'clinical-study-report', realm: 'ich' },
];
function buildCvService(overrides = {}) {
    return {
        getStfCategories: jest.fn().mockResolvedValue(overrides.categories ?? cvCategories),
        getStfFileTags: jest.fn().mockImplementation(async (mod) => {
            if (mod === 'm4')
                return overrides.fileTagsM4 ?? cvFileTagsM4;
            return overrides.fileTagsM5 ?? cvFileTagsM5;
        }),
    };
}
const mockMinio = {
    uploadFile: jest.fn().mockResolvedValue('abcd'),
};
function md5(text) {
    return (0, crypto_1.createHash)('md5').update(text, 'utf8').digest('hex');
}
function seedNode(prisma, overrides = {}) {
    const node = {
        id: overrides.id ?? 'node-1',
        sequenceId: overrides.sequenceId ?? 'seq-1',
        ctdSectionNumber: overrides.ctdSectionNumber ?? '4.2.3.2',
        templateNodeId: overrides.templateNodeId ?? 'tpl-423-2',
        templateNode: overrides.templateNode ?? { requiresStf: true, module: 4 },
        sequence: overrides.sequence ?? { applicationId: 'app-1', sequenceNumber: '0002' },
    };
    prisma.nodes.set(node.id, node);
    return node;
}
function seedFileAttachment(prisma, sequenceNodeId, basename, overrides = {}) {
    const id = `file-${basename}`;
    const row = {
        id,
        sequenceNodeId,
        originalName: basename,
        storedName: basename,
        storagePath: `path/${basename}`,
        ectdRelativePath: `m4/4.2.3.2/${basename}`,
        fileType: '.pdf',
        fileSize: BigInt(1000),
        md5Checksum: md5(basename),
        xmlLang: 'zh',
        isReference: false,
        ...overrides,
    };
    prisma.fileAttachments.set(id, row);
    return row;
}
function buildStfXml(params) {
    const cats = params.categories ?? [
        { name: 'species', value: 'rat', infoType: 'ich' },
    ];
    const docs = params.documents ?? [];
    const lines = [];
    lines.push('<?xml version="1.0" encoding="UTF-8"?>');
    lines.push('<!DOCTYPE ectd:study SYSTEM "../../../util/dtd/ich-stf-v2-2.dtd">');
    lines.push('<ectd:study xmlns:ectd="http://www.ich.org/ectd" xmlns:xlink="http://www.w3.org/1999/xlink" dtd-version="2.2">');
    lines.push('  <study-identifier>');
    lines.push(`    <title>${params.title}</title>`);
    lines.push(`    <study-id>${params.studyId}</study-id>`);
    for (const c of cats) {
        lines.push(`    <category name="${c.name}" info-type="${c.infoType ?? 'ich'}">${c.value}</category>`);
    }
    lines.push('  </study-identifier>');
    lines.push('  <study-document>');
    docs.forEach((d, i) => {
        const modAttr = d.modifiedFromHref ? ` modified-file="${d.modifiedFromHref}"` : '';
        const op = d.operation ?? 'new';
        lines.push(`    <doc-content ID="${d.leafId ?? 'leaf-' + i}" operation="${op}"${modAttr} xlink:href="${d.href}" xlink:type="simple" checksum="${d.checksum}" checksum-type="md5">`);
        lines.push(`      <title>${d.title ?? d.href}</title>`);
        lines.push(`      <file-tag name="${d.fileTag}" info-type="ich"/>`);
        lines.push('    </doc-content>');
    });
    lines.push('  </study-document>');
    lines.push('</ectd:study>');
    return lines.join('\n');
}
describe('StudyTaggingFileImportService', () => {
    let prisma;
    let stfXml;
    let cvService;
    let service;
    beforeEach(() => {
        prisma = new FakePrisma();
        stfXml = new study_tagging_file_service_1.StudyTaggingFileService();
        cvService = buildCvService();
        service = new study_tagging_file_import_service_1.StudyTaggingFileImportService(prisma, stfXml, cvService, mockMinio);
        mockMinio.uploadFile.mockClear();
    });
    it('imports a well-formed STF XML when the referenced PDF already exists', async () => {
        const node = seedNode(prisma);
        const pdf = seedFileAttachment(prisma, node.id, 'study-001-body.pdf');
        const xml = buildStfXml({
            studyId: 'TOX-2024-001',
            title: '28 天大鼠毒性试验',
            documents: [
                {
                    href: 'study-001-body.pdf',
                    checksum: pdf.md5Checksum,
                    fileTag: 'study-report-body',
                    operation: 'new',
                },
            ],
        });
        const result = await service.importStfXml(node.id, xml);
        expect(result.created).toBe(true);
        expect(result.warnings).toEqual([]);
        const row = Array.from(prisma.studies.values())[0];
        expect(row.studyId).toBe('TOX-2024-001');
        expect(row.title).toBe('28 天大鼠毒性试验');
        const cats = Array.from(prisma.studyCategories.values()).filter((c) => c.studyId === row.id);
        expect(cats).toHaveLength(1);
        expect(cats[0].name).toBe('species');
        const docs = Array.from(prisma.studyDocuments.values()).filter((d) => d.studyId === row.id);
        expect(docs).toHaveLength(1);
        expect(docs[0].fileAttachmentId).toBe(pdf.id);
        expect(row.stfXmlContent).toBeTruthy();
        expect(row.stfChecksum).toBeTruthy();
    });
    it('throws BadRequestException when <study-id> is empty', async () => {
        const node = seedNode(prisma);
        const xml = buildStfXml({
            studyId: '',
            title: 'Some title',
            documents: [
                {
                    href: 'a.pdf',
                    checksum: md5('a'),
                    fileTag: 'study-report-body',
                },
            ],
        });
        await expect(service.importStfXml(node.id, xml)).rejects.toThrow(common_1.BadRequestException);
    });
    it('throws BadRequestException listing unknown category names', async () => {
        const node = seedNode(prisma);
        const xml = buildStfXml({
            studyId: 'S1',
            title: 'T',
            categories: [
                { name: 'not-a-real-category', value: 'something' },
            ],
            documents: [
                {
                    href: 'a.pdf',
                    checksum: md5('a'),
                    fileTag: 'study-report-body',
                },
            ],
        });
        try {
            await service.importStfXml(node.id, xml);
            fail('Should have thrown');
        }
        catch (err) {
            expect(err).toBeInstanceOf(common_1.BadRequestException);
            const body = err.getResponse();
            expect(body.unknownCategories).toContain('not-a-real-category');
        }
    });
    it('throws BadRequestException listing unknown file-tags', async () => {
        const node = seedNode(prisma);
        seedFileAttachment(prisma, node.id, 'a.pdf');
        const xml = buildStfXml({
            studyId: 'S1',
            title: 'T',
            documents: [
                {
                    href: 'a.pdf',
                    checksum: md5('a'),
                    fileTag: 'totally-fake-tag',
                },
            ],
        });
        try {
            await service.importStfXml(node.id, xml);
            fail('Should have thrown');
        }
        catch (err) {
            expect(err).toBeInstanceOf(common_1.BadRequestException);
            const body = err.getResponse();
            expect(body.unknownFileTags).toContain('totally-fake-tag');
        }
    });
    it('throws ConflictException when onConflict=reject and duplicate exists', async () => {
        const node = seedNode(prisma);
        const pdf = seedFileAttachment(prisma, node.id, 'a.pdf');
        prisma.studies.set('existing', {
            id: 'existing',
            sequenceId: node.sequenceId,
            sequenceNodeId: node.id,
            ctdSectionNumber: node.ctdSectionNumber,
            studyId: 'DUPE-1',
            title: 'old title',
            operation: 'NEW',
            modifiedFromId: null,
            stfXmlContent: null,
            stfChecksum: null,
            templateNodeId: node.templateNodeId,
            applicationId: node.sequence.applicationId,
            sequenceNumber: node.sequence.sequenceNumber,
        });
        const xml = buildStfXml({
            studyId: 'DUPE-1',
            title: 'new title',
            documents: [
                { href: 'a.pdf', checksum: pdf.md5Checksum, fileTag: 'study-report-body' },
            ],
        });
        await expect(service.importStfXml(node.id, xml)).rejects.toThrow(common_1.ConflictException);
    });
    it('overwrites an existing Study when onConflict=overwrite', async () => {
        const node = seedNode(prisma);
        const pdf = seedFileAttachment(prisma, node.id, 'a.pdf');
        prisma.studies.set('old-id', {
            id: 'old-id',
            sequenceId: node.sequenceId,
            sequenceNodeId: node.id,
            ctdSectionNumber: node.ctdSectionNumber,
            studyId: 'DUPE-1',
            title: 'old title',
            operation: 'NEW',
            modifiedFromId: null,
            stfXmlContent: null,
            stfChecksum: null,
            templateNodeId: node.templateNodeId,
            applicationId: node.sequence.applicationId,
            sequenceNumber: node.sequence.sequenceNumber,
        });
        const xml = buildStfXml({
            studyId: 'DUPE-1',
            title: 'new title',
            documents: [
                { href: 'a.pdf', checksum: pdf.md5Checksum, fileTag: 'study-report-body' },
            ],
        });
        const result = await service.importStfXml(node.id, xml, {
            onConflict: 'overwrite',
        });
        expect(prisma.studies.has('old-id')).toBe(false);
        const fresh = Array.from(prisma.studies.values())[0];
        expect(fresh.id).not.toBe('old-id');
        expect(fresh.title).toBe('new title');
        expect(result.created).toBe(true);
    });
    it('merges into an existing Study when onConflict=merge (preserves id)', async () => {
        const node = seedNode(prisma);
        const pdf = seedFileAttachment(prisma, node.id, 'a.pdf');
        prisma.studies.set('old-id', {
            id: 'old-id',
            sequenceId: node.sequenceId,
            sequenceNodeId: node.id,
            ctdSectionNumber: node.ctdSectionNumber,
            studyId: 'DUPE-1',
            title: 'old title',
            operation: 'NEW',
            modifiedFromId: null,
            stfXmlContent: null,
            stfChecksum: null,
            templateNodeId: node.templateNodeId,
            applicationId: node.sequence.applicationId,
            sequenceNumber: node.sequence.sequenceNumber,
        });
        prisma.studyCategories.set('old-cat', {
            id: 'old-cat',
            studyId: 'old-id',
            name: 'species',
            value: 'mouse',
            infoType: 'ich',
            sortOrder: 0,
        });
        prisma.studyDocuments.set('old-doc', {
            id: 'old-doc',
            studyId: 'old-id',
            fileAttachmentId: pdf.id,
            fileTag: 'protocol',
            fileTagInfoType: 'ich',
            sortOrder: 0,
        });
        const xml = buildStfXml({
            studyId: 'DUPE-1',
            title: 'new title',
            categories: [{ name: 'species', value: 'rat' }],
            documents: [
                { href: 'a.pdf', checksum: pdf.md5Checksum, fileTag: 'study-report-body' },
            ],
        });
        const result = await service.importStfXml(node.id, xml, { onConflict: 'merge' });
        expect(result.studyId).toBe('old-id');
        expect(prisma.studies.has('old-id')).toBe(true);
        expect(prisma.studies.get('old-id').title).toBe('new title');
        expect(prisma.studyCategories.has('old-cat')).toBe(false);
        expect(prisma.studyDocuments.has('old-doc')).toBe(false);
        const newCats = Array.from(prisma.studyCategories.values()).filter((c) => c.studyId === 'old-id');
        expect(newCats).toHaveLength(1);
        expect(newCats[0].value).toBe('rat');
        const newDocs = Array.from(prisma.studyDocuments.values()).filter((d) => d.studyId === 'old-id');
        expect(newDocs).toHaveLength(1);
        expect(newDocs[0].fileTag).toBe('study-report-body');
    });
    it('resolves modifiedFromId when a prior Study exists in the same application', async () => {
        const priorNode = seedNode(prisma, {
            id: 'node-prior',
            sequenceId: 'seq-prior',
            templateNodeId: 'tpl-423-2',
            sequence: { applicationId: 'app-1', sequenceNumber: '0001' },
        });
        prisma.studies.set('prior-study', {
            id: 'prior-study',
            sequenceId: priorNode.sequenceId,
            sequenceNodeId: priorNode.id,
            ctdSectionNumber: priorNode.ctdSectionNumber,
            studyId: 'TOX-2024-001',
            title: 'original',
            operation: 'NEW',
            modifiedFromId: null,
            stfXmlContent: null,
            stfChecksum: null,
            templateNodeId: priorNode.templateNodeId,
            applicationId: priorNode.sequence.applicationId,
            sequenceNumber: priorNode.sequence.sequenceNumber,
        });
        const node = seedNode(prisma);
        const pdf = seedFileAttachment(prisma, node.id, 'a.pdf');
        const xml = buildStfXml({
            studyId: 'TOX-2024-001',
            title: 'new version',
            documents: [
                {
                    href: 'a.pdf',
                    checksum: pdf.md5Checksum,
                    fileTag: 'study-report-body',
                    operation: 'replace',
                    modifiedFromHref: '../../../0001/m4/4.2.3.2/a.pdf',
                },
            ],
        });
        const result = await service.importStfXml(node.id, xml);
        expect(result.warnings).toEqual([]);
        const created = Array.from(prisma.studies.values()).find((s) => s.id !== 'prior-study');
        expect(created.modifiedFromId).toBe('prior-study');
        expect(created.operation).toBe('REPLACE');
    });
    it('surfaces a warning when modifiedFromHref cannot be resolved', async () => {
        const node = seedNode(prisma);
        const pdf = seedFileAttachment(prisma, node.id, 'a.pdf');
        const xml = buildStfXml({
            studyId: 'TOX-2024-001',
            title: 'new version',
            documents: [
                {
                    href: 'a.pdf',
                    checksum: pdf.md5Checksum,
                    fileTag: 'study-report-body',
                    operation: 'replace',
                    modifiedFromHref: '../../../0000/m4/4.2.3.2/a.pdf',
                },
            ],
        });
        const result = await service.importStfXml(node.id, xml);
        const warningMatch = result.warnings.some((w) => w.includes('生命周期链断裂'));
        expect(warningMatch).toBe(true);
        const created = Array.from(prisma.studies.values())[0];
        expect(created.modifiedFromId).toBeNull();
        expect(result.created).toBe(true);
    });
    it('warns and skips documents whose href does not match any FileAttachment', async () => {
        const node = seedNode(prisma);
        seedFileAttachment(prisma, node.id, 'body.pdf');
        const xml = buildStfXml({
            studyId: 'S1',
            title: 'T',
            documents: [
                { href: 'body.pdf', checksum: md5('body.pdf'), fileTag: 'study-report-body' },
                { href: 'missing.pdf', checksum: md5('missing'), fileTag: 'protocol' },
            ],
        });
        const result = await service.importStfXml(node.id, xml);
        expect(result.warnings.some((w) => w.includes('missing.pdf'))).toBe(true);
        const created = Array.from(prisma.studies.values())[0];
        const docs = Array.from(prisma.studyDocuments.values()).filter((d) => d.studyId === created.id);
        expect(docs).toHaveLength(1);
    });
    it('bundle mode: warns when attached file MD5 mismatches XML checksum and uses actual MD5', async () => {
        const node = seedNode(prisma);
        const buffer = Buffer.from('hello world', 'utf8');
        const actualMd5 = md5('hello world');
        const wrongMd5 = 'deadbeefdeadbeefdeadbeefdeadbeef';
        const xml = buildStfXml({
            studyId: 'S1',
            title: 'T',
            documents: [
                {
                    href: 'hello.pdf',
                    checksum: wrongMd5,
                    fileTag: 'study-report-body',
                },
            ],
        });
        const result = await service.importStfBundle(node.id, {
            xmlString: xml,
            attachedFiles: [{ originalName: 'hello.pdf', buffer }],
        });
        expect(result.warnings.some((w) => w.includes('MD5'))).toBe(true);
        const created = Array.from(prisma.fileAttachments.values())[0];
        expect(created.md5Checksum).toBe(actualMd5);
    });
    it('bundle mode: creates a new FileAttachment bound to the same sequenceNode', async () => {
        const node = seedNode(prisma);
        const buffer = Buffer.from('payload', 'utf8');
        const xml = buildStfXml({
            studyId: 'S1',
            title: 'T',
            documents: [
                {
                    href: 'payload.pdf',
                    checksum: md5('payload'),
                    fileTag: 'study-report-body',
                },
            ],
        });
        const result = await service.importStfBundle(node.id, {
            xmlString: xml,
            attachedFiles: [{ originalName: 'payload.pdf', buffer }],
        });
        expect(result.warnings).toEqual([]);
        const attachments = Array.from(prisma.fileAttachments.values());
        expect(attachments).toHaveLength(1);
        expect(attachments[0].sequenceNodeId).toBe(node.id);
        expect(attachments[0].originalName).toBe('payload.pdf');
        expect(mockMinio.uploadFile).toHaveBeenCalledTimes(1);
        const created = Array.from(prisma.studies.values())[0];
        const docs = Array.from(prisma.studyDocuments.values()).filter((d) => d.studyId === created.id);
        expect(docs).toHaveLength(1);
        expect(docs[0].fileAttachmentId).toBe(attachments[0].id);
    });
    it('throws NotFoundException when the sequenceNode does not exist', async () => {
        const xml = buildStfXml({
            studyId: 'S1',
            title: 'T',
            documents: [
                { href: 'a.pdf', checksum: md5('a'), fileTag: 'study-report-body' },
            ],
        });
        await expect(service.importStfXml('no-such-node', xml)).rejects.toThrow(common_1.NotFoundException);
    });
    it('throws BadRequestException when the targeted section does not allow STF', async () => {
        const node = seedNode(prisma, {
            ctdSectionNumber: '3.2.S',
            templateNode: { requiresStf: false, module: 3 },
        });
        const xml = buildStfXml({
            studyId: 'S1',
            title: 'T',
            documents: [
                { href: 'a.pdf', checksum: md5('a'), fileTag: 'study-report-body' },
            ],
        });
        await expect(service.importStfXml(node.id, xml)).rejects.toThrow(common_1.BadRequestException);
    });
});
//# sourceMappingURL=study-tagging-file-import.service.spec.js.map