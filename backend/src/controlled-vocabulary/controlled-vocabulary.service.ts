import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { XMLParser } from 'fast-xml-parser';
import * as fs from 'fs';
import * as path from 'path';

interface CvCode {
  name: string;
  descriptionZh: string;
  descriptionEn: string;
}

interface CvVersion {
  number: string;
  validFrom: string;
  codes: CvCode[];
}

@Injectable()
export class ControlledVocabularyService implements OnModuleInit {
  private readonly logger = new Logger(ControlledVocabularyService.name);
  private readonly xmlParser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
  });
  private readonly cvBasePath = path.resolve(
    process.cwd(),
    '../reference/eCTD技术规范V1.1附件包/附件1-2：受控词汇文件包',
  );

  constructor(private prisma: PrismaService) {}

  async onModuleInit() {
    await this.seedControlledVocabularies();
  }

  async seedControlledVocabularies() {
    const existingCount = await this.prisma.controlledVocabulary.count();
    if (existingCount > 0) {
      this.logger.log('受控词汇数据已存在，跳过初始化');
      return;
    }

    this.logger.log('开始解析受控词汇文件...');

    const cvFiles = [
      { file: 'cv-application-type.xml', vocabName: 'application-type' },
      { file: 'cv-product-type.xml', vocabName: 'product-type' },
      { file: 'cv-regulatory-activity-type.xml', vocabName: 'regulatory-activity-type' },
      { file: 'cv-sequence-type.xml', vocabName: 'sequence-type' },
    ];

    for (const { file, vocabName } of cvFiles) {
      await this.parseCvFile(file, vocabName);
    }

    await this.parseDependencyFile();
    this.logger.log('受控词汇数据初始化完成');
  }

  private async parseCvFile(fileName: string, vocabularyName: string) {
    const filePath = path.join(this.cvBasePath, fileName);
    const xml = fs.readFileSync(filePath, 'utf-8');
    const parsed = this.xmlParser.parse(xml);

    const cv = parsed['controlled-vocabulary'];
    const version = cv.version;
    const versionNumber = version['@_number'];
    const validFrom = this.parseDate(version['@_valid-from']);

    const codes = Array.isArray(version.code) ? version.code : [version.code];

    for (const code of codes) {
      const descriptions = Array.isArray(code.description)
        ? code.description
        : [code.description];

      const zhDesc = descriptions.find(
        (d: any) => d['@_xml:lang'] === 'zh',
      );
      const enDesc = descriptions.find(
        (d: any) => d['@_xml:lang'] === 'en',
      );

      await this.prisma.controlledVocabulary.create({
        data: {
          vocabularyName,
          code: code['@_name'],
          version: versionNumber,
          validFrom,
          descriptionZh: zhDesc?.['#text'] || '',
          descriptionEn: enDesc?.['#text'] || '',
        },
      });
    }

    this.logger.log(`已解析 ${fileName}: ${codes.length} 条记录`);
  }

  private async parseDependencyFile() {
    const filePath = path.join(this.cvBasePath, 'depend-apt-rat-sqt.xml');
    const xml = fs.readFileSync(filePath, 'utf-8');
    const parsed = this.xmlParser.parse(xml);

    const dependency = parsed.dependency;
    const version = dependency.version;
    const versionNumber = version['@_number'];

    // Level 1: application types
    const appCodes = Array.isArray(version.code)
      ? version.code
      : [version.code];

    for (const appCode of appCodes) {
      const appType = appCode['@_name'];

      // Level 2: regulatory activity types
      const ratCodes = Array.isArray(appCode.code)
        ? appCode.code
        : [appCode.code];

      for (const ratCode of ratCodes) {
        const ratType = ratCode['@_name'];

        // Level 3: sequence types
        const sqtCodes = Array.isArray(ratCode.code)
          ? ratCode.code
          : [ratCode.code];

        for (const sqtCode of sqtCodes) {
          await this.prisma.cvDependency.create({
            data: {
              applicationTypeCode: appType,
              regulatoryActivityTypeCode: ratType,
              sequenceTypeCode: sqtCode['@_name'],
              version: versionNumber,
            },
          });
        }
      }
    }

    this.logger.log('已解析 depend-apt-rat-sqt.xml');
  }

  private parseDate(dateStr: string): Date {
    // Handle format like "2026-3-1" or "2021-9-1"
    const parts = dateStr.split('-');
    return new Date(
      parseInt(parts[0]),
      parseInt(parts[1]) - 1,
      parseInt(parts[2]),
    );
  }

  // ==================== Query APIs ====================

  async getApplicationTypes() {
    return this.prisma.controlledVocabulary.findMany({
      where: { vocabularyName: 'application-type' },
      orderBy: { code: 'asc' },
    });
  }

  async getProductTypes() {
    return this.prisma.controlledVocabulary.findMany({
      where: { vocabularyName: 'product-type' },
      orderBy: { code: 'asc' },
    });
  }

  async getRegulatoryActivityTypes(appType?: string) {
    if (!appType) {
      return this.prisma.controlledVocabulary.findMany({
        where: { vocabularyName: 'regulatory-activity-type' },
        orderBy: { code: 'asc' },
      });
    }

    // Get allowed RAT codes for this application type
    const deps = await this.prisma.cvDependency.findMany({
      where: { applicationTypeCode: appType },
      select: { regulatoryActivityTypeCode: true },
      distinct: ['regulatoryActivityTypeCode'],
    });

    const ratCodes = deps.map((d) => d.regulatoryActivityTypeCode);

    return this.prisma.controlledVocabulary.findMany({
      where: {
        vocabularyName: 'regulatory-activity-type',
        code: { in: ratCodes },
      },
      orderBy: { code: 'asc' },
    });
  }

  async getSequenceTypes(appType?: string, ratType?: string) {
    if (!appType || !ratType) {
      return this.prisma.controlledVocabulary.findMany({
        where: { vocabularyName: 'sequence-type' },
        orderBy: { code: 'asc' },
      });
    }

    // Get allowed sequence types for this app-type + rat-type combination
    const deps = await this.prisma.cvDependency.findMany({
      where: {
        applicationTypeCode: appType,
        regulatoryActivityTypeCode: ratType,
      },
      select: { sequenceTypeCode: true },
    });

    const sqtCodes = deps
      .map((d) => d.sequenceTypeCode)
      .filter((c): c is string => c !== null);

    return this.prisma.controlledVocabulary.findMany({
      where: {
        vocabularyName: 'sequence-type',
        code: { in: sqtCodes },
      },
      orderBy: { code: 'asc' },
    });
  }

  async validateDependency(
    appType: string,
    ratType: string,
    sqtType?: string,
  ): Promise<boolean> {
    const where: any = {
      applicationTypeCode: appType,
      regulatoryActivityTypeCode: ratType,
    };
    if (sqtType) {
      where.sequenceTypeCode = sqtType;
    }

    const count = await this.prisma.cvDependency.count({ where });
    return count > 0;
  }

  async getCvVersion(vocabularyName: string, code: string): Promise<string> {
    const cv = await this.prisma.controlledVocabulary.findFirst({
      where: { vocabularyName, code },
      orderBy: { validFrom: 'desc' },
    });
    return cv?.version || '1.0';
  }
}
