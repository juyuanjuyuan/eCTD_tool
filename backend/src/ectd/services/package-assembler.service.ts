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

// Module folder mapping based on ctdSectionNumber
const MODULE_FOLDER_MAP: Record<number, string> = {
  1: 'm1',
  2: 'm2',
  3: 'm3',
  4: 'm4',
  5: 'm5',
};

// eCTD directory structure for module subfolders
const MODULE_SUBFOLDERS: Record<string, string> = {
  // Module 1 (cn)
  '1.0': 'm1/cn/00',
  '1.1': 'm1/cn/01',
  '1.2': 'm1/cn/02',
  '1.3': 'm1/cn/03',
  '1.4': 'm1/cn/04',
  '1.5': 'm1/cn/05',
  '1.6': 'm1/cn/06',
  '1.7': 'm1/cn/07',
  '1.8': 'm1/cn/08',
  '1.9': 'm1/cn/09',
  '1.10': 'm1/cn/10',
  '1.11': 'm1/cn/11',
  '1.12': 'm1/cn/12',
  // Module 2
  '2.2': 'm2/22-intro',
  '2.3': 'm2/23-qos',
  '2.4': 'm2/24-nonclin-over',
  '2.5': 'm2/25-clin-over',
  '2.6': 'm2/26-nonclin-sum',
  '2.7': 'm2/27-clin-sum',
  // Module 3
  '3.2': 'm3/32-body-data',
  '3.3': 'm3/33-lit-ref',
  // Module 4
  '4.2': 'm4/42-stud-rep',
  '4.3': 'm4/43-lit-ref',
  // Module 5
  '5.2': 'm5/52-tab-list',
  '5.3': 'm5/53-clin-stud-rep',
  '5.4': 'm5/54-lit-ref',
};

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
            studyTaggingFile: true,
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

    // Step 4: Generate index-md5.txt (backbone files + content files)
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
            studyTaggingFile: true,
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
      if (files.length === 0) continue;

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

      if (node.studyTaggingFile?.stfXmlContent) {
        const stfPath = this.getStfPath(node, basePath);
        if (stfPath) archive.append(node.studyTaggingFile.stfXmlContent, { name: stfPath });
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
      // Empty section handling: only include nodes that have actual file attachments
      for (const node of sequence.sequenceNodes) {
        if (!node.isLeaf || !node.operation || node.operation === 'DELETE') continue;

        // Skip empty leaf nodes (no files attached = empty section)
        const files = node.fileAttachments || [];
        if (files.length === 0) continue;

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

        // Add STF files if present
        if (node.studyTaggingFile?.stfXmlContent) {
          const stfPath = this.getStfPath(node, basePath);
          if (stfPath) {
            archive.append(node.studyTaggingFile.stfXmlContent, {
              name: stfPath,
            });
          }
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

  /**
   * Determine the STF file path within the eCTD package
   */
  private getStfPath(node: any, basePath: string): string | null {
    const sectionNum = node.ctdSectionNumber;
    if (!sectionNum) return null;

    const normalizedSection = sectionNum.replace(/\./g, '-');
    const moduleNum = parseInt(sectionNum.split('.')[0]);
    const moduleFolder = MODULE_FOLDER_MAP[moduleNum];
    if (!moduleFolder) return null;

    const prefix = sectionNum.split('.').slice(0, 2).join('.');
    const subFolder = MODULE_SUBFOLDERS[prefix] || moduleFolder;

    return `${basePath}/${subFolder}/stf-${normalizedSection}.xml`;
  }

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
            studyTaggingFile: { select: { id: true } },
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
      if (files.length === 0) continue; // Empty section — exclude

      for (const file of files) {
        if (file.isReference) continue; // References point to prior sequence files
        paths.push(`${basePath}/${file.ectdRelativePath}`);
      }
      if (node.studyTaggingFile) {
        const stfPath = this.getStfPath(node, basePath);
        if (stfPath) paths.push(stfPath);
      }
    }

    return paths.sort();
  }
}
