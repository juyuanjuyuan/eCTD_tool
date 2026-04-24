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
  AddInstanceDto,
} from './dto';
import { LeafOperation, SequenceNodeStatus } from '@prisma/client';
import { randomUUID } from 'crypto';

/**
 * 3.2.R (Regional Information) extension node definitions.
 *
 * Source of truth: NMPA eCTD V1.1 controlled-vocabulary file
 *   reference/eCTD技术规范V1.1附件包/附件1-2：受控词汇文件包/node-extension-property_CN.xml
 *
 * Per NMPA V1.1, the 3.2.R section is an EXTENSION_POINT in the CTD template
 * and permits exactly these 6 sub-sections. Extension nodes are ONLY allowed
 * for biologic products (productTypeCode = 'cnprt2'); see `createExtensionNode`
 * below which enforces this restriction.
 *
 * NB: The Chinese titles below intentionally differ from the ICH M4Q §3.2.R
 * labels — they are NMPA regional redefinitions of the extension slots.
 */
const EXTENSION_NODE_DEFS: Record<string, { titleZh: string; titleEn: string }> = {
  '3.2.R.1': { titleZh: '3.2.R.1工艺验证', titleEn: 'Process Validation' },
  '3.2.R.2': { titleZh: '3.2.R.2批记录', titleEn: 'Batch Records' },
  '3.2.R.3': { titleZh: '3.2.R.3分析方法验证报告', titleEn: 'Analytical Method Validation Reports' },
  '3.2.R.4': { titleZh: '3.2.R.4稳定性图谱', titleEn: 'Stability Profiles' },
  '3.2.R.5': { titleZh: '3.2.R.5可比性方案', titleEn: 'Comparability Schemes' },
  '3.2.R.6': { titleZh: '3.2.R.6其他', titleEn: 'Other' },
};

/** Allowed product type for 3.2.R extension nodes (NMPA V1.1: biologics only) */
const EXTENSION_NODE_ALLOWED_PRODUCT_TYPE = 'cnprt2';

// Backbone attribute nodes
const SUBSTANCE_SECTIONS = new Set(['2.3.S', '3.2.S']);
const PRODUCT_SECTIONS = new Set(['2.3.P', '3.2.P']);
const INDICATION_SECTIONS = new Set(['2.7.3']);

/**
 * Plan 13: 根据 templateNode.instanceKeyFields + AddInstanceDto 拼接 UI 展示用的 instanceLabel.
 * 顺序按 key 数组来; 非空字段用 " - " 连接; 全空返回 null.
 */
function buildInstanceLabel(
  keyFields: string[] | null,
  attrs: { substance?: string; manufacturer?: string; productName?: string; dosageForm?: string; indication?: string },
): string | null {
  if (!keyFields || keyFields.length === 0) return null;
  const parts = keyFields
    .map((k) => (attrs as Record<string, string | undefined>)[k])
    .filter((v): v is string => typeof v === 'string' && v.trim().length > 0);
  return parts.length > 0 ? parts.join(' - ') : null;
}

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

    // Use flat query + in-memory tree building instead of deeply nested includes
    // This is a single DB query instead of 7 levels of nested queries
    const allNodes = await this.prisma.ctdTemplateNode.findMany({
      orderBy: { sortOrder: 'asc' },
    });

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

    await this.cache.set(cacheKey, roots, 86400); // 24h - template data is static
    return roots;
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

    // Pre-generate IDs and build all node data in memory
    const templateToSequenceId = new Map<string, string>();
    const nodeDataList: Array<{
      id: string;
      sequenceId: string;
      templateNodeId: string;
      parentId: string | null;
      elementName: string;
      ctdSectionNumber: string;
      title: string;
      operation: LeafOperation | null;
      status: SequenceNodeStatus;
      isRequired: boolean;
      isLeaf: boolean;
      sortOrder: number;
    }> = [];

    // First pass: generate IDs and compute node data
    for (const tmpl of templateNodes) {
      const nodeId = randomUUID();
      templateToSequenceId.set(tmpl.id, nodeId);

      let operation: LeafOperation | null = null;
      let status: SequenceNodeStatus = SequenceNodeStatus.EMPTY;

      if (isFirstSequence && tmpl.isLeaf) {
        operation = LeafOperation.NEW;
      } else if (priorNodesByTemplate && tmpl.isLeaf) {
        const priorNode = priorNodesByTemplate.get(tmpl.id);
        if (priorNode) {
          status = priorNode.status;
        }
      }

      nodeDataList.push({
        id: nodeId,
        sequenceId,
        templateNodeId: tmpl.id,
        parentId: null, // set in second pass
        elementName: tmpl.elementName,
        ctdSectionNumber: tmpl.ctdSectionNumber,
        title: tmpl.titleZh,
        operation,
        status,
        isRequired: requiredNodeIds.has(tmpl.id),
        isLeaf: tmpl.isLeaf,
        sortOrder: tmpl.sortOrder,
      });
    }

    // Second pass: resolve parent references using pre-generated IDs
    for (let i = 0; i < templateNodes.length; i++) {
      const tmpl = templateNodes[i];
      if (tmpl.parentId) {
        const parentSeqNodeId = templateToSequenceId.get(tmpl.parentId);
        if (parentSeqNodeId) {
          nodeDataList[i].parentId = parentSeqNodeId;
        }
      }
    }

    // Batch insert all nodes in a single transaction (instead of ~458 individual operations)
    await this.prisma.$transaction(
      nodeDataList.map((data) =>
        this.prisma.sequenceNode.create({ data }),
      ),
    );

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
      orderBy: [{ sortOrder: 'asc' }, { instanceIndex: 'asc' }],
      // Plan 13: include template.isRepeatable + instanceKeyFields 让前端渲染多实例 UI
      include: {
        templateNode: {
          select: { id: true, isRepeatable: true, instanceKeyFields: true },
        },
      },
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

    // Block status changes on approved/submitted nodes
    if (dto.status && (node.approvalStatus === 'APPROVED' || node.approvalStatus === 'SUBMITTED')) {
      throw new BadRequestException('已提交审批或已审批的节点不允许修改状态');
    }

    // Block skipping EDITING when going to COMPLETED
    if (dto.status === 'COMPLETED' && node.status === 'EMPTY') {
      throw new BadRequestException('未开始的节点不能直接标记为已完成，请先编辑');
    }

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
    if (
      sequence.regulatoryActivity.application.productTypeCode !==
      EXTENSION_NODE_ALLOWED_PRODUCT_TYPE
    ) {
      throw new ForbiddenException(
        `扩展节点仅适用于生物制品(${EXTENSION_NODE_ALLOWED_PRODUCT_TYPE})申请`,
      );
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

  // ==================== Plan 13: 多实例节点 ====================

  /**
   * 列出某可重复模板节点在指定序列下的全部实例 (SequenceNode 根节点, 不含子树).
   */
  async listInstances(sequenceId: string, templateNodeId: string) {
    const template = await this.prisma.ctdTemplateNode.findUnique({
      where: { id: templateNodeId },
    });
    if (!template) throw new NotFoundException('模板节点不存在');
    if (!template.isRepeatable) {
      throw new BadRequestException(`节点 ${template.ctdSectionNumber} 不支持多实例`);
    }
    return this.prisma.sequenceNode.findMany({
      where: { sequenceId, templateNodeId },
      orderBy: { instanceIndex: 'asc' },
    });
  }

  /**
   * 为可重复模板节点添加一个新实例. 服务端按 instanceKeyFields 校验必填属性,
   * 深拷贝整个模板子树创建 SequenceNode, 所有新节点共享同一 instanceIndex.
   *
   * 规则:
   * - 非首次序列 (sequenceNumber != '0000'), 新实例的 leaf 自动标记 operation=NEW
   *   (eCTD 意义: 新增原料药/制剂是"新增"行为)
   * - 同一实例组内, instanceKeyFields 组合必须唯一 (例如不能有两个同样
   *   substance+manufacturer 的原料药)
   */
  async addInstance(sequenceId: string, templateNodeId: string, dto: AddInstanceDto) {
    const template = await this.prisma.ctdTemplateNode.findUnique({
      where: { id: templateNodeId },
    });
    if (!template) throw new NotFoundException('模板节点不存在');
    if (!template.isRepeatable) {
      throw new BadRequestException(`节点 ${template.ctdSectionNumber} 不支持多实例`);
    }

    const sequence = await this.prisma.sequence.findUnique({ where: { id: sequenceId } });
    if (!sequence) throw new NotFoundException(`序列 ${sequenceId} 不存在`);

    const keyFields = (template.instanceKeyFields as string[] | null) ?? [];
    const attrs = dto as Record<string, string | undefined>;

    // 校验必填 key 字段至少填写一个 (宽松策略: DTD 中部分为 IMPLIED)
    const filledKeys = keyFields.filter((k) => typeof attrs[k] === 'string' && attrs[k]!.trim());
    if (filledKeys.length === 0) {
      throw new BadRequestException(
        `至少需要填写 ${keyFields.join(' / ')} 中的一项用于区分实例`,
      );
    }

    // 校验唯一性: 同 templateNode 下 instanceKeyFields 组合不能重复
    const existingInstances = await this.prisma.sequenceNode.findMany({
      where: { sequenceId, templateNodeId },
    });
    const keySignature = (n: Record<string, string | null | undefined>) =>
      keyFields.map((k) => (n[k] ?? '').trim()).join('|');
    const newSig = keySignature(attrs as Record<string, string>);
    if (existingInstances.some((n) => keySignature(n as unknown as Record<string, string | null>) === newSig)) {
      throw new BadRequestException('已存在相同骨架属性组合的实例');
    }

    // 计算下一个 instanceIndex
    const maxIdx = existingInstances.reduce(
      (max, n) => Math.max(max, n.instanceIndex ?? 0),
      -1,
    );
    const newInstanceIndex = maxIdx + 1;

    // 找到当前序列下该模板节点的父 SequenceNode 作为挂载点
    if (!template.parentId) {
      throw new BadRequestException('可重复节点必须有父节点');
    }
    const parentSeqNode = await this.prisma.sequenceNode.findFirst({
      where: { sequenceId, templateNodeId: template.parentId },
      orderBy: { instanceIndex: 'asc' }, // 取第一个实例作为挂载点 (一般父节点不是 repeatable)
    });
    if (!parentSeqNode) {
      throw new BadRequestException('父节点未初始化, 无法创建实例');
    }

    // 深拷贝模板子树: 拉取 template 自身及其所有后代
    const allDescendantTemplates = await this.collectTemplateSubtree(templateNodeId);
    const isFirstSeq = sequence.sequenceNumber === '0000';
    const instanceLabel = buildInstanceLabel(keyFields, dto);

    // 预生成所有 SequenceNode ID, 构建 templateId -> newSeqNodeId 映射
    const templateToNewSeqId = new Map<string, string>();
    for (const t of allDescendantTemplates) {
      templateToNewSeqId.set(t.id, randomUUID());
    }

    // 构建 create 数据 (root 节点 parentId = parentSeqNode.id, 子节点按 template 树的 parent)
    const createData: Parameters<typeof this.prisma.sequenceNode.create>[0]['data'][] = [];
    for (const t of allDescendantTemplates) {
      const isRoot = t.id === templateNodeId;
      const parentSeqId = isRoot
        ? parentSeqNode.id
        : (t.parentId && templateToNewSeqId.get(t.parentId)) || null;
      const thisIsLeaf = t.isLeaf;

      createData.push({
        id: templateToNewSeqId.get(t.id)!,
        sequenceId,
        templateNodeId: t.id,
        parentId: parentSeqId,
        elementName: t.elementName,
        ctdSectionNumber: t.ctdSectionNumber,
        title: t.titleZh,
        operation: isFirstSeq && thisIsLeaf ? LeafOperation.NEW : thisIsLeaf ? LeafOperation.NEW : null,
        status: SequenceNodeStatus.EMPTY,
        isRequired: false,
        isLeaf: thisIsLeaf,
        sortOrder: t.sortOrder,
        instanceIndex: newInstanceIndex,
        // 骨架属性只落在 root 实例节点上
        ...(isRoot
          ? {
              substance: dto.substance,
              manufacturer: dto.manufacturer,
              productName: dto.productName,
              dosageForm: dto.dosageForm,
              indication: dto.indication,
              instanceLabel,
            }
          : {}),
      });
    }

    await this.prisma.$transaction(
      createData.map((d) => this.prisma.sequenceNode.create({ data: d })),
    );

    // 返回新创建的根实例节点
    return this.prisma.sequenceNode.findUnique({
      where: { id: templateToNewSeqId.get(templateNodeId)! },
    });
  }

  /**
   * 删除一个实例. 首次序列: 硬删除整个子树. 非首次序列: 级联给子树叶子标记 operation=DELETE.
   */
  async removeInstance(sequenceId: string, instanceRootNodeId: string) {
    const instanceRoot = await this.prisma.sequenceNode.findFirst({
      where: { id: instanceRootNodeId, sequenceId },
      include: { templateNode: { select: { isRepeatable: true, ctdSectionNumber: true } } },
    });
    if (!instanceRoot) throw new NotFoundException('实例节点不存在');
    if (!instanceRoot.templateNode.isRepeatable) {
      throw new BadRequestException(`节点 ${instanceRoot.templateNode.ctdSectionNumber} 不是多实例节点`);
    }

    // 不允许删除最后一个实例 (至少保留 1 个以维持目录树结构)
    const peerCount = await this.prisma.sequenceNode.count({
      where: { sequenceId, templateNodeId: instanceRoot.templateNodeId },
    });
    if (peerCount <= 1) {
      throw new BadRequestException('不能删除最后一个实例, 至少保留一个');
    }

    const sequence = await this.prisma.sequence.findUnique({ where: { id: sequenceId } });
    if (!sequence) throw new NotFoundException(`序列 ${sequenceId} 不存在`);

    if (sequence.sequenceNumber === '0000') {
      // 首次序列: 直接级联删除子树 (Prisma onDelete: SET NULL on parent relation, 但 sequenceId CASCADE)
      // 先收集所有后代 id 再批量删
      const allNodes = await this.prisma.sequenceNode.findMany({ where: { sequenceId } });
      const descendantIds = this.getDescendantIds(instanceRootNodeId, allNodes);
      descendantIds.add(instanceRootNodeId);
      // 从叶子往根删, 避免 parent fk 冲突: Prisma parent 关系默认 onDelete=NoAction,
      // 先用 updateMany 清空 parentId, 再 deleteMany
      await this.prisma.$transaction([
        this.prisma.sequenceNode.updateMany({
          where: { id: { in: Array.from(descendantIds) } },
          data: { parentId: null },
        }),
        this.prisma.sequenceNode.deleteMany({
          where: { id: { in: Array.from(descendantIds) } },
        }),
      ]);
      return { message: '实例已删除', deletedCount: descendantIds.size };
    } else {
      // 非首次序列: 级联标记子树叶子为 DELETE (生命周期规范: 不能物理删除)
      const allNodes = await this.prisma.sequenceNode.findMany({ where: { sequenceId } });
      const descendantIds = this.getDescendantIds(instanceRootNodeId, allNodes);
      const leafIds = allNodes
        .filter((n) => (descendantIds.has(n.id) || n.id === instanceRootNodeId) && n.isLeaf)
        .map((n) => n.id);
      await this.prisma.sequenceNode.updateMany({
        where: { id: { in: leafIds } },
        data: { operation: LeafOperation.DELETE },
      });
      return { message: '实例已标记为删除 (非首次序列)', markedCount: leafIds.length };
    }
  }

  /** 递归拉取模板节点及其所有后代 (按 sortOrder 排序). */
  private async collectTemplateSubtree(rootTemplateNodeId: string) {
    const all = await this.prisma.ctdTemplateNode.findMany({
      orderBy: { sortOrder: 'asc' },
    });
    const byId = new Map(all.map((t) => [t.id, t]));
    const result: typeof all = [];
    const visit = (id: string) => {
      const node = byId.get(id);
      if (!node) return;
      result.push(node);
      const children = all.filter((t) => t.parentId === id);
      for (const c of children) visit(c.id);
    };
    visit(rootTemplateNodeId);
    return result;
  }

  // ==================== Completeness Check ====================

  async checkCompleteness(sequenceId: string) {
    const sequence = await this.prisma.sequence.findUnique({
      where: { id: sequenceId },
      include: {
        regulatoryActivity: {
          include: {
            application: { select: { applicationTypeCode: true, productTypeCode: true } },
          },
        },
      },
    });
    if (!sequence) throw new NotFoundException(`序列 ${sequenceId} 不存在`);

    const appTypeCode = sequence.regulatoryActivity.application.applicationTypeCode;
    const ratTypeCode = sequence.regulatoryActivity.regulatoryActivityTypeCode;
    const productTypeCode = sequence.regulatoryActivity.application.productTypeCode;
    const seqType = sequence.sequenceTypeCode;

    // Get all sequence nodes
    const nodes = await this.prisma.sequenceNode.findMany({
      where: { sequenceId },
    });

    // Plan 13: 按 sequenceType + productType 精筛规则
    const candidateRules = await this.prisma.ctdCompletenessRule.findMany({
      where: {
        applicationTypeCode: appTypeCode,
        regulatoryActivityTypeCode: ratTypeCode,
      },
      include: {
        templateNode: { select: { elementName: true, ctdSectionNumber: true, titleZh: true } },
      },
    });
    const rules = candidateRules.filter((r) => {
      const seqTypes = r.sequenceTypeCodes ?? [];
      if (seqTypes.length > 0 && seqType && !seqTypes.includes(seqType)) return false;
      const productTypes = r.productTypeCodes ?? [];
      if (productTypes.length > 0 && productTypeCode && !productTypes.includes(productTypeCode)) return false;
      return true;
    });

    // Plan 13: 同一 templateNode 可能有多个实例, 规则命中则任一实例满足即可
    const nodesByTemplateId = new Map<string, typeof nodes>();
    for (const n of nodes) {
      const arr = nodesByTemplateId.get(n.templateNodeId) ?? [];
      arr.push(n);
      nodesByTemplateId.set(n.templateNodeId, arr);
    }
    // 为兼容旧调用点保留 nodeByTemplateId (取第一个实例)
    const nodeByTemplateId = new Map<string, typeof nodes[0]>();
    for (const n of nodes) {
      if (!nodeByTemplateId.has(n.templateNodeId)) {
        nodeByTemplateId.set(n.templateNodeId, n);
      }
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

    // Plan 13: SECTION 容器"至少一叶子非空"语义
    const isSectionSatisfiedForTemplate = (templateNodeId: string): boolean => {
      const containers = nodesByTemplateId.get(templateNodeId) ?? [];
      for (const container of containers) {
        const stack = [container.id];
        while (stack.length) {
          const pid = stack.pop()!;
          for (const n of nodes) {
            if (n.parentId === pid) {
              if (n.isLeaf && n.status !== 'EMPTY') return true;
              stack.push(n.id);
            }
          }
        }
      }
      return false;
    };

    // Check required rules
    for (const rule of rules) {
      const seqNodes = nodesByTemplateId.get(rule.templateNodeId) ?? [];
      if (rule.ruleType === 'REQUIRED') {
        results.requiredSections++;
        let satisfied = false;
        if (seqNodes.length === 0) {
          satisfied = false;
        } else if (seqNodes.some((n) => n.isLeaf)) {
          // 叶节点: 任一实例 COMPLETED 即满足
          satisfied = seqNodes.some((n) => n.status === 'COMPLETED');
        } else {
          // SECTION 容器: 后代叶子非空
          satisfied = isSectionSatisfiedForTemplate(rule.templateNodeId);
        }
        if (satisfied) {
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
        // 任一实例非空即违规
        if (seqNodes.some((n) => n.status !== 'EMPTY')) {
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
    const productTypeCode = sequence.regulatoryActivity.application.productTypeCode;
    const seqType = sequence.sequenceTypeCode;

    // Plan 13: 按 sequenceType + productType 精筛规则
    const candidateRules = await this.prisma.ctdCompletenessRule.findMany({
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
    const rules = candidateRules.filter((r) => {
      const seqTypes = r.sequenceTypeCodes ?? [];
      if (seqTypes.length > 0 && seqType && !seqTypes.includes(seqType)) return false;
      const productTypes = r.productTypeCodes ?? [];
      if (productTypes.length > 0 && productTypeCode && !productTypes.includes(productTypeCode)) return false;
      return true;
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
