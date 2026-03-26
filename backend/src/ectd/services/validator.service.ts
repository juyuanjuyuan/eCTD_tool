import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Md5Service } from './md5.service';
import { ValidationSeverity } from '@prisma/client';

export interface ValidationItemInput {
  ruleCode: string;
  ruleCategory: string;
  severity: ValidationSeverity;
  description: string;
  detail?: string;
  filePath?: string;
  suggestion?: string;
}

// Valid file extensions for eCTD content files
const VALID_EXTENSIONS = new Set(['pdf', 'xml', 'xpt', 'txt', 'xsl']);

// Valid file/folder name regex: a-z, 0-9, -, _
const VALID_NAME_REGEX = /^[a-z0-9\-_]+$/;

// Required util/dtd files with their checksums source
const REQUIRED_UTIL_DTD_FILES = [
  'ich-ectd-3-2.dtd',
  'cn-regional-1-0.xsd',
  'xml.xsd',
  'xlink.xsd',
  'ich-stf-v2-2.dtd',
  'ectd-2-0.xsl',
];

// Required util/style files
const REQUIRED_UTIL_STYLE_FILES = [
  'cn-regional-1-1.xsl',
  'ich-stf-stylesheet-2-3.xsl',
  'ich-stf-stylesheet-2-2a.xsl',
  'valid-values.xml',
];

// Allowed root folder items
const ALLOWED_ROOT_ITEMS = new Set([
  'index.xml',
  'index-md5.txt',
  'm1',
  'm2',
  'm3',
  'm4',
  'm5',
  'util',
]);

@Injectable()
export class ValidatorService {
  private readonly logger = new Logger(ValidatorService.name);

  constructor(
    private prisma: PrismaService,
    private md5Service: Md5Service,
  ) {}

  /**
   * Run full validation on a sequence and persist the report
   */
  async validate(sequenceId: string): Promise<{
    reportId: string;
    totalErrors: number;
    totalWarnings: number;
    totalInfos: number;
    isPassed: boolean;
    items: ValidationItemInput[];
  }> {
    const items: ValidationItemInput[] = [];

    // Load full sequence context
    const sequence = await this.prisma.sequence.findUnique({
      where: { id: sequenceId },
      include: {
        regulatoryActivity: {
          include: {
            application: true,
            sequences: {
              select: { id: true, sequenceNumber: true },
              orderBy: { sequenceNumber: 'asc' },
            },
          },
        },
        sequenceNodes: {
          include: {
            templateNode: { select: { module: true, requiresStf: true, elementName: true, allowsExtension: true, ctdSectionNumber: true, titleZh: true } },
            fileAttachments: { include: { pdfAnalysis: true } },
            document: { select: { xmlLang: true, wordCount: true } },
            studyTaggingFile: true,
            children: { select: { id: true, isLeaf: true, operation: true } },
          },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    if (!sequence) {
      return {
        reportId: '',
        totalErrors: 1,
        totalWarnings: 0,
        totalInfos: 0,
        isPassed: false,
        items: [
          {
            ruleCode: '0.0',
            ruleCategory: '基础',
            severity: ValidationSeverity.ERROR,
            description: '序列不存在',
          },
        ],
      };
    }

    const app = sequence.regulatoryActivity.application;
    const ra = sequence.regulatoryActivity;
    const isFirst = sequence.sequenceNumber === '0000';

    // Run synchronous validations
    // ======== Category 1: Basic Identification (INFO) ========
    this.validateBasicIdentification(sequence, items);

    // ======== Category 2: File/Folder Validation ========
    this.validateFileStructure(sequence, items);

    // ======== Category 4.2: Envelope Information ========
    this.validateEnvelopeInfo(sequence, app, ra, isFirst, items);

    // ======== Category 5: STF Validation ========
    this.validateStf(sequence, items);

    // ======== Category 6: PDF Analysis ========
    this.validatePdf(sequence, items);

    // Run async validations in parallel (independent DB queries)
    const asyncItems: ValidationItemInput[][] = await Promise.all([
      // ======== Category 3: ICH Backbone (index.xml) ========
      (async () => {
        const cat3: ValidationItemInput[] = [];
        await this.validateIchBackbone(sequence, isFirst, cat3);
        return cat3;
      })(),
      // ======== Category 4.1: Regional Backbone ========
      (async () => {
        const cat41: ValidationItemInput[] = [];
        await this.validateRegionalBackbone(sequence, isFirst, cat41);
        return cat41;
      })(),
      // ======== Category 4.3: Completeness Rules ========
      (async () => {
        const cat43: ValidationItemInput[] = [];
        await this.validateCompleteness(sequence, app, ra, cat43);
        return cat43;
      })(),
      // ======== Category 4.2 async: Envelope Immutability ========
      (async () => {
        const cat42a: ValidationItemInput[] = [];
        await this.validateEnvelopeImmutability(sequence, app, ra, cat42a);
        return cat42a;
      })(),
    ]);
    for (const batch of asyncItems) {
      items.push(...batch);
    }

    // Calculate totals
    const totalErrors = items.filter((i) => i.severity === ValidationSeverity.ERROR).length;
    const totalWarnings = items.filter((i) => i.severity === ValidationSeverity.WARNING).length;
    const totalInfos = items.filter((i) => i.severity === ValidationSeverity.INFO).length;
    const isPassed = totalErrors === 0;

    // Persist report
    const report = await this.prisma.validationReport.create({
      data: {
        sequenceId,
        totalErrors,
        totalWarnings,
        totalInfos,
        isPassed,
        items: {
          create: items.map((item) => ({
            ruleCode: item.ruleCode,
            ruleCategory: item.ruleCategory,
            severity: item.severity,
            description: item.description,
            detail: item.detail || null,
            filePath: item.filePath || null,
            suggestion: item.suggestion || null,
          })),
        },
      },
    });

    // Update sequence status
    await this.prisma.sequence.update({
      where: { id: sequenceId },
      data: { status: 'VALIDATING' },
    });

    return { reportId: report.id, totalErrors, totalWarnings, totalInfos, isPassed, items };
  }

  // ============================================================
  // Category 1: Basic Identification (1.1 - 1.3) — INFO
  // ============================================================

  private validateBasicIdentification(sequence: any, items: ValidationItemInput[]): void {
    const leafNodes = sequence.sequenceNodes.filter(
      (n: any) => n.isLeaf && n.operation,
    );
    const totalFiles = leafNodes.reduce(
      (sum: number, n: any) => sum + (n.fileAttachments?.length || 0),
      0,
    );
    const totalSize = leafNodes.reduce(
      (sum: bigint, n: any) =>
        sum +
        (n.fileAttachments || []).reduce(
          (s: bigint, f: any) => s + BigInt(f.fileSize || 0),
          0n,
        ),
      0n,
    );
    const emptySections = sequence.sequenceNodes.filter(
      (n: any) => n.isLeaf && n.status === 'EMPTY',
    ).length;

    items.push({
      ruleCode: '1.1',
      ruleCategory: '基础识别',
      severity: ValidationSeverity.INFO,
      description: `当前序列包含 ${totalFiles} 个文件`,
    });
    items.push({
      ruleCode: '1.2',
      ruleCategory: '基础识别',
      severity: ValidationSeverity.INFO,
      description: `当前序列文件总大小: ${Number(totalSize / 1024n / 1024n)} MB`,
    });
    items.push({
      ruleCode: '1.3',
      ruleCategory: '基础识别',
      severity: ValidationSeverity.INFO,
      description: `当前序列有 ${emptySections} 个空缺章节`,
    });
  }

  // ============================================================
  // Category 2: File/Folder Validation (2.1 - 2.10) — ERROR
  // ============================================================

  private validateFileStructure(sequence: any, items: ValidationItemInput[]): void {
    const leafNodes = sequence.sequenceNodes.filter((n: any) => n.isLeaf);
    const allNodes = sequence.sequenceNodes;

    // 2.1 Empty folders: non-leaf nodes that have active children but no files in any child
    const nonLeafNodes = allNodes.filter((n: any) => !n.isLeaf);
    for (const node of nonLeafNodes) {
      const children = allNodes.filter((c: any) => c.parentId === node.id);
      if (children.length === 0) continue; // no children defined is ok
      const hasActiveChild = children.some(
        (c: any) => c.isLeaf ? (c.operation && c.operation !== 'DELETE') : true,
      );
      if (!hasActiveChild) {
        // Check if any leaf descendants have active operations
        const hasActiveDescendant = this.hasActiveDescendant(node.id, allNodes);
        if (!hasActiveDescendant && node.operation !== 'DELETE') {
          // Only flag if the folder would actually be generated
          const elementName = node.elementName || '';
          if (elementName.startsWith('m') || elementName.startsWith('cn-')) {
            items.push({
              ruleCode: '2.1',
              ruleCategory: '文件/文件夹',
              severity: ValidationSeverity.ERROR,
              description: `文件夹不能为空`,
              detail: `节点 ${node.ctdSectionNumber} ${node.title} 不包含任何文件或子文件夹`,
            });
          }
        }
      }
    }

    for (const node of leafNodes) {
      for (const file of node.fileAttachments || []) {
        // 2.2 File size limit
        const size = Number(file.fileSize || 0);
        const ext = (file.fileType || '').toLowerCase();
        const maxSize = ext === 'xpt' ? 4 * 1024 * 1024 * 1024 : 200 * 1024 * 1024;
        if (size > maxSize) {
          items.push({
            ruleCode: '2.2',
            ruleCategory: '文件/文件夹',
            severity: ValidationSeverity.ERROR,
            description: `文件大小超过限制`,
            detail: `${file.originalName}: ${(size / 1024 / 1024).toFixed(1)}MB, 限制: ${ext === 'xpt' ? '4GB' : '200MB'}`,
            filePath: file.ectdRelativePath,
            suggestion: '请缩减文件大小',
          });
        }

        // 2.4 File extension check (CDE: ERROR)
        if (ext && !VALID_EXTENSIONS.has(ext)) {
          items.push({
            ruleCode: '2.4',
            ruleCategory: '文件/文件夹',
            severity: ValidationSeverity.ERROR,
            description: `文件类型（文件扩展名检查）`,
            detail: `${file.originalName}: .${ext}, 允许: .pdf/.xml/.xpt/.txt/.xsl`,
            filePath: file.ectdRelativePath,
          });
        }

        // 2.5 File naming convention
        const fileName = (file.storedName || '').replace(/\.[^.]+$/, '');
        if (fileName && !VALID_NAME_REGEX.test(fileName)) {
          items.push({
            ruleCode: '2.5',
            ruleCategory: '文件/文件夹',
            severity: ValidationSeverity.ERROR,
            description: `文件和文件夹命名规范必须正确`,
            detail: `${file.storedName}: 仅允许 a-z, 0-9, -, _`,
            filePath: file.ectdRelativePath,
            suggestion: '请使用小写字母、数字、连字符或下划线命名',
          });
        }

        // 2.5 Path length check (max 180)
        if (file.ectdRelativePath && file.ectdRelativePath.length > 180) {
          items.push({
            ruleCode: '2.5',
            ruleCategory: '文件/文件夹',
            severity: ValidationSeverity.ERROR,
            description: `文件路径超过180字符限制`,
            detail: `路径长度: ${file.ectdRelativePath.length}`,
            filePath: file.ectdRelativePath,
          });
        }

        // 2.5 Single name length check (max 64)
        const pathParts = (file.ectdRelativePath || '').split('/');
        for (const part of pathParts) {
          if (part.length > 64) {
            items.push({
              ruleCode: '2.5',
              ruleCategory: '文件/文件夹',
              severity: ValidationSeverity.ERROR,
              description: `文件/文件夹名称超过64字符`,
              detail: `"${part}" (${part.length}字符)`,
              filePath: file.ectdRelativePath,
            });
          }
        }
      }
    }

    // 2.9 Sequence folder name must be 4 digits
    const seqNum = sequence.sequenceNumber || '';
    if (!/^\d{4}$/.test(seqNum)) {
      items.push({
        ruleCode: '2.9',
        ruleCategory: '文件/文件夹',
        severity: ValidationSeverity.ERROR,
        description: `序列文件夹要求`,
        detail: `序列文件夹名称必须仅包含4个数字: ${seqNum}`,
      });
    }

    // 2.10 Sequence numbering continuity
    const allSeqs = sequence.regulatoryActivity?.sequences || [];
    if (allSeqs.length > 0) {
      const seqNumbers = allSeqs.map((s: any) => parseInt(s.sequenceNumber, 10)).sort((a: number, b: number) => a - b);
      const currentNum = parseInt(seqNum, 10);
      // Must start from 0000
      if (seqNumbers[0] !== 0) {
        items.push({
          ruleCode: '2.10',
          ruleCategory: '文件/文件夹',
          severity: ValidationSeverity.ERROR,
          description: `序列编号`,
          detail: `初始序列号必须从0000开始`,
        });
      }
      // No gaps allowed
      if (currentNum > 0) {
        const prevSeqNum = currentNum - 1;
        const prevExists = seqNumbers.includes(prevSeqNum);
        if (!prevExists) {
          items.push({
            ruleCode: '2.10',
            ruleCategory: '文件/文件夹',
            severity: ValidationSeverity.ERROR,
            description: `序列编号`,
            detail: `序列号不允许跳号，序列号${String(prevSeqNum).padStart(4, '0')}不存在`,
          });
        }
      }
    }
  }

  private hasActiveDescendant(nodeId: string, allNodes: any[]): boolean {
    const children = allNodes.filter((n: any) => n.parentId === nodeId);
    for (const child of children) {
      if (child.isLeaf && child.operation && child.operation !== 'DELETE') return true;
      if (!child.isLeaf && this.hasActiveDescendant(child.id, allNodes)) return true;
    }
    return false;
  }

  // ============================================================
  // Category 3: ICH Backbone Validation (3.1 - 3.36)
  // Rule codes aligned with CDE eCTD验证标准V1.1
  // ============================================================

  private async validateIchBackbone(
    sequence: any,
    isFirst: boolean,
    items: ValidationItemInput[],
  ): Promise<void> {
    const allNodes = sequence.sequenceNodes;
    const ichLeaves = allNodes.filter(
      (n: any) => n.templateNode.module >= 2 && n.isLeaf,
    );
    const ichNonLeaves = allNodes.filter(
      (n: any) => n.templateNode.module >= 2 && !n.isLeaf,
    );

    // Track modified-file references to detect duplicates (3.5)
    const modifiedFileRefs = new Map<string, string[]>();

    for (const node of ichLeaves) {
      if (!node.operation) continue;
      const op = node.operation as string;
      const sectionDesc = `${node.ctdSectionNumber} ${node.title}`;

      // 3.7 NEW/REPLACE/APPEND must have xlink:href (files)
      if (['NEW', 'REPLACE', 'APPEND'].includes(op) && (!node.fileAttachments || node.fileAttachments.length === 0)) {
        items.push({
          ruleCode: '3.7',
          ruleCategory: 'ICH骨架文件',
          severity: ValidationSeverity.ERROR,
          description: `叶元素：新建、替换或增补的叶元素，必须有"文件引用（xlink:href）"值`,
          detail: `节点 ${sectionDesc} 操作为 ${op.toLowerCase()} 但无文件`,
          suggestion: '请上传对应的文件',
        });
      }

      // 3.8 DELETE must NOT have xlink:href (files)
      if (op === 'DELETE' && node.fileAttachments?.length > 0) {
        items.push({
          ruleCode: '3.8',
          ruleCategory: 'ICH骨架文件',
          severity: ValidationSeverity.ERROR,
          description: `叶元素：删除的叶元素不能包含"文件引用（xlink:href）"值`,
          detail: `节点 ${sectionDesc} 有 ${node.fileAttachments.length} 个文件附件`,
          suggestion: '删除操作不需要文件引用(xlink:href)和校验值(checksum)',
        });
      }

      // 3.9 REPLACE/DELETE/APPEND must have modified-file
      if (['REPLACE', 'DELETE', 'APPEND'].includes(op)) {
        // Track for 3.5 duplicate check
        const refKey = node.templateNodeId;
        if (!modifiedFileRefs.has(refKey)) {
          modifiedFileRefs.set(refKey, []);
        }
        modifiedFileRefs.get(refKey)!.push(node.id);
      }

      // 3.10 First sequence: all operations must be NEW
      if (isFirst && op !== 'NEW') {
        items.push({
          ruleCode: '3.10',
          ruleCategory: 'ICH骨架文件',
          severity: ValidationSeverity.ERROR,
          description: `叶元素：初始序列中所有文件必须为新建（new）`,
          detail: `节点 ${sectionDesc}: 当前操作为 ${op.toLowerCase()}`,
          suggestion: '首次提交(0000)的所有叶元素必须使用 new 操作',
        });
      }

      // 3.11 modified-file target must exist in prior sequences
      if (!isFirst && ['REPLACE', 'APPEND', 'DELETE'].includes(op)) {
        const prevExists = await this.checkPriorNodeExists(
          sequence.regulatoryActivityId,
          sequence.sequenceNumber,
          node.templateNodeId,
        );
        if (!prevExists) {
          items.push({
            ruleCode: '3.11',
            ruleCategory: 'ICH骨架文件',
            severity: ValidationSeverity.ERROR,
            description: `被修改文件对象必须存在`,
            detail: `节点 ${sectionDesc} 的 ${op.toLowerCase()} 操作指向的原文件在前序序列中不存在`,
            suggestion: '确保被修改的文件在前序序列中已存在',
          });
        }
      }

      // 3.12 File paths: relative only, forward slashes only
      for (const file of node.fileAttachments || []) {
        if (file.ectdRelativePath?.includes('\\')) {
          items.push({
            ruleCode: '3.12',
            ruleCategory: 'ICH骨架文件',
            severity: ValidationSeverity.ERROR,
            description: `只允许使用相对路径引用`,
            detail: `路径包含反斜杠: ${file.ectdRelativePath}`,
            filePath: file.ectdRelativePath,
            suggestion: '路径中只允许使用正斜杠"/"，不允许使用反斜杠"\\"',
          });
        }
        if (
          file.ectdRelativePath?.startsWith('/') ||
          /^[a-zA-Z]:/.test(file.ectdRelativePath || '')
        ) {
          items.push({
            ruleCode: '3.12',
            ruleCategory: 'ICH骨架文件',
            severity: ValidationSeverity.ERROR,
            description: `只允许使用相对路径引用`,
            detail: `路径不是相对路径: ${file.ectdRelativePath}`,
            filePath: file.ectdRelativePath,
            suggestion: '不允许使用绝对路径',
          });
        }
      }

      // 3.16 Node extension only for biologics (cnprt2) 3.2.R
      const templateElement = node.templateNode.elementName || '';
      if (templateElement.includes('-ext-') || templateElement.includes('node-extension')) {
        const productType = sequence.regulatoryActivity.application.productTypeCode;
        if (productType !== 'cnprt2') {
          items.push({
            ruleCode: '3.16',
            ruleCategory: 'ICH骨架文件',
            severity: ValidationSeverity.ERROR,
            description: `扩展节点的使用要求`,
            detail: `扩展节点仅允许在产品类型为生物制品(cnprt2)的序列中的3.2.R章节使用`,
          });
        }
      }

      // 3.18 Leaf title must not be empty
      if (!node.title || node.title.trim() === '') {
        items.push({
          ruleCode: '3.18',
          ruleCategory: 'ICH骨架文件',
          severity: ValidationSeverity.ERROR,
          description: `叶标题不能为空`,
          detail: `节点 ${node.ctdSectionNumber} 的标题为空`,
        });
      }

      // 3.20 Leaf title must not have leading/trailing spaces
      if (node.title && (node.title !== node.title.trim())) {
        items.push({
          ruleCode: '3.20',
          ruleCategory: 'ICH骨架文件',
          severity: ValidationSeverity.WARNING,
          description: `叶标题开头和结尾不能为空格`,
          detail: `节点 ${sectionDesc}`,
        });
      }

      // 3.23 Append usage warning for non-STF
      if (op === 'APPEND' && !node.templateNode.requiresStf) {
        items.push({
          ruleCode: '3.23',
          ruleCategory: 'ICH骨架文件',
          severity: ValidationSeverity.WARNING,
          description: `增补（append）的使用`,
          detail: `节点 ${sectionDesc}: 不建议在STF定义范围外使用增补操作`,
          suggestion: '在STF定义范围外使用"增补（append）"操作，需要在说明函中进行说明',
        });
      }

      // 3.25 indication attribute (2.7.3 and 5.3.5 sections)
      const secNum = node.ctdSectionNumber || '';
      if ((secNum.startsWith('2.7.3') || secNum.startsWith('5.3.5')) && node.indication !== undefined) {
        if (node.indication === null || node.indication === '') {
          items.push({
            ruleCode: '3.25',
            ruleCategory: 'ICH骨架文件',
            severity: ValidationSeverity.ERROR,
            description: `属性-适应症（indication）`,
            detail: `适应症属性在${secNum}章节中使用时为必填项，值不能为空`,
          });
        }
      }

      // 3.26 manufacturer attribute (2.3.S and 3.2.S sections)
      if ((secNum.startsWith('2.3.S') || secNum.startsWith('3.2.S'))) {
        if (node.manufacturer !== undefined && (node.manufacturer === null || node.manufacturer === '')) {
          items.push({
            ruleCode: '3.26',
            ruleCategory: 'ICH骨架文件',
            severity: ValidationSeverity.ERROR,
            description: `属性-生产商（manufacturer）`,
            detail: `生产商属性在${secNum}章节中使用时为必填项，值不能为空`,
          });
        }
      }

      // 3.27 substance attribute (2.3.S and 3.2.S sections)
      if ((secNum.startsWith('2.3.S') || secNum.startsWith('3.2.S'))) {
        if (node.substance !== undefined && (node.substance === null || node.substance === '')) {
          items.push({
            ruleCode: '3.27',
            ruleCategory: 'ICH骨架文件',
            severity: ValidationSeverity.ERROR,
            description: `属性-活性成分（substance）`,
            detail: `活性成分属性在${secNum}章节中使用时为必填项，值不能为空`,
          });
        }
      }

      // 3.28 Attribute values must not have leading/trailing spaces
      for (const attr of ['substance', 'manufacturer', 'productName', 'dosageForm', 'indication']) {
        const val = node[attr];
        if (val && typeof val === 'string' && val !== val.trim()) {
          items.push({
            ruleCode: '3.28',
            ruleCategory: 'ICH骨架文件',
            severity: ValidationSeverity.WARNING,
            description: `属性值开头和结尾不能为空格`,
            detail: `节点 ${sectionDesc} 的 ${attr} 属性值首尾含空格`,
          });
        }
      }

      // 3.36 Replace operation: language attribute must not change
      if (op === 'REPLACE' && !isFirst) {
        await this.checkLanguageConsistency(sequence, node, items);
      }
    }

    // 3.5 File must not be modified-file target multiple times in same sequence
    for (const [templateNodeId, nodeIds] of modifiedFileRefs) {
      if (nodeIds.length > 1) {
        const refNode = allNodes.find((n: any) => n.templateNodeId === templateNodeId);
        items.push({
          ruleCode: '3.5',
          ruleCategory: 'ICH骨架文件',
          severity: ValidationSeverity.ERROR,
          description: `文件在一个序列中不允许对应多个操作`,
          detail: `节点 ${refNode?.ctdSectionNumber || templateNodeId} 在同一序列中被多次引用为"被修改文件对象（modified-file）"`,
        });
      }
    }

    // 3.21 Elements starting with "m" must have leaf nodes
    for (const node of ichNonLeaves) {
      const elementName = node.elementName || '';
      if (elementName.startsWith('m')) {
        const hasLeaves = this.hasActiveDescendant(node.id, allNodes);
        if (!hasLeaves) {
          // Only report if the element would be generated (has been explicitly used)
          const children = allNodes.filter((c: any) => c.parentId === node.id);
          const hasAnyContent = children.some((c: any) => c.operation || c.status !== 'EMPTY');
          if (hasAnyContent) {
            items.push({
              ruleCode: '3.21',
              ruleCategory: 'ICH骨架文件',
              severity: ValidationSeverity.ERROR,
              description: `元素下必须有叶元素`,
              detail: `名称以"m"开始的元素 ${node.ctdSectionNumber} 必须有叶元素`,
            });
          }
        }
      }
    }

    // 3.29 Content reference: cross-application reference not allowed
    for (const node of ichLeaves) {
      for (const file of node.fileAttachments || []) {
        if (file.isReference && file.referenceFileId) {
          // Check if the referenced file belongs to the same application
          const refFile = await this.prisma.fileAttachment.findUnique({
            where: { id: file.referenceFileId },
            include: {
              sequenceNode: {
                include: {
                  sequence: {
                    include: { regulatoryActivity: true },
                  },
                },
              },
            },
          });
          if (refFile) {
            const refAppId = refFile.sequenceNode.sequence.regulatoryActivity.applicationId;
            const currentAppId = sequence.regulatoryActivity.applicationId;
            if (refAppId !== currentAppId) {
              items.push({
                ruleCode: '3.29',
                ruleCategory: 'ICH骨架文件',
                severity: ValidationSeverity.ERROR,
                description: `内容的引用`,
                detail: `骨架文件中不允许包含跨申请引用，只能引用同一申请中早先已提交序列的内容`,
                filePath: file.ectdRelativePath,
              });
            }
          }
        }
      }
    }

    // 3.30-3.33 Lifecycle validation
    if (!isFirst) {
      await this.validateLifecycle(sequence, ichLeaves, items, 'ICH骨架文件', '3');
    }
  }

  /**
   * Validate lifecycle rules: prevent invalid operation sequences
   * 3.30/4.1.25: append after replace → ERROR
   * 3.31/4.1.26: delete after replace → ERROR
   * 3.32/4.1.27: replace after replace → ERROR (second replace)
   * 3.33/4.1.28: any operation on deleted leaf → ERROR
   * 3.34/4.1.29: append after append (non-STF) → ERROR
   */
  private async validateLifecycle(
    sequence: any,
    leafNodes: any[],
    items: ValidationItemInput[],
    category: string,
    rulePrefix: string,
  ): Promise<void> {
    for (const node of leafNodes) {
      if (!node.operation) continue;
      const op = node.operation as string;

      // Get the latest operation on this node from prior sequences
      const lastOp = await this.getLastOperation(
        sequence.regulatoryActivityId,
        sequence.sequenceNumber,
        node.templateNodeId,
      );
      if (!lastOp) continue;

      const sectionDesc = `${node.ctdSectionNumber} ${node.title}`;

      // 3.33/4.1.28: Already deleted leaf cannot have any further operation
      if (lastOp === 'DELETE') {
        items.push({
          ruleCode: `${rulePrefix}.33`,
          ruleCategory: category,
          severity: ValidationSeverity.ERROR,
          description: `检测无效的生命周期模式：对已删除叶元素的操作`,
          detail: `节点 ${sectionDesc}: 已被删除的叶元素不能再做其他任何操作`,
        });
        continue;
      }

      // 3.30/4.1.25: Replaced leaf cannot be appended
      if (lastOp === 'REPLACE' && op === 'APPEND') {
        items.push({
          ruleCode: `${rulePrefix}.30`,
          ruleCategory: category,
          severity: ValidationSeverity.ERROR,
          description: `检测无效的生命周期模式：增补操作造成分支`,
          detail: `节点 ${sectionDesc}: 已经被替换的叶元素不能再进行增补操作`,
        });
      }

      // 3.31/4.1.26: Replaced leaf cannot be deleted
      if (lastOp === 'REPLACE' && op === 'DELETE') {
        items.push({
          ruleCode: `${rulePrefix}.31`,
          ruleCategory: category,
          severity: ValidationSeverity.ERROR,
          description: `检测无效的生命周期模式：删除操作造成分支`,
          detail: `节点 ${sectionDesc}: 已经被替换的叶元素不能再进行删除操作`,
        });
      }

      // 3.32/4.1.27: Replaced leaf cannot be replaced again
      if (lastOp === 'REPLACE' && op === 'REPLACE') {
        items.push({
          ruleCode: `${rulePrefix}.32`,
          ruleCategory: category,
          severity: ValidationSeverity.ERROR,
          description: `检测无效的生命周期模式：替换操作造成分支`,
          detail: `节点 ${sectionDesc}: 已经被替换的叶元素不能再进行第二次替换操作`,
        });
      }

      // 3.34/4.1.29: Appended leaf cannot be appended again (non-STF)
      if (lastOp === 'APPEND' && op === 'APPEND' && !node.templateNode.requiresStf) {
        items.push({
          ruleCode: `${rulePrefix}.34`,
          ruleCategory: category,
          severity: ValidationSeverity.ERROR,
          description: `检测无效的生命周期模式：对增补的叶元素进行增补操作`,
          detail: `节点 ${sectionDesc}: 不允许对已增补的叶元素使用增补操作（此规则不适用于STF）`,
        });
      }
    }
  }

  private async getLastOperation(
    regulatoryActivityId: string,
    currentSeqNumber: string,
    templateNodeId: string,
  ): Promise<string | null> {
    const priorSeqs = await this.prisma.sequence.findMany({
      where: {
        regulatoryActivityId,
        sequenceNumber: { lt: currentSeqNumber },
      },
      select: { id: true, sequenceNumber: true },
      orderBy: { sequenceNumber: 'desc' },
    });

    for (const seq of priorSeqs) {
      const node = await this.prisma.sequenceNode.findFirst({
        where: {
          sequenceId: seq.id,
          templateNodeId,
          operation: { not: null },
        },
        select: { operation: true },
      });
      if (node) return node.operation;
    }
    return null;
  }

  private async checkPriorNodeExists(
    regulatoryActivityId: string,
    currentSeqNumber: string,
    templateNodeId: string,
  ): Promise<boolean> {
    const lastOp = await this.getLastOperation(regulatoryActivityId, currentSeqNumber, templateNodeId);
    return lastOp !== null;
  }

  private async checkLanguageConsistency(
    sequence: any,
    node: any,
    items: ValidationItemInput[],
  ): Promise<void> {
    if (!node.fileAttachments?.length) return;
    const currentLang = node.fileAttachments[0].xmlLang;

    const priorSeqs = await this.prisma.sequence.findMany({
      where: {
        regulatoryActivityId: sequence.regulatoryActivityId,
        sequenceNumber: { lt: sequence.sequenceNumber },
      },
      select: { id: true },
      orderBy: { sequenceNumber: 'desc' },
    });

    for (const seq of priorSeqs) {
      const priorNode = await this.prisma.sequenceNode.findFirst({
        where: {
          sequenceId: seq.id,
          templateNodeId: node.templateNodeId,
          operation: { not: null },
        },
        include: { fileAttachments: { take: 1 } },
      });
      if (priorNode?.fileAttachments?.[0]) {
        const priorLang = priorNode.fileAttachments[0].xmlLang;
        if (currentLang && priorLang && currentLang !== priorLang) {
          items.push({
            ruleCode: '3.36',
            ruleCategory: 'ICH骨架文件',
            severity: ValidationSeverity.WARNING,
            description: `替换操作时语言属性不得变更`,
            detail: `节点 ${node.ctdSectionNumber}: 原文件语言 ${priorLang}, 替换文件语言 ${currentLang}`,
          });
        }
        break;
      }
    }
  }

  // ============================================================
  // Category 4.1: Regional Backbone Validation (4.1.1 - 4.1.31)
  // ============================================================

  private async validateRegionalBackbone(
    sequence: any,
    isFirst: boolean,
    items: ValidationItemInput[],
  ): Promise<void> {
    const allNodes = sequence.sequenceNodes;
    const m1Leaves = allNodes.filter(
      (n: any) => n.templateNode.module === 1 && n.isLeaf,
    );
    const m1NonLeaves = allNodes.filter(
      (n: any) => n.templateNode.module === 1 && !n.isLeaf,
    );

    // Track modified-file duplicates (4.1.6)
    const modifiedFileRefs = new Map<string, string[]>();

    for (const node of m1Leaves) {
      if (!node.operation) continue;
      const op = node.operation as string;
      const sectionDesc = `${node.ctdSectionNumber} ${node.title}`;

      // 4.1.8 NEW/REPLACE/APPEND must have xlink:href
      if (['NEW', 'REPLACE', 'APPEND'].includes(op) && (!node.fileAttachments || node.fileAttachments.length === 0)) {
        items.push({
          ruleCode: '4.1.8',
          ruleCategory: '区域性管理信息',
          severity: ValidationSeverity.ERROR,
          description: `叶元素：新建、替换或增补的叶元素，必须有"文件引用（xlink:href）"值`,
          detail: `节点 ${sectionDesc} 操作为 ${op.toLowerCase()} 但无文件`,
        });
      }

      // 4.1.9 DELETE must NOT have xlink:href
      if (op === 'DELETE' && node.fileAttachments?.length > 0) {
        items.push({
          ruleCode: '4.1.9',
          ruleCategory: '区域性管理信息',
          severity: ValidationSeverity.ERROR,
          description: `叶元素：删除的叶元素不能包含"文件引用（xlink:href）"值`,
          detail: `节点 ${sectionDesc}`,
        });
      }

      // 4.1.10 REPLACE/DELETE/APPEND must have modified-file
      if (['REPLACE', 'DELETE', 'APPEND'].includes(op)) {
        const refKey = node.templateNodeId;
        if (!modifiedFileRefs.has(refKey)) {
          modifiedFileRefs.set(refKey, []);
        }
        modifiedFileRefs.get(refKey)!.push(node.id);
      }

      // 4.1.11 First sequence: all must be NEW
      if (isFirst && op !== 'NEW') {
        items.push({
          ruleCode: '4.1.11',
          ruleCategory: '区域性管理信息',
          severity: ValidationSeverity.ERROR,
          description: `叶元素：初始序列中所有文件必须为新建（new）`,
          detail: `节点 ${sectionDesc}: 当前操作为 ${op.toLowerCase()}`,
        });
      }

      // 4.1.14 说明函 operation must always be NEW
      const elementName = node.elementName || node.templateNode.elementName || '';
      if (elementName === 'cn-1-0' || node.ctdSectionNumber === 'cn-1-0') {
        if (op !== 'NEW') {
          items.push({
            ruleCode: '4.1.14',
            ruleCategory: '区域性管理信息',
            severity: ValidationSeverity.ERROR,
            description: `说明函的"操作（operations）"属性`,
            detail: `所有说明函的"操作（operation）"属性值必须为"新建（new）"`,
          });
        }
      }

      // 4.1.15 申请表 for first submission must be NEW
      if (isFirst && (elementName === 'cn-1-2' || node.ctdSectionNumber === 'cn-1-2')) {
        if (op !== 'NEW') {
          items.push({
            ruleCode: '4.1.15',
            ruleCategory: '区域性管理信息',
            severity: ValidationSeverity.ERROR,
            description: `申请表的"操作（operations）"属性`,
            detail: `序列类型为"首次提交"，且提交序列中包含申请表文件时，其操作必须为"新建（new）"`,
          });
        }
      }

      // 4.1.16 Node extensions not allowed in regional backbone
      if (elementName.includes('-ext-') || elementName.includes('node-extension')) {
        items.push({
          ruleCode: '4.1.16',
          ruleCategory: '区域性管理信息',
          severity: ValidationSeverity.ERROR,
          description: `不允许使用"扩展节点（Node Extension）"`,
          detail: `不允许在区域骨架文件结构中使用扩展节点`,
        });
      }

      // 4.1.17 Leaf title must not be empty
      if (!node.title || node.title.trim() === '') {
        items.push({
          ruleCode: '4.1.17',
          ruleCategory: '区域性管理信息',
          severity: ValidationSeverity.ERROR,
          description: `叶标题不能为空`,
          detail: `节点 ${node.ctdSectionNumber} 的标题为空`,
        });
      }

      // 4.1.19 Leaf title no leading/trailing spaces
      if (node.title && node.title !== node.title.trim()) {
        items.push({
          ruleCode: '4.1.19',
          ruleCategory: '区域性管理信息',
          severity: ValidationSeverity.WARNING,
          description: `叶标题开头和结尾不能为空格`,
          detail: `节点 ${sectionDesc}`,
        });
      }

      // 4.1.30 Append usage warning in regional backbone
      if (op === 'APPEND') {
        items.push({
          ruleCode: '4.1.30',
          ruleCategory: '区域性管理信息',
          severity: ValidationSeverity.WARNING,
          description: `增补（append）的使用`,
          detail: `不建议在区域骨架文件中使用"增补（append）"操作属性`,
        });
      }

      // 4.1.31 Replace: language must not change
      if (op === 'REPLACE' && !isFirst) {
        await this.checkRegionalLanguageConsistency(sequence, node, items);
      }

      // 4.1.12 File paths: relative, forward slashes
      for (const file of node.fileAttachments || []) {
        if (file.ectdRelativePath?.includes('\\')) {
          items.push({
            ruleCode: '4.1.5',
            ruleCategory: '区域性管理信息',
            severity: ValidationSeverity.ERROR,
            description: `文件引用路径只允许使用正斜杠`,
            filePath: file.ectdRelativePath,
          });
        }
      }
    }

    // 4.1.6 File must not be modified-file target multiple times
    for (const [templateNodeId, nodeIds] of modifiedFileRefs) {
      if (nodeIds.length > 1) {
        const refNode = allNodes.find((n: any) => n.templateNodeId === templateNodeId);
        items.push({
          ruleCode: '4.1.6',
          ruleCategory: '区域性管理信息',
          severity: ValidationSeverity.ERROR,
          description: `文件在一个序列中不允许对应多个操作`,
          detail: `节点 ${refNode?.ctdSectionNumber || templateNodeId} 被多次引用为"被修改文件对象"`,
        });
      }
    }

    // 4.1.20 cn- elements must have leaf nodes
    for (const node of m1NonLeaves) {
      const elementName = node.elementName || '';
      if (elementName.startsWith('cn-')) {
        const children = allNodes.filter((c: any) => c.parentId === node.id);
        const hasActive = children.some((c: any) =>
          c.isLeaf ? (c.operation && c.operation !== 'DELETE') : this.hasActiveDescendant(c.id, allNodes),
        );
        if (!hasActive) {
          const anyContent = children.some((c: any) => c.operation || c.status !== 'EMPTY');
          if (anyContent) {
            items.push({
              ruleCode: '4.1.20',
              ruleCategory: '区域性管理信息',
              severity: ValidationSeverity.ERROR,
              description: `元素下必须有叶元素`,
              detail: `名称以"cn-"开始的元素 ${node.ctdSectionNumber} 必须有叶元素`,
            });
          }
        }
      }
    }

    // 4.1.24 Cross-application reference not allowed
    for (const node of m1Leaves) {
      for (const file of node.fileAttachments || []) {
        if (file.isReference && file.referenceFileId) {
          const refFile = await this.prisma.fileAttachment.findUnique({
            where: { id: file.referenceFileId },
            include: {
              sequenceNode: {
                include: {
                  sequence: { include: { regulatoryActivity: true } },
                },
              },
            },
          });
          if (refFile) {
            const refAppId = refFile.sequenceNode.sequence.regulatoryActivity.applicationId;
            if (refAppId !== sequence.regulatoryActivity.applicationId) {
              items.push({
                ruleCode: '4.1.24',
                ruleCategory: '区域性管理信息',
                severity: ValidationSeverity.ERROR,
                description: `内容的引用`,
                detail: `区域骨架文件中不允许包含跨申请引用`,
                filePath: file.ectdRelativePath,
              });
            }
          }
        }
      }
    }

    // 4.1.25-4.1.29 Lifecycle validation for M1
    if (!isFirst) {
      await this.validateLifecycle(sequence, m1Leaves, items, '区域性管理信息', '4.1.25'.slice(0, -3));
      // Use prefix '4.1' with rule mapping:
      // 4.1.25 = append after replace
      // 4.1.26 = delete after replace
      // 4.1.27 = replace after replace
      // 4.1.28 = operation on deleted
      // 4.1.29 = append after append
      // The validateLifecycle uses prefix.30-34, so we need specific M1 lifecycle checks
      await this.validateM1Lifecycle(sequence, m1Leaves, items);
    }
  }

  private async validateM1Lifecycle(
    sequence: any,
    m1Leaves: any[],
    items: ValidationItemInput[],
  ): Promise<void> {
    for (const node of m1Leaves) {
      if (!node.operation) continue;
      const op = node.operation as string;
      const lastOp = await this.getLastOperation(
        sequence.regulatoryActivityId,
        sequence.sequenceNumber,
        node.templateNodeId,
      );
      if (!lastOp) continue;
      const sectionDesc = `${node.ctdSectionNumber} ${node.title}`;

      if (lastOp === 'DELETE') {
        items.push({
          ruleCode: '4.1.28',
          ruleCategory: '区域性管理信息',
          severity: ValidationSeverity.ERROR,
          description: `检测无效的生命周期模式：对已删除叶元素的操作`,
          detail: `节点 ${sectionDesc}: 已被删除的叶元素不能再做其他任何操作`,
        });
        continue;
      }
      if (lastOp === 'REPLACE' && op === 'APPEND') {
        items.push({
          ruleCode: '4.1.25',
          ruleCategory: '区域性管理信息',
          severity: ValidationSeverity.ERROR,
          description: `检测无效的生命周期模式：增补操作造成分支`,
          detail: `节点 ${sectionDesc}`,
        });
      }
      if (lastOp === 'REPLACE' && op === 'DELETE') {
        items.push({
          ruleCode: '4.1.26',
          ruleCategory: '区域性管理信息',
          severity: ValidationSeverity.ERROR,
          description: `检测无效的生命周期模式：删除操作造成分支`,
          detail: `节点 ${sectionDesc}`,
        });
      }
      if (lastOp === 'REPLACE' && op === 'REPLACE') {
        items.push({
          ruleCode: '4.1.27',
          ruleCategory: '区域性管理信息',
          severity: ValidationSeverity.ERROR,
          description: `检测无效的生命周期模式：替换操作造成分支`,
          detail: `节点 ${sectionDesc}`,
        });
      }
      if (lastOp === 'APPEND' && op === 'APPEND') {
        items.push({
          ruleCode: '4.1.29',
          ruleCategory: '区域性管理信息',
          severity: ValidationSeverity.ERROR,
          description: `检测无效的生命周期模式：对增补的叶元素进行增补操作`,
          detail: `节点 ${sectionDesc}: 该规则不适用于STF的情况`,
        });
      }
    }
  }

  private async checkRegionalLanguageConsistency(
    sequence: any,
    node: any,
    items: ValidationItemInput[],
  ): Promise<void> {
    if (!node.fileAttachments?.length) return;
    const currentLang = node.fileAttachments[0].xmlLang;

    const priorSeqs = await this.prisma.sequence.findMany({
      where: {
        regulatoryActivityId: sequence.regulatoryActivityId,
        sequenceNumber: { lt: sequence.sequenceNumber },
      },
      select: { id: true },
      orderBy: { sequenceNumber: 'desc' },
    });

    for (const seq of priorSeqs) {
      const priorNode = await this.prisma.sequenceNode.findFirst({
        where: {
          sequenceId: seq.id,
          templateNodeId: node.templateNodeId,
          operation: { not: null },
        },
        include: { fileAttachments: { take: 1 } },
      });
      if (priorNode?.fileAttachments?.[0]) {
        const priorLang = priorNode.fileAttachments[0].xmlLang;
        if (currentLang && priorLang && currentLang !== priorLang) {
          items.push({
            ruleCode: '4.1.31',
            ruleCategory: '区域性管理信息',
            severity: ValidationSeverity.WARNING,
            description: `替换操作时语言属性不得变更`,
            detail: `节点 ${node.ctdSectionNumber}: 原语言 ${priorLang}, 新语言 ${currentLang}`,
          });
        }
        break;
      }
    }
  }

  // ============================================================
  // Category 4.2: Envelope Information (4.2.1 - 4.2.14)
  // ============================================================

  private validateEnvelopeInfo(
    sequence: any,
    app: any,
    ra: any,
    isFirst: boolean,
    items: ValidationItemInput[],
  ): void {
    // 4.2.1 application-id format
    const appNum = app.applicationNumber || '';
    if (!/^[xyls]\d{9}$/.test(appNum)) {
      items.push({
        ruleCode: '4.2.1',
        ruleCategory: '区域性管理信息',
        severity: ValidationSeverity.ERROR,
        description: `信封元素：申请编号`,
        detail: `当前: ${appNum}, 要求: 字母前缀(x/y/l/s) + 4位年份 + 5位流水号`,
        suggestion: '申请编号必须符合《eCTD技术规范V1.1》中的编码规则',
      });
    }

    // 4.2.2 application-type in controlled vocabulary
    const validAppTypes = ['cnapt1', 'cnapt2', 'cnapt3', 'cnapt4'];
    if (!validAppTypes.includes(app.applicationTypeCode)) {
      items.push({
        ruleCode: '4.2.2',
        ruleCategory: '区域性管理信息',
        severity: ValidationSeverity.ERROR,
        description: `信封元素：申请类型`,
        detail: `当前: ${app.applicationTypeCode}，必须参考"cv-application-type.xml"中的定义`,
      });
    }

    // 4.2.3 product-type
    const validPrdTypes = ['cnprt1', 'cnprt2'];
    if (!validPrdTypes.includes(app.productTypeCode)) {
      items.push({
        ruleCode: '4.2.3',
        ruleCategory: '区域性管理信息',
        severity: ValidationSeverity.ERROR,
        description: `信封元素：产品类型`,
        detail: `当前: ${app.productTypeCode}，必须参考"cv-product-type.xml"中的定义`,
      });
    }

    // 4.2.4 product-number (原始编号) must not be empty and must be 10 digits
    if (!app.productNumber || app.productNumber.trim() === '') {
      items.push({
        ruleCode: '4.2.4',
        ruleCategory: '区域性管理信息',
        severity: ValidationSeverity.ERROR,
        description: `信封元素：原始编号`,
        detail: `原始编号不能为空`,
      });
    } else if (!/^\d{10}$/.test(app.productNumber)) {
      items.push({
        ruleCode: '4.2.4',
        ruleCategory: '区域性管理信息',
        severity: ValidationSeverity.ERROR,
        description: `信封元素：原始编号`,
        detail: `原始编号必须为10位数字（年份4位+流水号6位），当前值: ${app.productNumber}`,
      });
    }

    // 4.2.5 related-sequence: must be 4 digits, <= current sequence number
    const relatedSeq = ra.relatedSequence || '';
    if (!/^\d{4}$/.test(relatedSeq)) {
      items.push({
        ruleCode: '4.2.5',
        ruleCategory: '区域性管理信息',
        severity: ValidationSeverity.ERROR,
        description: `信封元素：相关序列`,
        detail: `相关序列必须是4位数字，且小于或等于当前序列号`,
      });
    } else {
      const relatedNum = parseInt(relatedSeq, 10);
      const currentNum = parseInt(sequence.sequenceNumber, 10);
      if (relatedNum > currentNum) {
        items.push({
          ruleCode: '4.2.5',
          ruleCategory: '区域性管理信息',
          severity: ValidationSeverity.ERROR,
          description: `信封元素：相关序列`,
          detail: `相关序列 ${relatedSeq} 不应大于当前序列号 ${sequence.sequenceNumber}`,
        });
      }
    }

    // 4.2.6 regulatory-activity-type
    const validRats = [
      'cnrat1', 'cnrat2', 'cnrat3', 'cnrat4', 'cnrat5',
      'cnrat6', 'cnrat7', 'cnrat8', 'cnrat9',
    ];
    if (!validRats.includes(ra.regulatoryActivityTypeCode)) {
      items.push({
        ruleCode: '4.2.6',
        ruleCategory: '区域性管理信息',
        severity: ValidationSeverity.ERROR,
        description: `信封元素：注册行为类型`,
        detail: `当前: ${ra.regulatoryActivityTypeCode}，必须参考"cv-regulatory-activity-type.xml"中的定义`,
      });
    }

    // 4.2.7 sequence-number: 4 digits
    if (!/^\d{4}$/.test(sequence.sequenceNumber || '')) {
      items.push({
        ruleCode: '4.2.7',
        ruleCategory: '区域性管理信息',
        severity: ValidationSeverity.ERROR,
        description: `信封元素：序列号`,
        detail: `序列号必须由四位数字组成，当前: ${sequence.sequenceNumber}`,
      });
    }

    // 4.2.8 sequence-type
    const validSqts = ['cnsqt1', 'cnsqt2', 'cnsqt3', 'cnsqt4'];
    if (!validSqts.includes(sequence.sequenceTypeCode)) {
      items.push({
        ruleCode: '4.2.8',
        ruleCategory: '区域性管理信息',
        severity: ValidationSeverity.ERROR,
        description: `信封元素：序列类型`,
        detail: `当前: ${sequence.sequenceTypeCode}，必须参考"cv-sequence-type.xml"中的定义`,
      });
    }

    // 4.2.9 sequence description: not empty, max 120 Chinese characters
    if (!sequence.description || sequence.description.trim() === '') {
      items.push({
        ruleCode: '4.2.9',
        ruleCategory: '区域性管理信息',
        severity: ValidationSeverity.ERROR,
        description: `信封元素：序列描述`,
        detail: `序列描述不能为空`,
      });
    } else if (sequence.description.length > 120) {
      items.push({
        ruleCode: '4.2.9',
        ruleCategory: '区域性管理信息',
        severity: ValidationSeverity.ERROR,
        description: `信封元素：序列描述`,
        detail: `序列描述总长度不能超过120个中文字符，当前: ${sequence.description.length}`,
      });
    }

    // 4.2.11 related-sequence for non-first/non-format-conversion
    if (sequence.sequenceTypeCode !== 'cnsqt1' && sequence.sequenceTypeCode !== 'cnsqt4') {
      // related-sequence should NOT equal current sequence number
      if (relatedSeq === sequence.sequenceNumber) {
        items.push({
          ruleCode: '4.2.11',
          ruleCategory: '区域性管理信息',
          severity: ValidationSeverity.ERROR,
          description: `相关序列的值`,
          detail: `如果序列类型不是首次提交或格式转换，则相关序列不应与当前序列号相同`,
        });
      }
    }

    // 4.2.12 related-sequence for first submission or format conversion
    if (sequence.sequenceTypeCode === 'cnsqt1' || sequence.sequenceTypeCode === 'cnsqt4') {
      // related-sequence should equal current sequence number
      if (relatedSeq !== sequence.sequenceNumber) {
        items.push({
          ruleCode: '4.2.12',
          ruleCategory: '区域性管理信息',
          severity: ValidationSeverity.ERROR,
          description: `相关序列的值`,
          detail: `如果序列类型是首次提交或格式转换，则相关序列应与当前序列号相同`,
        });
      }
    }

    // Contact info validation (not a specific CDE rule number but needed)
    if (!sequence.contactName || !sequence.contactPhone || !sequence.contactEmail) {
      items.push({
        ruleCode: '4.2.9',
        ruleCategory: '区域性管理信息',
        severity: ValidationSeverity.ERROR,
        description: `信封元素：序列联系人信息不完整`,
        detail: `姓名/电话/邮箱均为必填`,
      });
    }
  }

  // ============================================================
  // Category 4.2 async: Envelope Immutability (4.2.10, 4.2.13, 4.2.14)
  // ============================================================

  private async validateEnvelopeImmutability(
    sequence: any,
    app: any,
    ra: any,
    items: ValidationItemInput[],
  ): Promise<void> {
    // 4.2.10 depend-apt-rat-sqt validation
    const dependency = await this.prisma.cvDependency.findFirst({
      where: {
        applicationTypeCode: app.applicationTypeCode,
        regulatoryActivityTypeCode: ra.regulatoryActivityTypeCode,
      },
    });
    if (!dependency) {
      items.push({
        ruleCode: '4.2.10',
        ruleCategory: '区域性管理信息',
        severity: ValidationSeverity.ERROR,
        description: `信封元素：序列相关信息`,
        detail: `申请类型 ${app.applicationTypeCode}、注册行为类型 ${ra.regulatoryActivityTypeCode} 的关联关系不在"depend-apt-rat-sqt.xml"定义中`,
      });
    } else if (dependency.sequenceTypeCode && dependency.sequenceTypeCode !== sequence.sequenceTypeCode) {
      items.push({
        ruleCode: '4.2.10',
        ruleCategory: '区域性管理信息',
        severity: ValidationSeverity.ERROR,
        description: `信封元素：序列相关信息`,
        detail: `序列类型 ${sequence.sequenceTypeCode} 与关联关系定义不匹配，期望: ${dependency.sequenceTypeCode}`,
      });
    }

    // 4.2.13 Application-level envelope immutability
    const allSeqsInApp = await this.prisma.sequence.findMany({
      where: {
        regulatoryActivity: {
          applicationId: app.id,
        },
        sequenceNumber: { lt: sequence.sequenceNumber },
      },
      include: {
        regulatoryActivity: {
          include: { application: true },
        },
      },
      take: 1,
      orderBy: { sequenceNumber: 'asc' },
    });

    if (allSeqsInApp.length > 0) {
      const firstSeq = allSeqsInApp[0];
      const firstApp = firstSeq.regulatoryActivity?.application;
      if (!firstApp) return;
      // Check immutable fields
      if (firstApp.applicationNumber !== app.applicationNumber) {
        items.push({
          ruleCode: '4.2.13',
          ruleCategory: '区域性管理信息',
          severity: ValidationSeverity.ERROR,
          description: `申请级别的信封元素必须保持不变`,
          detail: `申请编号在生命周期中不能更改: 初始=${firstApp.applicationNumber}, 当前=${app.applicationNumber}`,
        });
      }
      if (firstApp.applicationTypeCode !== app.applicationTypeCode) {
        items.push({
          ruleCode: '4.2.13',
          ruleCategory: '区域性管理信息',
          severity: ValidationSeverity.ERROR,
          description: `申请级别的信封元素必须保持不变`,
          detail: `申请类型在生命周期中不能更改`,
        });
      }
      if (firstApp.productTypeCode !== app.productTypeCode) {
        items.push({
          ruleCode: '4.2.13',
          ruleCategory: '区域性管理信息',
          severity: ValidationSeverity.ERROR,
          description: `申请级别的信封元素必须保持不变`,
          detail: `产品类型在生命周期中不能更改`,
        });
      }
      if (firstApp.productNumber !== app.productNumber) {
        items.push({
          ruleCode: '4.2.13',
          ruleCategory: '区域性管理信息',
          severity: ValidationSeverity.ERROR,
          description: `申请级别的信封元素必须保持不变`,
          detail: `原始编号在生命周期中不能更改`,
        });
      }
    }

    // 4.2.14 RA type immutability within same regulatory activity
    const allSeqsInRA = await this.prisma.sequence.findMany({
      where: {
        regulatoryActivityId: ra.id,
        sequenceNumber: { lt: sequence.sequenceNumber },
      },
      include: { regulatoryActivity: true },
      take: 1,
    });

    if (allSeqsInRA.length > 0) {
      const firstRASeq = allSeqsInRA[0];
      if (firstRASeq.regulatoryActivity?.regulatoryActivityTypeCode && firstRASeq.regulatoryActivity.regulatoryActivityTypeCode !== ra.regulatoryActivityTypeCode) {
        items.push({
          ruleCode: '4.2.14',
          ruleCategory: '区域性管理信息',
          severity: ValidationSeverity.ERROR,
          description: `注册行为类型必须保持不变`,
          detail: `同一注册行为的所有序列，其注册行为类型的值必须相同`,
        });
      }
    }
  }

  // ============================================================
  // Category 4.3: Completeness Rules
  // ============================================================

  private async validateCompleteness(
    sequence: any,
    app: any,
    ra: any,
    items: ValidationItemInput[],
  ): Promise<void> {
    const rules = await this.prisma.ctdCompletenessRule.findMany({
      where: {
        applicationTypeCode: app.applicationTypeCode,
        regulatoryActivityTypeCode: ra.regulatoryActivityTypeCode,
      },
      include: {
        templateNode: { select: { elementName: true, ctdSectionNumber: true, titleZh: true } },
      },
    });

    const nodeByTemplateId = new Map<string, any>();
    for (const n of sequence.sequenceNodes) {
      nodeByTemplateId.set(n.templateNodeId, n);
    }

    for (const rule of rules) {
      const seqNode = nodeByTemplateId.get(rule.templateNodeId);

      if (rule.ruleType === 'REQUIRED') {
        const hasContent =
          seqNode &&
          seqNode.status === 'COMPLETED' &&
          (seqNode.fileAttachments?.length > 0 || seqNode.document);

        if (!hasContent) {
          items.push({
            ruleCode: `4.3`,
            ruleCategory: '区域性管理信息',
            severity:
              rule.severity === 'ERROR'
                ? ValidationSeverity.ERROR
                : ValidationSeverity.WARNING,
            description: `必填章节缺失: ${rule.templateNode.ctdSectionNumber} ${rule.templateNode.titleZh}`,
            detail: `申请类型 ${app.applicationTypeCode} + 注册行为 ${ra.regulatoryActivityTypeCode} 要求此章节`,
            suggestion: '请完成此章节的内容编辑',
          });
        }
      } else if (rule.ruleType === 'FORBIDDEN') {
        if (seqNode && seqNode.status !== 'EMPTY') {
          items.push({
            ruleCode: `4.3`,
            ruleCategory: '区域性管理信息',
            severity: ValidationSeverity.WARNING,
            description: `章节不应包含内容: ${rule.templateNode.ctdSectionNumber} ${rule.templateNode.titleZh}`,
            detail: `当前申请类型和注册行为组合下此章节不应有内容`,
          });
        }
      }
    }
  }

  // ============================================================
  // Category 5: STF Validation (5.1 - 5.20)
  // ============================================================

  private validateStf(sequence: any, items: ValidationItemInput[]): void {
    const stfNodes = sequence.sequenceNodes.filter(
      (n: any) =>
        n.templateNode.requiresStf &&
        n.isLeaf &&
        n.operation &&
        n.operation !== 'DELETE',
    );

    for (const node of stfNodes) {
      const stf = node.studyTaggingFile;
      const sectionDesc = `${node.ctdSectionNumber} ${node.title}`;

      // 5.1 STF required and must be valid
      if (!stf) {
        items.push({
          ruleCode: '5.1',
          ruleCategory: 'STF',
          severity: ValidationSeverity.ERROR,
          description: `STF文件必须有效`,
          detail: `节点 ${sectionDesc} 缺少研究标签文件(STF)`,
          suggestion: '模块四 4.2.X 和模块五 5.3.1-5.3.5 的文件必须有 STF',
        });
        continue;
      }

      // 5.4 File reference must not use backslash
      // (In our system, file paths are managed, so check STF content if available)

      // 5.4 study title must not be empty
      if (!stf.studyTitle || stf.studyTitle.trim() === '') {
        items.push({
          ruleCode: '5.4',
          ruleCategory: 'STF',
          severity: ValidationSeverity.WARNING,
          description: `研究标识的标题不能为空`,
          detail: `节点 ${sectionDesc}: 研究标识的标题（study-title）不能为空`,
        });
      }

      // 5.5 study-identifier category must not be empty
      const categories = stf.categories as any;
      if (!categories || Object.keys(categories).length === 0) {
        items.push({
          ruleCode: '5.5',
          ruleCategory: 'STF',
          severity: ValidationSeverity.WARNING,
          description: `研究标识的类别不能空`,
          detail: `节点 ${sectionDesc}: 研究标识/类别（study-identifier>>category）值不能是空的`,
        });
      }

      // 5.6 study-id must not be empty
      if (!stf.studyId || stf.studyId.trim() === '') {
        items.push({
          ruleCode: '5.6',
          ruleCategory: 'STF',
          severity: ValidationSeverity.WARNING,
          description: `研究标识的研究ID不能为空`,
          detail: `节点 ${sectionDesc}`,
        });
      }

      // 5.7 Study title must match leaf title
      if (stf.studyTitle && node.title && stf.studyTitle !== node.title) {
        items.push({
          ruleCode: '5.7',
          ruleCategory: 'STF',
          severity: ValidationSeverity.WARNING,
          description: `研究标识的标题必须与叶元素的叶标题匹配`,
          detail: `节点 ${sectionDesc}: STF标题="${stf.studyTitle}", 叶标题="${node.title}"`,
        });
      }

      // 5.8 tag and category values must be valid (from valid-values.xml)
      const fileTags = stf.fileTags as any[];
      if (fileTags && Array.isArray(fileTags)) {
        for (const tag of fileTags) {
          if (!tag.name || tag.name.trim() === '') {
            items.push({
              ruleCode: '5.8',
              ruleCategory: 'STF',
              severity: ValidationSeverity.WARNING,
              description: `标签属性和类别元素的值`,
              detail: `节点 ${sectionDesc}: 文件标签名称为空`,
            });
          }
        }
      }

      // 5.14 STF must only exist in M4 (4.2.x) and M5 (5.3.1.x-5.3.5.x)
      const secNum = node.ctdSectionNumber || '';
      const isValidStfLocation = secNum.startsWith('4.2') ||
        (secNum.startsWith('5.3.') && !secNum.startsWith('5.3.6') && !secNum.startsWith('5.3.7'));
      if (!isValidStfLocation) {
        items.push({
          ruleCode: '5.14',
          ruleCategory: 'STF',
          severity: ValidationSeverity.WARNING,
          description: `无效STF目录位置`,
          detail: `STF只存在于模块四（4.2.x章节）和模块五（5.3.1.x-5.3.5.x章节）中`,
        });
      }

      // 5.15 Each doc-content should have only 1 file-tag
      if (fileTags && fileTags.length > 1) {
        items.push({
          ruleCode: '5.15',
          ruleCategory: 'STF',
          severity: ValidationSeverity.WARNING,
          description: `STF "doc-content"的标签（file-tag）数量`,
          detail: `节点 ${sectionDesc}: 每个"doc-content"元素有且仅有1个"文件标签（file-tag）"`,
        });
      }

      // 5.16 Section 5.3.7 case report form table structure
      if (secNum.startsWith('5.3.7')) {
        items.push({
          ruleCode: '5.16',
          ruleCategory: 'STF',
          severity: ValidationSeverity.ERROR,
          description: `5.3.7章节病例报告表结构`,
          detail: `如果当前序列使用了STF，5.3.7章节禁止被使用。病例报告表必须在STF中被引用和展现`,
        });
      }
    }

    // 5.17 STF must be used for 4.2.x and 5.3.1-5.3.5
    const stfRequiredNodes = sequence.sequenceNodes.filter(
      (n: any) =>
        n.templateNode.requiresStf &&
        n.isLeaf &&
        n.operation &&
        n.operation !== 'DELETE' &&
        !n.studyTaggingFile,
    );
    for (const node of stfRequiredNodes) {
      // Already covered by 5.1, but 5.17 is the explicit usage requirement
      items.push({
        ruleCode: '5.17',
        ruleCategory: 'STF',
        severity: ValidationSeverity.ERROR,
        description: `使用STF`,
        detail: `第4.2章节中的叶元素必须使用STF引用。第5.3.1至5.3.5章节中的叶元素必须使用STF引用`,
      });
    }

    // Check non-STF nodes that incorrectly have STF
    const nonStfWithStf = sequence.sequenceNodes.filter(
      (n: any) => !n.templateNode.requiresStf && n.studyTaggingFile,
    );
    for (const node of nonStfWithStf) {
      items.push({
        ruleCode: '5.14',
        ruleCategory: 'STF',
        severity: ValidationSeverity.WARNING,
        description: `无效STF目录位置`,
        detail: `节点 ${node.ctdSectionNumber}: 非 STF 章节不应有研究标签文件`,
      });
    }
  }

  // ============================================================
  // Category 6: PDF Analysis (6.1 - 6.26)
  // Rule codes aligned with CDE eCTD验证标准V1.1
  // ============================================================

  private validatePdf(sequence: any, items: ValidationItemInput[]): void {
    for (const node of sequence.sequenceNodes) {
      for (const file of node.fileAttachments || []) {
        if (file.fileType !== 'pdf') continue;
        const analysis = file.pdfAnalysis;
        if (!analysis) continue;

        // 6.1 PDF must be readable (page count > 0)
        if (analysis.pageCount === 0) {
          items.push({
            ruleCode: '6.1',
            ruleCategory: 'PDF分析',
            severity: ValidationSeverity.ERROR,
            description: `PDF文件必须可读`,
            detail: `${file.storedName}: 页码数为0，文件可能被破坏或不可读`,
            filePath: file.ectdRelativePath,
          });
        }

        // 6.10 External hyperlinks not allowed
        if (analysis.hasExternalLinks) {
          items.push({
            ruleCode: '6.10',
            ruleCategory: 'PDF分析',
            severity: ValidationSeverity.ERROR,
            description: `有网页、邮箱地址或其他外部链接的超文本链接`,
            detail: `PDF文件中不允许使用包含网页链接、电子邮箱地址或其他外部链接的超文本链接`,
            filePath: file.ectdRelativePath,
          });
        }

        // 6.16 PDF version (WARNING in CDE spec)
        const ver = analysis.pdfVersion || '';
        const validVersions = ['1.4', '1.5', '1.6', '1.7'];
        const isPdfA = ver.toLowerCase().includes('pdf/a');
        if (!validVersions.includes(ver) && !isPdfA) {
          items.push({
            ruleCode: '6.16',
            ruleCategory: 'PDF分析',
            severity: ValidationSeverity.WARNING,
            description: `PDF版本必须正确`,
            detail: `${file.storedName}: 版本 ${ver}, 允许 1.4, 1.5, 1.6, 1.7, PDF/A-1, PDF/A-2`,
            filePath: file.ectdRelativePath,
          });
        }

        // 6.17 No attachments
        if (analysis.hasAttachments) {
          items.push({
            ruleCode: '6.17',
            ruleCategory: 'PDF分析',
            severity: ValidationSeverity.ERROR,
            description: `不允许带附件的PDF文件`,
            detail: `PDF文件中不能嵌入任何附件`,
            filePath: file.ectdRelativePath,
          });
        }

        // 6.19 No security settings
        if (analysis.isEncrypted) {
          items.push({
            ruleCode: '6.19',
            ruleCategory: 'PDF分析',
            severity: ValidationSeverity.ERROR,
            description: `PDF文件不能有任何安全设置`,
            detail: `不能提交有安全设置的PDF文件，例如限制选择文本或图形等`,
            filePath: file.ectdRelativePath,
          });
        }

        // 6.21 No password protection
        // (In our system, encryption covers password protection)

        // 6.23 Documents > 5 pages must have bookmarks
        if (analysis.pageCount > 5 && !analysis.hasBookmarks) {
          items.push({
            ruleCode: '6.23',
            ruleCategory: 'PDF分析',
            severity: ValidationSeverity.ERROR,
            description: `大于5页的文件必须有书签`,
            detail: `${file.storedName}: ${analysis.pageCount} 页，无书签`,
            filePath: file.ectdRelativePath,
          });
        }

        // 6.8 Bookmark zoom must be Inherit Zoom (WARNING)
        if (analysis.hasBookmarks && !analysis.bookmarkZoomInherit) {
          items.push({
            ruleCode: '6.8',
            ruleCategory: 'PDF分析',
            severity: ValidationSeverity.WARNING,
            description: `书签必须承前缩放（Inherit Zoom）`,
            detail: `所有的书签的放大率设置应为承前缩放（Inherit Zoom）`,
            filePath: file.ectdRelativePath,
          });
        }

        // 6.24 No JavaScript, 3D content, or audio/video (WARNING in CDE)
        if (analysis.hasJavascript) {
          items.push({
            ruleCode: '6.24',
            ruleCategory: 'PDF分析',
            severity: ValidationSeverity.WARNING,
            description: `PDF内容限制`,
            detail: `PDF文件不能包含JavaScript`,
            filePath: file.ectdRelativePath,
          });
        }
        if (analysis.hasMultimedia) {
          items.push({
            ruleCode: '6.24',
            ruleCategory: 'PDF分析',
            severity: ValidationSeverity.WARNING,
            description: `PDF内容限制`,
            detail: `PDF文件不能包含3D内容或动态内容（音频/视频）`,
            filePath: file.ectdRelativePath,
          });
        }

        // 6.25 PDF text must be searchable (WARNING)
        if (!analysis.isTextSearchable) {
          items.push({
            ruleCode: '6.25',
            ruleCategory: 'PDF分析',
            severity: ValidationSeverity.WARNING,
            description: `PDF内容可搜索`,
            detail: `PDF文件中的文本必须可搜索。如果是扫描页面，则应使用OCR提供可搜索的文本`,
            filePath: file.ectdRelativePath,
          });
        }

        // 6.26 Non-standard fonts must be embedded (WARNING)
        if (!analysis.fontsEmbedded) {
          items.push({
            ruleCode: '6.26',
            ruleCategory: 'PDF分析',
            severity: ValidationSeverity.WARNING,
            description: `如使用非标准字体，需嵌入在PDF文件中`,
            detail: `PDF文件应尽量使用标准字体。如果包含非标准字体，则需要在文件中嵌入该非标准字体`,
            filePath: file.ectdRelativePath,
            suggestion: '标准字体包括：宋体、黑体、Times New Roman、Arial、Courier New、Symbol、Zapf Dingbats',
          });
        }
      }
    }
  }

  // ============================================================
  // Get Report
  // ============================================================

  async getReport(reportId: string) {
    return this.prisma.validationReport.findUnique({
      where: { id: reportId },
      include: {
        items: {
          orderBy: [{ severity: 'asc' }, { ruleCode: 'asc' }],
        },
      },
    });
  }

  async getLatestReport(sequenceId: string) {
    return this.prisma.validationReport.findFirst({
      where: { sequenceId },
      orderBy: { createdAt: 'desc' },
      include: {
        items: {
          orderBy: [{ severity: 'asc' }, { ruleCode: 'asc' }],
        },
      },
    });
  }
}
