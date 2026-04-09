import {
  StfStudyInput,
  StudyTaggingFileService,
} from './study-tagging-file.service';

/**
 * Build a minimal valid StfStudyInput and apply caller overrides.
 */
function buildStudy(overrides: Partial<StfStudyInput> = {}): StfStudyInput {
  return {
    id: 'study-pk1',
    studyId: 'TOX-2024-001',
    title: '研究报告 X',
    operation: 'NEW',
    categories: [
      { name: 'species', value: 'rat', infoType: 'ich' },
      { name: 'route-of-admin', value: 'oral', infoType: 'ich' },
    ],
    documents: [
      {
        leafId: 'study-tox-2024-001-body',
        href: 'study-tox-2024-001-body.pdf',
        title: '研究报告正文',
        checksum: '5eb63bbbe01eeed093cb22bb8f5acdc3',
        fileTag: 'study-report-body',
        fileTagInfoType: 'ich',
        xmlLang: 'zh',
      },
    ],
    ...overrides,
  };
}

describe('StudyTaggingFileService', () => {
  let service: StudyTaggingFileService;

  beforeEach(() => {
    service = new StudyTaggingFileService();
  });

  // ==================== generateStfXml ====================

  describe('generateStfXml', () => {
    it('emits the XML declaration and DOCTYPE for ich-stf-v2-2.dtd', () => {
      const xml = service.generateStfXml(buildStudy());
      expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(
        true,
      );
      expect(xml).toContain(
        '<!DOCTYPE ectd:study SYSTEM "../../../util/dtd/ich-stf-v2-2.dtd">',
      );
    });

    it('references the stf XSL stylesheet', () => {
      const xml = service.generateStfXml(buildStudy());
      expect(xml).toContain(
        '<?xml-stylesheet type="text/xsl" href="../../../util/style/ich-stf-stylesheet-2-3.xsl"?>',
      );
    });

    it('includes dtd-version="2.2" attribute on the root element', () => {
      const xml = service.generateStfXml(buildStudy());
      expect(xml).toContain('dtd-version="2.2"');
    });

    it('declares both ectd and xlink namespaces on the root element', () => {
      const xml = service.generateStfXml(buildStudy());
      expect(xml).toContain('xmlns:ectd="http://www.ich.org/ectd"');
      expect(xml).toContain('xmlns:xlink="http://www.w3.org/1999/xlink"');
    });

    it('escapes XML entities in the study title', () => {
      const xml = service.generateStfXml(
        buildStudy({ title: 'A & B < C > "D"' }),
      );
      expect(xml).toContain(
        '<title>A &amp; B &lt; C &gt; &quot;D&quot;</title>',
      );
    });

    it('emits <study-id> with the human-readable study number', () => {
      const xml = service.generateStfXml(
        buildStudy({ studyId: 'TOX-2024-042' }),
      );
      expect(xml).toContain('<study-id>TOX-2024-042</study-id>');
    });

    it('emits multiple category elements in input order', () => {
      const xml = service.generateStfXml(
        buildStudy({
          categories: [
            { name: 'species', value: 'rat', infoType: 'ich' },
            { name: 'duration', value: 'chronic', infoType: 'ich' },
            { name: 'type-of-control', value: 'vehicle', infoType: 'ich' },
          ],
        }),
      );
      const speciesIdx = xml.indexOf('name="species"');
      const durationIdx = xml.indexOf('name="duration"');
      const controlIdx = xml.indexOf('name="type-of-control"');
      expect(speciesIdx).toBeGreaterThan(-1);
      expect(durationIdx).toBeGreaterThan(speciesIdx);
      expect(controlIdx).toBeGreaterThan(durationIdx);
    });

    it('emits info-type attribute on every category', () => {
      const xml = service.generateStfXml(
        buildStudy({
          categories: [
            { name: 'species', value: 'rat', infoType: 'ich' },
            { name: 'cn-specific', value: 'foo', infoType: 'cn' },
          ],
        }),
      );
      expect(xml).toContain('name="species" info-type="ich"');
      expect(xml).toContain('name="cn-specific" info-type="cn"');
    });

    it('emits one doc-content per document in the documents array', () => {
      const xml = service.generateStfXml(
        buildStudy({
          documents: [
            {
              leafId: 'doc-1',
              href: 'doc-1.pdf',
              title: 'Body',
              checksum: 'd41d8cd98f00b204e9800998ecf8427e',
              fileTag: 'study-report-body',
              fileTagInfoType: 'ich',
            },
            {
              leafId: 'doc-2',
              href: 'doc-2.pdf',
              title: 'Protocol',
              checksum: '5eb63bbbe01eeed093cb22bb8f5acdc3',
              fileTag: 'protocol',
              fileTagInfoType: 'ich',
            },
            {
              leafId: 'doc-3',
              href: 'doc-3.pdf',
              title: 'CRF',
              checksum: 'b10a8db164e0754105b7a99be72e3fe5',
              fileTag: 'sample-case-report-form',
              fileTagInfoType: 'ich',
            },
          ],
        }),
      );
      const matches = xml.match(/<doc-content /g);
      expect(matches?.length).toBe(3);
      expect(xml).toContain('ID="doc-1"');
      expect(xml).toContain('ID="doc-2"');
      expect(xml).toContain('ID="doc-3"');
    });

    it('emits xlink:href, xlink:type="simple", checksum, checksum-type="md5" on NEW documents', () => {
      const xml = service.generateStfXml(buildStudy());
      expect(xml).toContain('xlink:href="study-tox-2024-001-body.pdf"');
      expect(xml).toContain('xlink:type="simple"');
      expect(xml).toContain(
        'checksum="5eb63bbbe01eeed093cb22bb8f5acdc3"',
      );
      expect(xml).toContain('checksum-type="md5"');
    });

    it('emits operation="delete" without xlink:href or checksum attributes', () => {
      const xml = service.generateStfXml(
        buildStudy({
          operation: 'DELETE',
          modifiedFromStfHref: 'study-tox-2024-001.xml',
          documents: [
            {
              leafId: 'doc-del',
              href: 'doc-del.pdf',
              title: 'Body',
              checksum: '5eb63bbbe01eeed093cb22bb8f5acdc3',
              fileTag: 'study-report-body',
              fileTagInfoType: 'ich',
              modifiedFromHref: 'prior-doc-del.pdf',
            },
          ],
        }),
      );
      expect(xml).toContain('operation="delete"');
      // The substring "xlink:href" must not appear as an attribute on the deleted doc
      const docContentBlock = xml.substring(
        xml.indexOf('<doc-content'),
        xml.indexOf('</doc-content>'),
      );
      expect(docContentBlock).not.toContain('xlink:href');
      expect(docContentBlock).not.toContain('checksum=');
      expect(docContentBlock).not.toContain('checksum-type');
    });

    it('emits modified-file attribute on REPLACE documents', () => {
      const xml = service.generateStfXml(
        buildStudy({
          operation: 'REPLACE',
          documents: [
            {
              leafId: 'doc-rep',
              href: 'doc-rep.pdf',
              title: 'Body v2',
              checksum: '5eb63bbbe01eeed093cb22bb8f5acdc3',
              fileTag: 'study-report-body',
              fileTagInfoType: 'ich',
              modifiedFromHref: 'prior-doc-rep.pdf',
            },
          ],
        }),
      );
      expect(xml).toContain('operation="replace"');
      expect(xml).toContain('modified-file="prior-doc-rep.pdf"');
      expect(xml).toContain('xlink:href="doc-rep.pdf"');
    });

    it('falls back to the study-level modifiedFromStfHref if the document omits modifiedFromHref', () => {
      const xml = service.generateStfXml(
        buildStudy({
          operation: 'REPLACE',
          modifiedFromStfHref: 'prior-study.xml',
          documents: [
            {
              leafId: 'doc-x',
              href: 'doc-x.pdf',
              title: 'X',
              checksum: '5eb63bbbe01eeed093cb22bb8f5acdc3',
              fileTag: 'study-report-body',
              fileTagInfoType: 'ich',
            },
          ],
        }),
      );
      expect(xml).toContain('modified-file="prior-study.xml"');
    });

    it('emits xml:lang="zh" when the document provides xmlLang', () => {
      const xml = service.generateStfXml(buildStudy());
      expect(xml).toContain('xml:lang="zh"');
    });

    it('omits xml:lang when the document does not provide xmlLang', () => {
      const xml = service.generateStfXml(
        buildStudy({
          documents: [
            {
              leafId: 'doc-nolang',
              href: 'doc-nolang.pdf',
              title: 'No Lang',
              checksum: '5eb63bbbe01eeed093cb22bb8f5acdc3',
              fileTag: 'study-report-body',
              fileTagInfoType: 'ich',
            },
          ],
        }),
      );
      // No xml:lang attribute anywhere (the root ectd:study omits it too)
      expect(xml).not.toContain('xml:lang=');
    });

    it('emits an inner <file-tag name=... info-type=.../> element for each doc-content', () => {
      const xml = service.generateStfXml(buildStudy());
      expect(xml).toContain(
        '<file-tag name="study-report-body" info-type="ich"/>',
      );
    });

    it('round-trips through parseStfXml and produces an equivalent structure', () => {
      const input = buildStudy();
      const xml = service.generateStfXml(input);
      const parsed = service.parseStfXml(xml);

      expect(parsed.studyId).toBe(input.studyId);
      expect(parsed.title).toBe(input.title);
      expect(parsed.dtdVersion).toBe('2.2');
      expect(parsed.categories).toHaveLength(input.categories.length);
      expect(parsed.categories[0]).toEqual({
        name: 'species',
        value: 'rat',
        infoType: 'ich',
      });
      expect(parsed.documents).toHaveLength(input.documents.length);
      expect(parsed.documents[0].leafId).toBe('study-tox-2024-001-body');
      expect(parsed.documents[0].href).toBe('study-tox-2024-001-body.pdf');
      expect(parsed.documents[0].fileTag).toBe('study-report-body');
      expect(parsed.documents[0].operation).toBe('new');
      expect(parsed.documents[0].xmlLang).toBe('zh');
    });
  });

  // ==================== parseStfXml ====================

  describe('parseStfXml', () => {
    it('extracts the study-id', () => {
      const xml = service.generateStfXml(
        buildStudy({ studyId: 'STUDY-XYZ' }),
      );
      const parsed = service.parseStfXml(xml);
      expect(parsed.studyId).toBe('STUDY-XYZ');
    });

    it('parses categories preserving input order', () => {
      const xml = service.generateStfXml(
        buildStudy({
          categories: [
            { name: 'species', value: 'monkey', infoType: 'ich' },
            { name: 'duration', value: 'chronic', infoType: 'ich' },
            { name: 'type-of-control', value: 'placebo', infoType: 'ich' },
          ],
        }),
      );
      const parsed = service.parseStfXml(xml);
      expect(parsed.categories.map((c) => c.name)).toEqual([
        'species',
        'duration',
        'type-of-control',
      ]);
      expect(parsed.categories.map((c) => c.value)).toEqual([
        'monkey',
        'chronic',
        'placebo',
      ]);
    });

    it('parses multiple documents with file-tag and href preserved', () => {
      const xml = service.generateStfXml(
        buildStudy({
          documents: [
            {
              leafId: 'a',
              href: 'a.pdf',
              title: 'A',
              checksum: '5eb63bbbe01eeed093cb22bb8f5acdc3',
              fileTag: 'study-report-body',
              fileTagInfoType: 'ich',
            },
            {
              leafId: 'b',
              href: 'b.pdf',
              title: 'B',
              checksum: 'd41d8cd98f00b204e9800998ecf8427e',
              fileTag: 'protocol',
              fileTagInfoType: 'ich',
            },
          ],
        }),
      );
      const parsed = service.parseStfXml(xml);
      expect(parsed.documents).toHaveLength(2);
      expect(parsed.documents[0].href).toBe('a.pdf');
      expect(parsed.documents[0].fileTag).toBe('study-report-body');
      expect(parsed.documents[1].href).toBe('b.pdf');
      expect(parsed.documents[1].fileTag).toBe('protocol');
    });

    it('throws a descriptive error when the root element is missing', () => {
      const xml = '<?xml version="1.0"?><not-ectd-study/>';
      expect(() => service.parseStfXml(xml)).toThrow(/ectd:study/);
    });

    it('extracts the dtd-version attribute', () => {
      const xml = service.generateStfXml(buildStudy());
      const parsed = service.parseStfXml(xml);
      expect(parsed.dtdVersion).toBe('2.2');
    });

    it('extracts modified-file attribute on replace documents', () => {
      const xml = service.generateStfXml(
        buildStudy({
          operation: 'REPLACE',
          documents: [
            {
              leafId: 'doc-rep',
              href: 'doc-rep.pdf',
              title: 'Body v2',
              checksum: '5eb63bbbe01eeed093cb22bb8f5acdc3',
              fileTag: 'study-report-body',
              fileTagInfoType: 'ich',
              modifiedFromHref: 'prior-doc.pdf',
            },
          ],
        }),
      );
      const parsed = service.parseStfXml(xml);
      expect(parsed.documents[0].operation).toBe('replace');
      expect(parsed.documents[0].modifiedFromHref).toBe('prior-doc.pdf');
    });
  });

  // ==================== computeStfChecksum ====================

  describe('computeStfChecksum', () => {
    it('produces a 32-character lowercase hex MD5', () => {
      const xml = service.generateStfXml(buildStudy());
      const hash = service.computeStfChecksum(xml);
      expect(hash).toHaveLength(32);
      expect(/^[a-f0-9]{32}$/.test(hash)).toBe(true);
    });

    it('is stable across identical inputs', () => {
      const xml = service.generateStfXml(buildStudy());
      expect(service.computeStfChecksum(xml)).toBe(
        service.computeStfChecksum(xml),
      );
    });

    it('produces different digests for different content', () => {
      const h1 = service.computeStfChecksum(
        service.generateStfXml(buildStudy({ studyId: 'A' })),
      );
      const h2 = service.computeStfChecksum(
        service.generateStfXml(buildStudy({ studyId: 'B' })),
      );
      expect(h1).not.toBe(h2);
    });

    it('matches the known MD5 of "hello world"', () => {
      expect(service.computeStfChecksum('hello world')).toBe(
        '5eb63bbbe01eeed093cb22bb8f5acdc3',
      );
    });
  });

  // ==================== validateStructure ====================

  describe('validateStructure', () => {
    it('returns valid=true on a well-formed STF document', () => {
      const xml = service.generateStfXml(buildStudy());
      const result = service.validateStructure(xml);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('returns valid=false and reports missing root element', () => {
      const xml = '<?xml version="1.0"?><foo/>';
      const result = service.validateStructure(xml);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => /ectd:study/.test(e))).toBe(true);
    });

    it('returns valid=false when study-id is missing', () => {
      const xml = service
        .generateStfXml(buildStudy())
        .replace(/<study-id>[^<]*<\/study-id>/, '<study-id></study-id>');
      const result = service.validateStructure(xml);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => /study-id/.test(e))).toBe(true);
    });

    it('returns valid=false when two doc-content elements share an ID', () => {
      const xml = service.generateStfXml(
        buildStudy({
          documents: [
            {
              leafId: 'dup',
              href: 'a.pdf',
              title: 'A',
              checksum: '5eb63bbbe01eeed093cb22bb8f5acdc3',
              fileTag: 'study-report-body',
              fileTagInfoType: 'ich',
            },
            {
              leafId: 'dup',
              href: 'b.pdf',
              title: 'B',
              checksum: 'd41d8cd98f00b204e9800998ecf8427e',
              fileTag: 'protocol',
              fileTagInfoType: 'ich',
            },
          ],
        }),
      );
      const result = service.validateStructure(xml);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => /重复|duplicate|dup/i.test(e))).toBe(
        true,
      );
    });

    it('reports missing modified-file on replace operation', () => {
      // Build a replace doc without any modifiedFromHref or study-level fallback
      const xml = service.generateStfXml(
        buildStudy({
          operation: 'REPLACE',
          documents: [
            {
              leafId: 'doc-rep',
              href: 'doc-rep.pdf',
              title: 'Body',
              checksum: '5eb63bbbe01eeed093cb22bb8f5acdc3',
              fileTag: 'study-report-body',
              fileTagInfoType: 'ich',
              // no modifiedFromHref, no study-level modifiedFromStfHref
            },
          ],
        }),
      );
      const result = service.validateStructure(xml);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => /modified-file/.test(e))).toBe(true);
    });

    it('reports malformed checksum', () => {
      const xml = service
        .generateStfXml(buildStudy())
        .replace(
          'checksum="5eb63bbbe01eeed093cb22bb8f5acdc3"',
          'checksum="not-a-real-md5"',
        );
      const result = service.validateStructure(xml);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => /checksum/i.test(e))).toBe(true);
    });

    it('accepts region-specific info-type values on categories', () => {
      const xml = service.generateStfXml(
        buildStudy({
          categories: [
            { name: 'species', value: 'rat', infoType: 'ich' },
            { name: 'cn-specific', value: 'foo', infoType: 'cn' },
          ],
        }),
      );
      const result = service.validateStructure(xml);
      expect(result.valid).toBe(true);
    });
  });
});
