import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisCacheService } from '../common/redis-cache.service';
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
  constructor(
    private prisma: PrismaService,
    private cache: RedisCacheService,
  ) {}

  // ==================== Template Tree ====================

  async getTemplateTree() {
    const cacheKey = 'ctd:template-tree';
    const cached = await this.cache.get(cacheKey);
    if (cached) return cached;

    const result = await this.prisma.ctdTemplateNode.findMany({
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

    await this.cache.set(cacheKey, result, 86400); // 24h - template data is static
    return result;
  }

  async getTemplateTreeWithRules(appTypeCode: string, ratTypeCode: string) {
    const cacheKey = `ctd:template-tree:${appTypeCode}:${ratTypeCode}`;
    const cached = await this.cache.get(cacheKey);
    if (cached) return cached;

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

    await this.cache.set(cacheKey, roots, 86400);
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

    // For subsequent sequences, get prior sequence nodes to inherit status
    let priorNodesByTemplate: Map<string, { status: SequenceNodeStatus; operation: LeafOperation | null }> | null = null;
    if (!isFirstSequence) {
      // Find the prior sequence in the same regulatory activity
      const priorSequences = await this.prisma.sequence.findMany({
        where: {
          regulatoryActivityId: sequence.regulatoryActivity.id,
          id: { not: sequenceId },
        },
        orderBy: { sequenceNumber: 'desc' },
        take: 1,
      });

      if (priorSequences.length > 0) {
        const priorNodes = await this.prisma.sequenceNode.findMany({
          where: { sequenceId: priorSequences[0].id },
        });
        priorNodesByTemplate = new Map();
        for (const pn of priorNodes) {
          priorNodesByTemplate.set(pn.templateNodeId, {
            status: pn.status as SequenceNodeStatus,
            operation: null, // Subsequent sequences don't inherit operation
          });
        }
      }
    }

    // Map template node IDs to sequence node IDs
    const templateToSequenceId = new Map<string, string>();

    // Create sequence nodes from template
    for (const tmpl of templateNodes) {
      let operation: LeafOperation | null = null;
      let status: SequenceNodeStatus = SequenceNodeStatus.EMPTY;

      if (isFirstSequence && tmpl.isLeaf) {
        operation = LeafOperation.NEW;
      } else if (priorNodesByTemplate && tmpl.isLeaf) {
        // Inherit status from prior sequence
        const priorNode = priorNodesByTemplate.get(tmpl.id);
        if (priorNode) {
          status = priorNode.status;
        }
      }

      const seqNode = await this.prisma.sequenceNode.create({
        data: {
          sequenceId,
          templateNodeId: tmpl.id,
          elementName: tmpl.elementName,
          ctdSectionNumber: tmpl.ctdSectionNumber,
          title: tmpl.titleZh,
          operation,
          status,
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

    // For subsequent sequences, also copy extension nodes from prior sequence
    if (!isFirstSequence && priorNodesByTemplate) {
      const priorSequences = await this.prisma.sequence.findMany({
        where: {
          regulatoryActivityId: sequence.regulatoryActivity.id,
          id: { not: sequenceId },
        },
        orderBy: { sequenceNumber: 'desc' },
        take: 1,
      });

      if (priorSequences.length > 0) {
        const priorExtensions = await this.prisma.sequenceNode.findMany({
          where: {
            sequenceId: priorSequences[0].id,
            elementName: 'node-extension',
          },
        });

        for (const ext of priorExtensions) {
          const parentSeqNodeId = templateToSequenceId.get(ext.templateNodeId);
          if (parentSeqNodeId) {
            await this.prisma.sequenceNode.create({
              data: {
                sequenceId,
                templateNodeId: ext.templateNodeId,
                parentId: parentSeqNodeId,
                elementName: 'node-extension',
                ctdSectionNumber: ext.ctdSectionNumber,
                title: ext.title,
                operation: null,
                status: ext.status as SequenceNodeStatus,
                isRequired: false,
                isLeaf: true,
                sortOrder: ext.sortOrder,
              },
            });
          }
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

    // Rule 3.6: When updating substance/manufacturer on 2.3.S/3.2.S,
    // must mark all child leaf nodes for rebuild (delete old + new)
    if (SUBSTANCE_SECTIONS.has(sno)) {
      const hasSubstanceChange =
        (dto.substance !== undefined && dto.substance !== node.substance) ||
        (dto.manufacturer !== undefined && dto.manufacturer !== node.manufacturer);

      if (hasSubstanceChange) {
        // Get the sequence to check if it's the first sequence
        const sequence = await this.prisma.sequence.findUnique({
          where: { id: sequenceId },
        });

        // For non-first sequences, mark child leaves as DELETE then rebuild with NEW
        if (sequence && sequence.sequenceNumber !== '0000') {
          const childLeaves = await this.prisma.sequenceNode.findMany({
            where: {
              sequenceId,
              isLeaf: true,
            },
          });

          // Find all descendant leaves under this section node
          const allNodes = await this.prisma.sequenceNode.findMany({
            where: { sequenceId },
          });
          const descendantIds = this.getDescendantIds(node.id, allNodes);

          const sectionLeaves = childLeaves.filter(
            (l) => descendantIds.has(l.id),
          );

          // Mark section leaves for rebuild: operation = NEW
          // (In eCTD, updating substance/manufacturer requires deleting the old section
          // and creating new content — we set operation to NEW to signal this)
          for (const leaf of sectionLeaves) {
            await this.prisma.sequenceNode.update({
              where: { id: leaf.id },
              data: { operation: LeafOperation.NEW },
            });
          }
        }
      }
    }

    return this.prisma.sequenceNode.update({
      where: { id: nodeId },
      data,
    });
  }

  /** Get all descendant node IDs recursively */
  private getDescendantIds(
    parentId: string,
    allNodes: Array<{ id: string; parentId: string | null }>,
  ): Set<string> {
    const result = new Set<string>();
    const children = allNodes.filter((n) => n.parentId === parentId);
    for (const child of children) {
      result.add(child.id);
      const grandChildren = this.getDescendantIds(child.id, allNodes);
      grandChildren.forEach((id) => result.add(id));
    }
    return result;
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

  // ==================== Pre-initialization Preview ====================

  async previewRequiredSections(sequenceId: string) {
    const sequence = await this.prisma.sequence.findUnique({
      where: { id: sequenceId },
      include: {
        regulatoryActivity: {
          include: {
            application: {
              select: { applicationTypeCode: true, productTypeCode: true },
            },
          },
        },
      },
    });
    if (!sequence) throw new NotFoundException(`序列 ${sequenceId} 不存在`);

    const appTypeCode = sequence.regulatoryActivity.application.applicationTypeCode;
    const ratTypeCode = sequence.regulatoryActivity.regulatoryActivityTypeCode;

    const rules = await this.prisma.ctdCompletenessRule.findMany({
      where: {
        applicationTypeCode: appTypeCode,
        regulatoryActivityTypeCode: ratTypeCode,
      },
      include: {
        templateNode: {
          select: {
            elementName: true,
            ctdSectionNumber: true,
            titleZh: true,
            module: true,
          },
        },
      },
    });

    const required = rules
      .filter((r) => r.ruleType === 'REQUIRED')
      .map((r) => ({
        section: r.templateNode.ctdSectionNumber,
        title: r.templateNode.titleZh,
        module: r.templateNode.module,
        severity: r.severity,
      }));

    const forbidden = rules
      .filter((r) => r.ruleType === 'FORBIDDEN')
      .map((r) => ({
        section: r.templateNode.ctdSectionNumber,
        title: r.templateNode.titleZh,
        module: r.templateNode.module,
      }));

    return {
      applicationTypeCode: appTypeCode,
      regulatoryActivityTypeCode: ratTypeCode,
      requiredSections: required,
      forbiddenSections: forbidden,
      totalRequired: required.length,
    };
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
