import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NodePermission } from '@prisma/client';

export interface CreateAssignmentDto {
  userId: string;
  permission: NodePermission;
}

@Injectable()
export class AssignmentService {
  constructor(private readonly prisma: PrismaService) {}

  async assignNode(
    nodeId: string,
    assignments: CreateAssignmentDto[],
    assignerId: string,
  ) {
    const node = await this.prisma.sequenceNode.findUnique({
      where: { id: nodeId },
      include: {
        sequence: {
          include: {
            regulatoryActivity: {
              include: { application: { select: { projectId: true } } },
            },
          },
        },
      },
    });
    if (!node) throw new NotFoundException('节点不存在');

    const projectId = node.sequence.regulatoryActivity.application.projectId;

    // Verify assigner is OWNER
    const assignerMember = await this.prisma.projectMember.findFirst({
      where: { projectId, userId: assignerId },
    });
    if (!assignerMember || assignerMember.role !== 'OWNER') {
      throw new ForbiddenException('只有项目所有者可以指派章节');
    }

    // Verify all target users are project members
    for (const a of assignments) {
      const member = await this.prisma.projectMember.findFirst({
        where: { projectId, userId: a.userId },
      });
      if (!member) {
        throw new BadRequestException(`用户 ${a.userId} 不是项目成员`);
      }
    }

    // Upsert assignments
    const results = [];
    for (const a of assignments) {
      const result = await this.prisma.nodeAssignment.upsert({
        where: {
          nodeId_userId: { nodeId, userId: a.userId },
        },
        update: { permission: a.permission },
        create: {
          nodeId,
          userId: a.userId,
          permission: a.permission,
          assignedBy: assignerId,
        },
        include: {
          user: { select: { id: true, name: true, email: true } },
        },
      });
      results.push(result);

      // Create notification for assignee
      await this.prisma.notification.create({
        data: {
          userId: a.userId,
          type: 'ASSIGNMENT',
          title: '您被指派了新的章节任务',
          content: `您被指派编辑章节「${node.ctdSectionNumber} ${node.title}」，权限为 ${a.permission}`,
          projectId,
          resourceType: 'node',
          resourceId: nodeId,
        },
      });
    }

    return results;
  }

  async getNodeAssignments(nodeId: string) {
    return this.prisma.nodeAssignment.findMany({
      where: { nodeId },
      include: {
        user: { select: { id: true, name: true, email: true } },
        assigner: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async removeAssignment(nodeId: string, userId: string, removerId: string) {
    const node = await this.prisma.sequenceNode.findUnique({
      where: { id: nodeId },
      include: {
        sequence: {
          include: {
            regulatoryActivity: {
              include: { application: { select: { projectId: true } } },
            },
          },
        },
      },
    });
    if (!node) throw new NotFoundException('节点不存在');

    const projectId = node.sequence.regulatoryActivity.application.projectId;
    const removerMember = await this.prisma.projectMember.findFirst({
      where: { projectId, userId: removerId },
    });
    if (!removerMember || removerMember.role !== 'OWNER') {
      throw new ForbiddenException('只有项目所有者可以取消指派');
    }

    const assignment = await this.prisma.nodeAssignment.findUnique({
      where: { nodeId_userId: { nodeId, userId } },
    });
    if (!assignment) throw new NotFoundException('指派记录不存在');

    return this.prisma.nodeAssignment.delete({
      where: { id: assignment.id },
    });
  }

  async getSequenceAssignmentOverview(sequenceId: string) {
    const nodes = await this.prisma.sequenceNode.findMany({
      where: { sequenceId },
      select: {
        id: true,
        ctdSectionNumber: true,
        title: true,
        isLeaf: true,
        assignments: {
          include: {
            user: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { sortOrder: 'asc' },
    });

    return nodes.map((n) => ({
      nodeId: n.id,
      ctdSectionNumber: n.ctdSectionNumber,
      title: n.title,
      isLeaf: n.isLeaf,
      isAssigned: n.assignments.length > 0,
      assignees: n.assignments.map((a) => ({
        userId: a.user.id,
        name: a.user.name,
        permission: a.permission,
      })),
    }));
  }

  /**
   * Check if a user has a specific permission on a node.
   * Permission inheritance: parent node permissions cascade to children unless overridden.
   * OWNER has full access. VIEWER has VIEW only.
   */
  async checkNodePermission(
    nodeId: string,
    userId: string,
    requiredPermission: NodePermission,
  ): Promise<boolean> {
    const node = await this.prisma.sequenceNode.findUnique({
      where: { id: nodeId },
      include: {
        sequence: {
          include: {
            regulatoryActivity: {
              include: { application: { select: { projectId: true } } },
            },
          },
        },
      },
    });
    if (!node) return false;

    const projectId = node.sequence.regulatoryActivity.application.projectId;
    const member = await this.prisma.projectMember.findFirst({
      where: { projectId, userId },
    });
    if (!member) return false;

    // OWNER always has full access
    if (member.role === 'OWNER') return true;

    // VIEWER can only VIEW
    if (member.role === 'VIEWER') return requiredPermission === 'VIEW';

    // MEMBER: check explicit assignment on this node
    const directAssignment = await this.prisma.nodeAssignment.findUnique({
      where: { nodeId_userId: { nodeId, userId } },
    });
    if (directAssignment) {
      return this.permissionSatisfies(directAssignment.permission, requiredPermission);
    }

    // Check parent chain for inherited permission
    let currentParentId = node.parentId;
    while (currentParentId) {
      const parentAssignment = await this.prisma.nodeAssignment.findUnique({
        where: { nodeId_userId: { nodeId: currentParentId, userId } },
      });
      if (parentAssignment) {
        return this.permissionSatisfies(parentAssignment.permission, requiredPermission);
      }
      const parent = await this.prisma.sequenceNode.findUnique({
        where: { id: currentParentId },
        select: { parentId: true },
      });
      currentParentId = parent?.parentId ?? null;
    }

    // MEMBER with no assignment has default EDIT permission
    return true;
  }

  private permissionSatisfies(
    granted: NodePermission,
    required: NodePermission,
  ): boolean {
    const hierarchy: Record<NodePermission, number> = {
      EDIT: 3,
      REVIEW: 2,
      VIEW: 1,
    };
    return hierarchy[granted] >= hierarchy[required];
  }
}
