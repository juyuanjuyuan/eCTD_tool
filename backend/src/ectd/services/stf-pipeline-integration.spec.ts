/**
 * STF Pipeline Integration Tests — Plan 12 P5
 *
 * End-to-end integration tests that wire together the full STF v2 export +
 * import pipeline against a mocked Prisma client. These tests verify that
 * all of the Plan 12 services (IndexXmlService, PackageAssemblerService,
 * StudyService, StudyTaggingFileImportService, StudyTaggingFileService,
 * ValidatorService) agree on the same XML / paths / checksums when they are
 * fed a single shared fixture.
 *
 * Organised into four describe blocks (see Plan 12 §5 for the spec):
 *   A. Full STF export pipeline (index.xml + preview)
 *   B. STF lifecycle: cross-sequence modifiedFromId resolution
 *   C. STF round-trip: generate → export → reimport
 *   D. Plan 12 CDE validator coverage (rules 5.10 / 5.12 / 5.13 / 5.18 / 5.20)
 *
 * All Prisma methods are mocked via jest.fn(). No real database.
 */
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ValidationSeverity, LeafOperation } from '@prisma/client';

import { IndexXmlService } from './index-xml.service';
import { Md5Service } from './md5.service';
import { StudyTaggingFileService } from './study-tagging-file.service';
import { ValidatorService } from './validator.service';
import { PackageAssemblerService } from './package-assembler.service';
import { StudyService } from '../../study/study.service';
import { StudyTaggingFileImportService } from '../../study/study-tagging-file-import.service';

// Silence archiver/minio side-effects in package-assembler.service.ts
jest.mock('minio', () => ({ Client: jest.fn() }));
jest.mock('archiver', () => {
  const fn = jest.fn(() => ({
    on: jest.fn().mockReturnThis(),
    pipe: jest.fn().mockReturnThis(),
    append: jest.fn().mockReturnThis(),
    file: jest.fn().mockReturnThis(),
    finalize: jest.fn(),
  }));
  return { __esModule: true, default: fn };
});
jest.mock('fs', () => ({ existsSync: jest.fn().mockReturnValue(false) }));

// =====================================================================
// Fixtures: mini Sequence tree used by §A and §D tests
// =====================================================================

/**
 * Build a flat list of `sequenceNode` rows as returned by
 * `prisma.sequenceNode.findMany` inside IndexXmlService.loadModuleNodes.
 * The shape mirrors the Prisma include shown in index-xml.service.ts lines
 * 143-168 (templateNode + fileAttachments + studies.documents.fileAttachment).
 */
function buildIndexXmlNodes() {
  // ---------- M2 non-STF node (control: emits a PDF leaf) ----------
  const m2Node = {
    id: 'node-m2',
    templateNodeId: 'tpl-m2-3',
    elementName: 'm2-3-quality-overall-summary',
    ctdSectionNumber: '2.3',
    title: '质量综述',
    operation: 'NEW',
    isLeaf: true,
    parentId: null,
    substance: null,
    manufacturer: null,
    productName: null,
    dosageForm: null,
    indication: null,
    templateNode: { module: 2, requiresStf: false },
    fileAttachments: [
      {
        ectdRelativePath: 'm2/23-qos/qos-summary.pdf',
        md5Checksum: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        xmlLang: 'zh',
      },
    ],
    studies: [],
  };

  // ---------- M4 STF node with TWO studies ----------
  const m4Study1Pdf = 'm4/42-stud-rep/423-tox-rep/423-2-rep-dose-tox/tox-001-body.pdf';
  const m4Study2Pdf = 'm4/42-stud-rep/423-tox-rep/423-2-rep-dose-tox/tox-002-body.pdf';
  const m4Node = {
    id: 'node-m4',
    templateNodeId: 'tpl-m4-423-2',
    elementName: 'm4-2-3-2-repeat-dose-toxicity',
    ctdSectionNumber: '4.2.3.2',
    title: '重复给药毒性',
    operation: 'NEW',
    isLeaf: true,
    parentId: null,
    substance: null,
    manufacturer: null,
    productName: null,
    dosageForm: null,
    indication: null,
    templateNode: { module: 4, requiresStf: true },
    fileAttachments: [
      {
        ectdRelativePath: m4Study1Pdf,
        md5Checksum: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        xmlLang: 'zh',
      },
      {
        ectdRelativePath: m4Study2Pdf,
        md5Checksum: 'cccccccccccccccccccccccccccccccc',
        xmlLang: 'zh',
      },
    ],
    studies: [
      {
        id: 'study-tox-1',
        studyId: 'TOX-2024-001',
        title: '28 天大鼠毒性试验',
        operation: 'NEW',
        stfChecksum: 'dddddddddddddddddddddddddddddddd',
        documents: [
          { fileAttachment: { ectdRelativePath: m4Study1Pdf } },
        ],
      },
      {
        id: 'study-tox-2',
        studyId: 'TOX-2024-002',
        title: '90 天大鼠毒性试验',
        operation: 'NEW',
        stfChecksum: 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
        documents: [
          { fileAttachment: { ectdRelativePath: m4Study2Pdf } },
        ],
      },
    ],
  };

  // ---------- M5 STF node with ONE study ----------
  const m5StudyPdf = 'm5/53-clin-stud-rep/535-rep-effic-safety-stud/5351-stud-rep-contr/clin-001-body.pdf';
  const m5Node = {
    id: 'node-m5',
    templateNodeId: 'tpl-m5-351',
    elementName: 'm5-3-5-1-study-reports-controlled-clinical-studies',
    ctdSectionNumber: '5.3.5.1',
    title: '控制性临床研究',
    operation: 'NEW',
    isLeaf: true,
    parentId: null,
    substance: null,
    manufacturer: null,
    productName: null,
    dosageForm: null,
    indication: null,
    templateNode: { module: 5, requiresStf: true },
    fileAttachments: [
      {
        ectdRelativePath: m5StudyPdf,
        md5Checksum: 'ffffffffffffffffffffffffffffffff',
        xmlLang: 'zh',
      },
    ],
    studies: [
      {
        id: 'study-clin-1',
        studyId: 'CLIN-2024-001',
        title: 'Phase II controlled trial',
        operation: 'NEW',
        stfChecksum: '11111111111111111111111111111111',
        documents: [
          { fileAttachment: { ectdRelativePath: m5StudyPdf } },
        ],
      },
    ],
  };

  return [m2Node, m4Node, m5Node];
}

// =====================================================================
// §A. Full STF export pipeline
// =====================================================================

describe('Full STF export pipeline', () => {
  let indexXmlService: IndexXmlService;
  let packageAssembler: PackageAssemblerService;
  let prisma: Record<string, any>;

  const nodes = buildIndexXmlNodes();

  beforeEach(() => {
    prisma = {
      sequence: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'seq-1',
          sequenceNumber: '0000',
          status: 'DRAFT',
          regulatoryActivityId: 'ra-1',
          regulatoryActivity: {
            applicationId: 'app-1',
            application: { applicationNumber: 'x202600001' },
          },
          // preview uses a nested include; stitch in sequenceNodes for that call
          sequenceNodes: nodes.map((n) => ({
            id: n.id,
            isLeaf: n.isLeaf,
            ctdSectionNumber: n.ctdSectionNumber,
            operation: n.operation,
            templateNode: { module: n.templateNode.module },
            fileAttachments: n.fileAttachments.map((f) => ({
              ectdRelativePath: f.ectdRelativePath,
              isReference: false,
            })),
            studies: n.studies.map((s) => ({
              id: s.id,
              studyId: s.studyId,
              operation: s.operation,
              documents: s.documents,
            })),
          })),
        }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      sequenceNode: {
        findMany: jest.fn().mockResolvedValue(nodes),
      },
    };

    const md5 = new Md5Service();
    indexXmlService = new IndexXmlService(prisma as any, md5);
    packageAssembler = new PackageAssemblerService(
      prisma as any,
      {} as any, // cnRegionalXml — not used by the tests below
      {} as any, // indexXml — not used by previewStructure directly
      md5 as any,
      {} as any, // minio
    );
  });

  it('emits STF leaves (not PDF leaves) for M4 STF nodes in index.xml', async () => {
    const xml = await indexXmlService.generateIndexXml('seq-1');

    // The STF leaf xlink:href should point to the derived STF path
    const expectedStfHref =
      'm4/42-stud-rep/423-tox-rep/423-2-rep-dose-tox/study-tox-2024-001.xml';
    expect(xml).toContain(`xlink:href="${expectedStfHref}"`);

    // Assert that the underlying PDF is NOT emitted as a leaf for the same node.
    // (The PDF is still referenced inside the STF file itself, not from index.xml.)
    expect(xml).not.toContain(
      'xlink:href="m4/42-stud-rep/423-tox-rep/423-2-rep-dose-tox/tox-001-body.pdf"',
    );
  });

  it('STF leaf checksum in index.xml matches study.stfChecksum', async () => {
    const xml = await indexXmlService.generateIndexXml('seq-1');
    // Study 1 checksum
    expect(xml).toContain('checksum="dddddddddddddddddddddddddddddddd"');
    // Study 2 checksum
    expect(xml).toContain('checksum="eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"');
  });

  it('non-STF nodes (M2) still emit direct PDF leaves', async () => {
    const xml = await indexXmlService.generateIndexXml('seq-1');
    // M2 2.3 PDF still emitted as a direct leaf
    expect(xml).toContain('xlink:href="m2/23-qos/qos-summary.pdf"');
    expect(xml).toContain('checksum="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"');
  });

  it('previewStructure includes both STF XML paths and underlying PDF paths', async () => {
    const paths = await packageAssembler.previewStructure('seq-1');

    // STF file paths (same directory as PDFs, named study-<slug>.xml)
    expect(paths).toContain(
      'x202600001/0000/m4/42-stud-rep/423-tox-rep/423-2-rep-dose-tox/study-tox-2024-001.xml',
    );
    expect(paths).toContain(
      'x202600001/0000/m4/42-stud-rep/423-tox-rep/423-2-rep-dose-tox/study-tox-2024-002.xml',
    );
    expect(paths).toContain(
      'x202600001/0000/m5/53-clin-stud-rep/535-rep-effic-safety-stud/5351-stud-rep-contr/study-clin-2024-001.xml',
    );

    // Underlying PDFs still appear — the STF references them via relative path
    expect(paths).toContain(
      'x202600001/0000/m4/42-stud-rep/423-tox-rep/423-2-rep-dose-tox/tox-001-body.pdf',
    );
    expect(paths).toContain(
      'x202600001/0000/m4/42-stud-rep/423-tox-rep/423-2-rep-dose-tox/tox-002-body.pdf',
    );
    expect(paths).toContain(
      'x202600001/0000/m5/53-clin-stud-rep/535-rep-effic-safety-stud/5351-stud-rep-contr/clin-001-body.pdf',
    );

    // M2 (non-STF) node: only the PDF, no STF file
    expect(paths).toContain('x202600001/0000/m2/23-qos/qos-summary.pdf');
    expect(paths).not.toContain(
      'x202600001/0000/m2/23-qos/study-qos-summary.xml',
    );
  });
});

// =====================================================================
// §B. STF lifecycle: cross-sequence modifiedFromId resolution
// =====================================================================

describe('STF lifecycle: cross-sequence modified-file resolution', () => {
  let studyService: StudyService;
  let prisma: Record<string, any>;
  let cvService: any;
  let stfXml: StudyTaggingFileService;

  // Two-sequence fixture: 0000 (prior study) and 0001 (replace study)
  const priorStudyId = 'prior-study-pk';
  const priorNodeId = 'node-0000';
  const newNodeId = 'node-0001';

  beforeEach(() => {
    // Fixtures for the 0001 node — resolveModifiedFromId queries it.
    const newNode0001 = {
      id: newNodeId,
      sequenceId: 'seq-0001',
      ctdSectionNumber: '4.2.3.2',
      title: '重复给药毒性',
      templateNode: { requiresStf: true, module: 4 },
      // the resolveModifiedFromId select path also needs templateNodeId + sequence
      templateNodeId: 'tpl-m4-423-2',
      sequence: {
        applicationId: 'app-1',
        sequenceNumber: '0001',
      },
    };

    prisma = {
      sequenceNode: {
        // loadNode (duplicate check step) + resolveModifiedFromId use this
        findUnique: jest.fn().mockResolvedValue(newNode0001),
      },
      study: {
        findUnique: jest.fn().mockResolvedValue(null), // no duplicate on 0001
        findMany: jest.fn().mockResolvedValue([
          // Prior study with the same studyId exists in sequence 0000
          {
            id: priorStudyId,
            studyId: 'TOX-2024-001',
            sequence: { sequenceNumber: '0000' },
          },
        ]),
      },
      fileAttachment: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'file-1',
            ectdRelativePath:
              'm4/42-stud-rep/423-tox-rep/423-2-rep-dose-tox/tox-001-body.pdf',
            md5Checksum: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
            xmlLang: 'zh',
          },
        ]),
      },
      ctdTemplateNode: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ defaultStfCategories: null }),
      },
      // $transaction used by StudyService.create — wire a fake tx
      $transaction: jest.fn().mockImplementation(async (fn: any) => {
        const tx = {
          study: {
            create: jest.fn().mockImplementation(async ({ data }: any) => ({
              id: 'newly-created-study-id',
              ...data,
              categories: (data.categories?.create ?? []).map(
                (c: any, idx: number) => ({
                  id: `cat-${idx}`,
                  ...c,
                  infoType: c.infoType ?? 'ich',
                }),
              ),
              documents: (data.documents?.create ?? []).map(
                (d: any, idx: number) => ({
                  id: `doc-${idx}`,
                  ...d,
                  fileTagInfoType: d.fileTagInfoType ?? 'ich',
                  fileAttachment: {
                    ectdRelativePath:
                      'm4/42-stud-rep/423-tox-rep/423-2-rep-dose-tox/tox-001-body.pdf',
                    md5Checksum: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
                    xmlLang: 'zh',
                  },
                }),
              ),
            })),
            update: jest.fn().mockImplementation(async ({ data }: any) => ({
              id: 'newly-created-study-id',
              ...data,
              categories: [{ name: 'species', value: 'rat', infoType: 'ich' }],
              documents: [],
            })),
          },
          studyCategory: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
          studyDocument: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
        };
        return fn(tx);
      }),
    };

    cvService = {
      getStfCategories: jest.fn().mockResolvedValue([
        { name: 'species', values: [{ value: 'rat', realm: 'ich' }] },
      ]),
      getStfFileTags: jest
        .fn()
        .mockResolvedValue([{ value: 'study-report-body', realm: 'ich' }]),
    };

    stfXml = new StudyTaggingFileService();
    studyService = new StudyService(prisma as any, cvService as any, stfXml);
  });

  it('auto-resolves modifiedFromId to the prior sequence Study when operation=REPLACE', async () => {
    // Capture the tx.study.create call data
    let capturedCreateData: any = null;
    prisma.$transaction.mockImplementation(async (fn: any) => {
      const tx = {
        study: {
          create: jest.fn().mockImplementation(async ({ data }: any) => {
            capturedCreateData = data;
            return {
              id: 'new-study-id',
              ...data,
              categories: [{ name: 'species', value: 'rat', infoType: 'ich' }],
              documents: [
                {
                  id: 'doc-1',
                  fileTag: 'study-report-body',
                  fileTagInfoType: 'ich',
                  fileAttachment: {
                    ectdRelativePath:
                      'm4/42-stud-rep/423-tox-rep/423-2-rep-dose-tox/tox-001-body.pdf',
                    md5Checksum: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
                    xmlLang: 'zh',
                  },
                },
              ],
            };
          }),
          update: jest.fn().mockImplementation(async ({ data }: any) => ({
            id: 'new-study-id',
            studyId: 'TOX-2024-001',
            title: 't',
            operation: 'REPLACE',
            modifiedFromId: capturedCreateData?.modifiedFromId ?? null,
            categories: [{ name: 'species', value: 'rat', infoType: 'ich' }],
            documents: [],
          })),
        },
      };
      return fn(tx);
    });

    await studyService.create(newNodeId, {
      studyId: 'TOX-2024-001',
      title: '28 天大鼠毒性试验 (replacement)',
      operation: LeafOperation.REPLACE,
      categories: [{ name: 'species', value: 'rat', infoType: 'ich' }],
      documents: [
        {
          fileAttachmentId: 'file-1',
          fileTag: 'study-report-body',
          fileTagInfoType: 'ich',
        },
      ],
    });

    // The auto-resolved modifiedFromId should match the prior study's id
    expect(capturedCreateData).not.toBeNull();
    expect(capturedCreateData.modifiedFromId).toBe(priorStudyId);
    // And the study.findMany walk was actually performed
    expect(prisma.study.findMany).toHaveBeenCalled();
  });

  it('throws BadRequestException when REPLACE is requested but no prior study exists', async () => {
    // Reset the findMany to return nothing → no prior in any sequence
    prisma.study.findMany.mockResolvedValueOnce([]);

    await expect(
      studyService.create(newNodeId, {
        studyId: 'TOX-2024-001',
        title: 'orphan replacement',
        operation: LeafOperation.REPLACE,
        categories: [{ name: 'species', value: 'rat', infoType: 'ich' }],
        documents: [
          {
            fileAttachmentId: 'file-1',
            fileTag: 'study-report-body',
            fileTagInfoType: 'ich',
          },
        ],
      }),
    ).rejects.toThrow(BadRequestException);

    // The thrown error message should mention the missing studyId
    try {
      await studyService.create(newNodeId, {
        studyId: 'TOX-2024-001',
        title: 'orphan replacement',
        operation: LeafOperation.REPLACE,
        categories: [{ name: 'species', value: 'rat', infoType: 'ich' }],
        documents: [
          {
            fileAttachmentId: 'file-1',
            fileTag: 'study-report-body',
            fileTagInfoType: 'ich',
          },
        ],
      });
    } catch (err) {
      // The second call needs its own empty prior list
      prisma.study.findMany.mockResolvedValueOnce([]);
      expect((err as Error).message).toContain('TOX-2024-001');
    }
  });

  it('resolves modifiedFromId to null when operation=NEW (no lookup performed)', async () => {
    let capturedCreateData: any = null;
    prisma.study.findMany.mockClear();
    prisma.$transaction.mockImplementation(async (fn: any) => {
      const tx = {
        study: {
          create: jest.fn().mockImplementation(async ({ data }: any) => {
            capturedCreateData = data;
            return {
              id: 'new-study-id',
              ...data,
              categories: [{ name: 'species', value: 'rat', infoType: 'ich' }],
              documents: [
                {
                  id: 'doc-1',
                  fileTag: 'study-report-body',
                  fileTagInfoType: 'ich',
                  fileAttachment: {
                    ectdRelativePath:
                      'm4/42-stud-rep/423-tox-rep/423-2-rep-dose-tox/tox-001-body.pdf',
                    md5Checksum: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
                    xmlLang: 'zh',
                  },
                },
              ],
            };
          }),
          update: jest.fn().mockImplementation(async ({ data }: any) => ({
            id: 'new-study-id',
            studyId: 'TOX-2024-001',
            title: 't',
            operation: 'NEW',
            modifiedFromId: null,
            categories: [{ name: 'species', value: 'rat', infoType: 'ich' }],
            documents: [],
          })),
        },
      };
      return fn(tx);
    });

    await studyService.create(newNodeId, {
      studyId: 'TOX-2024-001',
      title: 'first submission',
      operation: LeafOperation.NEW,
      categories: [{ name: 'species', value: 'rat', infoType: 'ich' }],
      documents: [
        {
          fileAttachmentId: 'file-1',
          fileTag: 'study-report-body',
          fileTagInfoType: 'ich',
        },
      ],
    });

    expect(capturedCreateData).not.toBeNull();
    // NEW → no prior lookup; modifiedFromId should end up null
    expect(capturedCreateData.modifiedFromId).toBeNull();
    expect(prisma.study.findMany).not.toHaveBeenCalled();
  });
});

// =====================================================================
// §C. STF round-trip: generate → export → reimport
// =====================================================================

describe('STF round-trip: generate → export → reimport', () => {
  let stfXml: StudyTaggingFileService;

  beforeEach(() => {
    stfXml = new StudyTaggingFileService();
  });

  const buildInput = () => ({
    id: 'study-1',
    studyId: 'TOX-2024-001',
    title: '28 天大鼠毒性试验',
    operation: 'NEW' as const,
    categories: [
      { name: 'species', value: 'rat', infoType: 'ich' },
      { name: 'route-of-admin', value: 'oral', infoType: 'ich' },
    ],
    documents: [
      {
        leafId: 'tox-2024-001-0',
        href: 'tox-001-body.pdf',
        title: 'Study report body',
        checksum: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        fileTag: 'study-report-body',
        fileTagInfoType: 'ich',
        xmlLang: 'zh',
      },
    ],
  });

  it('round-trips through generate → parse with identical canonical shape', () => {
    const input = buildInput();
    const xml = stfXml.generateStfXml(input);
    const parsed = stfXml.parseStfXml(xml);

    expect(parsed.studyId).toBe(input.studyId);
    expect(parsed.title).toBe(input.title);

    // Categories preserved in order, with matching attributes
    expect(parsed.categories).toHaveLength(input.categories.length);
    input.categories.forEach((cat, idx) => {
      expect(parsed.categories[idx].name).toBe(cat.name);
      expect(parsed.categories[idx].value).toBe(cat.value);
      expect(parsed.categories[idx].infoType).toBe(cat.infoType);
    });

    // Documents preserved in order, with matching file-tag + href
    expect(parsed.documents).toHaveLength(input.documents.length);
    input.documents.forEach((doc, idx) => {
      expect(parsed.documents[idx].fileTag).toBe(doc.fileTag);
      expect(parsed.documents[idx].href).toBe(doc.href);
      expect(parsed.documents[idx].checksum).toBe(doc.checksum);
    });
  });

  it('round-trip MD5 is stable: regenerating produces the same checksum', () => {
    const input = buildInput();
    const xml1 = stfXml.generateStfXml(input);
    const xml2 = stfXml.generateStfXml(input);
    // Same inputs → same XML → same MD5
    expect(xml1).toBe(xml2);
    expect(stfXml.computeStfChecksum(xml1)).toBe(
      stfXml.computeStfChecksum(xml2),
    );
    expect(stfXml.computeStfChecksum(xml1)).toMatch(/^[a-f0-9]{32}$/);
  });

  it('import reconstructs categories correctly from a real STF XML', async () => {
    // 1. Build a real STF XML from the pure service
    const input = buildInput();
    const xml = stfXml.generateStfXml(input);

    // 2. Set up StudyTaggingFileImportService with mocked Prisma + CV
    const priorSeqNode = {
      id: 'target-node',
      sequenceId: 'seq-1',
      ctdSectionNumber: '4.2.3.2',
      templateNodeId: 'tpl-m4-423-2',
      templateNode: { requiresStf: true, module: 4 },
      sequence: { applicationId: 'app-1', sequenceNumber: '0000' },
    };

    let createCallData: any = null;
    const prisma: Record<string, any> = {
      sequenceNode: {
        findUnique: jest.fn().mockResolvedValue(priorSeqNode),
      },
      fileAttachment: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'existing-file-1',
            originalName: 'tox-001-body.pdf',
            storedName: 'tox-001-body.pdf',
            ectdRelativePath:
              'm4/42-stud-rep/423-tox-rep/423-2-rep-dose-tox/tox-001-body.pdf',
            md5Checksum: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
            xmlLang: 'zh',
          },
        ]),
        create: jest.fn(),
      },
      study: {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      $transaction: jest.fn().mockImplementation(async (fn: any) => {
        const tx = {
          study: {
            create: jest.fn().mockImplementation(async ({ data, select }: any) => {
              createCallData = data;
              const id = 'imported-study-id';
              if (select) return { id };
              return { id };
            }),
            delete: jest.fn(),
            update: jest.fn().mockResolvedValue({ id: 'imported-study-id' }),
            findUnique: jest.fn().mockImplementation(async ({ where }: any) => ({
              id: where.id,
              studyId: input.studyId,
              title: input.title,
              operation: 'NEW',
              categories: input.categories.map((c, i) => ({
                ...c,
                id: `cat-${i}`,
                sortOrder: i,
              })),
              documents: input.documents.map((d, i) => ({
                id: `doc-${i}`,
                fileTag: d.fileTag,
                fileTagInfoType: d.fileTagInfoType,
                sortOrder: i,
                fileAttachment: {
                  ectdRelativePath:
                    'm4/42-stud-rep/423-tox-rep/423-2-rep-dose-tox/tox-001-body.pdf',
                  md5Checksum: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
                  xmlLang: 'zh',
                },
              })),
            })),
          },
          studyCategory: { deleteMany: jest.fn() },
          studyDocument: { deleteMany: jest.fn() },
          fileAttachment: {
            create: jest.fn(),
          },
        };
        return fn(tx);
      }),
    };

    const cvService = {
      getStfCategories: jest.fn().mockResolvedValue([
        { name: 'species', values: [{ value: 'rat', realm: 'ich' }] },
        {
          name: 'route-of-admin',
          values: [{ value: 'oral', realm: 'ich' }],
        },
      ]),
      getStfFileTags: jest
        .fn()
        .mockResolvedValue([{ value: 'study-report-body', realm: 'ich' }]),
    };

    const importService = new StudyTaggingFileImportService(
      prisma as any,
      stfXml,
      cvService as any,
      undefined as any, // minio not needed for XML-only import
    );

    const result = await importService.importStfXml('target-node', xml);

    expect(result.created).toBe(true);
    expect(createCallData).not.toBeNull();

    // Categories should have been passed through in order with the same names/values
    const createdCats = createCallData.categories.create;
    expect(createdCats).toHaveLength(2);
    expect(createdCats[0].name).toBe('species');
    expect(createdCats[0].value).toBe('rat');
    expect(createdCats[1].name).toBe('route-of-admin');
    expect(createdCats[1].value).toBe('oral');

    // And one document, linked to the existing FileAttachment
    const createdDocs = createCallData.documents.create;
    expect(createdDocs).toHaveLength(1);
    expect(createdDocs[0].fileTag).toBe('study-report-body');
    expect(createdDocs[0].fileAttachmentId).toBe('existing-file-1');
  });
});

// =====================================================================
// §D. Plan 12 CDE validator coverage
//     (rules 5.10 / 5.12 / 5.13 / 5.18 / 5.20)
// =====================================================================

function buildValidatorSequence(overrides: any = {}) {
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
      id: 'ra-1',
      applicationId: 'app-1',
      regulatoryActivityTypeCode: 'cnrat1',
      relatedSequence: '0000',
      application: {
        id: 'app-1',
        applicationNumber: 'x202600001',
        applicationTypeCode: 'cnapt2',
        productTypeCode: 'cnprt1',
        productNumber: '2026000001',
      },
      sequences: [{ id: 'seq-1', sequenceNumber: '0000' }],
    },
    sequenceNodes: [],
    ...overrides,
  };
}

function buildValidatorStfLeaf(overrides: any = {}) {
  return {
    id: `node-${Math.random().toString(36).slice(2, 10)}`,
    isLeaf: true,
    ctdSectionNumber: '4.2.3.2',
    title: '重复给药毒性',
    operation: 'NEW',
    status: 'COMPLETED',
    parentId: null,
    templateNodeId: 'tpl-m4-423-2',
    elementName: 'm4-2-3-2-repeat-dose-toxicity',
    templateNode: {
      module: 4,
      requiresStf: true,
      elementName: 'm4-2-3-2-repeat-dose-toxicity',
      allowsExtension: false,
      ctdSectionNumber: '4.2.3.2',
      titleZh: '重复给药毒性',
    },
    children: [],
    substance: undefined,
    manufacturer: undefined,
    productName: undefined,
    dosageForm: undefined,
    indication: undefined,
    fileAttachments: [
      {
        id: 'f-1',
        fileSize: 2048,
        fileType: 'pdf',
        originalName: 'tox.pdf',
        storedName: 'tox.pdf',
        ectdRelativePath: 'm4/42-stud-rep/423-tox-rep/423-2-rep-dose-tox/tox.pdf',
        pdfAnalysis: {
          pdfVersion: '1.7',
          isEncrypted: false,
          hasJavascript: false,
          hasExternalLinks: false,
          hasMultimedia: false,
          pageCount: 5,
          hasBookmarks: true,
          bookmarkZoomInherit: true,
          hasAttachments: false,
          fontsEmbedded: true,
          isTextSearchable: true,
        },
      },
    ],
    document: null,
    studies: [],
    ...overrides,
  };
}

describe('Plan 12 CDE validator coverage', () => {
  let validatorService: ValidatorService;
  let prisma: Record<string, any>;

  beforeEach(() => {
    prisma = {
      sequence: {
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({}),
      },
      sequenceNode: {
        findFirst: jest.fn(),
      },
      validationReport: {
        create: jest.fn().mockResolvedValue({ id: 'report-1' }),
      },
      ctdCompletenessRule: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      cvDependency: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: 'dep-1', sequenceTypeCode: null }),
      },
      fileAttachment: {
        findUnique: jest.fn(),
      },
    };
    validatorService = new ValidatorService(prisma as any, new Md5Service());
  });

  // ------------------------------------------------------------------
  // Rule 5.10: study must have at least one document
  // ------------------------------------------------------------------
  it('rule 5.10: flags ERROR when a Study on an STF-required node has no documents', async () => {
    const seq = buildValidatorSequence({
      sequenceNodes: [
        buildValidatorStfLeaf({
          studies: [
            {
              id: 's1',
              studyId: 'TOX-2024-001',
              title: 'ok title',
              operation: 'NEW',
              modifiedFromId: null,
              stfXmlContent: '<x/>',
              stfChecksum: 'd41d8cd98f00b204e9800998ecf8427e',
              categories: [{ name: 'species', value: 'rat' }],
              documents: [], // empty → rule 5.10
            },
          ],
        }),
      ],
    });
    prisma.sequence.findUnique.mockResolvedValue(seq);

    const result = await validatorService.validate('seq-1');
    const errors = result.items.filter(
      (i) => i.ruleCode === '5.10' && i.severity === ValidationSeverity.ERROR,
    );
    expect(errors.length).toBe(1);
  });

  // ------------------------------------------------------------------
  // Rule 5.12: stfXmlContent cached and non-null
  // ------------------------------------------------------------------
  it('rule 5.12: flags ERROR when stfXmlContent is null', async () => {
    const seq = buildValidatorSequence({
      sequenceNodes: [
        buildValidatorStfLeaf({
          studies: [
            {
              id: 's1',
              studyId: 'TOX-2024-001',
              title: 'ok title',
              operation: 'NEW',
              modifiedFromId: null,
              stfXmlContent: null, // missing → rule 5.12
              stfChecksum: 'd41d8cd98f00b204e9800998ecf8427e',
              categories: [{ name: 'species', value: 'rat' }],
              documents: [{ fileTag: 'study-report-body' }],
            },
          ],
        }),
      ],
    });
    prisma.sequence.findUnique.mockResolvedValue(seq);

    const result = await validatorService.validate('seq-1');
    const errors = result.items.filter(
      (i) => i.ruleCode === '5.12' && i.severity === ValidationSeverity.ERROR,
    );
    expect(errors.length).toBe(1);
  });

  // ------------------------------------------------------------------
  // Rule 5.13: stfChecksum must look like a 32-char MD5
  // ------------------------------------------------------------------
  it('rule 5.13: flags ERROR when stfChecksum is not a 32-char MD5', async () => {
    const seq = buildValidatorSequence({
      sequenceNodes: [
        buildValidatorStfLeaf({
          studies: [
            {
              id: 's1',
              studyId: 'TOX-2024-001',
              title: 'ok title',
              operation: 'NEW',
              modifiedFromId: null,
              stfXmlContent: '<x/>',
              stfChecksum: 'not-a-md5', // bad format → rule 5.13
              categories: [{ name: 'species', value: 'rat' }],
              documents: [{ fileTag: 'study-report-body' }],
            },
          ],
        }),
      ],
    });
    prisma.sequence.findUnique.mockResolvedValue(seq);

    const result = await validatorService.validate('seq-1');
    const errors = result.items.filter(
      (i) => i.ruleCode === '5.13' && i.severity === ValidationSeverity.ERROR,
    );
    expect(errors.length).toBe(1);
  });

  // ------------------------------------------------------------------
  // Rule 5.18: REPLACE / APPEND / DELETE must have modifiedFromId
  // ------------------------------------------------------------------
  it('rule 5.18: flags ERROR when operation=REPLACE but modifiedFromId is null', async () => {
    const seq = buildValidatorSequence({
      sequenceNumber: '0001',
      sequenceNodes: [
        buildValidatorStfLeaf({
          operation: 'REPLACE',
          studies: [
            {
              id: 's1',
              studyId: 'TOX-2024-001',
              title: 'ok title',
              operation: 'REPLACE',
              modifiedFromId: null, // broken chain → rule 5.18
              stfXmlContent: '<x/>',
              stfChecksum: 'd41d8cd98f00b204e9800998ecf8427e',
              categories: [{ name: 'species', value: 'rat' }],
              documents: [{ fileTag: 'study-report-body' }],
            },
          ],
        }),
      ],
    });
    prisma.sequence.findUnique.mockResolvedValue(seq);

    const result = await validatorService.validate('seq-1');
    const errors = result.items.filter(
      (i) => i.ruleCode === '5.18' && i.severity === ValidationSeverity.ERROR,
    );
    expect(errors.length).toBe(1);
  });

  // ------------------------------------------------------------------
  // Rule 5.20: duplicate studyId within the same node
  // ------------------------------------------------------------------
  it('rule 5.20: flags ERROR when two Studies on the same node share a studyId', async () => {
    const seq = buildValidatorSequence({
      sequenceNodes: [
        buildValidatorStfLeaf({
          studies: [
            {
              id: 's1',
              studyId: 'TOX-2024-001',
              title: 'first',
              operation: 'NEW',
              modifiedFromId: null,
              stfXmlContent: '<x/>',
              stfChecksum: 'd41d8cd98f00b204e9800998ecf8427e',
              categories: [{ name: 'species', value: 'rat' }],
              documents: [{ fileTag: 'study-report-body' }],
            },
            {
              id: 's2',
              studyId: 'TOX-2024-001', // same id → rule 5.20
              title: 'duplicate',
              operation: 'NEW',
              modifiedFromId: null,
              stfXmlContent: '<x/>',
              stfChecksum: 'd41d8cd98f00b204e9800998ecf8427e',
              categories: [{ name: 'species', value: 'rat' }],
              documents: [{ fileTag: 'study-report-body' }],
            },
          ],
        }),
      ],
    });
    prisma.sequence.findUnique.mockResolvedValue(seq);

    const result = await validatorService.validate('seq-1');
    const errors = result.items.filter(
      (i) => i.ruleCode === '5.20' && i.severity === ValidationSeverity.ERROR,
    );
    expect(errors.length).toBeGreaterThanOrEqual(1);
  });
});
