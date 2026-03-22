import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SaveDocumentDto } from './dto';

@Injectable()
export class DocumentService {
  constructor(private prisma: PrismaService) {}

  // ==================== Get Document ====================

  async getDocument(nodeId: string) {
    // Validate node exists
    const node = await this.prisma.sequenceNode.findUnique({
      where: { id: nodeId },
    });
    if (!node) throw new NotFoundException('序列节点不存在');

    const doc = await this.prisma.document.findUnique({
      where: { nodeId },
    });

    // Return empty doc structure if none exists yet
    if (!doc) {
      return {
        id: null,
        nodeId,
        contentJson: null,
        contentHtml: '',
        contentText: '',
        wordCount: 0,
        version: 0,
        xmlLang: 'zh',
        createdBy: null,
        updatedBy: null,
        createdAt: null,
        updatedAt: null,
      };
    }

    return doc;
  }

  // ==================== Save Document ====================

  async saveDocument(nodeId: string, dto: SaveDocumentDto, userId?: string) {
    // Validate node exists
    const node = await this.prisma.sequenceNode.findUnique({
      where: { id: nodeId },
    });
    if (!node) throw new NotFoundException('序列节点不存在');

    // Extract plain text and word count from HTML
    const contentText = this.extractText(dto.contentHtml || '');
    const wordCount = this.countWords(contentText);

    const existing = await this.prisma.document.findUnique({
      where: { nodeId },
    });

    if (existing) {
      // Update existing document
      const doc = await this.prisma.document.update({
        where: { nodeId },
        data: {
          contentJson: dto.contentJson ?? undefined,
          contentHtml: dto.contentHtml ?? undefined,
          contentText,
          wordCount,
          xmlLang: dto.xmlLang ?? undefined,
          version: { increment: 1 },
          updatedBy: userId || undefined,
        },
      });

      // Update node status to EDITING if it was EMPTY
      if (node.status === 'EMPTY') {
        await this.prisma.sequenceNode.update({
          where: { id: nodeId },
          data: { status: 'EDITING' },
        });
      }

      return doc;
    } else {
      // Create new document
      const doc = await this.prisma.document.create({
        data: {
          nodeId,
          contentJson: dto.contentJson ?? undefined,
          contentHtml: dto.contentHtml ?? undefined,
          contentText,
          wordCount,
          version: 1,
          xmlLang: dto.xmlLang || 'zh',
          createdBy: userId || undefined,
          updatedBy: userId || undefined,
        },
      });

      // Update node status to EDITING
      if (node.status === 'EMPTY') {
        await this.prisma.sequenceNode.update({
          where: { id: nodeId },
          data: { status: 'EDITING' },
        });
      }

      return doc;
    }
  }

  // ==================== Version Management ====================

  async getVersions(nodeId: string) {
    const doc = await this.prisma.document.findUnique({
      where: { nodeId },
    });
    if (!doc) return [];

    return this.prisma.documentVersion.findMany({
      where: { documentId: doc.id },
      orderBy: { version: 'desc' },
      select: {
        id: true,
        version: true,
        wordCount: true,
        xmlLang: true,
        createdBy: true,
        createdAt: true,
      },
    });
  }

  async getVersion(nodeId: string, version: number) {
    const doc = await this.prisma.document.findUnique({
      where: { nodeId },
    });
    if (!doc) throw new NotFoundException('文档不存在');

    const ver = await this.prisma.documentVersion.findFirst({
      where: { documentId: doc.id, version },
    });
    if (!ver) throw new NotFoundException(`版本 ${version} 不存在`);

    return ver;
  }

  async createVersionSnapshot(nodeId: string, userId?: string) {
    const doc = await this.prisma.document.findUnique({
      where: { nodeId },
    });
    if (!doc) throw new NotFoundException('文档不存在');

    return this.prisma.documentVersion.create({
      data: {
        documentId: doc.id,
        version: doc.version,
        contentJson: doc.contentJson ?? undefined,
        contentHtml: doc.contentHtml ?? undefined,
        wordCount: doc.wordCount,
        xmlLang: doc.xmlLang,
        createdBy: userId || doc.updatedBy,
      },
    });
  }

  async restoreVersion(nodeId: string, version: number, userId?: string) {
    const doc = await this.prisma.document.findUnique({
      where: { nodeId },
    });
    if (!doc) throw new NotFoundException('文档不存在');

    const ver = await this.prisma.documentVersion.findFirst({
      where: { documentId: doc.id, version },
    });
    if (!ver) throw new NotFoundException(`版本 ${version} 不存在`);

    // Save current state as a version snapshot before restoring
    await this.prisma.documentVersion.create({
      data: {
        documentId: doc.id,
        version: doc.version,
        contentJson: doc.contentJson ?? undefined,
        contentHtml: doc.contentHtml ?? undefined,
        wordCount: doc.wordCount,
        xmlLang: doc.xmlLang,
        createdBy: doc.updatedBy,
      },
    });

    // Restore the selected version
    const contentText = this.extractText(ver.contentHtml || '');

    return this.prisma.document.update({
      where: { nodeId },
      data: {
        contentJson: ver.contentJson ?? undefined,
        contentHtml: ver.contentHtml ?? undefined,
        contentText,
        wordCount: ver.wordCount,
        xmlLang: ver.xmlLang,
        version: { increment: 1 },
        updatedBy: userId || undefined,
      },
    });
  }

  // ==================== Helpers ====================

  private extractText(html: string): string {
    // Strip HTML tags to get plain text
    return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
  }

  private countWords(text: string): number {
    if (!text) return 0;
    // Count Chinese characters + English words
    const chineseChars = (text.match(/[\u4e00-\u9fff]/g) || []).length;
    const englishWords = text
      .replace(/[\u4e00-\u9fff]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 0).length;
    return chineseChars + englishWords;
  }
}
