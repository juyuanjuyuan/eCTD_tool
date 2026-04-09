import { Injectable, Logger, BadRequestException, Inject, Optional } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CnRegionalXmlService } from './cn-regional-xml.service';
import { IndexXmlService } from './index-xml.service';
import { Md5Service } from './md5.service';
import { MinioService } from '../../file/minio.service';
import * as fs from 'fs';
import * as path from 'path';
import archiver from 'archiver';
import { PassThrough, Writable } from 'stream';

/**
 * Plan 12 helper: derive an STF file's eCTD-relative path from any anchor PDF
 * inside that STF (since v2 STF files live in the same directory as their
 * referenced PDFs — locked decision 2). Mirrors the same helper in
 * IndexXmlService.
 */
function deriveStfPath(anchorEctdPath: string, studyId: string): string {
  const idx = anchorEctdPath.lastIndexOf('/');
  const dir = idx >= 0 ? anchorEctdPath.substring(0, idx) : '';
  const slug = studyId
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const fileName = `study-${slug}.xml`;
  return dir ? `${dir}/${fileName}` : fileName;
}

@Injectable()
export class PackageAssemblerService {
  private readonly logger = new Logger(PackageAssemblerService.name);
  private readonly utilSourceBase = path.resolve(
    process.cwd(),
    '../reference/eCTD技术规范V1.1附件包',
  );

  constructor(
    private prisma: PrismaService,
    private cnRegionalXml: CnRegionalXmlService,
    private indexXml: IndexXmlService,
    private md5Service: Md5Service,
    @Optional() @Inject(MinioService) private minioService?: MinioService,
  ) {}

  /**
   * Assemble and return a complete eCTD package as a ZIP buffer
   */
  async assemblePackage(sequenceId: string): Promise<{
    buffer: Buffer;
    fileName: string;
  }> {
    // Load sequence context
    const sequence = await this.prisma.sequence.findUnique({
      where: { id: sequenceId },
      include: {
        regulatoryActivity: {
          include: { application: true },
        },
        sequenceNodes: {
          include: {
            templateNode: { select: { module: true } },
            fileAttachments: true,
            studies: {
              orderBy: { studyId: 'asc' },
              include: {
                documents: {
                  orderBy: { sortOrder: 'asc' },
                  take: 1,
                  include: {
                    fileAttachment: { select: { ectdRelativePath: true } },
                  },
                },
              },
            },
          },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    if (!sequence) throw new BadRequestException('序列不存在');

    const appNumber = sequence.regulatoryActivity.application.applicationNumber;
    const seqNumber = sequence.sequenceNumber;
    const basePath = `${appNumber}/${seqNumber}`;

    // Step 3: Generate XML files
    const cnRegionalContent = await this.cnRegionalXml.generateCnRegionalXml(sequenceId);
    const indexContent = await this.indexXml.generateIndexXml(sequenceId);

    // Step 4: Generate index-md5.txt (backbone files + content files + STF files)
    const md5Entries: Array<{ fileName: string; content?: string; md5?: string }> = [
      { fileName: 'index.xml', content: indexContent },
      { fileName: 'm1/cn/cn-regional.xml', content: cnRegionalContent },
    ];
    // Add content file checksums
    for (const node of sequence.sequenceNodes) {
      if (!node.isLeaf || !node.operation || node.operation === 'DELETE') continue;
      for (const file of (node.fileAttachments || [])) {
        if (file.isReference) continue;
        if (file.ectdRelativePath && file.md5Checksum) {
          md5Entries.push({ fileName: file.ectdRelativePath, md5: file.md5Checksum });
        }
      }
      // Plan 12: STF XML files participate in index-md5.txt with the cached
      // study.stfChecksum computed by StudyService at save time.
      for (const study of (node.studies || [])) {
        const anchor = study.documents[0]?.fileAttachment?.ectdRelativePath;
        if (!anchor || !study.stfChecksum) continue;
        md5Entries.push({
          fileName: deriveStfPath(anchor, study.studyId),
          md5: study.stfChecksum,
        });
      }
    }
    const indexMd5Content = this.md5Service.generateIndexMd5(md5Entries);

    // Step 5: Build ZIP archive
    const buffer = await this.buildZip(
      basePath,
      sequence,
      cnRegionalContent,
      indexContent,
      indexMd5Content,
    );

    // Step 6: Update sequence status
    await this.prisma.sequence.update({
      where: { id: sequenceId },
      data: { status: 'EXPORTED' },
    });

    return {
      buffer,
      fileName: `${appNumber}_${seqNumber}_ectd.zip`,
    };
  }

  /**
   * Assemble and return a stream for large packages (avoids buffering entire ZIP in memory).
   */
  async assemblePackageStream(sequenceId: string): Promise<{
    stream: PassThrough;
    fileName: string;
  }> {
    const sequence = await this.prisma.sequence.findUnique({
      where: { id: sequenceId },
      include: {
        regulatoryActivity: { include: { application: true } },
        sequenceNodes: {
          include: {
            templateNode: { select: { module: true } },
            fileAttachments: true,
            studies: {
              orderBy: { studyId: 'asc' },
              include: {
                documents: {
                  orderBy: { sortOrder: 'asc' },
                  take: 1,
                  include: {
                    fileAttachment: { select: { ectdRelativePath: true } },
                  },
                },
              },
            },
          },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    if (!sequence) throw new BadRequestException('序列不存在');

    const appNumber = sequence.regulatoryActivity.application.applicationNumber;
    const seqNumber = sequence.sequenceNumber;
    const basePath = `${appNumber}/${seqNumber}`;

    const cnRegionalContent = await this.cnRegionalXml.generateCnRegionalXml(sequenceId);
    const indexContent = await this.indexXml.generateIndexXml(sequenceId);
    const md5Entries: Array<{ fileName: string; content?: string; md5?: string }> = [
      { fileName: 'index.xml', content: indexContent },
      { fileName: 'm1/cn/cn-regional.xml', content: cnRegionalContent },
    ];
    for (const node of sequence.sequenceNodes) {
      if (!node.isLeaf || !node.operation || node.operation === 'DELETE') continue;
      for (const file of (node.fileAttachments || [])) {
        if (file.isReference) continue;
        if (file.ectdRelativePath && file.md5Checksum) {
          md5Entries.push({ fileName: file.ectdRelativePath, md5: file.md5Checksum });
        }
      }
      // Plan 12: STF XML files participate in index-md5.txt
      for (const study of (node.studies || [])) {
        const anchor = study.documents[0]?.fileAttachment?.ectdRelativePath;
        if (!anchor || !study.stfChecksum) continue;
        md5Entries.push({
          fileName: deriveStfPath(anchor, study.studyId),
          md5: study.stfChecksum,
        });
      }
    }
    const indexMd5Content = this.md5Service.generateIndexMd5(md5Entries);

    // Create streaming archive
    const passThrough = new PassThrough();
    const archive = archiver('zip', { zlib: { level: 6 } }); // level 6 for speed/size balance
    archive.on('error', (err) => passThrough.destroy(err));
    archive.pipe(passThrough);

    // Add backbone files
    archive.append(indexContent, { name: `${basePath}/index.xml` });
    archive.append(indexMd5Content, { name: `${basePath}/index-md5.txt` });
    archive.append(cnRegionalContent, { name: `${basePath}/m1/cn/cn-regional.xml` });

    this.addUtilFiles(archive, basePath);

    // Add content files using streams from MinIO where possible
    for (const node of sequence.sequenceNodes) {
      if (!node.isLeaf || !node.operation || node.operation === 'DELETE') continue;
      const files = node.fileAttachments || [];

      for (const file of files) {
        if (file.isReference && file.referenceFileId) continue;
        const filePath = `${basePath}/${file.ectdRelativePath}`;

        if (this.minioService && file.storagePath) {
          try {
            const fileStream = await this.minioService.getFileStream(file.storagePath);
            archive.append(fileStream, { name: filePath });
            continue;
          } catch (err) {
            this.logger.warn(`MinIO stream read failed for ${file.storagePath}: ${err}`);
          }
        }

        if (file.storagePath && fs.existsSync(file.storagePath)) {
          archive.append(fs.createReadStream(file.storagePath), { name: filePath });
        }
      }

      // Plan 12: emit one STF XML file per Study attached to this node. The
      // file is written next to its referenced PDFs (locked decision 2). The
      // XML content is the cached study.stfXmlContent computed at save time.
      for (const study of (node.studies || [])) {
        const anchor = study.documents[0]?.fileAttachment?.ectdRelativePath;
        if (!anchor || !study.stfXmlContent) continue;
        const stfRelPath = deriveStfPath(anchor, study.studyId);
        archive.append(study.stfXmlContent, { name: `${basePath}/${stfRelPath}` });
      }
    }

    // Finalize in background - don't await, let it stream
    archive.finalize().then(() => {
      this.prisma.sequence.update({
        where: { id: sequenceId },
        data: { status: 'EXPORTED' },
      }).catch((e) => this.logger.warn(`Failed to update sequence status: ${e}`));
    });

    return {
      stream: passThrough,
      fileName: `${appNumber}_${seqNumber}_ectd.zip`,
    };
  }

  private async buildZip(
    basePath: string,
    sequence: any,
    cnRegionalContent: string,
    indexContent: string,
    indexMd5Content: string,
  ): Promise<Buffer> {
    return new Promise(async (resolve, reject) => {
      const chunks: Buffer[] = [];
      const writable = new Writable({
        write(chunk, _encoding, callback) {
          chunks.push(chunk);
          callback();
        },
      });

      const archive = archiver('zip', { zlib: { level: 9 } });
      archive.on('error', reject);
      writable.on('finish', () => resolve(Buffer.concat(chunks)));

      archive.pipe(writable);

      // Add XML backbone files
      archive.append(indexContent, { name: `${basePath}/index.xml` });
      archive.append(indexMd5Content, { name: `${basePath}/index-md5.txt` });
      archive.append(cnRegionalContent, {
        name: `${basePath}/m1/cn/cn-regional.xml`,
      });

      // Add util files
      this.addUtilFiles(archive, basePath);

      // Add content files from sequence nodes
      // Empty section handling: skip nodes that have neither file attachments
      // nor STF studies
      for (const node of sequence.sequenceNodes) {
        if (!node.isLeaf || !node.operation || node.operation === 'DELETE') continue;

        const files = node.fileAttachments || [];
        const studies = node.studies || [];
        if (files.length === 0 && studies.length === 0) continue;

        for (const file of files) {
          // The ectdRelativePath is relative to the sequence folder
          const filePath = `${basePath}/${file.ectdRelativePath}`;

          // For reference files, read the original from MinIO
          if (file.isReference && file.referenceFileId) {
            // Reference files don't need to be included physically;
            // the backbone XML references them via relative path.
            // But if the reference is within the same sequence, include it.
            continue;
          }

          // Try MinIO first, then fall back to local disk
          if (this.minioService && file.storagePath) {
            try {
              const exists = await this.minioService.fileExists(file.storagePath);
              if (exists) {
                const fileBuffer = await this.minioService.getFile(file.storagePath);
                archive.append(fileBuffer, { name: filePath });
                continue;
              }
            } catch (err) {
              this.logger.warn(`MinIO read failed for ${file.storagePath}: ${err}`);
            }
          }

          // Fallback: local disk
          if (file.storagePath && fs.existsSync(file.storagePath)) {
            archive.file(file.storagePath, { name: filePath });
          }
        }

        // Plan 12: emit STF XML files alongside their PDFs.
        for (const study of studies) {
          const anchor = study.documents[0]?.fileAttachment?.ectdRelativePath;
          if (!anchor || !study.stfXmlContent) continue;
          const stfRelPath = deriveStfPath(anchor, study.studyId);
          archive.append(study.stfXmlContent, {
            name: `${basePath}/${stfRelPath}`,
          });
        }
      }

      archive.finalize();
    });
  }

  /**
   * Add the required util directory files (DTD, Schema, XSL, valid-values)
   */
  private addUtilFiles(archive: archiver.Archiver, basePath: string): void {
    const utilMappings = [
      {
        src: '附件1-1：区域Schema文件/cn-regional-1-0.xsd',
        dest: 'util/dtd/cn-regional-1-0.xsd',
      },
      {
        src: '附件2-1：ICH DTD文件/ich-ectd-3-2.dtd',
        dest: 'util/dtd/ich-ectd-3-2.dtd',
      },
      {
        src: '附件2-2：ICH STF DTD文件/ich-stf-v2-2.dtd',
        dest: 'util/dtd/ich-stf-v2-2.dtd',
      },
      {
        src: '附件3-1：w3c标准xlink结构定义文件/xlink.xsd',
        dest: 'util/dtd/xlink.xsd',
      },
      {
        src: '附件3-2：w3c标准xml命名规范定义文件/xml.xsd',
        dest: 'util/dtd/xml.xsd',
      },
      {
        src: '附件1-3：区域性样式文件/cn-regional-1-1.xsl',
        dest: 'util/style/cn-regional-1-1.xsl',
      },
      {
        src: '附件2-3：ICH样式文件/ectd-2-0.xsl',
        dest: 'util/style/ectd-2-0.xsl',
      },
      {
        src: '附件2-5：ICH STF样式文件2-3/ich-stf-stylesheet-2-3.xsl',
        dest: 'util/style/ich-stf-stylesheet-2-3.xsl',
      },
      {
        src: '附件2-4：ICH STF样式文件2-2a/ich-stf-stylesheet-2-2a.xsl',
        dest: 'util/style/ich-stf-stylesheet-2-2a.xsl',
      },
      {
        src: '附件2-6：STF标签值文件/valid-values.xml',
        dest: 'util/style/valid-values.xml',
      },
    ];

    for (const mapping of utilMappings) {
      const srcPath = path.join(this.utilSourceBase, mapping.src);
      if (fs.existsSync(srcPath)) {
        archive.file(srcPath, { name: `${basePath}/${mapping.dest}` });
      } else {
        this.logger.warn(`Reference file not found: ${srcPath}`);
      }
    }
  }

  // NOTE(Plan 12): the v1 `getStfPath` (which produced
  // `<basePath>/<subFolder>/stf-<section>.xml`) was removed. Per locked
  // decision 2, v2 STF files live in the same directory as their PDFs and
  // are named `study-<normalized-id>.xml`. The new resolver lives in
  // study-tagging-file.service and is consumed by the package assembler in
  // P3 task #8.

  /**
   * Preview the directory structure that would be generated.
   * Empty sections (no files) are automatically excluded.
   */
  async previewStructure(sequenceId: string): Promise<string[]> {
    const sequence = await this.prisma.sequence.findUnique({
      where: { id: sequenceId },
      include: {
        regulatoryActivity: {
          include: { application: { select: { applicationNumber: true } } },
        },
        sequenceNodes: {
          include: {
            templateNode: { select: { module: true } },
            fileAttachments: { select: { ectdRelativePath: true, isReference: true } },
            studies: {
              orderBy: { studyId: 'asc' },
              select: {
                id: true,
                studyId: true,
                operation: true,
                documents: {
                  orderBy: { sortOrder: 'asc' },
                  take: 1,
                  select: {
                    fileAttachment: { select: { ectdRelativePath: true } },
                  },
                },
              },
            },
          },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    if (!sequence) return [];

    const appNumber = sequence.regulatoryActivity.application.applicationNumber;
    const seqNumber = sequence.sequenceNumber;
    const basePath = `${appNumber}/${seqNumber}`;
    const paths: string[] = [];

    // Backbone files
    paths.push(`${basePath}/index.xml`);
    paths.push(`${basePath}/index-md5.txt`);
    paths.push(`${basePath}/m1/cn/cn-regional.xml`);

    // Util files
    paths.push(`${basePath}/util/dtd/cn-regional-1-0.xsd`);
    paths.push(`${basePath}/util/dtd/ich-ectd-3-2.dtd`);
    paths.push(`${basePath}/util/dtd/ich-stf-v2-2.dtd`);
    paths.push(`${basePath}/util/dtd/xlink.xsd`);
    paths.push(`${basePath}/util/dtd/xml.xsd`);
    paths.push(`${basePath}/util/style/cn-regional-1-1.xsl`);
    paths.push(`${basePath}/util/style/ectd-2-0.xsl`);
    paths.push(`${basePath}/util/style/ich-stf-stylesheet-2-3.xsl`);
    paths.push(`${basePath}/util/style/ich-stf-stylesheet-2-2a.xsl`);
    paths.push(`${basePath}/util/style/valid-values.xml`);

    // Content files — skip empty sections
    for (const node of sequence.sequenceNodes) {
      if (!node.isLeaf || !node.operation || node.operation === 'DELETE') continue;

      const files = node.fileAttachments || [];
      const studies = node.studies || [];
      if (files.length === 0 && studies.length === 0) continue;

      for (const file of files) {
        if (file.isReference) continue; // References point to prior sequence files
        paths.push(`${basePath}/${file.ectdRelativePath}`);
      }
      // Plan 12: include STF preview paths for each study
      for (const study of studies) {
        const anchor = study.documents[0]?.fileAttachment?.ectdRelativePath;
        if (!anchor) continue;
        paths.push(`${basePath}/${deriveStfPath(anchor, study.studyId)}`);
      }
    }

    return paths.sort();
  }
}
