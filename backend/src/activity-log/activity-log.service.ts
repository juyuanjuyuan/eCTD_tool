import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface LogActivityParams {
  userId: string;
  action: string;
  resource: string;
  resourceId: string;
  detail?: Record<string, any>;
}

@Injectable()
export class ActivityLogService {
  constructor(private readonly prisma: PrismaService) {}

  async log(params: LogActivityParams) {
    return this.prisma.activityLog.create({
      data: {
        userId: params.userId,
        action: params.action,
        resource: params.resource,
        resourceId: params.resourceId,
        detail: params.detail || undefined,
      },
    });
  }

  async logMemberAction(
    userId: string,
    action: string,
    projectId: string,
    detail?: Record<string, any>,
  ) {
    return this.log({
      userId,
      action,
      resource: 'project',
      resourceId: projectId,
      detail,
    });
  }

  async getBySequence(
    sequenceId: string,
    page = 1,
    pageSize = 20,
  ) {
    // Get all node IDs for this sequence
    const nodes = await this.prisma.sequenceNode.findMany({
      where: { sequenceId },
      select: { id: true },
    });
    const nodeIds = nodes.map((n) => n.id);

    // Get activity logs that reference these node IDs or the sequence itself
    const where = {
      OR: [
        { resource: 'sequence', resourceId: sequenceId },
        { resource: 'node', resourceId: { in: nodeIds } },
        { resource: 'document', resourceId: { in: nodeIds } },
        { resource: 'file', resourceId: { in: nodeIds } },
        { resource: 'comment', resourceId: { in: nodeIds } },
      ],
    };

    const [items, total] = await Promise.all([
      this.prisma.activityLog.findMany({
        where,
        include: {
          user: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.activityLog.count({ where }),
    ]);

    return { items, total, page, pageSize };
  }

  async getMemberActivity(
    projectId: string,
    userId: string,
    page = 1,
    pageSize = 20,
  ) {
    // Get all sequence IDs in this project
    const sequences = await this.prisma.sequence.findMany({
      where: {
        regulatoryActivity: {
          application: { projectId },
        },
      },
      select: { id: true },
    });
    const seqIds = sequences.map((s) => s.id);

    const nodes = await this.prisma.sequenceNode.findMany({
      where: { sequenceId: { in: seqIds } },
      select: { id: true },
    });
    const nodeIds = nodes.map((n) => n.id);

    const where = {
      userId,
      OR: [
        { resource: 'project', resourceId: projectId },
        { resource: 'sequence', resourceId: { in: seqIds } },
        { resource: 'node', resourceId: { in: nodeIds } },
        { resource: 'document', resourceId: { in: nodeIds } },
        { resource: 'file', resourceId: { in: nodeIds } },
        { resource: 'comment', resourceId: { in: nodeIds } },
      ],
    };

    const [items, total] = await Promise.all([
      this.prisma.activityLog.findMany({
        where,
        include: {
          user: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.activityLog.count({ where }),
    ]);

    return { items, total, page, pageSize };
  }
}
