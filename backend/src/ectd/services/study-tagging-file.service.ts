import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { XMLParser } from 'fast-xml-parser';

// =====================================================================
// Public input / output types
// =====================================================================

export type StfOperation = 'NEW' | 'REPLACE' | 'APPEND' | 'DELETE';

export interface StfCategoryInput {
  /** Category name, e.g. "species" — must be validated against the CV table upstream. */
  name: string;
  /** Category value, e.g. "rat" — must be validated against the CV table upstream. */
  value: string;
  /** Usually "ich"; region codes ("cn"/"us"/...) allowed by DTD. */
  infoType: string;
}

export interface StfDocumentInput {
  /** Unique leaf ID within this STF (typically derived from study.id + doc index). */
  leafId: string;
  /** Relative path from the STF file's location to the PDF (same-directory name preferred). */
  href: string;
  /** Title shown in the review tool. */
  title: string;
  /** MD5 checksum of the referenced PDF. */
  checksum: string;
  /** file-tag/@name — must come from the CV table upstream. */
  fileTag: string;
  /** file-tag/@info-type — usually "ich". */
  fileTagInfoType: string;
  /** Optional xml:lang hint, e.g. "zh". */
  xmlLang?: string;
  /** Per-leaf lifecycle override. Defaults to the study-level operation. */
  operation?: StfOperation;
  /** Prior doc-content href for REPLACE/APPEND/DELETE. */
  modifiedFromHref?: string;
}

export interface StfStudyInput {
  /** Study.id (from database). */
  id: string;
  /** Human-readable study number, e.g. "TOX-2024-001". */
  studyId: string;
  /** Full title of the report as on the title page. */
  title: string;
  /** Study-level lifecycle operation; used as the default for each document. */
  operation: StfOperation;
  /** Relative path to the prior STF file (used by replace/append/delete leaves). */
  modifiedFromStfHref?: string;
  categories: StfCategoryInput[];
  documents: StfDocumentInput[];
}

export interface StfParseResult {
  studyId: string;
  title: string;
  dtdVersion: string;
  categories: Array<{ name: string; value: string; infoType: string }>;
  documents: Array<{
    leafId: string;
    href: string;
    title: string;
    checksum: string;
    fileTag: string;
    fileTagInfoType: string;
    xmlLang?: string;
    operation?: string;
    modifiedFromHref?: string;
  }>;
}

export interface StfValidationResult {
  valid: boolean;
  errors: string[];
}

// =====================================================================
// Constants
// =====================================================================

/** DTD version literal. ICH STF v2.6.1 spec still pins the DTD to "2.2". */
const STF_DTD_VERSION = '2.2';

/**
 * STF files sit in a CTD section sub-folder, e.g.
 *   m4/42-stud-rep/421-pharmacol-stud/study-tox-2024-001.xml
 * so the DTD at util/dtd/ is three directory hops up.
 */
const STF_DTD_SYSTEM_PATH = '../../../util/dtd/ich-stf-v2-2.dtd';
const STF_XSL_SYSTEM_PATH = '../../../util/style/ich-stf-stylesheet-2-3.xsl';

const ECTD_NAMESPACE = 'http://www.ich.org/ectd';
const XLINK_NAMESPACE = 'http://www.w3.org/1999/xlink';

// =====================================================================
// Service
// =====================================================================

/**
 * StudyTaggingFileService — pure XML in / XML out service for ICH STF v2.2
 * Study Tagging Files. Takes no dependencies and never touches the database
 * or the filesystem. Validation of category / file-tag values against the
 * controlled-vocabulary table is the caller's responsibility.
 */
@Injectable()
export class StudyTaggingFileService {
  private readonly xmlParser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    // Preserve original order of repeated elements (categories, doc-contents)
    preserveOrder: false,
    // Keep plain string values so checksums with only digits stay as strings
    parseAttributeValue: false,
    parseTagValue: false,
    trimValues: true,
  });

  /**
   * Build an ICH STF v2.2 XML document from a study + its categories + its
   * documents. Line-based construction matches the style of
   * index-xml.service.ts and cn-regional-xml.service.ts.
   */
  generateStfXml(input: StfStudyInput): string {
    const lines: string[] = [];

    // XML declaration, DTD reference, XSL stylesheet
    lines.push('<?xml version="1.0" encoding="UTF-8"?>');
    lines.push(`<!DOCTYPE ectd:study SYSTEM "${STF_DTD_SYSTEM_PATH}">`);
    lines.push(`<?xml-stylesheet type="text/xsl" href="${STF_XSL_SYSTEM_PATH}"?>`);

    // Root element
    lines.push(
      `<ectd:study xmlns:ectd="${ECTD_NAMESPACE}"`,
      `            xmlns:xlink="${XLINK_NAMESPACE}"`,
      `            dtd-version="${STF_DTD_VERSION}">`,
    );

    // study-identifier: title, study-id, categories (order matters per DTD)
    lines.push('  <study-identifier>');
    lines.push(`    <title>${this.escapeXml(input.title)}</title>`);
    lines.push(`    <study-id>${this.escapeXml(input.studyId)}</study-id>`);
    for (const cat of input.categories) {
      lines.push(
        `    <category name="${this.escapeXml(cat.name)}" info-type="${this.escapeXml(cat.infoType)}">${this.escapeXml(cat.value)}</category>`,
      );
    }
    lines.push('  </study-identifier>');

    // study-document: one doc-content per referenced PDF
    lines.push('  <study-document>');
    for (const doc of input.documents) {
      this.buildDocContent(lines, doc, input);
    }
    lines.push('  </study-document>');

    lines.push('</ectd:study>');

    return lines.join('\n');
  }

  /**
   * Parse an STF XML string into a flat shape suitable for round-tripping
   * through generateStfXml. Throws a descriptive Error on unparseable input.
   */
  parseStfXml(xml: string): StfParseResult {
    let parsed: any;
    try {
      parsed = this.xmlParser.parse(xml);
    } catch (err) {
      throw new Error(
        `STF XML 解析失败: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    const root = parsed?.['ectd:study'];
    if (!root) {
      throw new Error('STF XML 缺失根元素 <ectd:study>');
    }

    const dtdVersion = String(root['@_dtd-version'] ?? '');

    const identifier = root['study-identifier'];
    if (!identifier) {
      throw new Error('STF XML 缺失 <study-identifier> 元素');
    }

    const title = this.readText(identifier['title']);
    const studyId = this.readText(identifier['study-id']);

    const rawCategories = this.toArray(identifier['category']);
    const categories = rawCategories.map((c) => ({
      name: String(c['@_name'] ?? ''),
      value: this.readText(c),
      infoType: String(c['@_info-type'] ?? ''),
    }));

    const studyDoc = root['study-document'];
    const rawDocs = this.toArray(studyDoc ? studyDoc['doc-content'] : undefined);
    const documents = rawDocs.map((d) => {
      const fileTagRaw = d['file-tag'];
      const fileTag = Array.isArray(fileTagRaw) ? fileTagRaw[0] : fileTagRaw;
      return {
        leafId: String(d['@_ID'] ?? ''),
        href: String(d['@_xlink:href'] ?? ''),
        title: this.readText(d['title']),
        checksum: String(d['@_checksum'] ?? ''),
        fileTag: fileTag ? String(fileTag['@_name'] ?? '') : '',
        fileTagInfoType: fileTag ? String(fileTag['@_info-type'] ?? '') : '',
        xmlLang: d['@_xml:lang'] ? String(d['@_xml:lang']) : undefined,
        operation: d['@_operation'] ? String(d['@_operation']) : undefined,
        modifiedFromHref: d['@_modified-file']
          ? String(d['@_modified-file'])
          : undefined,
      };
    });

    return { studyId, title, dtdVersion, categories, documents };
  }

  /** Compute an MD5 hex digest over the STF XML string (utf-8). */
  computeStfChecksum(xml: string): string {
    return createHash('md5').update(xml, 'utf8').digest('hex');
  }

  /**
   * Perform structural validation that goes beyond what the DTD can express:
   * required elements/attributes present, doc-content IDs unique, checksum
   * format sane, etc. Returns an aggregated list rather than throwing on the
   * first failure.
   */
  validateStructure(xml: string): StfValidationResult {
    const errors: string[] = [];

    let parsed: any;
    try {
      parsed = this.xmlParser.parse(xml);
    } catch (err) {
      return {
        valid: false,
        errors: [
          `XML 格式不合法: ${err instanceof Error ? err.message : String(err)}`,
        ],
      };
    }

    const root = parsed?.['ectd:study'];
    if (!root) {
      return {
        valid: false,
        errors: ['缺失根元素 <ectd:study>'],
      };
    }

    if (root['@_dtd-version'] !== STF_DTD_VERSION) {
      errors.push(
        `dtd-version 必须为 "${STF_DTD_VERSION}"，实际为 "${root['@_dtd-version']}"`,
      );
    }

    const identifier = root['study-identifier'];
    if (!identifier) {
      errors.push('缺失 <study-identifier> 元素');
    } else {
      if (!this.readText(identifier['title'])) {
        errors.push('<study-identifier> 缺失非空 <title>');
      }
      if (!this.readText(identifier['study-id'])) {
        errors.push('<study-identifier> 缺失非空 <study-id>');
      }
      const cats = this.toArray(identifier['category']);
      cats.forEach((c, idx) => {
        if (!c['@_name']) {
          errors.push(`category[${idx}] 缺失 name 属性`);
        }
        if (!c['@_info-type']) {
          errors.push(`category[${idx}] 缺失 info-type 属性`);
        }
        if (!this.readText(c)) {
          errors.push(`category[${idx}] 文本内容为空`);
        }
      });
    }

    const studyDoc = root['study-document'];
    if (!studyDoc) {
      errors.push('缺失 <study-document> 元素');
    } else {
      const docs = this.toArray(studyDoc['doc-content']);
      if (docs.length === 0) {
        errors.push('<study-document> 至少需要一个 <doc-content>');
      }

      const seenIds = new Set<string>();
      docs.forEach((d, idx) => {
        const id = d['@_ID'] ? String(d['@_ID']) : '';
        if (!id) {
          errors.push(`doc-content[${idx}] 缺失 ID 属性`);
        } else if (seenIds.has(id)) {
          errors.push(`doc-content ID "${id}" 重复`);
        } else {
          seenIds.add(id);
        }

        const op = d['@_operation']
          ? String(d['@_operation']).toLowerCase()
          : '';
        if (!op) {
          errors.push(`doc-content[${idx}] 缺失 operation 属性`);
        } else if (!['new', 'replace', 'append', 'delete'].includes(op)) {
          errors.push(
            `doc-content[${idx}] operation 非法: "${op}" (允许 new/replace/append/delete)`,
          );
        }

        // non-delete operations need xlink:href + checksum
        if (op && op !== 'delete') {
          if (!d['@_xlink:href']) {
            errors.push(`doc-content[${idx}] 缺失 xlink:href`);
          }
          const checksum = d['@_checksum'] ? String(d['@_checksum']) : '';
          if (!checksum) {
            errors.push(`doc-content[${idx}] 缺失 checksum`);
          } else if (!/^[a-f0-9]{32}$/i.test(checksum)) {
            errors.push(
              `doc-content[${idx}] checksum 不是合法的 32 字符 MD5: "${checksum}"`,
            );
          }
          if (
            d['@_checksum-type'] &&
            String(d['@_checksum-type']).toLowerCase() !== 'md5'
          ) {
            errors.push(
              `doc-content[${idx}] checksum-type 必须为 "md5"，实际为 "${d['@_checksum-type']}"`,
            );
          }
        }

        // replace/append/delete need modified-file
        if (op === 'replace' || op === 'append' || op === 'delete') {
          if (!d['@_modified-file']) {
            errors.push(
              `doc-content[${idx}] operation="${op}" 时必须提供 modified-file 属性`,
            );
          }
        }

        // file-tag presence
        const fileTagRaw = d['file-tag'];
        const fileTag = Array.isArray(fileTagRaw) ? fileTagRaw[0] : fileTagRaw;
        if (!fileTag) {
          errors.push(`doc-content[${idx}] 缺失 <file-tag> 元素`);
        } else {
          if (!fileTag['@_name']) {
            errors.push(`doc-content[${idx}] <file-tag> 缺失 name 属性`);
          }
          if (!fileTag['@_info-type']) {
            errors.push(`doc-content[${idx}] <file-tag> 缺失 info-type 属性`);
          }
        }
      });
    }

    return { valid: errors.length === 0, errors };
  }

  // =====================================================================
  // Private helpers
  // =====================================================================

  private buildDocContent(
    lines: string[],
    doc: StfDocumentInput,
    study: StfStudyInput,
  ): void {
    const op = (doc.operation ?? study.operation).toLowerCase();
    const isDelete = op === 'delete';
    const needsModifiedFile =
      op === 'replace' || op === 'append' || op === 'delete';

    const attrParts: string[] = [];
    attrParts.push(`ID="${this.escapeAttr(doc.leafId)}"`);
    attrParts.push(`operation="${op}"`);

    if (needsModifiedFile) {
      const modifiedFile = doc.modifiedFromHref ?? study.modifiedFromStfHref;
      if (modifiedFile) {
        attrParts.push(`modified-file="${this.escapeAttr(modifiedFile)}"`);
      }
    }

    // ICH STF DTD strictly marks xlink:href #REQUIRED, but delete leaves in
    // ICH eCTD lifecycle semantics do not reference a payload — they simply
    // tombstone a prior leaf. The project's index-xml.service.ts follows the
    // same convention (see line 320: skip xlink:href on delete). Mirror it.
    if (!isDelete) {
      attrParts.push(`xlink:href="${this.escapeAttr(doc.href)}"`);
      attrParts.push('xlink:type="simple"');
      attrParts.push(`checksum="${this.escapeAttr(doc.checksum)}"`);
      attrParts.push('checksum-type="md5"');
    }

    if (doc.xmlLang) {
      attrParts.push(`xml:lang="${this.escapeAttr(doc.xmlLang)}"`);
    }

    // Open tag — attributes on one line for compactness, like cn-regional
    lines.push(`    <doc-content ${attrParts.join(' ')}>`);
    lines.push(`      <title>${this.escapeXml(doc.title)}</title>`);
    lines.push(
      `      <file-tag name="${this.escapeAttr(doc.fileTag)}" info-type="${this.escapeAttr(doc.fileTagInfoType)}"/>`,
    );
    lines.push('    </doc-content>');
  }

  /** Escape for element text content. */
  private escapeXml(str: string): string {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  /** Escape for attribute values. Same rules as escapeXml. */
  private escapeAttr(str: string): string {
    return this.escapeXml(str);
  }

  /** Normalise fast-xml-parser's "maybe array, maybe scalar, maybe undefined" shape. */
  private toArray<T>(value: T | T[] | undefined | null): T[] {
    if (value === undefined || value === null) return [];
    return Array.isArray(value) ? value : [value];
  }

  /**
   * Read element text from fast-xml-parser output. With the current parser
   * options, simple `<title>foo</title>` becomes a bare string, while an
   * element with attributes becomes an object whose text lives under `#text`.
   */
  private readText(node: unknown): string {
    if (node === undefined || node === null) return '';
    if (typeof node === 'string') return node;
    if (typeof node === 'number' || typeof node === 'boolean') {
      return String(node);
    }
    if (typeof node === 'object') {
      const anyNode = node as Record<string, unknown>;
      if (typeof anyNode['#text'] === 'string') return anyNode['#text'];
      if (anyNode['#text'] !== undefined) return String(anyNode['#text']);
    }
    return '';
  }
}
