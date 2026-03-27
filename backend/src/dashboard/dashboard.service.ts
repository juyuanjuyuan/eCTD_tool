import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisCacheService } from '../common/redis-cache.service';

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisCacheService,
  ) {}

  async getMyTasks(userId: string) {
    // 1. Nodes assigned to me for editing
    const assignedNodes = await this.prisma.nodeAssignment.findMany({
      where: { userId, permission: 'EDIT' },
      include: {
        node: {
          select: {
            id: true,
            ctdSectionNumber: true,
            title: true,
            status: true,
            approvalStatus: true,
            sequenceId: true,
            sequence: {
              select: {
                id: true,
                sequenceNumber: true,
                regulatoryActivity: {
                  select: {
                    application: {
                      select: {
                        projectId: true,
                        project: { select: { id: true, name: true } },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    const pendingEditNodes = assignedNodes
      .filter((a) => a.node.approvalStatus !== 'APPROVED')
      .map((a) => ({
        nodeId: a.node.id,
        ctdSectionNumber: a.node.ctdSectionNumber,
        title: a.node.title,
        status: a.node.status,
        approvalStatus: a.node.approvalStatus,
        sequenceId: a.node.sequenceId,
        projectId: a.node.sequence.regulatoryActivity.application.projectId,
        projectName: a.node.sequence.regulatoryActivity.application.project.name,
      }));

    // 2. Nodes pending my review (I have REVIEW permission + node is SUBMITTED)
    const reviewAssignments = await this.prisma.nodeAssignment.findMany({
      where: { userId, permission: 'REVIEW' },
      select: { nodeId: true },
    });
    const reviewNodeIds = reviewAssignments.map((a) => a.nodeId);

    let pendingReviewNodes: any[] = [];
    if (reviewNodeIds.length > 0) {
      pendingReviewNodes = await this.prisma.sequenceNode.findMany({
        where: {
          id: { in: reviewNodeIds },
          approvalStatus: 'SUBMITTED',
        },
        select: {
          id: true,
          ctdSectionNumber: true,
          title: true,
          submittedBy: true,
          submittedAt: true,
          sequenceId: true,
          sequence: {
            select: {
              regulatoryActivity: {
                select: {
                  application: {
                    select: {
                      projectId: true,
                      project: { select: { name: true } },
                    },
                  },
                },
              },
            },
          },
        },
      });
    }

    // 3. Pending invitations
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });
    const pendingInvitations = user
      ? await this.prisma.projectInvitation.count({
          where: {
            email: user.email,
            status: 'PENDING',
            expiresAt: { gt: new Date() },
          },
        })
      : 0;

    return {
      pendingEditNodes,
      pendingReviewNodes: pendingReviewNodes.map((n: any) => ({
        nodeId: n.id,
        ctdSectionNumber: n.ctdSectionNumber,
        title: n.title,
        submittedBy: n.submittedBy,
        submittedAt: n.submittedAt,
        sequenceId: n.sequenceId,
        projectName: n.sequence.regulatoryActivity.application.project.name,
      })),
      pendingInvitations,
    };
  }

  async getRecentEdits(userId: string) {
    const recentLogs = await this.prisma.activityLog.findMany({
      where: {
        userId,
        resource: { in: ['document', 'node'] },
        action: { in: ['CREATED', 'UPDATED', 'SAVED'] },
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
      distinct: ['resourceId'],
    });

    const nodeIds = recentLogs.map((l) => l.resourceId);
    if (nodeIds.length === 0) return [];

    const nodes = await this.prisma.sequenceNode.findMany({
      where: { id: { in: nodeIds } },
      select: {
        id: true,
        ctdSectionNumber: true,
        title: true,
        status: true,
        sequenceId: true,
        sequence: {
          select: {
            regulatoryActivity: {
              select: {
                application: {
                  select: {
                    project: { select: { id: true, name: true } },
                  },
                },
              },
            },
          },
        },
      },
    });

    const nodeMap = new Map(nodes.map((n) => [n.id, n]));
    return recentLogs
      .filter((l) => nodeMap.has(l.resourceId))
      .slice(0, 5)
      .map((l) => {
        const n = nodeMap.get(l.resourceId)!;
        return {
          nodeId: n.id,
          ctdSectionNumber: n.ctdSectionNumber,
          title: n.title,
          status: n.status,
          sequenceId: n.sequenceId,
          projectId: n.sequence.regulatoryActivity.application.project.id,
          projectName: n.sequence.regulatoryActivity.application.project.name,
          editedAt: l.createdAt,
        };
      });
  }

  async getProjectProgress(projectId: string) {
    // Get all sequences in the project
    const sequences = await this.prisma.sequence.findMany({
      where: {
        regulatoryActivity: { application: { projectId } },
      },
      select: { id: true },
    });
    const seqIds = sequences.map((s) => s.id);
    if (seqIds.length === 0) {
      return { modules: {}, totalNodes: 0, approvedNodes: 0 };
    }

    const nodes = await this.prisma.sequenceNode.findMany({
      where: { sequenceId: { in: seqIds }, isLeaf: true },
      select: {
        ctdSectionNumber: true,
        approvalStatus: true,
      },
    });

    // Group by module (first digit of ctdSectionNumber)
    const moduleStats: Record<string, { total: number; approved: number }> = {};
    for (const n of nodes) {
      const module = `M${n.ctdSectionNumber.split('.')[0]}`;
      if (!moduleStats[module]) moduleStats[module] = { total: 0, approved: 0 };
      moduleStats[module].total++;
      if (n.approvalStatus === 'APPROVED') moduleStats[module].approved++;
    }

    const totalNodes = nodes.length;
    const approvedNodes = nodes.filter((n) => n.approvalStatus === 'APPROVED').length;

    return { modules: moduleStats, totalNodes, approvedNodes };
  }

  async getProjectWorkload(projectId: string) {
    // Get project members
    const members = await this.prisma.projectMember.findMany({
      where: { projectId },
      include: { user: { select: { id: true, name: true } } },
    });

    const seqIds = (
      await this.prisma.sequence.findMany({
        where: {
          regulatoryActivity: { application: { projectId } },
        },
        select: { id: true },
      })
    ).map((s) => s.id);

    const workload = await Promise.all(
      members.map(async (m) => {
        const assignedCount = await this.prisma.nodeAssignment.count({
          where: {
            userId: m.userId,
            node: { sequenceId: { in: seqIds } },
          },
        });

        const approvedCount = await this.prisma.nodeAssignment.count({
          where: {
            userId: m.userId,
            node: {
              sequenceId: { in: seqIds },
              approvalStatus: 'APPROVED',
            },
          },
        });

        const submittedCount = await this.prisma.nodeAssignment.count({
          where: {
            userId: m.userId,
            node: {
              sequenceId: { in: seqIds },
              approvalStatus: 'SUBMITTED',
            },
          },
        });

        // Check for active edit locks
        let editingCount = 0;
        if (seqIds.length > 0) {
          const nodeIds = (
            await this.prisma.nodeAssignment.findMany({
              where: { userId: m.userId, node: { sequenceId: { in: seqIds } } },
              select: { nodeId: true },
            })
          ).map((a) => a.nodeId);

          for (const nid of nodeIds) {
            const lock = await this.redis.get<{ userId: string }>(`lock:node:${nid}`);
            if (lock && lock.userId === m.userId) editingCount++;
          }
        }

        return {
          userId: m.userId,
          name: m.user.name,
          role: m.role,
          assigned: assignedCount,
          approved: approvedCount,
          editing: editingCount,
          pendingReview: submittedCount,
        };
      }),
    );

    return workload;
  }
}
