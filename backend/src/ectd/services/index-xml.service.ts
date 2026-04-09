import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Md5Service } from './md5.service';

// Elements that require specific backbone attributes
const SUBSTANCE_ELEMENTS = new Set([
  'm2-3-s-drug-substance',
  'm3-2-s-drug-substance',
]);
const PRODUCT_ELEMENTS = new Set([
  'm2-3-p-drug-product',
  'm3-2-p-drug-product',
]);
const INDICATION_ELEMENTS = new Set([
  'm2-7-3-summary-of-clinical-efficacy',
]);
// m5-3-5 also has indication=#REQUIRED per DTD
const INDICATION_ELEMENTS_M5 = new Set([
  'm5-3-5-reports-of-efficacy-and-safety-studies',
]);

interface SequenceNodeTree {
  id: string;
  templateNodeId: string;
  elementName: string;
  ctdSectionNumber: string;
  title: string;
  operation: string | null;
  isLeaf: boolean;
  substance: string | null;
  manufacturer: string | null;
  productName: string | null;
  dosageForm: string | null;
  indication: string | null;
  // Plan 12: M4 4.2.x and M5 5.3.1-5.3.5 leaves are emitted as references to
  // STF files rather than directly to PDFs. requiresStf gates that branch.
  requiresStf: boolean;
  children: SequenceNodeTree[];
  fileAttachments: Array<{
    ectdRelativePath: string;
    md5Checksum: string;
    xmlLang: string;
  }>;
  studies: StudyLeafInput[];
}

/**
 * Snapshot of a Study + its first document, used to derive the STF file path
 * within the eCTD package and to emit a leaf referencing it from index.xml.
 */
interface StudyLeafInput {
  id: string;
  studyId: string;
  title: string;
  operation: string;
  stfChecksum: string | null;
  /** Path of any one of the study's PDFs, used as the STF directory anchor. */
  anchorEctdRelativePath: string | null;
}

@Injectable()
export class IndexXmlService {
  private readonly logger = new Logger(IndexXmlService.name);

  constructor(
    private prisma: PrismaService,
    private md5Service: Md5Service,
  ) {}

  /**
   * Generate index.xml (ICH backbone for modules 2-5)
   */
  async generateIndexXml(sequenceId: string): Promise<string> {
    const sequence = await this.prisma.sequence.findUnique({
      where: { id: sequenceId },
      select: {
        id: true,
        sequenceNumber: true,
        regulatoryActivity: { select: { applicationId: true } },
      },
    });
    if (!sequence) throw new Error(`序列 ${sequenceId} 不存在`);

    // Load prior sequence mapping for modified-file references
    const priorLeafIdMap = await this.buildPriorLeafIdMap({
      id: sequence.id,
      sequenceNumber: sequence.sequenceNumber,
      applicationId: sequence.regulatoryActivity.applicationId,
    });

    const moduleRoots = await this.loadModuleNodes(sequenceId);
    return this.buildXml(sequenceId, moduleRoots, priorLeafIdMap);
  }

  /**
   * Build a map from templateNodeId -> prior sequence leaf ID
   * for REPLACE/DELETE/APPEND operations' modified-file attribute.
   *
   * Scope: the entire application, under method C. Walks all prior sequences
   * (across RAs) in descending order and records the first occurrence per
   * templateNodeId, i.e. the most recent prior operation for that template.
   */
  private async buildPriorLeafIdMap(
    sequence: { id: string; sequenceNumber: string; applicationId: string },
  ): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    if (sequence.sequenceNumber === '0000') return map;

    const priorSequences = await this.prisma.sequence.findMany({
      where: {
        regulatoryActivity: { applicationId: sequence.applicationId },
        sequenceNumber: { lt: sequence.sequenceNumber },
      },
      orderBy: { sequenceNumber: 'desc' },
      select: { id: true },
    });

    // For each prior sequence (most recent first), find leaf nodes and
    // record the most recent occurrence of each templateNodeId.
    for (const priorSeq of priorSequences) {
      const priorNodes = await this.prisma.sequenceNode.findMany({
        where: {
          sequenceId: priorSeq.id,
          isLeaf: true,
          operation: { not: null },
          templateNode: { module: { gte: 2 } },
        },
        select: { id: true, templateNodeId: true },
      });

      for (const node of priorNodes) {
        if (!map.has(node.templateNodeId)) {
          // Generate the deterministic leaf ID that was used for this node in the prior sequence
          map.set(node.templateNodeId, this.md5Service.generateDeterministicLeafId(priorSeq.id, node.id));
        }
      }
    }

    return map;
  }

  private async loadModuleNodes(sequenceId: string): Promise<SequenceNodeTree[]> {
    const allNodes = await this.prisma.sequenceNode.findMany({
      where: { sequenceId },
      include: {
        templateNode: { select: { module: true, requiresStf: true } },
        fileAttachments: {
          select: {
            ectdRelativePath: true,
            md5Checksum: true,
            xmlLang: true,
          },
        },
        studies: {
          orderBy: { studyId: 'asc' },
          include: {
            documents: {
              orderBy: { sortOrder: 'asc' },
              take: 1,
              include: {
                fileAttachment: { select: { ectdRelativePath: true } },
              },
            },
          },
        },
      },
      orderBy: { sortOrder: 'asc' },
    });

    // Filter to modules 2-5 only
    const ichNodes = allNodes.filter((n) => n.templateNode.module >= 2);

    // Build tree
    const nodeMap = new Map<string, SequenceNodeTree>();
    for (const node of ichNodes) {
      nodeMap.set(node.id, {
        id: node.id,
        templateNodeId: node.templateNodeId,
        elementName: node.elementName,
        ctdSectionNumber: node.ctdSectionNumber,
        title: node.title,
        operation: node.operation,
        isLeaf: node.isLeaf,
        substance: node.substance,
        manufacturer: node.manufacturer,
        productName: node.productName,
        dosageForm: node.dosageForm,
        indication: node.indication,
        requiresStf: node.templateNode.requiresStf,
        children: [],
        fileAttachments: node.fileAttachments,
        // Defensive default: legacy mocks (and the prior PDF-leaf code path)
        // do not populate `studies`. Treat missing as empty.
        studies: (node.studies ?? []).map((s): StudyLeafInput => ({
          id: s.id,
          studyId: s.studyId,
          title: s.title,
          operation: s.operation,
          stfChecksum: s.stfChecksum,
          anchorEctdRelativePath:
            s.documents[0]?.fileAttachment?.ectdRelativePath ?? null,
        })),
      });
    }

    const roots: SequenceNodeTree[] = [];
    for (const node of ichNodes) {
      const treeNode = nodeMap.get(node.id)!;
      if (node.parentId && nodeMap.has(node.parentId)) {
        nodeMap.get(node.parentId)!.children.push(treeNode);
      } else {
        roots.push(treeNode);
      }
    }

    return roots;
  }

  private buildXml(
    sequenceId: string,
    moduleRoots: SequenceNodeTree[],
    priorLeafIdMap: Map<string, string>,
  ): string {
    const lines: string[] = [];

    // XML declaration + DTD reference + stylesheet
    lines.push('<?xml version="1.0" encoding="UTF-8"?>');
    lines.push('<!DOCTYPE ectd:ectd SYSTEM "util/dtd/ich-ectd-3-2.dtd">');
    lines.push('<?xml-stylesheet type="text/xsl" href="util/style/ectd-2-0.xsl"?>');

    // Root element
    lines.push(
      '<ectd:ectd xmlns:ectd="http://www.ich.org/ectd"',
      '           xmlns:xlink="http://www.w3.org/1999/xlink">',
    );

    // Build each module (m2-m5)
    for (const root of moduleRoots) {
      if (this.hasActiveLeaves(root)) {
        this.buildElement(lines, root, '  ', sequenceId, priorLeafIdMap);
      }
    }

    lines.push('</ectd:ectd>');
    return lines.join('\n');
  }

  private buildElement(
    lines: string[],
    node: SequenceNodeTree,
    indent: string,
    sequenceId: string,
    priorLeafIdMap: Map<string, string>,
  ): void {
    if (node.isLeaf) {
      this.buildLeafElements(lines, node, indent, sequenceId, priorLeafIdMap);
      return;
    }

    // Handle extension nodes
    if (node.elementName === 'node-extension') {
      this.buildNodeExtension(lines, node, indent, sequenceId, priorLeafIdMap);
      return;
    }

    // Section element with possible backbone attributes
    const attrs = this.buildBackboneAttributes(node);
    const openTag = attrs
      ? `${indent}<${node.elementName} ${attrs}>`
      : `${indent}<${node.elementName}>`;

    lines.push(openTag);

    for (const child of node.children) {
      if (this.hasActiveLeaves(child)) {
        this.buildElement(lines, child, indent + '  ', sequenceId, priorLeafIdMap);
      }
    }

    lines.push(`${indent}</${node.elementName}>`);
  }

  private buildNodeExtension(
    lines: string[],
    node: SequenceNodeTree,
    indent: string,
    sequenceId: string,
    priorLeafIdMap: Map<string, string>,
  ): void {
    lines.push(`${indent}<node-extension>`);
    lines.push(`${indent}  <title>${this.escapeXml(node.title)}</title>`);

    // Extension nodes contain leaves
    for (const child of node.children) {
      this.buildLeafElements(lines, child, indent + '  ', sequenceId, priorLeafIdMap);
    }
    // If the extension itself is a leaf (has files)
    if (node.fileAttachments.length > 0 && node.operation) {
      this.buildLeafFromAttachments(lines, node, indent + '  ', sequenceId, priorLeafIdMap);
    }

    lines.push(`${indent}</node-extension>`);
  }

  private buildLeafElements(
    lines: string[],
    node: SequenceNodeTree,
    indent: string,
    sequenceId: string,
    priorLeafIdMap: Map<string, string>,
  ): void {
    if (!node.operation) return;

    this.buildLeafFromAttachments(lines, node, indent, sequenceId, priorLeafIdMap);
  }

  private buildLeafFromAttachments(
    lines: string[],
    node: SequenceNodeTree,
    indent: string,
    sequenceId: string,
    priorLeafIdMap: Map<string, string>,
  ): void {
    const op = node.operation!.toLowerCase();
    const modifiedFile = ['replace', 'delete', 'append'].includes(op)
      ? priorLeafIdMap.get(node.templateNodeId)
      : undefined;

    // Plan 12: M4 4.2.x and M5 5.3.1-5.3.5 leaves point at STF files instead
    // of directly at PDFs. The PDF references live inside each STF's
    // <doc-content> elements (handled by package-assembler + StudyTaggingFileService).
    if (node.requiresStf && node.studies.length > 0) {
      this.buildStfLeaves(lines, node, indent, sequenceId, priorLeafIdMap);
      return;
    }

    if (node.fileAttachments.length > 0) {
      for (let i = 0; i < node.fileAttachments.length; i++) {
        const file = node.fileAttachments[i];
        const leafId = this.md5Service.generateDeterministicLeafId(sequenceId, node.id, i);
        const attrs = this.buildLeafAttrs(leafId, op, file, modifiedFile);
        lines.push(`${indent}<leaf ${attrs}>`);
        lines.push(`${indent}  <title>${this.escapeXml(node.title)}</title>`);
        lines.push(`${indent}</leaf>`);
      }
    } else if (op === 'delete') {
      const leafId = this.md5Service.generateDeterministicLeafId(sequenceId, node.id);
      const deleteAttrs = [`ID="${leafId}"`, `operation="delete"`];
      if (modifiedFile) {
        deleteAttrs.push(`modified-file="${modifiedFile}"`);
      }
      lines.push(`${indent}<leaf ${deleteAttrs.join(' ')}>`);
      lines.push(`${indent}  <title>${this.escapeXml(node.title)}</title>`);
      lines.push(`${indent}</leaf>`);
    }
  }

  /**
   * Plan 12: emit one <leaf> per Study attached to a STF-required node. Each
   * leaf references the STF XML file (not the underlying PDFs). The STF lives
   * in the same directory as its referenced PDFs (decision 2), so we derive
   * the STF's eCTD-relative path by stripping the basename off any of the
   * study's documents and appending `<normalized-study-id>.xml`.
   *
   * If a study has no documents (legacy / partial state), we skip it and
   * leave the validator to surface a missing-document error.
   */
  private buildStfLeaves(
    lines: string[],
    node: SequenceNodeTree,
    indent: string,
    sequenceId: string,
    priorLeafIdMap: Map<string, string>,
  ): void {
    for (let i = 0; i < node.studies.length; i++) {
      const study = node.studies[i];
      if (!study.anchorEctdRelativePath) continue;

      const stfRelPath = this.deriveStfPath(
        study.anchorEctdRelativePath,
        study.studyId,
      );
      const op = study.operation.toLowerCase();
      const modifiedFile = ['replace', 'delete', 'append'].includes(op)
        ? priorLeafIdMap.get(node.templateNodeId)
        : undefined;

      // Use a deterministic id with the index so multiple studies under the
      // same node get distinct IDs without colliding with PDF-leaf ids.
      const leafId = this.md5Service.generateDeterministicLeafId(
        sequenceId,
        node.id,
        // offset by a large number so STF leaf IDs never collide with PDF
        // leaf IDs from the legacy fallback path
        10000 + i,
      );

      const parts: string[] = [`ID="${leafId}"`, `operation="${op}"`];
      if (modifiedFile) parts.push(`modified-file="${modifiedFile}"`);
      if (op !== 'delete') {
        parts.push(`xlink:href="${this.escapeXml(stfRelPath)}"`);
        parts.push(`xlink:type="simple"`);
        parts.push(`checksum="${study.stfChecksum ?? ''}"`);
        parts.push(`checksum-type="MD5"`);
      }

      lines.push(`${indent}<leaf ${parts.join('\n              ')}>`);
      lines.push(
        `${indent}  <title>${this.escapeXml(study.title || node.title)}</title>`,
      );
      lines.push(`${indent}</leaf>`);
    }
  }

  /**
   * Strip the basename off `<dir>/<file.pdf>` and append a normalized
   * `<study-id>.xml` to keep the STF in the same folder as its PDFs.
   */
  private deriveStfPath(anchorPath: string, studyId: string): string {
    const idx = anchorPath.lastIndexOf('/');
    const dir = idx >= 0 ? anchorPath.substring(0, idx) : '';
    const slug = studyId
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '');
    const fileName = `study-${slug}.xml`;
    return dir ? `${dir}/${fileName}` : fileName;
  }

  private buildLeafAttrs(
    leafId: string,
    operation: string,
    file: { ectdRelativePath: string; md5Checksum: string; xmlLang: string },
    modifiedFile?: string,
  ): string {
    const parts: string[] = [`ID="${leafId}"`, `operation="${operation}"`];

    if (modifiedFile) {
      parts.push(`modified-file="${modifiedFile}"`);
    }

    if (operation !== 'delete') {
      parts.push(`xlink:href="${this.escapeXml(file.ectdRelativePath)}"`);
      parts.push(`xlink:type="simple"`);
      parts.push(`checksum="${file.md5Checksum}"`);
      parts.push(`checksum-type="MD5"`);
    }

    if (file.xmlLang) {
      parts.push(`xml:lang="${this.escapeXml(file.xmlLang)}"`);
    }

    return parts.join('\n              ');
  }

  /**
   * Build backbone attributes for specific elements (substance, manufacturer, etc.)
   */
  private buildBackboneAttributes(node: SequenceNodeTree): string | null {
    const parts: string[] = [];

    if (SUBSTANCE_ELEMENTS.has(node.elementName)) {
      parts.push(`substance="${this.escapeXml(node.substance || '')}"`);
      parts.push(`manufacturer="${this.escapeXml(node.manufacturer || '')}"`);
    } else if (PRODUCT_ELEMENTS.has(node.elementName)) {
      if (node.productName) {
        parts.push(`product-name="${this.escapeXml(node.productName)}"`);
      }
      if (node.dosageForm) {
        parts.push(`dosageform="${this.escapeXml(node.dosageForm)}"`);
      }
      if (node.manufacturer) {
        parts.push(`manufacturer="${this.escapeXml(node.manufacturer)}"`);
      }
    } else if (
      INDICATION_ELEMENTS.has(node.elementName) ||
      INDICATION_ELEMENTS_M5.has(node.elementName)
    ) {
      parts.push(`indication="${this.escapeXml(node.indication || '')}"`);
    }

    return parts.length > 0 ? parts.join(' ') : null;
  }

  private hasActiveLeaves(node: SequenceNodeTree): boolean {
    if (node.isLeaf && node.operation) {
      // STF-required nodes count as active when they have studies, even if
      // fileAttachments is empty (the PDFs are referenced via the studies).
      return (
        node.fileAttachments.length > 0 ||
        node.studies.length > 0 ||
        node.operation.toUpperCase() === 'DELETE'
      );
    }
    return node.children.some((child) => this.hasActiveLeaves(child));
  }

  private escapeXml(str: string): string {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
}
