import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CnRegionalXmlService } from './cn-regional-xml.service';
import { IndexXmlService } from './index-xml.service';
import { Md5Service } from './md5.service';
import { ValidatorService } from './validator.service';
import * as fs from 'fs';
import * as path from 'path';
import archiver from 'archiver';
import { Writable } from 'stream';

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
    private validator: ValidatorService,
  ) {}

  /**
   * Assemble and return a complete eCTD package as a ZIP buffer
   */
  async assemblePackage(sequenceId: string): Promise<{
    buffer: Buffer;
    fileName: string;
  }> {
    // Step 1: Run validation
    const validationResult = await this.validator.validate(sequenceId);
    if (!validationResult.isPassed) {
      throw new BadRequestException({
        message: `验证未通过，有 ${validationResult.totalErrors} 个错误需要修复`,
        reportId: validationResult.reportId,
        errors: validationResult.items.filter((i) => i.severity === 'ERROR'),
      });
    }

    // Step 2: Load sequence context
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

    // Step 4: Generate index-md5.txt
    const indexMd5Content = this.md5Service.generateIndexMd5([
      { fileName: 'index.xml', content: indexContent },
      { fileName: 'cn-regional.xml', content: cnRegionalContent },
    ]);

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

  private async buildZip(
    basePath: string,
    sequence: any,
    cnRegionalContent: string,
    indexContent: string,
    indexMd5Content: string,
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
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
      const addedFolders = new Set<string>();
      for (const node of sequence.sequenceNodes) {
        if (!node.isLeaf || !node.operation || node.operation === 'DELETE') continue;

        for (const file of node.fileAttachments || []) {
          // Add file to the archive
          // The ectdRelativePath is relative to the sequence folder
          const filePath = `${basePath}/${file.ectdRelativePath}`;

          // Read from storage path if it exists on disk
          if (file.storagePath && fs.existsSync(file.storagePath)) {
            archive.file(file.storagePath, { name: filePath });
          }
        }

        // Add STF files if present
        if (node.studyTaggingFile?.stfXmlContent) {
          // STF goes alongside the study files
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

    // STF file goes in the same directory as the study files
    // Named based on section number
    const normalizedSection = sectionNum.replace(/\./g, '-');
    const moduleNum = parseInt(sectionNum.split('.')[0]);
    const moduleFolder = MODULE_FOLDER_MAP[moduleNum];
    if (!moduleFolder) return null;

    // Find the appropriate subfolder
    const prefix = sectionNum.split('.').slice(0, 2).join('.');
    const subFolder = MODULE_SUBFOLDERS[prefix] || moduleFolder;

    return `${basePath}/${subFolder}/stf-${normalizedSection}.xml`;
  }

  /**
   * Preview the directory structure that would be generated
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
            fileAttachments: { select: { ectdRelativePath: true } },
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

    // Content files
    for (const node of sequence.sequenceNodes) {
      if (!node.isLeaf || !node.operation || node.operation === 'DELETE') continue;
      for (const file of node.fileAttachments || []) {
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
