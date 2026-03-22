import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ApprovalStatus } from '@prisma/client';

@Injectable()
export class ApprovalService {
  constructor(private readonly prisma: PrismaService) {}

  async submitForApproval(nodeId: string, userId: string) {
    const node = await this.prisma.sequenceNode.findUnique({
      where: { id: nodeId },
    });
    if (!node) throw new NotFoundException('节点不存在');
    if (!node.isLeaf) throw new BadRequestException('只有叶节点可以提交审批');

    if (node.approvalStatus !== ApprovalStatus.DRAFT &&
        node.approvalStatus !== ApprovalStatus.REJECTED) {
      throw new BadRequestException(
        `当前审批状态为 ${node.approvalStatus}，无法提交审批`,
      );
    }

    if (node.status === 'EMPTY') {
      throw new BadRequestException('节点内容为空，无法提交审批');
    }

    return this.prisma.sequenceNode.update({
      where: { id: nodeId },
      data: {
        approvalStatus: ApprovalStatus.SUBMITTED,
        submittedBy: userId,
        submittedAt: new Date(),
        approvedBy: null,
        approvedAt: null,
        rejectionReason: null,
      },
    });
  }

  async approveNode(nodeId: string, approverId: string) {
    const node = await this.prisma.sequenceNode.findUnique({
      where: { id: nodeId },
    });
    if (!node) throw new NotFoundException('节点不存在');

    if (node.approvalStatus !== ApprovalStatus.SUBMITTED) {
      throw new BadRequestException('只有已提交的节点可以审批通过');
    }

    return this.prisma.sequenceNode.update({
      where: { id: nodeId },
      data: {
        approvalStatus: ApprovalStatus.APPROVED,
        approvedBy: approverId,
        approvedAt: new Date(),
      },
    });
  }

  async rejectNode(nodeId: string, approverId: string, reason: string) {
    const node = await this.prisma.sequenceNode.findUnique({
      where: { id: nodeId },
    });
    if (!node) throw new NotFoundException('节点不存在');

    if (node.approvalStatus !== ApprovalStatus.SUBMITTED) {
      throw new BadRequestException('只有已提交的节点可以驳回');
    }

    return this.prisma.sequenceNode.update({
      where: { id: nodeId },
      data: {
        approvalStatus: ApprovalStatus.REJECTED,
        approvedBy: approverId,
        approvedAt: new Date(),
        rejectionReason: reason,
      },
    });
  }

  async unlockApproval(nodeId: string) {
    const node = await this.prisma.sequenceNode.findUnique({
      where: { id: nodeId },
    });
    if (!node) throw new NotFoundException('节点不存在');

    return this.prisma.sequenceNode.update({
      where: { id: nodeId },
      data: {
        approvalStatus: ApprovalStatus.DRAFT,
        submittedBy: null,
        submittedAt: null,
        approvedBy: null,
        approvedAt: null,
        rejectionReason: null,
      },
    });
  }

  async getSequenceApprovalStatus(sequenceId: string) {
    const nodes = await this.prisma.sequenceNode.findMany({
      where: { sequenceId, isLeaf: true },
      select: {
        id: true,
        ctdSectionNumber: true,
        title: true,
        isRequired: true,
        approvalStatus: true,
        submittedBy: true,
        submittedAt: true,
        approvedBy: true,
        approvedAt: true,
        rejectionReason: true,
        status: true,
      },
    });

    const total = nodes.length;
    const approved = nodes.filter((n) => n.approvalStatus === 'APPROVED').length;
    const submitted = nodes.filter((n) => n.approvalStatus === 'SUBMITTED').length;
    const rejected = nodes.filter((n) => n.approvalStatus === 'REJECTED').length;
    const draft = nodes.filter((n) => n.approvalStatus === 'DRAFT').length;

    const requiredNodes = nodes.filter((n) => n.isRequired);
    const requiredApproved = requiredNodes.filter(
      (n) => n.approvalStatus === 'APPROVED',
    ).length;
    const allRequiredApproved =
      requiredNodes.length > 0 && requiredApproved === requiredNodes.length;

    return {
      total,
      approved,
      submitted,
      rejected,
      draft,
      requiredTotal: requiredNodes.length,
      requiredApproved,
      allRequiredApproved,
      nodes,
    };
  }

  async getApprovalHistory(nodeId: string) {
    const node = await this.prisma.sequenceNode.findUnique({
      where: { id: nodeId },
      select: {
        id: true,
        approvalStatus: true,
        submittedBy: true,
        submittedAt: true,
        approvedBy: true,
        approvedAt: true,
        rejectionReason: true,
      },
    });
    if (!node) throw new NotFoundException('节点不存在');

    // Enrich with user names
    const userIds = [node.submittedBy, node.approvedBy].filter(Boolean) as string[];
    const users = userIds.length > 0
      ? await this.prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, name: true },
        })
      : [];

    const userMap = Object.fromEntries(users.map((u) => [u.id, u.name]));

    return {
      ...node,
      submitterName: node.submittedBy ? userMap[node.submittedBy] || null : null,
      approverName: node.approvedBy ? userMap[node.approvedBy] || null : null,
    };
  }

  async checkNodeEditable(nodeId: string): Promise<boolean> {
    const node = await this.prisma.sequenceNode.findUnique({
      where: { id: nodeId },
      select: { approvalStatus: true },
    });
    return node?.approvalStatus !== ApprovalStatus.APPROVED;
  }
}
