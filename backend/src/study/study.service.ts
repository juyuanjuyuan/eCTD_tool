import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { LeafOperation, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ControlledVocabularyService } from '../controlled-vocabulary/controlled-vocabulary.service';
import {
  StudyTaggingFileService,
  StfStudyInput,
  StfDocumentInput,
} from '../ectd/services/study-tagging-file.service';
import { CreateStudyDto, UpdateStudyDto } from './dto';
import { parseJsonField } from '../common/json-field.helper';

/**
 * Result of metadata validation. `valid` is true iff `errors` is empty.
 * `warnings` are surfaced to the UI but do not block save.
 */
export interface StudyMetadataValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * StudyService — orchestrates Study + StudyCategory + StudyDocument writes,
 * validates metadata against the controlled-vocabulary table, regenerates the
 * cached STF XML on every save via StudyTaggingFileService, and resolves
 * lifecycle modifiedFromId for REPLACE / APPEND / DELETE operations.
 *
 * It does NOT touch index.xml / cn-regional.xml — those are regenerated on
 * package assembly via the existing IndexXmlService / package-assembler
 * pipeline.
 */
@Injectable()
export class StudyService {
  private readonly logger = new Logger(StudyService.name);

  constructor(
    private prisma: PrismaService,
    private cvService: ControlledVocabularyService,
    private stfXml: StudyTaggingFileService,
  ) {}

  // ==================================================================
  // Read
  // ==================================================================

  async listBySequence(sequenceId: string) {
    return this.prisma.study.findMany({
      where: { sequenceId },
      include: {
        categories: { orderBy: { sortOrder: 'asc' } },
        documents: {
          orderBy: { sortOrder: 'asc' },
          include: { fileAttachment: true },
        },
      },
      orderBy: [{ ctdSectionNumber: 'asc' }, { studyId: 'asc' }],
    });
  }

  async listByNode(sequenceNodeId: string) {
    return this.prisma.study.findMany({
      where: { sequenceNodeId },
      include: {
        categories: { orderBy: { sortOrder: 'asc' } },
        documents: {
          orderBy: { sortOrder: 'asc' },
          include: { fileAttachment: true },
        },
      },
      orderBy: { studyId: 'asc' },
    });
  }

  async getById(id: string) {
    const study = await this.prisma.study.findUnique({
      where: { id },
      include: {
        categories: { orderBy: { sortOrder: 'asc' } },
        documents: {
          orderBy: { sortOrder: 'asc' },
          include: { fileAttachment: true },
        },
        sequenceNode: { select: { id: true, ctdSectionNumber: true, title: true } },
      },
    });
    if (!study) throw new NotFoundException(`研究 ${id} 不存在`);
    return study;
  }

  // ==================================================================
  // Create / Update / Delete
  // ==================================================================

  async create(sequenceNodeId: string, dto: CreateStudyDto) {
    const node = await this.loadNode(sequenceNodeId);
    this.assertStfAllowed(node);

    // Reject duplicate (sequenceNodeId, studyId) early so the user gets a
    // clean error instead of a Prisma unique-violation surface.
    const existing = await this.prisma.study.findUnique({
      where: {
        sequenceNodeId_studyId: { sequenceNodeId, studyId: dto.studyId },
      },
    });
    if (existing) {
      throw new ConflictException(
        `节点 ${node.ctdSectionNumber} 已存在研究编号为 ${dto.studyId} 的研究`,
      );
    }

    const operation = dto.operation ?? LeafOperation.NEW;
    const validation = await this.validateMetadata(node.ctdSectionNumber, dto);
    if (!validation.valid) {
      throw new BadRequestException({
        message: '研究元数据校验失败',
        errors: validation.errors,
        warnings: validation.warnings,
      });
    }

    const modifiedFromId = await this.resolveModifiedFromId(
      sequenceNodeId,
      dto.studyId,
      operation,
      dto.modifiedFromId,
    );

    // Pre-load the file attachments referenced by the document inputs so we
    // can compute hrefs and checksums for the STF XML in the same transaction.
    const fileAttachments = await this.loadFileAttachments(
      dto.documents.map((d) => d.fileAttachmentId),
    );

    return this.prisma.$transaction(async (tx) => {
      const created = await tx.study.create({
        data: {
          sequenceId: node.sequenceId,
          sequenceNodeId,
          ctdSectionNumber: node.ctdSectionNumber,
          studyId: dto.studyId,
          title: dto.title,
          operation,
          modifiedFromId: modifiedFromId ?? null,
          categories: {
            create: dto.categories.map((c, idx) => ({
              name: c.name,
              value: c.value,
              infoType: c.infoType ?? 'ich',
              sortOrder: c.sortOrder ?? idx,
            })),
          },
          documents: {
            create: dto.documents.map((d, idx) => ({
              fileAttachmentId: d.fileAttachmentId,
              fileTag: d.fileTag,
              fileTagInfoType: d.fileTagInfoType ?? 'ich',
              sortOrder: d.sortOrder ?? idx,
            })),
          },
        },
        include: {
          categories: { orderBy: { sortOrder: 'asc' } },
          documents: {
            orderBy: { sortOrder: 'asc' },
            include: { fileAttachment: true },
          },
        },
      });

      // Generate the STF XML in the same transaction so the cached
      // stfXmlContent + stfChecksum stay consistent with the row.
      const xml = this.buildStfXmlForStudy(created, fileAttachments);
      const checksum = this.stfXml.computeStfChecksum(xml);
      return tx.study.update({
        where: { id: created.id },
        data: { stfXmlContent: xml, stfChecksum: checksum },
        include: {
          categories: { orderBy: { sortOrder: 'asc' } },
          documents: {
            orderBy: { sortOrder: 'asc' },
            include: { fileAttachment: true },
          },
        },
      });
    });
  }

  async update(id: string, dto: UpdateStudyDto) {
    const existing = await this.getById(id);

    // Build the merged shape used for validation + STF regen
    const merged = {
      studyId: dto.studyId ?? existing.studyId,
      title: dto.title ?? existing.title,
      operation: dto.operation ?? existing.operation,
      categories:
        dto.categories ??
        existing.categories.map((c) => ({
          name: c.name,
          value: c.value,
          infoType: c.infoType,
          sortOrder: c.sortOrder,
        })),
      documents:
        dto.documents ??
        existing.documents.map((d) => ({
          fileAttachmentId: d.fileAttachmentId,
          fileTag: d.fileTag,
          fileTagInfoType: d.fileTagInfoType,
          sortOrder: d.sortOrder,
        })),
    };

    const validation = await this.validateMetadata(
      existing.ctdSectionNumber,
      merged,
    );
    if (!validation.valid) {
      throw new BadRequestException({
        message: '研究元数据校验失败',
        errors: validation.errors,
        warnings: validation.warnings,
      });
    }

    const modifiedFromId =
      dto.modifiedFromId !== undefined
        ? dto.modifiedFromId
        : await this.resolveModifiedFromId(
            existing.sequenceNodeId,
            merged.studyId,
            merged.operation,
            existing.modifiedFromId ?? undefined,
          );

    const fileAttachments = await this.loadFileAttachments(
      merged.documents.map((d) => d.fileAttachmentId),
    );

    return this.prisma.$transaction(async (tx) => {
      // Wipe-and-recreate the child rows so reordering, removals, and adds
      // are handled in one shot. Cleaner than diffing for this volume.
      if (dto.categories !== undefined) {
        await tx.studyCategory.deleteMany({ where: { studyId: id } });
      }
      if (dto.documents !== undefined) {
        await tx.studyDocument.deleteMany({ where: { studyId: id } });
      }

      const updated = await tx.study.update({
        where: { id },
        data: {
          studyId: merged.studyId,
          title: merged.title,
          operation: merged.operation,
          modifiedFromId,
          ...(dto.categories !== undefined
            ? {
                categories: {
                  create: merged.categories.map((c, idx) => ({
                    name: c.name,
                    value: c.value,
                    infoType: c.infoType ?? 'ich',
                    sortOrder: c.sortOrder ?? idx,
                  })),
                },
              }
            : {}),
          ...(dto.documents !== undefined
            ? {
                documents: {
                  create: merged.documents.map((d, idx) => ({
                    fileAttachmentId: d.fileAttachmentId,
                    fileTag: d.fileTag,
                    fileTagInfoType: d.fileTagInfoType ?? 'ich',
                    sortOrder: d.sortOrder ?? idx,
                  })),
                },
              }
            : {}),
        },
        include: {
          categories: { orderBy: { sortOrder: 'asc' } },
          documents: {
            orderBy: { sortOrder: 'asc' },
            include: { fileAttachment: true },
          },
        },
      });

      const xml = this.buildStfXmlForStudy(updated, fileAttachments);
      const checksum = this.stfXml.computeStfChecksum(xml);
      return tx.study.update({
        where: { id: updated.id },
        data: { stfXmlContent: xml, stfChecksum: checksum },
        include: {
          categories: { orderBy: { sortOrder: 'asc' } },
          documents: {
            orderBy: { sortOrder: 'asc' },
            include: { fileAttachment: true },
          },
        },
      });
    });
  }

  async delete(id: string) {
    const existing = await this.prisma.study.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`研究 ${id} 不存在`);
    await this.prisma.study.delete({ where: { id } });
    return { id, deleted: true };
  }

  /**
   * Force-regenerate the cached STF XML for an existing study without
   * mutating any other field. Useful after a referenced PDF's checksum
   * changes (e.g. user re-uploaded the file under the same id).
   */
  async regenerateXml(id: string) {
    const existing = await this.getById(id);
    const fileAttachments = await this.loadFileAttachments(
      existing.documents.map((d) => d.fileAttachmentId),
    );
    const xml = this.buildStfXmlForStudy(existing, fileAttachments);
    const checksum = this.stfXml.computeStfChecksum(xml);
    return this.prisma.study.update({
      where: { id },
      data: { stfXmlContent: xml, stfChecksum: checksum },
      include: {
        categories: { orderBy: { sortOrder: 'asc' } },
        documents: {
          orderBy: { sortOrder: 'asc' },
          include: { fileAttachment: true },
        },
      },
    });
  }

  // ==================================================================
  // Validation against the controlled-vocabulary table
  // ==================================================================

  async validateMetadata(
    ctdSectionNumber: string,
    payload: {
      studyId: string;
      title: string;
      categories: Array<{ name: string; value: string }>;
      documents: Array<{ fileTag: string }>;
    },
  ): Promise<StudyMetadataValidation> {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!payload.studyId?.trim()) errors.push('studyId 不能为空');
    if (!payload.title?.trim()) errors.push('title 不能为空');

    // Categories: name and value must both come from the CV table
    const categoryNames = new Set<string>();
    const cvCategories = await this.cvService.getStfCategories();
    const cvCategoryMap = new Map<string, Set<string>>(
      cvCategories.map((c) => [c.name, new Set(c.values.map((v) => v.value))]),
    );

    for (const cat of payload.categories ?? []) {
      if (!cvCategoryMap.has(cat.name)) {
        errors.push(`category 名称 "${cat.name}" 不在受控词汇表内`);
        continue;
      }
      if (!cvCategoryMap.get(cat.name)!.has(cat.value)) {
        errors.push(
          `category "${cat.name}" 的值 "${cat.value}" 不在受控词汇表内`,
        );
      }
      if (categoryNames.has(cat.name)) {
        errors.push(`category "${cat.name}" 重复，每个 study 同名 category 只能出现一次`);
      }
      categoryNames.add(cat.name);
    }

    // file-tags: must come from the CV table for the relevant module (m4 / m5)
    const moduleKey: 'm4' | 'm5' = ctdSectionNumber.startsWith('4.')
      ? 'm4'
      : 'm5';
    const cvFileTagsRaw = await this.cvService.getStfFileTags(moduleKey);
    const cvFileTagSet = new Set(cvFileTagsRaw.map((t) => t.value));

    for (const doc of payload.documents ?? []) {
      if (!cvFileTagSet.has(doc.fileTag)) {
        errors.push(
          `file-tag "${doc.fileTag}" 不在 ${moduleKey} 的受控词汇表内`,
        );
      }
    }

    // Coverage warning: if the section has defaultStfCategories that are
    // marked required, but the user didn't supply them, surface a warning.
    const node = await this.prisma.ctdTemplateNode.findFirst({
      where: { ctdSectionNumber },
      select: { defaultStfCategories: true },
    });
    const defaults = parseJsonField<Array<{ name: string; required?: boolean }> | null>(
      node?.defaultStfCategories as string | Array<{ name: string; required?: boolean }> | null,
      null,
    );
    if (Array.isArray(defaults)) {
      for (const def of defaults) {
        if (def.required && !categoryNames.has(def.name)) {
          warnings.push(
            `章节 ${ctdSectionNumber} 建议提供 category "${def.name}"`,
          );
        }
      }
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  // ==================================================================
  // Lifecycle resolution
  // ==================================================================

  /**
   * For REPLACE / APPEND / DELETE: locate the prior `Study` row that this
   * one supersedes. Walks application-scoped sequences in descending order
   * looking for a Study at the same templateNode with the same studyId.
   *
   * Returns:
   * - the explicit modifiedFromId from the DTO if provided
   * - the auto-resolved Study.id if found
   * - null if operation is NEW (no lifecycle linkage needed)
   * - throws BadRequestException if non-NEW operation but no prior found
   */
  private async resolveModifiedFromId(
    sequenceNodeId: string,
    studyId: string,
    operation: LeafOperation,
    explicitId?: string,
  ): Promise<string | null> {
    if (operation === LeafOperation.NEW) return null;
    if (explicitId) return explicitId;

    // Find the application this node lives in, then walk all of its sequences
    // looking for a study with the same studyId at the same templateNode.
    const node = await this.prisma.sequenceNode.findUnique({
      where: { id: sequenceNodeId },
      select: {
        templateNodeId: true,
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

    const candidates = await this.prisma.study.findMany({
      where: {
        studyId,
        sequenceNode: { templateNodeId: node.templateNodeId },
        sequence: {
          applicationId: node.sequence.applicationId,
          sequenceNumber: { lt: node.sequence.sequenceNumber },
        },
      },
      orderBy: { sequence: { sequenceNumber: 'desc' } },
      take: 1,
    });

    if (candidates.length === 0) {
      throw new BadRequestException(
        `操作 ${operation} 需要存在前序研究，但在本申请中未找到 studyId="${studyId}" 的前序记录`,
      );
    }
    return candidates[0].id;
  }

  // ==================================================================
  // STF XML construction
  // ==================================================================

  /**
   * Build the StfStudyInput shape and call StudyTaggingFileService. The
   * `href` for each document is computed as the basename of the file's
   * ectdRelativePath, since per locked decision 2 the STF lives in the same
   * directory as its referenced PDFs.
   */
  private buildStfXmlForStudy(
    study: {
      id: string;
      studyId: string;
      title: string;
      operation: LeafOperation;
      modifiedFromId: string | null;
      categories: Array<{ name: string; value: string; infoType: string }>;
      documents: Array<{
        id: string;
        fileTag: string;
        fileTagInfoType: string;
        fileAttachment: { ectdRelativePath: string; md5Checksum: string; xmlLang: string };
      }>;
    },
    _fileAttachments: Map<string, { ectdRelativePath: string }>,
  ): string {
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

  private async loadNode(sequenceNodeId: string) {
    const node = await this.prisma.sequenceNode.findUnique({
      where: { id: sequenceNodeId },
      select: {
        id: true,
        sequenceId: true,
        ctdSectionNumber: true,
        title: true,
        templateNode: { select: { requiresStf: true, module: true } },
      },
    });
    if (!node) {
      throw new NotFoundException(`节点 ${sequenceNodeId} 不存在`);
    }
    return node;
  }

  private assertStfAllowed(node: {
    ctdSectionNumber: string;
    templateNode: { requiresStf: boolean };
  }) {
    if (!node.templateNode.requiresStf) {
      throw new BadRequestException(
        `章节 ${node.ctdSectionNumber} 不允许创建研究标签文件 (STF)`,
      );
    }
  }

  private async loadFileAttachments(ids: string[]) {
    if (ids.length === 0) return new Map<string, { ectdRelativePath: string }>();
    const rows = await this.prisma.fileAttachment.findMany({
      where: { id: { in: ids } },
      select: { id: true, ectdRelativePath: true },
    });
    if (rows.length !== ids.length) {
      const missing = ids.filter((id) => !rows.some((r) => r.id === id));
      throw new BadRequestException(
        `以下文件不存在: ${missing.join(', ')}`,
      );
    }
    return new Map(rows.map((r) => [r.id, { ectdRelativePath: r.ectdRelativePath }]));
  }

  private basename(p: string): string {
    const idx = p.lastIndexOf('/');
    return idx >= 0 ? p.substring(idx + 1) : p;
  }

  /** Normalize a study-id into [a-z0-9-_] for safe use as a leaf ID. */
  private normalizeLeafIdPart(id: string): string {
    return id
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }
}
