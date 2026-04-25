import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisCacheService } from '../common/redis-cache.service';
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
  // Resolution order:
  //   1. process.env.REFERENCE_DIR (Electron main injects this from <userData>/reference/)
  //   2. ../reference/... relative to backend's cwd (dev path, run-from-backend)
  // If neither resolves to an existing dir we skip seeding and log a warning;
  // the customer-side embedded build is expected to populate via a pre-seeded
  // first-run.db snapshot rather than parsing XMLs at runtime.
  private readonly cvBasePath = (() => {
    const fromEnv = process.env.REFERENCE_DIR;
    if (fromEnv) {
      return path.join(fromEnv, '附件1-2：受控词汇文件包');
    }
    return path.resolve(
      process.cwd(),
      '../reference/eCTD技术规范V1.1附件包/附件1-2：受控词汇文件包',
    );
  })();

  constructor(
    private prisma: PrismaService,
    private cache: RedisCacheService,
  ) {}

  async onModuleInit() {
    await this.seedControlledVocabularies();
    await this.seedStfVocabularies();
  }

  async seedControlledVocabularies() {
    const existingCount = await this.prisma.controlledVocabulary.count();
    if (existingCount > 0) {
      this.logger.log('受控词汇数据已存在，跳过初始化');
      return;
    }

    if (!fs.existsSync(this.cvBasePath)) {
      this.logger.warn(
        `受控词汇 reference 目录不存在 (${this.cvBasePath}); 跳过 XML 解析。` +
          ` 桌面/embedded 构建应通过预生成的 first-run.db 填充该表。` +
          ` 设置 REFERENCE_DIR 环境变量指向 reference 目录可启用 XML 解析。`,
      );
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

  // ==================== STF Vocabulary Seed ====================

  /**
   * Load ICH STF v2 controlled vocabulary from valid-values.xml
   * (附件2-6) into the ControlledVocabulary table.
   *
   * Naming convention:
   *   - stf-category-<name>   one row per <category name="X"><valid-value ...>
   *   - stf-file-tag-m4       all <file-tag><valid-value ...> values (mirrored)
   *   - stf-file-tag-m5       all <file-tag><valid-value ...> values (mirrored)
   *
   * Design note on file-tag mirroring:
   *   valid-values.xml has a single flat <file-tag> block that is shared by
   *   modules 4 and 5. Plan 12 §1.2 asks for per-module keys
   *   (stf-file-tag-m4 / stf-file-tag-m5). We therefore write every file-tag
   *   row TWICE, once under each vocabularyName, so the per-module query API
   *   can look up by a single key without fan-out at read time.
   *
   * Realm encoding:
   *   The CV table has no realm column. We prefix descriptionEn with the
   *   realm, e.g. "[ich] mouse", and store the bare value in descriptionZh
   *   as a display fallback. Query APIs parse the prefix back out.
   */
  async seedStfVocabularies(): Promise<void> {
    const existingCount = await this.prisma.controlledVocabulary.count({
      where: { vocabularyName: { startsWith: 'stf-' } },
    });
    if (existingCount > 0) {
      this.logger.log('STF CV already seeded');
      return;
    }

    const filePath = path.resolve(
      process.cwd(),
      '../reference/eCTD技术规范V1.1附件包/附件2-6：STF标签值文件/valid-values.xml',
    );

    if (!fs.existsSync(filePath)) {
      this.logger.warn(`STF valid-values.xml not found at ${filePath}`);
      return;
    }

    const { categories, fileTags, version, validFrom } =
      this.parseStfValidValuesFile(filePath);

    // Insert categories
    let categoryRowCount = 0;
    for (const category of categories) {
      const vocabularyName = `stf-category-${category.name}`;
      for (const entry of category.values) {
        await this.prisma.controlledVocabulary.create({
          data: {
            vocabularyName,
            code: entry.value,
            version,
            validFrom,
            descriptionZh: entry.value,
            descriptionEn: `[${entry.realm}] ${entry.value}`,
          },
        });
        categoryRowCount++;
      }
    }

    // Insert file-tags mirrored under both m4 and m5 keys
    let fileTagRowCount = 0;
    for (const moduleKey of ['m4', 'm5'] as const) {
      const vocabularyName = `stf-file-tag-${moduleKey}`;
      for (const entry of fileTags) {
        await this.prisma.controlledVocabulary.create({
          data: {
            vocabularyName,
            code: entry.value,
            version,
            validFrom,
            descriptionZh: entry.value,
            descriptionEn: `[${entry.realm}] ${entry.value}`,
          },
        });
        fileTagRowCount++;
      }
    }

    this.logger.log(
      `STF CV seeded: ${categories.length} categories (${categoryRowCount} values), ${fileTagRowCount} file-tag rows (mirrored m4+m5)`,
    );
  }

  /**
   * Parse the ICH STF valid-values.xml file into in-memory structures.
   * Public visibility (via a thin accessor) would allow reuse from a
   * standalone prisma seed; kept private here because prisma/seed.ts does
   * not currently reference seeds from a seeds/ directory.
   */
  private parseStfValidValuesFile(filePath: string): {
    categories: Array<{
      name: string;
      values: Array<{ value: string; realm: string }>;
    }>;
    fileTags: Array<{ value: string; realm: string }>;
    version: string;
    validFrom: Date;
  } {
    const xml = fs.readFileSync(filePath, 'utf-8');
    const parsed = this.xmlParser.parse(xml);

    const root = parsed['ectd:study-values'];
    if (!root) {
      throw new Error(
        'Invalid STF valid-values.xml: missing <ectd:study-values> root',
      );
    }

    const normaliseEntries = (raw: any): Array<{ value: string; realm: string }> => {
      if (!raw) return [];
      const entries = Array.isArray(raw) ? raw : [raw];
      return entries.map((e: any) => ({
        value: String(e['@_value']),
        realm: String(e['@_realm'] || 'ich'),
      }));
    };

    // Categories: one or many <category name="..."> blocks
    const rawCategories = Array.isArray(root.category)
      ? root.category
      : root.category
        ? [root.category]
        : [];

    const categories = rawCategories.map((cat: any) => ({
      name: String(cat['@_name']),
      values: normaliseEntries(cat['valid-value']),
    }));

    // file-tag block (single element, flat list)
    const fileTagBlock = root['file-tag'];
    const fileTags = normaliseEntries(fileTagBlock?.['valid-value']);

    // Version is expressed only in a comment header ("v6.0 - November 2023").
    // fast-xml-parser drops comments by default, so we hardcode to match the
    // frozen v6.0 baseline; upgrades will bump this constant.
    return {
      categories,
      fileTags,
      version: '6.0',
      validFrom: new Date('2023-11-01'),
    };
  }

  // ==================== Query APIs ====================

  async getApplicationTypes() {
    const cacheKey = 'cv:application-types';
    const cached = await this.cache.get(cacheKey);
    if (cached) return cached;

    const result = await this.prisma.controlledVocabulary.findMany({
      where: { vocabularyName: 'application-type' },
      orderBy: { code: 'asc' },
    });
    await this.cache.set(cacheKey, result, 86400); // 24h
    return result;
  }

  async getProductTypes() {
    const cacheKey = 'cv:product-types';
    const cached = await this.cache.get(cacheKey);
    if (cached) return cached;

    const result = await this.prisma.controlledVocabulary.findMany({
      where: { vocabularyName: 'product-type' },
      orderBy: { code: 'asc' },
    });
    await this.cache.set(cacheKey, result, 86400);
    return result;
  }

  async getRegulatoryActivityTypes(appType?: string) {
    const cacheKey = `cv:rat-types:${appType || 'all'}`;
    const cached = await this.cache.get(cacheKey);
    if (cached) return cached;

    let result;
    if (!appType) {
      result = await this.prisma.controlledVocabulary.findMany({
        where: { vocabularyName: 'regulatory-activity-type' },
        orderBy: { code: 'asc' },
      });
    } else {
      const deps = await this.prisma.cvDependency.findMany({
        where: { applicationTypeCode: appType },
        select: { regulatoryActivityTypeCode: true },
        distinct: ['regulatoryActivityTypeCode'],
      });

      const ratCodes = deps.map((d) => d.regulatoryActivityTypeCode);

      result = await this.prisma.controlledVocabulary.findMany({
        where: {
          vocabularyName: 'regulatory-activity-type',
          code: { in: ratCodes },
        },
        orderBy: { code: 'asc' },
      });
    }

    await this.cache.set(cacheKey, result, 86400);
    return result;
  }

  async getSequenceTypes(appType?: string, ratType?: string) {
    const cacheKey = `cv:sqt-types:${appType || 'all'}:${ratType || 'all'}`;
    const cached = await this.cache.get(cacheKey);
    if (cached) return cached;

    let result;
    if (!appType || !ratType) {
      result = await this.prisma.controlledVocabulary.findMany({
        where: { vocabularyName: 'sequence-type' },
        orderBy: { code: 'asc' },
      });
    } else {
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

      result = await this.prisma.controlledVocabulary.findMany({
        where: {
          vocabularyName: 'sequence-type',
          code: { in: sqtCodes },
        },
        orderBy: { code: 'asc' },
      });
    }

    await this.cache.set(cacheKey, result, 86400);
    return result;
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

  // ==================== STF Query APIs ====================

  /**
   * Parse "[realm] value" encoding used in descriptionEn.
   * Falls back to realm="ich" if the prefix is missing.
   */
  private decodeStfDescription(descriptionEn: string, fallbackValue: string): {
    value: string;
    realm: string;
  } {
    const match = /^\[([^\]]+)\]\s*(.*)$/.exec(descriptionEn || '');
    if (match) {
      return { realm: match[1], value: match[2] || fallbackValue };
    }
    return { realm: 'ich', value: fallbackValue };
  }

  /**
   * Return every STF category grouped by its category name, e.g.
   *   [{ name: "species", values: [{ value: "rat", realm: "ich" }, ...] }, ...]
   */
  async getStfCategories(): Promise<
    Array<{ name: string; values: Array<{ value: string; realm: string }> }>
  > {
    const cacheKey = 'cv:stf-categories';
    const cached = await this.cache.get(cacheKey);
    if (cached) return cached as Array<{
      name: string;
      values: Array<{ value: string; realm: string }>;
    }>;

    const rows = await this.prisma.controlledVocabulary.findMany({
      where: { vocabularyName: { startsWith: 'stf-category-' } },
      orderBy: [{ vocabularyName: 'asc' }, { code: 'asc' }],
    });

    const grouped = new Map<
      string,
      Array<{ value: string; realm: string }>
    >();
    for (const row of rows) {
      const name = row.vocabularyName.replace(/^stf-category-/, '');
      const decoded = this.decodeStfDescription(row.descriptionEn, row.code);
      if (!grouped.has(name)) grouped.set(name, []);
      grouped.get(name)!.push({ value: row.code, realm: decoded.realm });
    }

    const result = Array.from(grouped.entries()).map(([name, values]) => ({
      name,
      values,
    }));

    await this.cache.set(cacheKey, result, 86400);
    return result;
  }

  /**
   * Return ICH STF file-tag values for a given module.
   * Both modules share the same flat file-tag list from valid-values.xml,
   * mirrored at seed time. See seedStfVocabularies() design note.
   */
  async getStfFileTags(
    module: 'm4' | 'm5',
  ): Promise<Array<{ value: string; realm: string }>> {
    const cacheKey = `cv:stf-file-tags:${module}`;
    const cached = await this.cache.get(cacheKey);
    if (cached) return cached as Array<{ value: string; realm: string }>;

    const rows = await this.prisma.controlledVocabulary.findMany({
      where: { vocabularyName: `stf-file-tag-${module}` },
      orderBy: { code: 'asc' },
    });

    const result = rows.map((row) => {
      const decoded = this.decodeStfDescription(row.descriptionEn, row.code);
      return { value: row.code, realm: decoded.realm };
    });

    await this.cache.set(cacheKey, result, 86400);
    return result;
  }

  /**
   * Return values for a single STF category.
   */
  async getStfCategoryValues(
    categoryName: string,
  ): Promise<Array<{ value: string; realm: string }>> {
    const cacheKey = `cv:stf-category-values:${categoryName}`;
    const cached = await this.cache.get(cacheKey);
    if (cached) return cached as Array<{ value: string; realm: string }>;

    const rows = await this.prisma.controlledVocabulary.findMany({
      where: { vocabularyName: `stf-category-${categoryName}` },
      orderBy: { code: 'asc' },
    });

    const result = rows.map((row) => {
      const decoded = this.decodeStfDescription(row.descriptionEn, row.code);
      return { value: row.code, realm: decoded.realm };
    });

    await this.cache.set(cacheKey, result, 86400);
    return result;
  }
}
