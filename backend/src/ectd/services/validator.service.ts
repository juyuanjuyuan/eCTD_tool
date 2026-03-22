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

// Required util/dtd files
const REQUIRED_DTD_FILES = [
  'cn-regional-1-0.xsd',
  'ich-ectd-3-2.dtd',
  'ich-stf-v2-2.dtd',
  'xlink.xsd',
  'xml.xsd',
];

// Required util/style files
const REQUIRED_STYLE_FILES = [
  'cn-regional-1-1.xsl',
  'ectd-2-0.xsl',
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
          },
        },
        sequenceNodes: {
          include: {
            templateNode: { select: { module: true, requiresStf: true, elementName: true } },
            fileAttachments: { include: { pdfAnalysis: true } },
            document: { select: { xmlLang: true, wordCount: true } },
            studyTaggingFile: true,
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

    // ======== Category 1: Basic Identification (INFO) ========
    this.validateBasicIdentification(sequence, items);

    // ======== Category 2: File/Folder Validation ========
    this.validateFileStructure(sequence, items);

    // ======== Category 3: ICH Backbone (index.xml) ========
    await this.validateIchBackbone(sequence, isFirst, items);

    // ======== Category 4: Regional Information (cn-regional.xml) ========
    this.validateRegionalInfo(sequence, app, ra, isFirst, items);

    // ======== Category 4.3: Completeness Rules ========
    await this.validateCompleteness(sequence, app, ra, items);

    // ======== Category 5: STF Validation ========
    this.validateStf(sequence, items);

    // ======== Category 6: PDF Analysis ========
    this.validatePdf(sequence, items);

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
  // Category 1: Basic Identification (1.1 - 1.3)
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
  // Category 2: File/Folder Validation (2.1 - 2.10)
  // ============================================================

  private validateFileStructure(sequence: any, items: ValidationItemInput[]): void {
    const leafNodes = sequence.sequenceNodes.filter((n: any) => n.isLeaf);

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

        // 2.4 File extension check
        if (ext && !VALID_EXTENSIONS.has(ext)) {
          items.push({
            ruleCode: '2.4',
            ruleCategory: '文件/文件夹',
            severity: ValidationSeverity.WARNING,
            description: `文件扩展名不在允许列表中`,
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
            description: `文件名不符合命名规范`,
            detail: `${file.storedName}: 仅允许 a-z, 0-9, -, _`,
            filePath: file.ectdRelativePath,
            suggestion: '请使用小写字母、数字、连字符或下划线命名',
          });
        }

        // 2.5 Path length check
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

        // 2.5 Single name length check
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

    // 2.3 Unreferenced files (check if all files are referenced by a leaf)
    // This is validated during package assembly rather than here since files are tracked in DB
  }

  // ============================================================
  // Category 3: ICH Backbone Validation (3.1 - 3.36)
  // ============================================================

  private async validateIchBackbone(
    sequence: any,
    isFirst: boolean,
    items: ValidationItemInput[],
  ): Promise<void> {
    const ichNodes = sequence.sequenceNodes.filter(
      (n: any) => n.templateNode.module >= 2 && n.isLeaf,
    );

    const leafIdSet = new Set<string>();

    for (const node of ichNodes) {
      if (!node.operation) continue;
      const op = node.operation as string;

      // 3.5 Operation must be valid
      if (!['NEW', 'REPLACE', 'APPEND', 'DELETE'].includes(op)) {
        items.push({
          ruleCode: '3.5',
          ruleCategory: 'ICH骨架文件',
          severity: ValidationSeverity.ERROR,
          description: `叶元素操作类型无效: ${op}`,
          detail: `节点 ${node.ctdSectionNumber} ${node.title}`,
        });
      }

      // 3.6 First sequence: all must be NEW
      if (isFirst && op !== 'NEW') {
        items.push({
          ruleCode: '3.6',
          ruleCategory: 'ICH骨架文件',
          severity: ValidationSeverity.ERROR,
          description: `首次提交序列中叶元素操作必须为 new`,
          detail: `节点 ${node.ctdSectionNumber}: 当前操作为 ${op.toLowerCase()}`,
          suggestion: '首次提交(0000)的所有叶元素必须使用 new 操作',
        });
      }

      // 3.7 Non-first: replace/append/delete must have modified-file concept
      // Since we track this in the DB via templateNodeId, we verify prior existence
      if (!isFirst && ['REPLACE', 'APPEND', 'DELETE'].includes(op)) {
        const prevExists = await this.checkPriorNodeExists(
          sequence.regulatoryActivityId,
          sequence.sequenceNumber,
          node.templateNodeId,
        );
        if (!prevExists) {
          items.push({
            ruleCode: '3.8',
            ruleCategory: 'ICH骨架文件',
            severity: ValidationSeverity.ERROR,
            description: `${op.toLowerCase()} 操作指向的原文件在前序序列中不存在`,
            detail: `节点 ${node.ctdSectionNumber} ${node.title}`,
            suggestion: '确保被修改的文件在前序序列中已存在',
          });
        }
      }

      // 3.16/3.17 Delete must not have xlink:href and checksum
      if (op === 'DELETE' && node.fileAttachments?.length > 0) {
        items.push({
          ruleCode: '3.16',
          ruleCategory: 'ICH骨架文件',
          severity: ValidationSeverity.ERROR,
          description: `delete 操作的叶元素不应引用文件`,
          detail: `节点 ${node.ctdSectionNumber} 有 ${node.fileAttachments.length} 个文件附件`,
          suggestion: '删除操作不需要文件引用(xlink:href)和校验值(checksum)',
        });
      }

      // 3.4 Non-delete must have files
      if (op !== 'DELETE' && (!node.fileAttachments || node.fileAttachments.length === 0)) {
        items.push({
          ruleCode: '3.4',
          ruleCategory: 'ICH骨架文件',
          severity: ValidationSeverity.ERROR,
          description: `叶元素缺少文件引用`,
          detail: `节点 ${node.ctdSectionNumber} ${node.title} 操作为 ${op.toLowerCase()} 但无文件`,
          suggestion: '请上传对应的文件',
        });
      }

      // Verify file checksums
      for (const file of node.fileAttachments || []) {
        // 3.9 Path must use forward slashes
        if (file.ectdRelativePath?.includes('\\')) {
          items.push({
            ruleCode: '3.9',
            ruleCategory: 'ICH骨架文件',
            severity: ValidationSeverity.ERROR,
            description: `文件路径使用了反斜杠`,
            filePath: file.ectdRelativePath,
            suggestion: '路径必须使用正斜杠 /',
          });
        }

        // 3.10 Path must be relative
        if (
          file.ectdRelativePath?.startsWith('/') ||
          /^[a-zA-Z]:/.test(file.ectdRelativePath || '')
        ) {
          items.push({
            ruleCode: '3.10',
            ruleCategory: 'ICH骨架文件',
            severity: ValidationSeverity.ERROR,
            description: `文件路径不是相对路径`,
            filePath: file.ectdRelativePath,
            suggestion: '路径不应以 / 开头或包含盘符',
          });
        }
      }
    }

    // Check module 1 nodes too
    const m1Nodes = sequence.sequenceNodes.filter(
      (n: any) => n.templateNode.module === 1 && n.isLeaf,
    );
    for (const node of m1Nodes) {
      if (!node.operation) continue;
      const op = node.operation as string;
      if (isFirst && op !== 'NEW') {
        items.push({
          ruleCode: '4.1.4',
          ruleCategory: '区域性管理信息',
          severity: ValidationSeverity.ERROR,
          description: `首次提交序列中模块一叶元素操作必须为 new`,
          detail: `节点 ${node.ctdSectionNumber}: 当前操作为 ${op.toLowerCase()}`,
        });
      }
    }
  }

  private async checkPriorNodeExists(
    regulatoryActivityId: string,
    currentSeqNumber: string,
    templateNodeId: string,
  ): Promise<boolean> {
    const priorSeqs = await this.prisma.sequence.findMany({
      where: {
        regulatoryActivityId,
        sequenceNumber: { lt: currentSeqNumber },
      },
      select: { id: true },
    });

    for (const seq of priorSeqs) {
      const exists = await this.prisma.sequenceNode.findFirst({
        where: {
          sequenceId: seq.id,
          templateNodeId,
          operation: { not: null },
        },
      });
      if (exists) return true;
    }
    return false;
  }

  // ============================================================
  // Category 4: Regional Information Validation (4.1 - 4.2)
  // ============================================================

  private validateRegionalInfo(
    sequence: any,
    app: any,
    ra: any,
    isFirst: boolean,
    items: ValidationItemInput[],
  ): void {
    // 4.2.1 Envelope must exist (always true since we build from DB)

    // 4.2.2 application-id format
    const appNum = app.applicationNumber || '';
    if (!/^[xyls]\d{9}$/.test(appNum)) {
      items.push({
        ruleCode: '4.2.2',
        ruleCategory: '区域性管理信息',
        severity: ValidationSeverity.ERROR,
        description: `申请编号格式不正确`,
        detail: `当前: ${appNum}, 要求: 字母前缀(x/y/l/s) + 4位年份 + 5位流水号`,
        suggestion: '申请编号格式: 字母前缀 + 年份 + 流水号，共10位',
      });
    }

    // 4.2.3 application-type in controlled vocabulary
    const validAppTypes = ['cnapt1', 'cnapt2', 'cnapt3', 'cnapt4'];
    if (!validAppTypes.includes(app.applicationTypeCode)) {
      items.push({
        ruleCode: '4.2.3',
        ruleCategory: '区域性管理信息',
        severity: ValidationSeverity.ERROR,
        description: `申请类型不在受控词汇中`,
        detail: `当前: ${app.applicationTypeCode}`,
      });
    }

    // 4.2.4 product-type
    const validPrdTypes = ['cnprt1', 'cnprt2'];
    if (!validPrdTypes.includes(app.productTypeCode)) {
      items.push({
        ruleCode: '4.2.4',
        ruleCategory: '区域性管理信息',
        severity: ValidationSeverity.ERROR,
        description: `产品类型不在受控词汇中`,
        detail: `当前: ${app.productTypeCode}`,
      });
    }

    // 4.2.5 product-number: 10 digits
    if (!/^\d{10}$/.test(app.productNumber || '')) {
      items.push({
        ruleCode: '4.2.5',
        ruleCategory: '区域性管理信息',
        severity: ValidationSeverity.ERROR,
        description: `原始编号格式不正确`,
        detail: `当前: ${app.productNumber}, 要求: 10位数字`,
      });
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
        description: `注册行为类型不在受控词汇中`,
        detail: `当前: ${ra.regulatoryActivityTypeCode}`,
      });
    }

    // 4.2.8 sequence-type
    const validSqts = ['cnsqt1', 'cnsqt2', 'cnsqt3', 'cnsqt4'];
    if (!validSqts.includes(sequence.sequenceTypeCode)) {
      items.push({
        ruleCode: '4.2.8',
        ruleCategory: '区域性管理信息',
        severity: ValidationSeverity.ERROR,
        description: `序列类型不在受控词汇中`,
        detail: `当前: ${sequence.sequenceTypeCode}`,
      });
    }

    // 4.2.10 sequence-number: 4 digits
    if (!/^\d{4}$/.test(sequence.sequenceNumber || '')) {
      items.push({
        ruleCode: '4.2.10',
        ruleCategory: '区域性管理信息',
        severity: ValidationSeverity.ERROR,
        description: `序列号格式不正确`,
        detail: `当前: ${sequence.sequenceNumber}, 要求: 4位数字`,
      });
    }

    // 4.2.11 Contact info validation
    if (!sequence.contactName || !sequence.contactPhone || !sequence.contactEmail) {
      items.push({
        ruleCode: '4.2.11',
        ruleCategory: '区域性管理信息',
        severity: ValidationSeverity.ERROR,
        description: `序列联系人信息不完整`,
        detail: `姓名/电话/邮箱均为必填`,
      });
    }

    // 4.2.12 Description required
    if (!sequence.description) {
      items.push({
        ruleCode: '4.2.12',
        ruleCategory: '区域性管理信息',
        severity: ValidationSeverity.ERROR,
        description: `序列描述为必填项`,
      });
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

      // 5.1 STF required
      if (!stf) {
        items.push({
          ruleCode: '5.1',
          ruleCategory: 'STF',
          severity: ValidationSeverity.ERROR,
          description: `缺少研究标签文件(STF)`,
          detail: `节点 ${node.ctdSectionNumber} ${node.title} 需要 STF`,
          suggestion: '模块四 4.2.X 和模块五 5.3.1-5.3.5 的文件必须有 STF',
        });
        continue;
      }

      // 5.4/5.5 Required fields
      if (!stf.studyTitle) {
        items.push({
          ruleCode: '5.4',
          ruleCategory: 'STF',
          severity: ValidationSeverity.ERROR,
          description: `STF 缺少研究标题`,
          detail: `节点 ${node.ctdSectionNumber}`,
        });
      }
      if (!stf.studyId) {
        items.push({
          ruleCode: '5.5',
          ruleCategory: 'STF',
          severity: ValidationSeverity.ERROR,
          description: `STF 缺少研究编号`,
          detail: `节点 ${node.ctdSectionNumber}`,
        });
      }
    }

    // Check non-STF nodes that have STF (shouldn't happen but flag it)
    const nonStfWithStf = sequence.sequenceNodes.filter(
      (n: any) => !n.templateNode.requiresStf && n.studyTaggingFile,
    );
    for (const node of nonStfWithStf) {
      items.push({
        ruleCode: '5.17',
        ruleCategory: 'STF',
        severity: ValidationSeverity.WARNING,
        description: `非 STF 节点不应有研究标签文件`,
        detail: `节点 ${node.ctdSectionNumber}`,
      });
    }

    // Check append warning for non-STF
    const appendNonStf = sequence.sequenceNodes.filter(
      (n: any) =>
        n.isLeaf &&
        n.operation === 'APPEND' &&
        !n.templateNode.requiresStf,
    );
    for (const node of appendNonStf) {
      items.push({
        ruleCode: '3.22',
        ruleCategory: 'ICH骨架文件',
        severity: ValidationSeverity.WARNING,
        description: `非 STF 文件使用 append 操作`,
        detail: `节点 ${node.ctdSectionNumber}: append 推荐仅对 STF 使用`,
        suggestion: '对非 STF 文件建议使用 replace 而非 append',
      });
    }
  }

  // ============================================================
  // Category 6: PDF Analysis (6.1 - 6.26)
  // ============================================================

  private validatePdf(sequence: any, items: ValidationItemInput[]): void {
    for (const node of sequence.sequenceNodes) {
      for (const file of node.fileAttachments || []) {
        if (file.fileType !== 'pdf') continue;
        const analysis = file.pdfAnalysis;
        if (!analysis) continue;

        // 6.18 PDF version
        const ver = analysis.pdfVersion || '';
        const validVersions = ['1.4', '1.5', '1.6', '1.7'];
        const isPdfA = ver.toLowerCase().includes('pdf/a');
        if (!validVersions.includes(ver) && !isPdfA) {
          items.push({
            ruleCode: '6.18',
            ruleCategory: 'PDF分析',
            severity: ValidationSeverity.ERROR,
            description: `PDF 版本不符合要求`,
            detail: `${file.storedName}: 版本 ${ver}, 要求 1.4-1.7 或 PDF/A`,
            filePath: file.ectdRelativePath,
          });
        }

        // 6.19 Encryption
        if (analysis.isEncrypted) {
          items.push({
            ruleCode: '6.19',
            ruleCategory: 'PDF分析',
            severity: ValidationSeverity.ERROR,
            description: `PDF 不允许加密`,
            filePath: file.ectdRelativePath,
          });
        }

        // 6.20 JavaScript
        if (analysis.hasJavascript) {
          items.push({
            ruleCode: '6.20',
            ruleCategory: 'PDF分析',
            severity: ValidationSeverity.ERROR,
            description: `PDF 不允许包含 JavaScript`,
            filePath: file.ectdRelativePath,
          });
        }

        // 6.21 External links
        if (analysis.hasExternalLinks) {
          items.push({
            ruleCode: '6.21',
            ruleCategory: 'PDF分析',
            severity: ValidationSeverity.ERROR,
            description: `PDF 不允许包含外部链接`,
            filePath: file.ectdRelativePath,
          });
        }

        // 6.22 Multimedia
        if (analysis.hasMultimedia) {
          items.push({
            ruleCode: '6.22',
            ruleCategory: 'PDF分析',
            severity: ValidationSeverity.ERROR,
            description: `PDF 不允许包含音视频/3D 对象`,
            filePath: file.ectdRelativePath,
          });
        }

        // 6.1 Bookmarks > 5 pages
        if (analysis.pageCount > 5 && !analysis.hasBookmarks) {
          items.push({
            ruleCode: '6.1',
            ruleCategory: 'PDF分析',
            severity: ValidationSeverity.ERROR,
            description: `超过5页的PDF必须有书签`,
            detail: `${file.storedName}: ${analysis.pageCount} 页，无书签`,
            filePath: file.ectdRelativePath,
          });
        }

        // 6.23 Bookmark zoom
        if (analysis.hasBookmarks && !analysis.bookmarkZoomInherit) {
          items.push({
            ruleCode: '6.23',
            ruleCategory: 'PDF分析',
            severity: ValidationSeverity.ERROR,
            description: `书签放大率必须为 Inherit Zoom`,
            filePath: file.ectdRelativePath,
          });
        }

        // 6.24 Attachments
        if (analysis.hasAttachments) {
          items.push({
            ruleCode: '6.24',
            ruleCategory: 'PDF分析',
            severity: ValidationSeverity.ERROR,
            description: `PDF 不允许包含附件/嵌入文件`,
            filePath: file.ectdRelativePath,
          });
        }

        // Font embedding (warning)
        if (!analysis.fontsEmbedded) {
          items.push({
            ruleCode: '6.25',
            ruleCategory: 'PDF分析',
            severity: ValidationSeverity.WARNING,
            description: `PDF 字体未完全嵌入`,
            filePath: file.ectdRelativePath,
            suggestion: '建议嵌入所有字体以确保正确显示',
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
