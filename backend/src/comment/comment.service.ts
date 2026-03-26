import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCommentDto } from './dto';

@Injectable()
export class CommentService {
  constructor(private readonly prisma: PrismaService) {}

  async createComment(
    nodeId: string,
    userId: string,
    dto: CreateCommentDto,
  ) {
    // Verify node exists
    const node = await this.prisma.sequenceNode.findUnique({
      where: { id: nodeId },
    });
    if (!node) throw new NotFoundException('节点不存在');

    // Verify parent comment exists and belongs to same node
    if (dto.parentId) {
      const parent = await this.prisma.comment.findUnique({
        where: { id: dto.parentId },
      });
      if (!parent || parent.sequenceNodeId !== nodeId) {
        throw new NotFoundException('父评论不存在');
      }
    }

    // Extract @mentions from content if not provided explicitly
    const mentions = dto.mentions || this.extractMentions(dto.content);

    return this.prisma.comment.create({
      data: {
        sequenceNodeId: nodeId,
        userId,
        content: dto.content,
        mentions: mentions,
        parentId: dto.parentId || null,
      },
      include: {
        user: { select: { id: true, name: true } },
      },
    });
  }

  async getComments(nodeId: string) {
    // Fetch all comments for the node, ordered by creation time
    const comments = await this.prisma.comment.findMany({
      where: { sequenceNodeId: nodeId },
      include: {
        user: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    // Build tree structure: top-level + nested replies
    const topLevel = comments.filter((c) => !c.parentId);
    const repliesMap = new Map<string, typeof comments>();

    for (const c of comments) {
      if (c.parentId) {
        const existing = repliesMap.get(c.parentId) || [];
        existing.push(c);
        repliesMap.set(c.parentId, existing);
      }
    }

    return topLevel.map((c) => ({
      ...c,
      replies: repliesMap.get(c.id) || [],
    }));
  }

  async deleteComment(commentId: string, userId: string, userRole: string) {
    const comment = await this.prisma.comment.findUnique({
      where: { id: commentId },
    });
    if (!comment) throw new NotFoundException('评论不存在');

    // Only the comment author, ADMIN, or MANAGER can delete
    if (comment.userId !== userId && userRole !== 'ADMIN' && userRole !== 'MANAGER') {
      throw new ForbiddenException('无权删除此评论');
    }

    await this.prisma.comment.delete({ where: { id: commentId } });
    return { message: '评论已删除' };
  }

  async getCommentCount(nodeId: string): Promise<number> {
    return this.prisma.comment.count({
      where: { sequenceNodeId: nodeId },
    });
  }

  private extractMentions(content: string): string[] {
    const matches = content.match(/@(\S+)/g);
    if (!matches) return [];
    return [...new Set(matches.map((m) => m.slice(1)))];
  }
}
