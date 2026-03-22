import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { XMLParser } from 'fast-xml-parser';
import * as fs from 'fs';
import * as path from 'path';

export interface StfCategory {
  name: string;
  values: string[];
}

export interface StfFileTag {
  name: string;
  module: string; // m4 or m5
}

@Injectable()
export class StfService {
  private readonly logger = new Logger(StfService.name);
  private categories: StfCategory[] = [];
  private fileTags: StfFileTag[] = [];
  private validValuesLoaded = false;

  constructor(private prisma: PrismaService) {}

  /**
   * Load valid-values.xml for category names and file-tag names
   */
  private loadValidValues(): void {
    if (this.validValuesLoaded) return;

    const validValuesPath = path.resolve(
      process.cwd(),
      '../reference/eCTD技术规范V1.1附件包/附件2-6：STF标签值文件/valid-values.xml',
    );

    try {
      const xml = fs.readFileSync(validValuesPath, 'utf-8');
      const parser = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: '@_',
      });
      const parsed = parser.parse(xml);

      // Parse categories (species, route-of-admin, duration, type-of-control)
      const version = parsed['valid-values']?.version;
      if (version) {
        const categories = Array.isArray(version.category)
          ? version.category
          : version.category
            ? [version.category]
            : [];

        for (const cat of categories) {
          const catName = cat['@_name'];
          const values = Array.isArray(cat.value) ? cat.value : cat.value ? [cat.value] : [];
          this.categories.push({
            name: catName,
            values: values.map((v: any) => (typeof v === 'string' ? v : v['@_name'] || v['#text'] || '')),
          });
        }

        // Parse file-tags
        const fileTags = Array.isArray(version['file-tag'])
          ? version['file-tag']
          : version['file-tag']
            ? [version['file-tag']]
            : [];

        for (const ft of fileTags) {
          this.fileTags.push({
            name: ft['@_name'] || ft['#text'] || '',
            module: ft['@_module'] || '',
          });
        }
      }

      this.validValuesLoaded = true;
      this.logger.log(
        `Loaded valid-values.xml: ${this.categories.length} categories, ${this.fileTags.length} file-tags`,
      );
    } catch (err) {
      this.logger.warn(`Failed to load valid-values.xml: ${err}`);
      this.validValuesLoaded = true; // prevent retrying
    }
  }

  /**
   * Get available category names and their valid values
   */
  getCategories(): StfCategory[] {
    this.loadValidValues();
    return this.categories;
  }

  /**
   * Get available file-tag names
   */
  getFileTags(): StfFileTag[] {
    this.loadValidValues();
    return this.fileTags;
  }

  /**
   * Save/update STF data for a sequence node
   */
  async saveStf(
    nodeId: string,
    data: {
      studyTitle: string;
      studyId: string;
      categories?: Record<string, string>;
      fileTags?: Array<{ name: string; infoType: string }>;
    },
  ) {
    const node = await this.prisma.sequenceNode.findUnique({
      where: { id: nodeId },
      include: { templateNode: { select: { requiresStf: true } } },
    });
    if (!node) throw new NotFoundException('节点不存在');

    // Generate XML content
    const xmlContent = this.generateStfXml(data, node);

    return this.prisma.studyTaggingFile.upsert({
      where: { sequenceNodeId: nodeId },
      create: {
        sequenceNodeId: nodeId,
        studyTitle: data.studyTitle,
        studyId: data.studyId,
        categories: data.categories || {},
        fileTags: data.fileTags || [],
        stfXmlContent: xmlContent,
        operation: node.operation || 'NEW',
      },
      update: {
        studyTitle: data.studyTitle,
        studyId: data.studyId,
        categories: data.categories || {},
        fileTags: data.fileTags || [],
        stfXmlContent: xmlContent,
      },
    });
  }

  /**
   * Get STF data for a sequence node
   */
  async getStf(nodeId: string) {
    return this.prisma.studyTaggingFile.findUnique({
      where: { sequenceNodeId: nodeId },
    });
  }

  /**
   * Generate STF XML content following ich-stf-v2-2.dtd
   */
  generateStfXml(
    data: {
      studyTitle: string;
      studyId: string;
      categories?: Record<string, string>;
      fileTags?: Array<{ name: string; infoType: string }>;
    },
    node: { fileAttachments?: Array<{ ectdRelativePath: string }> } & Record<string, any>,
  ): string {
    const lines: string[] = [];

    lines.push('<?xml version="1.0" encoding="UTF-8"?>');
    lines.push('<!DOCTYPE ectd:study SYSTEM "../../util/dtd/ich-stf-v2-2.dtd">');
    lines.push(
      '<?xml-stylesheet type="text/xsl" href="../../util/style/ich-stf-stylesheet-2-3.xsl"?>',
    );
    lines.push(
      '<ectd:study xmlns:ectd="http://www.ich.org/ectd"',
      '            xmlns:xlink="http://www.w3.org/1999/xlink" dtd-version="2.2">',
    );

    // study-identifier
    lines.push('  <study-identifier>');
    lines.push(`    <title>${this.escapeXml(data.studyTitle)}</title>`);
    lines.push(`    <study-id>${this.escapeXml(data.studyId)}</study-id>`);

    // Categories
    if (data.categories) {
      for (const [name, value] of Object.entries(data.categories)) {
        if (value) {
          lines.push(
            `    <category name="${this.escapeXml(name)}" info-type="keyword">${this.escapeXml(value)}</category>`,
          );
        }
      }
    }

    lines.push('  </study-identifier>');

    // study-document section — references the actual study files
    if (node.fileAttachments && node.fileAttachments.length > 0) {
      lines.push('  <study-document>');
      for (const file of node.fileAttachments) {
        lines.push(`    <doc-content xlink:href="${this.escapeXml(file.ectdRelativePath)}">`);
        lines.push(`      <title>${this.escapeXml(data.studyTitle)}</title>`);
        if (data.fileTags && data.fileTags.length > 0) {
          for (const tag of data.fileTags) {
            lines.push(
              `      <file-tag name="${this.escapeXml(tag.name)}" info-type="${this.escapeXml(tag.infoType || 'keyword')}"/>`,
            );
          }
        }
        lines.push('    </doc-content>');
      }
      lines.push('  </study-document>');
    }

    lines.push('</ectd:study>');
    return lines.join('\n');
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
