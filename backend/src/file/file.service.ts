import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MinioService } from './minio.service';
import { FileNameNormalizerService } from './file-name-normalizer.service';
import { PDFComplianceService } from '../export/pdf-compliance.service';
import type { ComplianceStatus } from '@prisma/client';

const CONTENT_TYPE_MAP: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.xml': 'application/xml',
  '.xpt': 'application/octet-stream',
  '.txt': 'text/plain',
  '.xsl': 'application/xml',
};

/** Image extensions allowed in editor (not eCTD content files) */
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.svg']);

@Injectable()
export class FileService {
  private readonly logger = new Logger(FileService.name);

  constructor(
    private prisma: PrismaService,
    private minio: MinioService,
    private normalizer: FileNameNormalizerService,
    private pdfCompliance: PDFComplianceService,
  ) {}

  /**
   * Upload a file to a sequence node.
   */
  async uploadFile(
    nodeId: string,
    file: Express.Multer.File,
    uploadedBy?: string,
  ) {
    // 1. Validate file extension
    this.normalizer.validateExtension(file.originalname);

    // 2. Validate file size
    this.normalizer.validateFileSize(file.size, file.originalname);

    // 3. Load node context
    const node = await this.prisma.sequenceNode.findUnique({
      where: { id: nodeId },
      include: {
        sequence: {
          include: {
            regulatoryActivity: {
              include: {
                application: {
                  include: { project: { select: { id: true } } },
                },
              },
            },
          },
        },
      },
    });
    if (!node) throw new NotFoundException('节点不存在');

    const sequence = node.sequence;
    const application = sequence.regulatoryActivity.application;
    const projectId = application.project.id;

    // 4. Normalize filename
    const normalizedName = this.normalizer.normalizeFileName(file.originalname);

    // 5. Build eCTD relative path
    const ectdRelativePath = this.normalizer.buildEctdRelativePath(
      node.ctdSectionNumber,
      normalizedName,
    );

    // 6. Build MinIO storage path
    const storagePath = this.normalizer.buildStoragePath(
      projectId,
      application.applicationNumber,
      sequence.sequenceNumber,
      ectdRelativePath,
    );

    // 7. Upload to MinIO and get MD5
    const ext = file.originalname.substring(file.originalname.lastIndexOf('.')).toLowerCase();
    const contentType = CONTENT_TYPE_MAP[ext] || 'application/octet-stream';
    const md5 = await this.minio.uploadFile(storagePath, file.buffer, contentType);

    // 8. Create FileAttachment record
    const attachment = await this.prisma.fileAttachment.create({
      data: {
        sequenceNodeId: nodeId,
        originalName: file.originalname,
        storedName: normalizedName,
        storagePath,
        ectdRelativePath,
        fileType: ext,
        fileSize: BigInt(file.size),
        md5Checksum: md5,
        xmlLang: 'zh',
        isReference: false,
        uploadedBy: uploadedBy || null,
      },
    });

    // 9. If PDF, run compliance analysis
    let pdfAnalysis = null;
    if (ext === '.pdf') {
      pdfAnalysis = await this.analyzePdf(attachment.id, file.buffer);
    }

    // 10. Auto-set node status to EDITING if it was EMPTY
    if (node.status === 'EMPTY') {
      await this.prisma.sequenceNode.update({
        where: { id: nodeId },
        data: { status: 'EDITING' },
      });
    }

    return {
      ...this.serializeAttachment(attachment),
      pdfAnalysis,
    };
  }

  /**
   * Upload multiple files to a node.
   */
  async uploadFiles(
    nodeId: string,
    files: Express.Multer.File[],
    uploadedBy?: string,
  ) {
    const results = [];
    for (const file of files) {
      const result = await this.uploadFile(nodeId, file, uploadedBy);
      results.push(result);
    }
    return results;
  }

  /**
   * List files for a node.
   */
  async listFiles(nodeId: string) {
    const files = await this.prisma.fileAttachment.findMany({
      where: { sequenceNodeId: nodeId },
      include: { pdfAnalysis: true },
      orderBy: { createdAt: 'desc' },
    });
    return files.map((f) => this.serializeAttachment(f));
  }

  /**
   * Get file detail.
   */
  async getFile(nodeId: string, fileId: string) {
    const file = await this.prisma.fileAttachment.findFirst({
      where: { id: fileId, sequenceNodeId: nodeId },
      include: { pdfAnalysis: true },
    });
    if (!file) throw new NotFoundException('文件不存在');
    return this.serializeAttachment(file);
  }

  /**
   * Delete a file.
   */
  async deleteFile(nodeId: string, fileId: string) {
    const file = await this.prisma.fileAttachment.findFirst({
      where: { id: fileId, sequenceNodeId: nodeId },
    });
    if (!file) throw new NotFoundException('文件不存在');

    // Check if any other files reference this one
    const refs = await this.prisma.fileAttachment.count({
      where: { referenceFileId: fileId },
    });
    if (refs > 0) {
      throw new BadRequestException(
        `该文件被 ${refs} 个引用使用，无法删除。请先移除引用。`,
      );
    }

    // Delete from MinIO (only if not a reference)
    if (!file.isReference && file.storagePath) {
      try {
        await this.minio.deleteFile(file.storagePath);
      } catch (err) {
        this.logger.warn(`MinIO delete failed for ${file.storagePath}: ${err}`);
      }
    }

    // Delete PDF analysis and attachment
    await this.prisma.filePdfAnalysis.deleteMany({
      where: { fileAttachmentId: fileId },
    });
    await this.prisma.fileAttachment.delete({ where: { id: fileId } });

    return { success: true };
  }

  /**
   * Get presigned download URL for a file.
   */
  async getDownloadUrl(nodeId: string, fileId: string) {
    const file = await this.prisma.fileAttachment.findFirst({
      where: { id: fileId, sequenceNodeId: nodeId },
    });
    if (!file) throw new NotFoundException('文件不存在');

    // If it's a reference, use the original file's storage path
    const storagePath = file.isReference && file.referenceFileId
      ? (await this.getOriginalStoragePath(file.referenceFileId))
      : file.storagePath;

    const url = await this.minio.getPresignedDownloadUrl(storagePath);
    return { url, originalName: file.originalName };
  }

  /**
   * Get presigned preview URL for a file.
   */
  async getPreviewUrl(nodeId: string, fileId: string) {
    const file = await this.prisma.fileAttachment.findFirst({
      where: { id: fileId, sequenceNodeId: nodeId },
    });
    if (!file) throw new NotFoundException('文件不存在');

    const storagePath = file.isReference && file.referenceFileId
      ? (await this.getOriginalStoragePath(file.referenceFileId))
      : file.storagePath;

    const url = await this.minio.getPresignedPreviewUrl(storagePath);
    return { url };
  }

  /**
   * Create a file reference (reuse from another sequence within same application).
   */
  async createFileReference(
    nodeId: string,
    sourceFileId: string,
    uploadedBy?: string,
  ) {
    // Load the source file
    const sourceFile = await this.prisma.fileAttachment.findUnique({
      where: { id: sourceFileId },
      include: {
        sequenceNode: {
          include: {
            sequence: {
              include: {
                regulatoryActivity: {
                  include: { application: true },
                },
              },
            },
          },
        },
      },
    });
    if (!sourceFile) throw new NotFoundException('源文件不存在');

    // Load target node
    const targetNode = await this.prisma.sequenceNode.findUnique({
      where: { id: nodeId },
      include: {
        sequence: {
          include: {
            regulatoryActivity: {
              include: { application: true },
            },
          },
        },
      },
    });
    if (!targetNode) throw new NotFoundException('目标节点不存在');

    // Verify same application (no cross-application references)
    const sourceAppId = sourceFile.sequenceNode.sequence.regulatoryActivity.application.id;
    const targetAppId = targetNode.sequence.regulatoryActivity.application.id;
    if (sourceAppId !== targetAppId) {
      throw new BadRequestException('不允许跨申请引用文件');
    }

    // Verify source sequence is not draft (must be submitted or at least exported)
    const sourceSeqStatus = sourceFile.sequenceNode.sequence.status;
    if (sourceSeqStatus === 'DRAFT') {
      throw new BadRequestException('不能引用草稿状态序列中的文件');
    }

    // Verify source sequence number < target sequence number
    const sourceSeqNum = sourceFile.sequenceNode.sequence.sequenceNumber;
    const targetSeqNum = targetNode.sequence.sequenceNumber;
    if (sourceSeqNum >= targetSeqNum) {
      throw new BadRequestException('只能引用前序序列（序列号更小）中的文件');
    }

    // Build relative path pointing to the source file in the prior sequence
    // xlink:href should be relative: ../../{sourceSeqNum}/{ectdRelativePath}
    const refEctdPath = sourceFile.ectdRelativePath;

    // Create the reference attachment
    const ref = await this.prisma.fileAttachment.create({
      data: {
        sequenceNodeId: nodeId,
        originalName: sourceFile.originalName,
        storedName: sourceFile.storedName,
        storagePath: sourceFile.storagePath, // Points to same MinIO object
        ectdRelativePath: refEctdPath,
        fileType: sourceFile.fileType,
        fileSize: sourceFile.fileSize,
        md5Checksum: sourceFile.md5Checksum,
        xmlLang: sourceFile.xmlLang,
        isReference: true,
        referenceFileId: sourceFileId,
        uploadedBy: uploadedBy || null,
      },
    });

    return this.serializeAttachment(ref);
  }

  /**
   * List files available for reference from prior sequences in the same application.
   */
  async listReferenceableFiles(nodeId: string) {
    const node = await this.prisma.sequenceNode.findUnique({
      where: { id: nodeId },
      include: {
        sequence: {
          include: {
            regulatoryActivity: {
              include: {
                application: {
                  include: {
                    regulatoryActivities: {
                      include: {
                        sequences: {
                          select: { id: true, sequenceNumber: true, status: true },
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
    });
    if (!node) throw new NotFoundException('节点不存在');

    const currentSeqNum = node.sequence.sequenceNumber;
    const application = node.sequence.regulatoryActivity.application;

    // Gather all prior sequence IDs (sequenceNumber < current, not DRAFT)
    const priorSequenceIds: string[] = [];
    for (const ra of application.regulatoryActivities) {
      for (const seq of ra.sequences) {
        if (seq.sequenceNumber < currentSeqNum && seq.status !== 'DRAFT') {
          priorSequenceIds.push(seq.id);
        }
      }
    }

    if (priorSequenceIds.length === 0) return [];

    // Find all non-reference files in prior sequences
    const files = await this.prisma.fileAttachment.findMany({
      where: {
        isReference: false,
        sequenceNode: {
          sequenceId: { in: priorSequenceIds },
        },
      },
      include: {
        sequenceNode: {
          select: {
            ctdSectionNumber: true,
            title: true,
            sequence: { select: { sequenceNumber: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return files.map((f) => ({
      ...this.serializeAttachment(f),
      sectionNumber: f.sequenceNode.ctdSectionNumber,
      sectionTitle: f.sequenceNode.title,
      sequenceNumber: f.sequenceNode.sequence.sequenceNumber,
    }));
  }

  /**
   * Upload an editor image to MinIO (not an eCTD content file).
   */
  async uploadEditorImage(
    sequenceId: string,
    file: Express.Multer.File,
  ): Promise<{ url: string }> {
    const ext = file.originalname.substring(file.originalname.lastIndexOf('.')).toLowerCase();
    if (!IMAGE_EXTENSIONS.has(ext)) {
      throw new BadRequestException(
        `不支持的图片格式 ${ext}。支持: ${[...IMAGE_EXTENSIONS].join(', ')}`,
      );
    }

    // Store under editor-images path (not part of eCTD package)
    const normalizedName = this.normalizer.normalizeFileName(file.originalname);
    const storagePath = `editor-images/${sequenceId}/${Date.now()}-${normalizedName}`;
    const contentType = this.getImageContentType(ext);

    await this.minio.uploadFile(storagePath, file.buffer, contentType);

    // Return presigned preview URL
    const url = await this.minio.getPresignedPreviewUrl(storagePath, 86400); // 24h
    return { url };
  }

  /**
   * Run PDF compliance analysis and store results.
   */
  private async analyzePdf(fileAttachmentId: string, buffer: Buffer) {
    const result = await this.pdfCompliance.checkCompliance(buffer);

    let status: ComplianceStatus = 'PASS';
    if (result.errors.length > 0) status = 'ERROR';
    else if (result.warnings.length > 0) status = 'WARNING';

    const analysis = await this.prisma.filePdfAnalysis.create({
      data: {
        fileAttachmentId,
        pdfVersion: result.summary.pdfVersion,
        pageCount: result.summary.pageCount,
        hasBookmarks: result.summary.hasBookmarks,
        bookmarkZoomInherit: !result.errors.some((e) => e.ruleId === '6.23'),
        isEncrypted: result.summary.hasEncryption,
        hasJavascript: result.errors.some((e) => e.ruleId === '6.20'),
        hasExternalLinks: result.errors.some((e) => e.ruleId === '6.21'),
        hasAttachments: result.errors.some((e) => e.ruleId === '6.24'),
        hasMultimedia: result.errors.some((e) => e.ruleId === '6.22'),
        fontsEmbedded: !result.warnings.some((w) => w.ruleId === '6.W2'),
        complianceStatus: status,
        complianceDetails: JSON.parse(JSON.stringify({
          errors: result.errors,
          warnings: result.warnings,
        })),
      },
    });

    return analysis;
  }

  /**
   * Get the original file's storage path (for references).
   */
  private async getOriginalStoragePath(fileId: string): Promise<string> {
    const file = await this.prisma.fileAttachment.findUnique({
      where: { id: fileId },
      select: { storagePath: true, isReference: true, referenceFileId: true },
    });
    if (!file) throw new NotFoundException('引用的源文件不存在');

    // Follow reference chain if needed
    if (file.isReference && file.referenceFileId) {
      return this.getOriginalStoragePath(file.referenceFileId);
    }
    return file.storagePath;
  }

  /**
   * Serialize a FileAttachment for API response (convert BigInt to string).
   */
  private serializeAttachment(attachment: any) {
    const { fileSize, pdfAnalysis, ...rest } = attachment;
    return {
      ...rest,
      fileSize: fileSize?.toString() || '0',
      pdfAnalysis: pdfAnalysis || undefined,
    };
  }

  private getImageContentType(ext: string): string {
    const map: Record<string, string> = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.svg': 'image/svg+xml',
    };
    return map[ext] || 'application/octet-stream';
  }
}
