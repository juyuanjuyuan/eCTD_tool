import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Md5Service } from './md5.service';

interface LeafData {
  id: string;
  operation: string;
  xlinkHref?: string;
  checksum?: string;
  modifiedFile?: string;
  xmlLang?: string;
  title: string;
}

interface SequenceNodeWithChildren {
  id: string;
  templateNodeId: string;
  elementName: string;
  ctdSectionNumber: string;
  title: string;
  operation: string | null;
  isLeaf: boolean;
  children: SequenceNodeWithChildren[];
  fileAttachments: Array<{
    ectdRelativePath: string;
    md5Checksum: string;
    xmlLang: string;
  }>;
}

@Injectable()
export class CnRegionalXmlService {
  private readonly logger = new Logger(CnRegionalXmlService.name);

  constructor(
    private prisma: PrismaService,
    private md5Service: Md5Service,
  ) {}

  /**
   * Generate cn-regional.xml for a given sequence
   */
  async generateCnRegionalXml(sequenceId: string): Promise<string> {
    // Load sequence with full context
    const sequence = await this.prisma.sequence.findUnique({
      where: { id: sequenceId },
      include: {
        regulatoryActivity: {
          include: {
            application: true,
          },
        },
      },
    });

    if (!sequence) {
      throw new Error(`序列 ${sequenceId} 不存在`);
    }

    const app = sequence.regulatoryActivity.application;
    const ra = sequence.regulatoryActivity;

    // Load prior sequence leaf ID map for modified-file references
    const priorLeafIdMap = await this.buildPriorLeafIdMap({
      id: sequence.id,
      sequenceNumber: sequence.sequenceNumber,
      applicationId: app.id,
    });

    // Load module 1 sequence nodes (tree structure)
    const module1Nodes = await this.loadModule1Nodes(sequenceId);

    // Build XML
    const xml = this.buildXml(sequence, app, ra, module1Nodes, priorLeafIdMap);
    return xml;
  }

  /**
   * Build a map from templateNodeId -> prior sequence leaf ID
   * for REPLACE/DELETE/APPEND operations' modified-file attribute.
   *
   * Scope: walk all sequences in the application with sequenceNumber < current,
   * in descending order, and record the first occurrence per templateNodeId.
   * This gives the most recent prior operation across all RAs.
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

    for (const priorSeq of priorSequences) {
      const priorNodes = await this.prisma.sequenceNode.findMany({
        where: {
          sequenceId: priorSeq.id,
          isLeaf: true,
          operation: { not: null },
          templateNode: { module: 1 },
        },
        select: { id: true, templateNodeId: true },
      });

      for (const node of priorNodes) {
        if (!map.has(node.templateNodeId)) {
          map.set(node.templateNodeId, this.md5Service.generateDeterministicLeafId(priorSeq.id, node.id));
        }
      }
      // Keep walking: earlier sequences may define templateNodes that the
      // most recent one doesn't, and we want the most recent occurrence of
      // each templateNodeId. The `!map.has` guard above ensures that.
    }

    return map;
  }

  private async loadModule1Nodes(sequenceId: string): Promise<SequenceNodeWithChildren[]> {
    const allNodes = await this.prisma.sequenceNode.findMany({
      where: { sequenceId },
      include: {
        templateNode: { select: { module: true } },
        fileAttachments: {
          select: {
            ectdRelativePath: true,
            md5Checksum: true,
            xmlLang: true,
          },
        },
      },
      orderBy: { sortOrder: 'asc' },
    });

    // Filter to module 1 only
    const m1Nodes = allNodes.filter((n) => n.templateNode.module === 1);

    // Build tree
    const nodeMap = new Map<string, SequenceNodeWithChildren>();
    for (const node of m1Nodes) {
      nodeMap.set(node.id, {
        id: node.id,
        templateNodeId: node.templateNodeId,
        elementName: node.elementName,
        ctdSectionNumber: node.ctdSectionNumber,
        title: node.title,
        operation: node.operation,
        isLeaf: node.isLeaf,
        children: [],
        fileAttachments: node.fileAttachments,
      });
    }

    const roots: SequenceNodeWithChildren[] = [];
    for (const node of m1Nodes) {
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
    sequence: any,
    app: any,
    ra: any,
    module1Nodes: SequenceNodeWithChildren[],
    priorLeafIdMap: Map<string, string>,
  ): string {
    const lines: string[] = [];

    // XML declaration
    lines.push('<?xml version="1.0" encoding="UTF-8"?>');

    // Root element
    lines.push(
      '<cn_ectd schema-version="1.0"',
      '         xmlns="cn_ectd"',
      '         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"',
      '         xsi:schemaLocation="cn_ectd ../../util/dtd/cn-regional-1-0.xsd"',
      '         xmlns:xlink="http://www.w3.org/1999/xlink">',
    );

    // cn-envelope
    lines.push('  <cn-envelope>');
    lines.push(`    <application-id>${this.escapeXml(app.applicationNumber)}</application-id>`);
    lines.push(
      `    <application-type code="${this.escapeXml(app.applicationTypeCode)}" version="${this.escapeXml(app.applicationTypeVersion)}"/>`,
    );
    lines.push(
      `    <product-type code="${this.escapeXml(app.productTypeCode)}" version="${this.escapeXml(app.productTypeVersion)}"/>`,
    );
    lines.push(`    <product-number>${this.escapeXml(app.productNumber)}</product-number>`);
    lines.push(
      `    <related-sequence>${this.escapeXml(ra.relatedSequence)}</related-sequence>`,
    );
    lines.push(
      `    <regulatory-activity-type code="${this.escapeXml(ra.regulatoryActivityTypeCode)}" version="${this.escapeXml(ra.regulatoryActivityTypeVersion)}"/>`,
    );
    lines.push(
      `    <sequence-number>${this.escapeXml(sequence.sequenceNumber)}</sequence-number>`,
    );
    lines.push(
      `    <sequence-type code="${this.escapeXml(sequence.sequenceTypeCode)}" version="${this.escapeXml(sequence.sequenceTypeVersion)}"/>`,
    );
    lines.push(
      `    <sequence-description>${this.escapeXml(sequence.description)}</sequence-description>`,
    );
    lines.push('    <sequence-contact>');
    lines.push(`      <name>${this.escapeXml(sequence.contactName)}</name>`);
    lines.push(`      <phone>${this.escapeXml(sequence.contactPhone)}</phone>`);
    lines.push(`      <email>${this.escapeXml(sequence.contactEmail)}</email>`);
    lines.push('    </sequence-contact>');
    lines.push('  </cn-envelope>');

    // cn-content
    lines.push('  <cn-content>');
    this.buildContentElements(lines, module1Nodes, '    ', sequence.id, priorLeafIdMap);
    lines.push('  </cn-content>');

    // Close root
    lines.push('</cn_ectd>');

    return lines.join('\n');
  }

  /**
   * Recursively build content elements for module 1 nodes.
   * Only emit elements that have leaves with content (no empty sections).
   */
  private buildContentElements(
    lines: string[],
    nodes: SequenceNodeWithChildren[],
    indent: string,
    sequenceId: string,
    priorLeafIdMap: Map<string, string>,
  ): void {
    for (const node of nodes) {
      if (node.isLeaf) {
        // Leaf node — generate leaf elements for each file attachment
        this.buildLeafElements(lines, node, indent, sequenceId, priorLeafIdMap);
      } else if (node.children.length > 0) {
        // Section node — only emit if it has any descendant leaves with content
        if (this.hasActiveLeaves(node)) {
          lines.push(`${indent}<${node.elementName}>`);
          this.buildContentElements(lines, node.children, indent + '  ', sequenceId, priorLeafIdMap);
          lines.push(`${indent}</${node.elementName}>`);
        }
      }
    }
  }

  private buildLeafElements(
    lines: string[],
    node: SequenceNodeWithChildren,
    indent: string,
    sequenceId: string,
    priorLeafIdMap: Map<string, string>,
  ): void {
    if (!node.operation) return;

    const op = node.operation.toLowerCase();
    const modifiedFile = ['replace', 'delete', 'append'].includes(op)
      ? priorLeafIdMap.get(node.templateNodeId)
      : undefined;

    // If node has file attachments, generate one leaf per file
    if (node.fileAttachments.length > 0) {
      for (let i = 0; i < node.fileAttachments.length; i++) {
        const file = node.fileAttachments[i];
        const leafId = this.md5Service.generateDeterministicLeafId(sequenceId, node.id, i);
        const attrs = this.buildLeafAttributes(leafId, op, file, modifiedFile);
        lines.push(`${indent}<leaf ${attrs}>`);
        lines.push(`${indent}  <title>${this.escapeXml(node.title)}</title>`);
        lines.push(`${indent}</leaf>`);
      }
    } else if (op === 'delete') {
      // Delete operations have no file reference
      const leafId = this.md5Service.generateDeterministicLeafId(sequenceId, node.id);
      const deleteAttrs = [`ID="${leafId}"`, `operation="delete"`];
      if (modifiedFile) {
        deleteAttrs.push(`modified-file="${modifiedFile}"`);
      }
      lines.push(`${indent}<leaf ${deleteAttrs.join(' ')}>`);
      lines.push(`${indent}  <title>${this.escapeXml(node.title)}</title>`);
      lines.push(`${indent}</leaf>`);
    }
    // If operation is new/replace/append but no file, skip (incomplete)
  }

  private buildLeafAttributes(
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
      // xlink:href must be relative to cn-regional.xml location (m1/cn/)
      const href = file.ectdRelativePath.startsWith('m1/cn/')
        ? file.ectdRelativePath.substring('m1/cn/'.length)
        : file.ectdRelativePath;
      parts.push(`xlink:href="${this.escapeXml(href)}"`);
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
   * Check if a node or any of its descendants has active leaf content
   */
  private hasActiveLeaves(node: SequenceNodeWithChildren): boolean {
    if (node.isLeaf && node.operation) {
      // Has operation and either has files or is a delete
      return (
        node.fileAttachments.length > 0 || node.operation.toUpperCase() === 'DELETE'
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
