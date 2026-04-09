import {
  Injectable,
  Inject,
  Optional,
  Logger,
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { LeafOperation, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ControlledVocabularyService } from '../controlled-vocabulary/controlled-vocabulary.service';
import {
  StudyTaggingFileService,
  StfParseResult,
  StfStudyInput,
  StfDocumentInput,
} from '../ectd/services/study-tagging-file.service';
import { MinioService } from '../file/minio.service';
import { ImportOnConflict } from './dto';

/**
 * Result returned to the controller / frontend.
 * `warnings` is never fatal — the Study is still created.
 */
export interface StfImportResult {
  studyId: string;
  created: boolean;
  warnings: string[];
}

/**
 * Internal representation of a PDF available to the import service.
 * In `importStfXml` mode this list is empty; in `importStfBundle` mode it
 * holds the attached files parsed from the multipart request.
 */
interface AttachedFileInput {
  originalName: string;
  buffer: Buffer;
  md5?: string;
}

/**
 * StudyTaggingFileImportService — round-trips an STF XML file back into the
 * v2 Study / StudyCategory / StudyDocument tables.
 *
 * Explicitly kept separate from StudyService (per Plan 12 §3.6):
 *   - StudyService owns the forward direction (DB ↔ XML generation)
 *   - This service owns the reverse direction (XML → DB)
 *
 * Separating the two keeps the import logic (which has its own conflict
 * modes, CV reverse lookups, modified-file resolution, and optional PDF
 * ingestion) from bloating the CRUD service.
 */
@Injectable()
export class StudyTaggingFileImportService {
  private readonly logger = new Logger(StudyTaggingFileImportService.name);

  constructor(
    private prisma: PrismaService,
    private stfXml: StudyTaggingFileService,
    private cvService: ControlledVocabularyService,
    @Optional() @Inject(MinioService) private minioService?: MinioService,
  ) {}

  // ==================================================================
  // Public: XML-only import
  // ==================================================================

  /**
   * Parse an STF XML string and create a Study row in the given sequenceNode.
   * PDFs referenced by the XML must already exist as FileAttachment rows in
   * the same SequenceNode; any unresolved href becomes a warning and is
   * dropped from the document list.
   */
  async importStfXml(
    sequenceNodeId: string,
    xmlString: string,
    options?: { onConflict?: ImportOnConflict },
  ): Promise<StfImportResult> {
    return this.importInternal(sequenceNodeId, xmlString, [], options?.onConflict);
  }

  // ==================================================================
  // Public: bundle import (XML + attached PDFs)
  // ==================================================================

  /**
   * Parse an STF XML string alongside a set of PDF buffers. For each
   * document href in the XML, first look for a matching attached file
   * (by basename); if found, upload it to MinIO, create a new
   * FileAttachment row, and link it. Otherwise fall back to
   * importStfXml's lookup-existing-FileAttachment behaviour.
   */
  async importStfBundle(
    sequenceNodeId: string,
    params: {
      xmlString: string;
      attachedFiles: AttachedFileInput[];
      onConflict?: ImportOnConflict;
    },
  ): Promise<StfImportResult> {
    return this.importInternal(
      sequenceNodeId,
      params.xmlString,
      params.attachedFiles,
      params.onConflict,
    );
  }

  // ==================================================================
  // Internal: shared import pipeline
  // ==================================================================

  private async importInternal(
    sequenceNodeId: string,
    xmlString: string,
    attachedFiles: AttachedFileInput[],
    onConflict: ImportOnConflict = 'reject',
  ): Promise<StfImportResult> {
    const warnings: string[] = [];

    // ---------- 1. Parse the XML ----------
    const parsed = this.stfXml.parseStfXml(xmlString);

    // ---------- 2. Basic shape validation ----------
    if (!parsed.studyId?.trim()) {
      throw new BadRequestException('STF XML 中 <study-id> 不能为空');
    }
    if (!parsed.title?.trim()) {
      throw new BadRequestException('STF XML 中 <title> 不能为空');
    }

    // ---------- 3. Load the target SequenceNode ----------
    const node = await this.prisma.sequenceNode.findUnique({
      where: { id: sequenceNodeId },
      select: {
        id: true,
        sequenceId: true,
        ctdSectionNumber: true,
        templateNodeId: true,
        templateNode: { select: { requiresStf: true, module: true } },
        sequence: {
          select: {
            applicationId: true,
            sequenceNumber: true,
          },
        },
      },
    });
    if (!node) {
      throw new NotFoundException(`节点 ${sequenceNodeId} 不存在`);
    }
    if (!node.templateNode.requiresStf) {
      throw new BadRequestException(
        `章节 ${node.ctdSectionNumber} 不允许创建研究标签文件 (STF)`,
      );
    }

    // ---------- 4. Validate category names against CV ----------
    const cvCategories = await this.cvService.getStfCategories();
    const cvCategoryNames = new Set(cvCategories.map((c) => c.name));
    const unknownCategoryNames = Array.from(
      new Set(
        parsed.categories
          .map((c) => c.name)
          .filter((name) => !cvCategoryNames.has(name)),
      ),
    );
    if (unknownCategoryNames.length > 0) {
      throw new BadRequestException({
        message: 'STF XML 中存在未知的 category 名称',
        unknownCategories: unknownCategoryNames,
      });
    }

    // Also verify the values fall within each category's value set.
    const cvCategoryValueMap = new Map<string, Set<string>>(
      cvCategories.map((c) => [
        c.name,
        new Set(c.values.map((v) => v.value)),
      ]),
    );
    const invalidCategoryValues: string[] = [];
    for (const cat of parsed.categories) {
      const valueSet = cvCategoryValueMap.get(cat.name);
      if (valueSet && !valueSet.has(cat.value)) {
        invalidCategoryValues.push(`${cat.name}="${cat.value}"`);
      }
    }
    if (invalidCategoryValues.length > 0) {
      throw new BadRequestException({
        message: 'STF XML 中存在受控词汇表外的 category 取值',
        invalidCategoryValues,
      });
    }

    // ---------- 5. Validate file-tag values against CV ----------
    const moduleKey: 'm4' | 'm5' = node.ctdSectionNumber.startsWith('4.')
      ? 'm4'
      : 'm5';
    const cvFileTagsRaw = await this.cvService.getStfFileTags(moduleKey);
    const cvFileTagSet = new Set(cvFileTagsRaw.map((t) => t.value));
    const unknownFileTags = Array.from(
      new Set(
        parsed.documents
          .map((d) => d.fileTag)
          .filter((tag) => tag && !cvFileTagSet.has(tag)),
      ),
    );
    if (unknownFileTags.length > 0) {
      throw new BadRequestException({
        message: `STF XML 中存在 ${moduleKey} 受控词汇表外的 file-tag`,
        unknownFileTags,
      });
    }

    // ---------- 6. Resolve each document.href to a FileAttachment ----------
    // Existing attachments in this node are used when nothing in
    // `attachedFiles` matches.
    const existingAttachments = await this.prisma.fileAttachment.findMany({
      where: { sequenceNodeId },
      select: {
        id: true,
        originalName: true,
        storedName: true,
        ectdRelativePath: true,
        md5Checksum: true,
        xmlLang: true,
      },
    });

    // Index attached files by basename for O(1) lookup.
    const attachedByName = new Map<string, AttachedFileInput>();
    for (const file of attachedFiles) {
      attachedByName.set(this.basename(file.originalName), file);
    }

    interface ResolvedDoc {
      parsedDoc: StfParseResult['documents'][number];
      fileAttachmentId: string;
      // Carries a "needs-create" instruction for bundle mode.
      create?: {
        buffer: Buffer;
        md5: string;
        originalName: string;
      };
    }

    const resolvedDocs: ResolvedDoc[] = [];
    for (const doc of parsed.documents) {
      const hrefBase = this.basename(doc.href);
      if (!hrefBase) {
        warnings.push(`doc-content ID="${doc.leafId}" 的 xlink:href 为空，跳过`);
        continue;
      }

      // Bundle mode: prefer a matching attached file (to be uploaded).
      const attached = attachedByName.get(hrefBase);
      if (attached) {
        const actualMd5 = attached.md5 ?? this.md5Buffer(attached.buffer);
        if (doc.checksum && actualMd5.toLowerCase() !== doc.checksum.toLowerCase()) {
          warnings.push(
            `文件 "${hrefBase}" 的 MD5 (${actualMd5}) 与 STF XML 中的 checksum (${doc.checksum}) 不一致，已使用实际 MD5`,
          );
        }
        resolvedDocs.push({
          parsedDoc: doc,
          // Filled in after the FileAttachment is created inside the transaction
          fileAttachmentId: '',
          create: {
            buffer: attached.buffer,
            md5: actualMd5,
            originalName: attached.originalName,
          },
        });
        continue;
      }

      // XML-only mode (or bundle with a missing attachment): look for an
      // existing FileAttachment on this node whose ectdRelativePath ends
      // with the same basename.
      const match = existingAttachments.find(
        (a) => this.basename(a.ectdRelativePath) === hrefBase,
      );
      if (!match) {
        warnings.push(
          `未能在节点 ${node.ctdSectionNumber} 下找到名为 "${hrefBase}" 的文件，已跳过该文档`,
        );
        continue;
      }
      resolvedDocs.push({
        parsedDoc: doc,
        fileAttachmentId: match.id,
      });
    }

    // ---------- 7. Resolve modifiedFromHref → prior Study ----------
    const modifiedFromId = await this.resolveModifiedFromStudy(
      node,
      parsed,
      warnings,
    );

    // ---------- 8. Handle conflict with existing Study ----------
    const existingStudy = await this.prisma.study.findUnique({
      where: {
        sequenceNodeId_studyId: {
          sequenceNodeId,
          studyId: parsed.studyId,
        },
      },
      select: { id: true },
    });

    if (existingStudy && onConflict === 'reject') {
      throw new ConflictException(
        `节点 ${node.ctdSectionNumber} 已存在研究编号为 "${parsed.studyId}" 的研究，` +
          `如需覆盖请传 onConflict=overwrite 或 onConflict=merge`,
      );
    }

    // ---------- 9. Work out the operation (parsed STF gives us a per-doc op) ----------
    // The top-level Study.operation is derived from the first doc's op; if all
    // are identical we pick that, otherwise we default to NEW and warn.
    const studyOperation = this.deriveStudyOperation(parsed, warnings);

    // ---------- 10. Create / overwrite / merge inside a transaction ----------
    const studyPk = await this.prisma.$transaction(async (tx) => {
      // Create any new FileAttachment rows (bundle mode).
      for (const doc of resolvedDocs) {
        if (!doc.create) continue;
        const att = await this.uploadAndCreateAttachment(
          tx,
          node,
          doc.create,
        );
        doc.fileAttachmentId = att.id;
      }

      // Re-check nothing slipped through without a fileAttachmentId.
      const attachedDocs = resolvedDocs.filter((d) => d.fileAttachmentId);

      // Overwrite mode: drop the old row (cascade deletes children).
      if (existingStudy && onConflict === 'overwrite') {
        await tx.study.delete({ where: { id: existingStudy.id } });
      }

      let studyRow: { id: string };

      if (existingStudy && onConflict === 'merge') {
        // Merge mode: keep the id but nuke children and re-create from scratch
        // so operation/modifiedFromId/title/categories/documents all reflect
        // the imported XML.
        await tx.studyCategory.deleteMany({
          where: { studyId: existingStudy.id },
        });
        await tx.studyDocument.deleteMany({
          where: { studyId: existingStudy.id },
        });
        studyRow = await tx.study.update({
          where: { id: existingStudy.id },
          data: {
            ctdSectionNumber: node.ctdSectionNumber,
            title: parsed.title,
            operation: studyOperation,
            modifiedFromId,
            categories: {
              create: parsed.categories.map((c, idx) => ({
                name: c.name,
                value: c.value,
                infoType: c.infoType || 'ich',
                sortOrder: idx,
              })),
            },
            documents: {
              create: attachedDocs.map((d, idx) => ({
                fileAttachmentId: d.fileAttachmentId,
                fileTag: d.parsedDoc.fileTag,
                fileTagInfoType: d.parsedDoc.fileTagInfoType || 'ich',
                sortOrder: idx,
              })),
            },
          },
          select: { id: true },
        });
      } else {
        // reject-path (no existing) + overwrite-path (after delete) both land here.
        const created = await tx.study.create({
          data: {
            sequenceId: node.sequenceId,
            sequenceNodeId,
            ctdSectionNumber: node.ctdSectionNumber,
            studyId: parsed.studyId,
            title: parsed.title,
            operation: studyOperation,
            modifiedFromId,
            categories: {
              create: parsed.categories.map((c, idx) => ({
                name: c.name,
                value: c.value,
                infoType: c.infoType || 'ich',
                sortOrder: idx,
              })),
            },
            documents: {
              create: attachedDocs.map((d, idx) => ({
                fileAttachmentId: d.fileAttachmentId,
                fileTag: d.parsedDoc.fileTag,
                fileTagInfoType: d.parsedDoc.fileTagInfoType || 'ich',
                sortOrder: idx,
              })),
            },
          },
          select: { id: true },
        });
        studyRow = created;
      }

      // Regenerate the cached STF XML + checksum so the round-trip is
      // self-consistent. We re-query inside the transaction so categories/
      // documents are the freshly-inserted rows.
      const full = await tx.study.findUnique({
        where: { id: studyRow.id },
        include: {
          categories: { orderBy: { sortOrder: 'asc' } },
          documents: {
            orderBy: { sortOrder: 'asc' },
            include: { fileAttachment: true },
          },
        },
      });
      if (!full) {
        throw new Error('无法在事务中重新加载刚创建的 Study');
      }
      const regenXml = this.buildStfXmlForStudy(full);
      const regenChecksum = this.stfXml.computeStfChecksum(regenXml);
      await tx.study.update({
        where: { id: studyRow.id },
        data: { stfXmlContent: regenXml, stfChecksum: regenChecksum },
      });

      return studyRow.id;
    });

    return {
      studyId: studyPk,
      created: true,
      warnings,
    };
  }

  // ==================================================================
  // Lifecycle resolution
  // ==================================================================

  /**
   * Walk application-scoped sequences in descending order looking for a
   * prior Study with the same studyId at the same templateNodeId. If any
   * parsed document carries a `modified-file` attribute but no prior can
   * be found, surface a warning (lifecycle link degraded) and return null.
   */
  private async resolveModifiedFromStudy(
    node: {
      templateNodeId: string;
      sequence: { applicationId: string; sequenceNumber: string };
    },
    parsed: StfParseResult,
    warnings: string[],
  ): Promise<string | null> {
    const hasModifiedFile = parsed.documents.some((d) => d.modifiedFromHref);
    if (!hasModifiedFile) return null;

    const prior = await this.prisma.study.findFirst({
      where: {
        studyId: parsed.studyId,
        sequenceNode: { templateNodeId: node.templateNodeId },
        sequence: {
          applicationId: node.sequence.applicationId,
          sequenceNumber: { lt: node.sequence.sequenceNumber },
        },
      },
      orderBy: { sequence: { sequenceNumber: 'desc' } },
      select: { id: true },
    });

    if (!prior) {
      warnings.push(
        `STF 中存在 modified-file 引用，但未找到前序 Study (studyId=${parsed.studyId})，生命周期链断裂`,
      );
      return null;
    }
    return prior.id;
  }

  /**
   * Inspect the per-document `operation` attributes and pick the Study-level
   * operation. If all docs share an op, use it; if they diverge or none are
   * specified, fall back to NEW and surface a warning.
   */
  private deriveStudyOperation(
    parsed: StfParseResult,
    warnings: string[],
  ): LeafOperation {
    const ops = parsed.documents
      .map((d) => (d.operation ?? '').toLowerCase())
      .filter((op) => op.length > 0);
    if (ops.length === 0) return LeafOperation.NEW;
    const unique = Array.from(new Set(ops));
    if (unique.length > 1) {
      warnings.push(
        `STF XML 中不同 doc-content 的 operation 不一致 (${unique.join(', ')})，已回退为 NEW`,
      );
      return LeafOperation.NEW;
    }
    switch (unique[0]) {
      case 'new':
        return LeafOperation.NEW;
      case 'replace':
        return LeafOperation.REPLACE;
      case 'append':
        return LeafOperation.APPEND;
      case 'delete':
        return LeafOperation.DELETE;
      default:
        warnings.push(
          `STF XML 中 operation="${unique[0]}" 不在允许集内，已回退为 NEW`,
        );
        return LeafOperation.NEW;
    }
  }

  // ==================================================================
  // Bundle mode: upload + create FileAttachment
  // ==================================================================

  private async uploadAndCreateAttachment(
    tx: Prisma.TransactionClient,
    node: {
      id: string;
      sequenceId: string;
      ctdSectionNumber: string;
      sequence: { applicationId: string; sequenceNumber: string };
    },
    create: { buffer: Buffer; md5: string; originalName: string },
  ): Promise<{ id: string }> {
    // Storage path mirrors the convention in FileService.uploadFile:
    // {applicationId}/{sequenceNumber}/{ectdRelativePath}. We keep it local
    // (no projectId lookup) because MinioService doesn't care what the
    // leading segments are — only that the object name is unique.
    const ext = this.extname(create.originalName);
    const normalizedName = create.originalName.toLowerCase().replace(/\s+/g, '-');
    const ectdRelativePath = this.buildEctdRelativePath(
      node.ctdSectionNumber,
      normalizedName,
    );
    const storagePath = [
      node.sequence.applicationId,
      node.sequence.sequenceNumber,
      ectdRelativePath,
    ].join('/');

    if (this.minioService) {
      try {
        const contentType =
          ext === '.pdf' ? 'application/pdf' : 'application/octet-stream';
        await this.minioService.uploadFile(
          storagePath,
          create.buffer,
          contentType,
        );
      } catch (err) {
        this.logger.warn(
          `MinIO 上传失败 (objectName=${storagePath}): ${err instanceof Error ? err.message : String(err)}; 继续创建 FileAttachment 记录`,
        );
      }
    } else {
      this.logger.warn(
        'MinioService 未注入，跳过实际上传，只创建 FileAttachment 元数据记录',
      );
    }

    const attachment = await tx.fileAttachment.create({
      data: {
        sequenceNodeId: node.id,
        originalName: create.originalName,
        storedName: normalizedName,
        storagePath,
        ectdRelativePath,
        fileType: ext,
        fileSize: BigInt(create.buffer.length),
        md5Checksum: create.md5,
        xmlLang: 'zh',
        isReference: false,
      },
      select: { id: true },
    });

    return attachment;
  }

  // ==================================================================
  // XML regeneration (mirrors StudyService.buildStfXmlForStudy)
  // ==================================================================

  private buildStfXmlForStudy(study: {
    id: string;
    studyId: string;
    title: string;
    operation: LeafOperation;
    categories: Array<{ name: string; value: string; infoType: string }>;
    documents: Array<{
      fileTag: string;
      fileTagInfoType: string;
      fileAttachment: {
        ectdRelativePath: string;
        md5Checksum: string;
        xmlLang: string;
      };
    }>;
  }): string {
    const docs: StfDocumentInput[] = study.documents.map((d, idx) => {
      const baseName = this.basename(d.fileAttachment.ectdRelativePath);
      return {
        leafId: `${this.normalizeLeafIdPart(study.studyId)}-${idx}`,
        href: baseName,
        title: d.fileTag,
        checksum: d.fileAttachment.md5Checksum,
        fileTag: d.fileTag,
        fileTagInfoType: d.fileTagInfoType,
        xmlLang: d.fileAttachment.xmlLang || undefined,
      };
    });
    const input: StfStudyInput = {
      id: study.id,
      studyId: study.studyId,
      title: study.title,
      operation: study.operation as StfStudyInput['operation'],
      categories: study.categories.map((c) => ({
        name: c.name,
        value: c.value,
        infoType: c.infoType,
      })),
      documents: docs,
    };
    return this.stfXml.generateStfXml(input);
  }

  // ==================================================================
  // Helpers
  // ==================================================================

  private basename(p: string): string {
    if (!p) return '';
    // Strip both forward and back slashes so uploads from Windows don't
    // smuggle directories into "basename".
    const idx = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'));
    return idx >= 0 ? p.substring(idx + 1) : p;
  }

  private extname(p: string): string {
    const base = this.basename(p);
    const idx = base.lastIndexOf('.');
    return idx >= 0 ? base.substring(idx).toLowerCase() : '';
  }

  private md5Buffer(buffer: Buffer): string {
    return createHash('md5').update(buffer).digest('hex');
  }

  private normalizeLeafIdPart(id: string): string {
    return id
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  /**
   * Build a simple eCTD relative path from a CTD section number and a
   * normalized file name. We mirror FileNameNormalizerService's shape
   * (m{module}/{slug}/{name}) without importing the normalizer, since this
   * fallback path only runs in bundle mode and the frontend's real upload
   * flow should still route through FileService.uploadFile.
   */
  private buildEctdRelativePath(
    ctdSectionNumber: string,
    normalizedName: string,
  ): string {
    const moduleDigit = ctdSectionNumber.split('.')[0];
    return `m${moduleDigit}/${ctdSectionNumber}/${normalizedName}`;
  }
}
