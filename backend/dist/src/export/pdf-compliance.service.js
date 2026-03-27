"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var PDFComplianceService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PDFComplianceService = void 0;
const common_1 = require("@nestjs/common");
const pdf_lib_1 = require("pdf-lib");
const MAX_FILE_SIZE_MB = 200;
let PDFComplianceService = PDFComplianceService_1 = class PDFComplianceService {
    logger = new common_1.Logger(PDFComplianceService_1.name);
    async checkCompliance(pdfBuffer) {
        const errors = [];
        const warnings = [];
        let pdfDoc;
        let pdfVersion = 'unknown';
        try {
            pdfDoc = await pdf_lib_1.PDFDocument.load(pdfBuffer, {
                ignoreEncryption: true,
                updateMetadata: false,
            });
        }
        catch (e) {
            return {
                isCompliant: false,
                errors: [
                    {
                        ruleId: '6.0',
                        severity: 'error',
                        message: 'PDF 文件无法解析',
                        detail: e.message,
                    },
                ],
                warnings: [],
                summary: {
                    pdfVersion: 'unknown',
                    pageCount: 0,
                    hasBookmarks: false,
                    hasEncryption: false,
                    fileSizeMB: pdfBuffer.length / (1024 * 1024),
                },
            };
        }
        const pageCount = pdfDoc.getPageCount();
        const fileSizeMB = pdfBuffer.length / (1024 * 1024);
        pdfVersion = this.extractPDFVersion(pdfBuffer);
        const allowedVersions = ['1.4', '1.5', '1.6', '1.7'];
        const versionNum = pdfVersion.replace('PDF-', '').replace('pdf-', '');
        if (!allowedVersions.includes(versionNum) && !pdfVersion.includes('PDF/A')) {
            errors.push({
                ruleId: '6.18',
                severity: 'error',
                message: `PDF 版本 ${pdfVersion} 不在允许范围内`,
                detail: '允许的版本: 1.4, 1.5, 1.6, 1.7, PDF/A-1, PDF/A-2',
            });
        }
        const hasEncryption = this.checkEncryption(pdfBuffer);
        if (hasEncryption) {
            errors.push({
                ruleId: '6.19',
                severity: 'error',
                message: 'PDF 包含加密或安全限制',
                detail: 'eCTD 不允许 PDF 加密或设置密码保护',
            });
        }
        const jsResult = this.safeCheck(() => this.checkJavaScript(pdfDoc), false, '6.20', 'JavaScript 检查', warnings);
        if (jsResult) {
            errors.push({
                ruleId: '6.20',
                severity: 'error',
                message: 'PDF 包含 JavaScript',
                detail: 'eCTD 不允许 PDF 中包含 JavaScript 代码',
            });
        }
        const externalLinks = this.safeCheck(() => this.checkExternalLinks(pdfDoc), [], '6.21', '外部链接检查', warnings);
        if (externalLinks.length > 0) {
            errors.push({
                ruleId: '6.21',
                severity: 'error',
                message: `PDF 包含 ${externalLinks.length} 个外部链接`,
                detail: `外部链接: ${externalLinks.slice(0, 5).join(', ')}${externalLinks.length > 5 ? '...' : ''}`,
            });
        }
        const hasMultimedia = this.safeCheck(() => this.checkMultimedia(pdfDoc), false, '6.22', '多媒体检查', warnings);
        if (hasMultimedia) {
            errors.push({
                ruleId: '6.22',
                severity: 'error',
                message: 'PDF 包含音频、视频或 3D 对象',
                detail: 'eCTD 不允许 PDF 中包含多媒体内容',
            });
        }
        const hasBookmarks = this.safeCheck(() => this.checkBookmarks(pdfDoc), false, '6.1', '书签检查', warnings);
        if (pageCount > 5 && !hasBookmarks) {
            errors.push({
                ruleId: '6.1',
                severity: 'error',
                message: '超过 5 页的 PDF 必须包含书签',
                detail: `当前 PDF 有 ${pageCount} 页但没有书签`,
            });
        }
        if (hasBookmarks) {
            const badZoomBookmarks = this.safeCheck(() => this.checkBookmarkZoom(pdfDoc), 0, '6.23', '书签缩放检查', warnings);
            if (badZoomBookmarks > 0) {
                errors.push({
                    ruleId: '6.23',
                    severity: 'error',
                    message: `${badZoomBookmarks} 个书签的放大率不是 Inherit Zoom`,
                    detail: '所有书签必须使用 Inherit Zoom (Fit) 放大率',
                });
            }
        }
        const hasAttachments = this.safeCheck(() => this.checkAttachments(pdfDoc), false, '6.24', '附件检查', warnings);
        if (hasAttachments) {
            errors.push({
                ruleId: '6.24',
                severity: 'error',
                message: 'PDF 包含附件或嵌入式文件',
                detail: 'eCTD 不允许 PDF 包含附件',
            });
        }
        if (fileSizeMB > MAX_FILE_SIZE_MB) {
            warnings.push({
                ruleId: '6.W1',
                severity: 'warning',
                message: `PDF 文件大小 ${fileSizeMB.toFixed(1)}MB 超过 ${MAX_FILE_SIZE_MB}MB 限制`,
            });
        }
        const unembeddedFonts = this.safeCheck(() => this.checkFontEmbedding(pdfDoc), [], '6.W2', '字体嵌入检查', warnings);
        if (unembeddedFonts.length > 0) {
            warnings.push({
                ruleId: '6.W2',
                severity: 'warning',
                message: `${unembeddedFonts.length} 个字体未嵌入`,
                detail: `未嵌入字体: ${unembeddedFonts.join(', ')}`,
            });
        }
        return {
            isCompliant: errors.length === 0,
            errors,
            warnings,
            summary: {
                pdfVersion,
                pageCount,
                hasBookmarks,
                hasEncryption,
                fileSizeMB: Math.round(fileSizeMB * 100) / 100,
            },
        };
    }
    safeCheck(checkFn, defaultVal, ruleId, checkName, warnings) {
        try {
            return checkFn();
        }
        catch (e) {
            this.logger.warn(`PDF compliance check failed for ${checkName}: ${e.message}`);
            warnings.push({
                ruleId: `${ruleId}-SKIP`,
                severity: 'warning',
                message: `无法执行${checkName}`,
                detail: `PDF 内部结构解析失败，请人工确认。错误: ${e.message}`,
            });
            return defaultVal;
        }
    }
    extractPDFVersion(buffer) {
        const header = buffer.subarray(0, 20).toString('ascii');
        const match = header.match(/%PDF-(\d+\.\d+)/);
        return match ? match[1] : 'unknown';
    }
    checkEncryption(buffer) {
        const content = buffer.toString('ascii');
        return content.includes('/Encrypt');
    }
    checkJavaScript(pdfDoc) {
        const catalog = pdfDoc.catalog;
        const names = catalog.lookup(pdf_lib_1.PDFName.of('Names'));
        if (names instanceof pdf_lib_1.PDFDict) {
            const js = names.lookup(pdf_lib_1.PDFName.of('JavaScript'));
            if (js)
                return true;
        }
        const aa = catalog.lookup(pdf_lib_1.PDFName.of('AA'));
        if (aa)
            return true;
        const openAction = catalog.lookup(pdf_lib_1.PDFName.of('OpenAction'));
        if (openAction instanceof pdf_lib_1.PDFDict) {
            const s = openAction.lookup(pdf_lib_1.PDFName.of('S'));
            if (s && s.toString() === '/JavaScript')
                return true;
        }
        return false;
    }
    checkExternalLinks(pdfDoc) {
        const externalLinks = [];
        const pages = pdfDoc.getPages();
        for (const page of pages) {
            const annots = page.node.lookup(pdf_lib_1.PDFName.of('Annots'));
            if (!(annots instanceof pdf_lib_1.PDFArray))
                continue;
            for (let i = 0; i < annots.size(); i++) {
                const annot = annots.lookup(i);
                if (!(annot instanceof pdf_lib_1.PDFDict))
                    continue;
                const a = annot.lookup(pdf_lib_1.PDFName.of('A'));
                if (a instanceof pdf_lib_1.PDFDict) {
                    const s = a.lookup(pdf_lib_1.PDFName.of('S'));
                    if (s && s.toString() === '/URI') {
                        const uri = a.lookup(pdf_lib_1.PDFName.of('URI'));
                        if (uri instanceof pdf_lib_1.PDFString || uri instanceof pdf_lib_1.PDFHexString) {
                            externalLinks.push(uri.decodeText());
                        }
                    }
                }
            }
        }
        return externalLinks;
    }
    checkMultimedia(pdfDoc) {
        const pages = pdfDoc.getPages();
        for (const page of pages) {
            const annots = page.node.lookup(pdf_lib_1.PDFName.of('Annots'));
            if (!(annots instanceof pdf_lib_1.PDFArray))
                continue;
            for (let i = 0; i < annots.size(); i++) {
                const annot = annots.lookup(i);
                if (!(annot instanceof pdf_lib_1.PDFDict))
                    continue;
                const subtype = annot.lookup(pdf_lib_1.PDFName.of('Subtype'));
                if (subtype) {
                    const st = subtype.toString();
                    if (st === '/RichMedia' ||
                        st === '/Screen' ||
                        st === '/Sound' ||
                        st === '/Movie' ||
                        st === '/3D') {
                        return true;
                    }
                }
            }
        }
        return false;
    }
    checkBookmarks(pdfDoc) {
        const outlines = pdfDoc.catalog.lookup(pdf_lib_1.PDFName.of('Outlines'));
        if (!(outlines instanceof pdf_lib_1.PDFDict))
            return false;
        const first = outlines.lookup(pdf_lib_1.PDFName.of('First'));
        return !!first;
    }
    checkBookmarkZoom(pdfDoc) {
        let badZoomCount = 0;
        const outlines = pdfDoc.catalog.lookup(pdf_lib_1.PDFName.of('Outlines'));
        if (!(outlines instanceof pdf_lib_1.PDFDict))
            return 0;
        const traverseOutline = (entry) => {
            if (!(entry instanceof pdf_lib_1.PDFDict))
                return;
            const dest = entry.lookup(pdf_lib_1.PDFName.of('Dest'));
            if (dest instanceof pdf_lib_1.PDFArray && dest.size() >= 2) {
                const fitType = dest.lookup(1);
                if (fitType) {
                    const ft = fitType.toString();
                    if (ft !== '/Fit' && ft !== '/FitH' && ft !== '/FitV' && ft !== '/FitB') {
                        if (ft === '/XYZ') {
                            if (dest.size() >= 5) {
                                const zoom = dest.lookup(4);
                                if (zoom && zoom.toString() !== 'null') {
                                    badZoomCount++;
                                }
                            }
                        }
                        else {
                            badZoomCount++;
                        }
                    }
                }
            }
            const next = entry.lookup(pdf_lib_1.PDFName.of('Next'));
            if (next)
                traverseOutline(pdfDoc.context.lookup(next));
            const first = entry.lookup(pdf_lib_1.PDFName.of('First'));
            if (first)
                traverseOutline(pdfDoc.context.lookup(first));
        };
        const first = outlines.lookup(pdf_lib_1.PDFName.of('First'));
        if (first)
            traverseOutline(pdfDoc.context.lookup(first));
        return badZoomCount;
    }
    checkAttachments(pdfDoc) {
        const catalog = pdfDoc.catalog;
        const names = catalog.lookup(pdf_lib_1.PDFName.of('Names'));
        if (names instanceof pdf_lib_1.PDFDict) {
            const embeddedFiles = names.lookup(pdf_lib_1.PDFName.of('EmbeddedFiles'));
            if (embeddedFiles)
                return true;
        }
        const af = catalog.lookup(pdf_lib_1.PDFName.of('AF'));
        if (af instanceof pdf_lib_1.PDFArray && af.size() > 0)
            return true;
        return false;
    }
    checkFontEmbedding(pdfDoc) {
        const unembedded = [];
        const pages = pdfDoc.getPages();
        for (const page of pages) {
            const resources = page.node.lookup(pdf_lib_1.PDFName.of('Resources'));
            if (!(resources instanceof pdf_lib_1.PDFDict))
                continue;
            const fonts = resources.lookup(pdf_lib_1.PDFName.of('Font'));
            if (!(fonts instanceof pdf_lib_1.PDFDict))
                continue;
            const fontEntries = fonts.entries();
            for (const [, fontRef] of fontEntries) {
                const font = pdfDoc.context.lookup(fontRef);
                if (!(font instanceof pdf_lib_1.PDFDict))
                    continue;
                const baseFont = font.lookup(pdf_lib_1.PDFName.of('BaseFont'));
                const fontDesc = font.lookup(pdf_lib_1.PDFName.of('FontDescriptor'));
                if (fontDesc instanceof pdf_lib_1.PDFDict) {
                    const fontFile = fontDesc.lookup(pdf_lib_1.PDFName.of('FontFile'));
                    const fontFile2 = fontDesc.lookup(pdf_lib_1.PDFName.of('FontFile2'));
                    const fontFile3 = fontDesc.lookup(pdf_lib_1.PDFName.of('FontFile3'));
                    if (!fontFile && !fontFile2 && !fontFile3) {
                        const name = baseFont ? baseFont.toString().replace('/', '') : 'Unknown';
                        const standard14 = [
                            'Courier', 'Courier-Bold', 'Courier-BoldOblique', 'Courier-Oblique',
                            'Helvetica', 'Helvetica-Bold', 'Helvetica-BoldOblique', 'Helvetica-Oblique',
                            'Times-Roman', 'Times-Bold', 'Times-BoldItalic', 'Times-Italic',
                            'Symbol', 'ZapfDingbats',
                        ];
                        if (!standard14.includes(name) && !unembedded.includes(name)) {
                            unembedded.push(name);
                        }
                    }
                }
            }
        }
        return unembedded;
    }
};
exports.PDFComplianceService = PDFComplianceService;
exports.PDFComplianceService = PDFComplianceService = PDFComplianceService_1 = __decorate([
    (0, common_1.Injectable)()
], PDFComplianceService);
//# sourceMappingURL=pdf-compliance.service.js.map