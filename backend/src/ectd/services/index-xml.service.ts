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
  children: SequenceNodeTree[];
  fileAttachments: Array<{
    ectdRelativePath: string;
    md5Checksum: string;
    xmlLang: string;
  }>;
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
    const moduleRoots = await this.loadModuleNodes(sequenceId);
    return this.buildXml(moduleRoots);
  }

  private async loadModuleNodes(sequenceId: string): Promise<SequenceNodeTree[]> {
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

    // Filter to modules 2-5 only
    const ichNodes = allNodes.filter((n) => n.templateNode.module >= 2);

    // Build tree
    const nodeMap = new Map<string, SequenceNodeTree>();
    for (const node of ichNodes) {
      nodeMap.set(node.id, {
        id: node.id,
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
        children: [],
        fileAttachments: node.fileAttachments,
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

  private buildXml(moduleRoots: SequenceNodeTree[]): string {
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
        this.buildElement(lines, root, '  ');
      }
    }

    lines.push('</ectd:ectd>');
    return lines.join('\n');
  }

  private buildElement(
    lines: string[],
    node: SequenceNodeTree,
    indent: string,
  ): void {
    if (node.isLeaf) {
      this.buildLeafElements(lines, node, indent);
      return;
    }

    // Handle extension nodes
    if (node.elementName === 'node-extension') {
      this.buildNodeExtension(lines, node, indent);
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
        this.buildElement(lines, child, indent + '  ');
      }
    }

    lines.push(`${indent}</${node.elementName}>`);
  }

  private buildNodeExtension(
    lines: string[],
    node: SequenceNodeTree,
    indent: string,
  ): void {
    lines.push(`${indent}<node-extension>`);
    lines.push(`${indent}  <title>${this.escapeXml(node.title)}</title>`);

    // Extension nodes contain leaves
    for (const child of node.children) {
      this.buildLeafElements(lines, child, indent + '  ');
    }
    // If the extension itself is a leaf (has files)
    if (node.fileAttachments.length > 0 && node.operation) {
      this.buildLeafFromAttachments(lines, node, indent + '  ');
    }

    lines.push(`${indent}</node-extension>`);
  }

  private buildLeafElements(
    lines: string[],
    node: SequenceNodeTree,
    indent: string,
  ): void {
    if (!node.operation) return;

    this.buildLeafFromAttachments(lines, node, indent);
  }

  private buildLeafFromAttachments(
    lines: string[],
    node: SequenceNodeTree,
    indent: string,
  ): void {
    const op = node.operation!.toLowerCase();

    if (node.fileAttachments.length > 0) {
      for (const file of node.fileAttachments) {
        const leafId = this.md5Service.generateLeafId();
        const attrs = this.buildLeafAttrs(leafId, op, file);
        lines.push(`${indent}<leaf ${attrs}>`);
        lines.push(`${indent}  <title>${this.escapeXml(node.title)}</title>`);
        lines.push(`${indent}</leaf>`);
      }
    } else if (op === 'delete') {
      const leafId = this.md5Service.generateLeafId();
      lines.push(`${indent}<leaf ID="${leafId}" operation="delete">`);
      lines.push(`${indent}  <title>${this.escapeXml(node.title)}</title>`);
      lines.push(`${indent}</leaf>`);
    }
  }

  private buildLeafAttrs(
    leafId: string,
    operation: string,
    file: { ectdRelativePath: string; md5Checksum: string; xmlLang: string },
  ): string {
    const parts: string[] = [`ID="${leafId}"`, `operation="${operation}"`];

    if (operation !== 'delete') {
      parts.push(`xlink:href="${this.escapeXml(file.ectdRelativePath)}"`);
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
