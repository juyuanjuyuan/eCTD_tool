import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  UpdateSequenceNodeDto,
  UpdateBackboneAttributesDto,
  CreateExtensionNodeDto,
} from './dto';
import { LeafOperation, SequenceNodeStatus } from '@prisma/client';

// Extension node definitions from node-extension-property_CN.xml
const EXTENSION_NODE_DEFS: Record<string, { titleZh: string; titleEn: string }> = {
  '3.2.R.1': { titleZh: '3.2.R.1工艺验证', titleEn: 'Process Validation' },
  '3.2.R.2': { titleZh: '3.2.R.2批记录', titleEn: 'Batch Records' },
  '3.2.R.3': { titleZh: '3.2.R.3分析方法验证报告', titleEn: 'Analytical Method Validation Reports' },
  '3.2.R.4': { titleZh: '3.2.R.4稳定性图谱', titleEn: 'Stability Profiles' },
  '3.2.R.5': { titleZh: '3.2.R.5可比性方案', titleEn: 'Comparability Schemes' },
  '3.2.R.6': { titleZh: '3.2.R.6其他', titleEn: 'Other' },
};

// Backbone attribute nodes
const SUBSTANCE_SECTIONS = new Set(['2.3.S', '3.2.S']);
const PRODUCT_SECTIONS = new Set(['2.3.P', '3.2.P']);
const INDICATION_SECTIONS = new Set(['2.7.3']);

@Injectable()
export class CtdTemplateService {
  constructor(private prisma: PrismaService) {}

  // ==================== Template Tree ====================

  async getTemplateTree() {
    return this.prisma.ctdTemplateNode.findMany({
      where: { parentId: null },
      include: {
        children: {
          include: {
            children: {
              include: {
                children: {
                  include: {
                    children: {
                      include: {
                        children: {
                          include: { children: true },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async getTemplateTreeWithRules(appTypeCode: string, ratTypeCode: string) {
    // Get all template nodes
    const allNodes = await this.prisma.ctdTemplateNode.findMany({
      orderBy: { sortOrder: 'asc' },
    });

    // Get applicable completeness rules
    const rules = await this.prisma.ctdCompletenessRule.findMany({
      where: {
        applicationTypeCode: appTypeCode,
        regulatoryActivityTypeCode: ratTypeCode,
      },
    });

    // Build rule maps
    const requiredNodeIds = new Set<string>();
    const forbiddenNodeIds = new Set<string>();
    for (const rule of rules) {
      if (rule.ruleType === 'REQUIRED') {
        requiredNodeIds.add(rule.templateNodeId);
      } else if (rule.ruleType === 'FORBIDDEN') {
        forbiddenNodeIds.add(rule.templateNodeId);
      }
    }

    // Annotate nodes
    const annotatedNodes = allNodes.map((node) => ({
      ...node,
      isRequired: requiredNodeIds.has(node.id),
      isForbidden: forbiddenNodeIds.has(node.id),
    }));

    // Build tree structure
    const nodeMap = new Map<string, any>();
    for (const node of annotatedNodes) {
      nodeMap.set(node.id, { ...node, children: [] });
    }

    const roots: any[] = [];
    for (const node of annotatedNodes) {
      const treeNode = nodeMap.get(node.id);
      if (node.parentId && nodeMap.has(node.parentId)) {
        nodeMap.get(node.parentId).children.push(treeNode);
      } else {
        roots.push(treeNode);
      }
    }

    return roots;
  }

  // ==================== Sequence Initialization ====================

  async initializeSequenceNodes(sequenceId: string) {
    // Check sequence exists and get context
    const sequence = await this.prisma.sequence.findUnique({
      where: { id: sequenceId },
      include: {
        regulatoryActivity: {
          include: {
            application: {
              select: {
                applicationTypeCode: true,
                productTypeCode: true,
              },
            },
          },
        },
        sequenceNodes: { select: { id: true }, take: 1 },
      },
    });

    if (!sequence) {
      throw new NotFoundException(`序列 ${sequenceId} 不存在`);
    }

    if (sequence.sequenceNodes.length > 0) {
      throw new BadRequestException('序列目录已初始化');
    }

    const appTypeCode = sequence.regulatoryActivity.application.applicationTypeCode;
    const ratTypeCode = sequence.regulatoryActivity.regulatoryActivityTypeCode;
    const isFirstSequence = sequence.sequenceNumber === '0000';

    // Get all template nodes
    const templateNodes = await this.prisma.ctdTemplateNode.findMany({
      orderBy: { sortOrder: 'asc' },
    });

    // Get completeness rules for this combination
    const rules = await this.prisma.ctdCompletenessRule.findMany({
      where: {
        applicationTypeCode: appTypeCode,
        regulatoryActivityTypeCode: ratTypeCode,
      },
    });

    const requiredNodeIds = new Set<string>();
    for (const rule of rules) {
      if (rule.ruleType === 'REQUIRED') {
        requiredNodeIds.add(rule.templateNodeId);
      }
    }

    // Map template node IDs to sequence node IDs
    const templateToSequenceId = new Map<string, string>();

    // Create sequence nodes from template
    for (const tmpl of templateNodes) {
      const operation = isFirstSequence && tmpl.isLeaf ? LeafOperation.NEW : null;

      const seqNode = await this.prisma.sequenceNode.create({
        data: {
          sequenceId,
          templateNodeId: tmpl.id,
          elementName: tmpl.elementName,
          ctdSectionNumber: tmpl.ctdSectionNumber,
          title: tmpl.titleZh,
          operation,
          status: SequenceNodeStatus.EMPTY,
          isRequired: requiredNodeIds.has(tmpl.id),
          isLeaf: tmpl.isLeaf,
          sortOrder: tmpl.sortOrder,
        },
      });
      templateToSequenceId.set(tmpl.id, seqNode.id);
    }

    // Set parent references
    for (const tmpl of templateNodes) {
      if (tmpl.parentId) {
        const seqNodeId = templateToSequenceId.get(tmpl.id);
        const parentSeqNodeId = templateToSequenceId.get(tmpl.parentId);
        if (seqNodeId && parentSeqNodeId) {
          await this.prisma.sequenceNode.update({
            where: { id: seqNodeId },
            data: { parentId: parentSeqNodeId },
          });
        }
      }
    }

    // Update sequence status
    await this.prisma.sequence.update({
      where: { id: sequenceId },
      data: { status: 'EDITING' },
    });

    return { message: '序列目录初始化完成', nodeCount: templateNodes.length };
  }

  // ==================== Sequence Node Tree ====================

  async getSequenceNodeTree(sequenceId: string) {
    const sequence = await this.prisma.sequence.findUnique({
      where: { id: sequenceId },
    });
    if (!sequence) throw new NotFoundException(`序列 ${sequenceId} 不存在`);

    const allNodes = await this.prisma.sequenceNode.findMany({
      where: { sequenceId },
      orderBy: { sortOrder: 'asc' },
    });

    // Build tree
    const nodeMap = new Map<string, any>();
    for (const node of allNodes) {
      nodeMap.set(node.id, { ...node, children: [] });
    }

    const roots: any[] = [];
    for (const node of allNodes) {
      const treeNode = nodeMap.get(node.id);
      if (node.parentId && nodeMap.has(node.parentId)) {
        nodeMap.get(node.parentId).children.push(treeNode);
      } else {
        roots.push(treeNode);
      }
    }

    return roots;
  }

  // ==================== Update Sequence Node ====================

  async updateSequenceNode(sequenceId: string, nodeId: string, dto: UpdateSequenceNodeDto) {
    const node = await this.prisma.sequenceNode.findFirst({
      where: { id: nodeId, sequenceId },
    });
    if (!node) throw new NotFoundException('序列节点不存在');

    return this.prisma.sequenceNode.update({
      where: { id: nodeId },
      data: dto,
    });
  }

  // ==================== Backbone Attributes ====================

  async updateBackboneAttributes(
    sequenceId: string,
    nodeId: string,
    dto: UpdateBackboneAttributesDto,
  ) {
    const node = await this.prisma.sequenceNode.findFirst({
      where: { id: nodeId, sequenceId },
    });
    if (!node) throw new NotFoundException('序列节点不存在');

    const sno = node.ctdSectionNumber;

    // Validate which attributes are allowed for this section
    const data: any = {};
    if (SUBSTANCE_SECTIONS.has(sno)) {
      if (dto.substance !== undefined) data.substance = dto.substance;
      if (dto.manufacturer !== undefined) data.manufacturer = dto.manufacturer;
    } else if (PRODUCT_SECTIONS.has(sno)) {
      if (dto.productName !== undefined) data.productName = dto.productName;
      if (dto.dosageForm !== undefined) data.dosageForm = dto.dosageForm;
      if (dto.manufacturer !== undefined) data.manufacturer = dto.manufacturer;
    } else if (INDICATION_SECTIONS.has(sno)) {
      if (dto.indication !== undefined) data.indication = dto.indication;
    } else {
      throw new BadRequestException(`章节 ${sno} 不支持骨架属性`);
    }

    return this.prisma.sequenceNode.update({
      where: { id: nodeId },
      data,
    });
  }

  // ==================== Extension Nodes ====================

  async createExtensionNode(
    sequenceId: string,
    parentNodeId: string,
    dto: CreateExtensionNodeDto,
  ) {
    // Validate parent is a 3.2.R node
    const parentNode = await this.prisma.sequenceNode.findFirst({
      where: { id: parentNodeId, sequenceId },
      include: {
        templateNode: { select: { allowsExtension: true } },
      },
    });
    if (!parentNode) throw new NotFoundException('父节点不存在');
    if (!parentNode.templateNode.allowsExtension) {
      throw new BadRequestException('该节点不允许创建扩展子节点');
    }

    // Validate product type is biological (cnprt2)
    const sequence = await this.prisma.sequence.findUnique({
      where: { id: sequenceId },
      include: {
        regulatoryActivity: {
          include: {
            application: { select: { productTypeCode: true } },
          },
        },
      },
    });
    if (!sequence) throw new NotFoundException(`序列 ${sequenceId} 不存在`);
    if (sequence.regulatoryActivity.application.productTypeCode !== 'cnprt2') {
      throw new ForbiddenException('扩展节点仅适用于生物制品(cnprt2)申请');
    }

    const extDef = EXTENSION_NODE_DEFS[dto.extensionType];
    if (!extDef) {
      throw new BadRequestException(`无效的扩展节点类型: ${dto.extensionType}`);
    }

    // Check duplicate
    const existing = await this.prisma.sequenceNode.findFirst({
      where: {
        sequenceId,
        parentId: parentNodeId,
        ctdSectionNumber: dto.extensionType,
      },
    });
    if (existing) {
      throw new BadRequestException(`扩展节点 ${dto.extensionType} 已存在`);
    }

    // Get max sort order under parent
    const maxSort = await this.prisma.sequenceNode.aggregate({
      where: { sequenceId, parentId: parentNodeId },
      _max: { sortOrder: true },
    });

    return this.prisma.sequenceNode.create({
      data: {
        sequenceId,
        templateNodeId: parentNode.templateNodeId,
        parentId: parentNodeId,
        elementName: 'node-extension',
        ctdSectionNumber: dto.extensionType,
        title: extDef.titleZh,
        operation: LeafOperation.NEW,
        status: SequenceNodeStatus.EMPTY,
        isRequired: false,
        isLeaf: true,
        sortOrder: (maxSort._max.sortOrder || 0) + 1,
      },
    });
  }

  async deleteExtensionNode(sequenceId: string, nodeId: string) {
    const node = await this.prisma.sequenceNode.findFirst({
      where: { id: nodeId, sequenceId, elementName: 'node-extension' },
    });
    if (!node) {
      throw new NotFoundException('扩展节点不存在');
    }
    return this.prisma.sequenceNode.delete({ where: { id: nodeId } });
  }

  // ==================== Completeness Check ====================

  async checkCompleteness(sequenceId: string) {
    const sequence = await this.prisma.sequence.findUnique({
      where: { id: sequenceId },
      include: {
        regulatoryActivity: {
          include: {
            application: { select: { applicationTypeCode: true } },
          },
        },
      },
    });
    if (!sequence) throw new NotFoundException(`序列 ${sequenceId} 不存在`);

    const appTypeCode = sequence.regulatoryActivity.application.applicationTypeCode;
    const ratTypeCode = sequence.regulatoryActivity.regulatoryActivityTypeCode;

    // Get all sequence nodes
    const nodes = await this.prisma.sequenceNode.findMany({
      where: { sequenceId },
    });

    // Get rules
    const rules = await this.prisma.ctdCompletenessRule.findMany({
      where: {
        applicationTypeCode: appTypeCode,
        regulatoryActivityTypeCode: ratTypeCode,
      },
      include: {
        templateNode: { select: { elementName: true, ctdSectionNumber: true, titleZh: true } },
      },
    });

    // Build maps
    const nodeByTemplateId = new Map<string, typeof nodes[0]>();
    for (const n of nodes) {
      nodeByTemplateId.set(n.templateNodeId, n);
    }

    const completedNodes = new Set<string>();
    for (const n of nodes) {
      if (n.status === 'COMPLETED') {
        completedNodes.add(n.templateNodeId);
      }
    }

    // Evaluate rules
    const results = {
      totalSections: nodes.filter((n) => n.isLeaf).length,
      requiredSections: 0,
      completedRequired: 0,
      forbiddenViolations: [] as Array<{ elementName: string; section: string; title: string }>,
      missingRequired: [] as Array<{
        elementName: string;
        section: string;
        title: string;
        severity: string;
      }>,
      moduleStats: {} as Record<string, { total: number; required: number; completed: number }>,
    };

    // Module stats
    for (const n of nodes) {
      if (!n.isLeaf) continue;
      const mod = `模块${n.ctdSectionNumber.split('.')[0]}`;
      if (!results.moduleStats[mod]) {
        results.moduleStats[mod] = { total: 0, required: 0, completed: 0 };
      }
      results.moduleStats[mod].total++;
      if (n.isRequired) results.moduleStats[mod].required++;
      if (n.status === 'COMPLETED') results.moduleStats[mod].completed++;
    }

    // Check required rules
    for (const rule of rules) {
      if (rule.ruleType === 'REQUIRED') {
        results.requiredSections++;
        const seqNode = nodeByTemplateId.get(rule.templateNodeId);
        if (seqNode && seqNode.status === 'COMPLETED') {
          results.completedRequired++;
        } else {
          results.missingRequired.push({
            elementName: rule.templateNode.elementName,
            section: rule.templateNode.ctdSectionNumber,
            title: rule.templateNode.titleZh,
            severity: rule.severity,
          });
        }
      } else if (rule.ruleType === 'FORBIDDEN') {
        const seqNode = nodeByTemplateId.get(rule.templateNodeId);
        if (seqNode && seqNode.status !== 'EMPTY') {
          results.forbiddenViolations.push({
            elementName: rule.templateNode.elementName,
            section: rule.templateNode.ctdSectionNumber,
            title: rule.templateNode.titleZh,
          });
        }
      }
    }

    return results;
  }

  // ==================== Extension Node Options ====================

  getExtensionNodeOptions() {
    return Object.entries(EXTENSION_NODE_DEFS).map(([type, def]) => ({
      type,
      titleZh: def.titleZh,
      titleEn: def.titleEn,
    }));
  }
}
