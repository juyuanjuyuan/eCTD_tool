"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.StudyTaggingFileService = void 0;
const common_1 = require("@nestjs/common");
const crypto_1 = require("crypto");
const fast_xml_parser_1 = require("fast-xml-parser");
const STF_DTD_VERSION = '2.2';
const STF_DTD_SYSTEM_PATH = '../../../util/dtd/ich-stf-v2-2.dtd';
const STF_XSL_SYSTEM_PATH = '../../../util/style/ich-stf-stylesheet-2-3.xsl';
const ECTD_NAMESPACE = 'http://www.ich.org/ectd';
const XLINK_NAMESPACE = 'http://www.w3.org/1999/xlink';
let StudyTaggingFileService = class StudyTaggingFileService {
    xmlParser = new fast_xml_parser_1.XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: '@_',
        preserveOrder: false,
        parseAttributeValue: false,
        parseTagValue: false,
        trimValues: true,
    });
    generateStfXml(input) {
        const lines = [];
        lines.push('<?xml version="1.0" encoding="UTF-8"?>');
        lines.push(`<!DOCTYPE ectd:study SYSTEM "${STF_DTD_SYSTEM_PATH}">`);
        lines.push(`<?xml-stylesheet type="text/xsl" href="${STF_XSL_SYSTEM_PATH}"?>`);
        lines.push(`<ectd:study xmlns:ectd="${ECTD_NAMESPACE}"`, `            xmlns:xlink="${XLINK_NAMESPACE}"`, `            dtd-version="${STF_DTD_VERSION}">`);
        lines.push('  <study-identifier>');
        lines.push(`    <title>${this.escapeXml(input.title)}</title>`);
        lines.push(`    <study-id>${this.escapeXml(input.studyId)}</study-id>`);
        for (const cat of input.categories) {
            lines.push(`    <category name="${this.escapeXml(cat.name)}" info-type="${this.escapeXml(cat.infoType)}">${this.escapeXml(cat.value)}</category>`);
        }
        lines.push('  </study-identifier>');
        lines.push('  <study-document>');
        for (const doc of input.documents) {
            this.buildDocContent(lines, doc, input);
        }
        lines.push('  </study-document>');
        lines.push('</ectd:study>');
        return lines.join('\n');
    }
    parseStfXml(xml) {
        let parsed;
        try {
            parsed = this.xmlParser.parse(xml);
        }
        catch (err) {
            throw new Error(`STF XML 解析失败: ${err instanceof Error ? err.message : String(err)}`);
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
    computeStfChecksum(xml) {
        return (0, crypto_1.createHash)('md5').update(xml, 'utf8').digest('hex');
    }
    validateStructure(xml) {
        const errors = [];
        let parsed;
        try {
            parsed = this.xmlParser.parse(xml);
        }
        catch (err) {
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
            errors.push(`dtd-version 必须为 "${STF_DTD_VERSION}"，实际为 "${root['@_dtd-version']}"`);
        }
        const identifier = root['study-identifier'];
        if (!identifier) {
            errors.push('缺失 <study-identifier> 元素');
        }
        else {
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
        }
        else {
            const docs = this.toArray(studyDoc['doc-content']);
            if (docs.length === 0) {
                errors.push('<study-document> 至少需要一个 <doc-content>');
            }
            const seenIds = new Set();
            docs.forEach((d, idx) => {
                const id = d['@_ID'] ? String(d['@_ID']) : '';
                if (!id) {
                    errors.push(`doc-content[${idx}] 缺失 ID 属性`);
                }
                else if (seenIds.has(id)) {
                    errors.push(`doc-content ID "${id}" 重复`);
                }
                else {
                    seenIds.add(id);
                }
                const op = d['@_operation']
                    ? String(d['@_operation']).toLowerCase()
                    : '';
                if (!op) {
                    errors.push(`doc-content[${idx}] 缺失 operation 属性`);
                }
                else if (!['new', 'replace', 'append', 'delete'].includes(op)) {
                    errors.push(`doc-content[${idx}] operation 非法: "${op}" (允许 new/replace/append/delete)`);
                }
                if (op && op !== 'delete') {
                    if (!d['@_xlink:href']) {
                        errors.push(`doc-content[${idx}] 缺失 xlink:href`);
                    }
                    const checksum = d['@_checksum'] ? String(d['@_checksum']) : '';
                    if (!checksum) {
                        errors.push(`doc-content[${idx}] 缺失 checksum`);
                    }
                    else if (!/^[a-f0-9]{32}$/i.test(checksum)) {
                        errors.push(`doc-content[${idx}] checksum 不是合法的 32 字符 MD5: "${checksum}"`);
                    }
                    if (d['@_checksum-type'] &&
                        String(d['@_checksum-type']).toLowerCase() !== 'md5') {
                        errors.push(`doc-content[${idx}] checksum-type 必须为 "md5"，实际为 "${d['@_checksum-type']}"`);
                    }
                }
                if (op === 'replace' || op === 'append' || op === 'delete') {
                    if (!d['@_modified-file']) {
                        errors.push(`doc-content[${idx}] operation="${op}" 时必须提供 modified-file 属性`);
                    }
                }
                const fileTagRaw = d['file-tag'];
                const fileTag = Array.isArray(fileTagRaw) ? fileTagRaw[0] : fileTagRaw;
                if (!fileTag) {
                    errors.push(`doc-content[${idx}] 缺失 <file-tag> 元素`);
                }
                else {
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
    buildDocContent(lines, doc, study) {
        const op = (doc.operation ?? study.operation).toLowerCase();
        const isDelete = op === 'delete';
        const needsModifiedFile = op === 'replace' || op === 'append' || op === 'delete';
        const attrParts = [];
        attrParts.push(`ID="${this.escapeAttr(doc.leafId)}"`);
        attrParts.push(`operation="${op}"`);
        if (needsModifiedFile) {
            const modifiedFile = doc.modifiedFromHref ?? study.modifiedFromStfHref;
            if (modifiedFile) {
                attrParts.push(`modified-file="${this.escapeAttr(modifiedFile)}"`);
            }
        }
        if (!isDelete) {
            attrParts.push(`xlink:href="${this.escapeAttr(doc.href)}"`);
            attrParts.push('xlink:type="simple"');
            attrParts.push(`checksum="${this.escapeAttr(doc.checksum)}"`);
            attrParts.push('checksum-type="md5"');
        }
        if (doc.xmlLang) {
            attrParts.push(`xml:lang="${this.escapeAttr(doc.xmlLang)}"`);
        }
        lines.push(`    <doc-content ${attrParts.join(' ')}>`);
        lines.push(`      <title>${this.escapeXml(doc.title)}</title>`);
        lines.push(`      <file-tag name="${this.escapeAttr(doc.fileTag)}" info-type="${this.escapeAttr(doc.fileTagInfoType)}"/>`);
        lines.push('    </doc-content>');
    }
    escapeXml(str) {
        if (!str)
            return '';
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
    }
    escapeAttr(str) {
        return this.escapeXml(str);
    }
    toArray(value) {
        if (value === undefined || value === null)
            return [];
        return Array.isArray(value) ? value : [value];
    }
    readText(node) {
        if (node === undefined || node === null)
            return '';
        if (typeof node === 'string')
            return node;
        if (typeof node === 'number' || typeof node === 'boolean') {
            return String(node);
        }
        if (typeof node === 'object') {
            const anyNode = node;
            if (typeof anyNode['#text'] === 'string')
                return anyNode['#text'];
            if (anyNode['#text'] !== undefined)
                return String(anyNode['#text']);
        }
        return '';
    }
};
exports.StudyTaggingFileService = StudyTaggingFileService;
exports.StudyTaggingFileService = StudyTaggingFileService = __decorate([
    (0, common_1.Injectable)()
], StudyTaggingFileService);
//# sourceMappingURL=study-tagging-file.service.js.map