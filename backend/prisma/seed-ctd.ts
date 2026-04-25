import { PrismaClient, CtdNodeType, CompletenessRuleType, CompletenessRuleSeverity } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { XMLParser } from 'fast-xml-parser';
import {
  STF_DEFAULTS,
  applyStfDefaultCategories,
  validateStfDefaults,
} from './seeds/stf-default-categories.js';
import type { StfCategoryDimension } from './seeds/stf-default-categories.js';

// Mutable so `runCtdSeed(client)` can inject either the PG or SQLite Prisma
// client. Default-constructed only when this file is invoked directly via
// `npm run seed:ctd` (require.main === module check below).
let prisma: any;

/** When DB_PROVIDER=sqlite, JSON columns are stored as TEXT and need stringify. */
function serializeJsonField<T>(value: T): T | string {
  if (process.env.DB_PROVIDER === 'sqlite' && value !== null && typeof value === 'object') {
    return JSON.stringify(value);
  }
  return value as T | string;
}

// ==================== XML Parsing ====================

const XML_DIR = path.resolve(process.cwd(), '../reference/eCTD技术规范V1.1附件包/附件1-2：受控词汇文件包');

function parseXmlFile(filename: string): any {
  const filePath = path.join(XML_DIR, filename);
  const xml = fs.readFileSync(filePath, 'utf-8');
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    isArray: (name) => name === 'element' || name === 'description',
  });
  return parser.parse(xml);
}

interface RawElement {
  '@_name': string;
  '@_structureno': string;
  description: Array<{ '#text': string; '@_xml:lang': string }>;
}

function extractElements(parsed: any): RawElement[] {
  const version = parsed['element-properties']?.version;
  if (!version) return [];
  const elements = version.element;
  return Array.isArray(elements) ? elements : elements ? [elements] : [];
}

function getDescription(el: RawElement, lang: string): string {
  const descs = el.description || [];
  const found = descs.find((d) => d['@_xml:lang'] === lang);
  return found ? found['#text'] : '';
}

// ==================== Hierarchy Builder ====================

// Derive parent structureno from a child structureno
// e.g. "3.2.S.4.1" -> "3.2.S.4", "1.3" -> "1", "2" -> null
function getParentStructureNo(sno: string): string | null {
  // Split on dots
  const parts = sno.split('.');
  if (parts.length <= 1) return null;
  return parts.slice(0, -1).join('.');
}

function getModuleNumber(sno: string): number {
  return parseInt(sno.split('.')[0], 10);
}

// Determine which leaf-level sections require STF
// Module 4: all leaf nodes under 4.2.x
// Module 5: leaf nodes under 5.3.1.x through 5.3.5.x
function requiresStf(sno: string): boolean {
  if (sno.startsWith('4.2.')) return true;
  const m5match = sno.match(/^5\.3\.([1-5])\./);
  if (m5match) return true;
  return false;
}

// Sections requiring electronic seal
const E_SEAL_SECTIONS = new Set([
  'cn-1-0', 'cn-1-2', 'cn-1-3-8', 'cn-1-10', 'cn-1-11', 'cn-1-12',
]);

// Extension point: 3.2.R sections (for biologics only)
function isExtensionPoint(elementName: string, sno: string): boolean {
  return sno === '3.2.R';
}

// Plan 13 (2026-04-23): 权威来源 ich-ectd-3-2.dtd 中可重复 (带 *) 的 5 个 element
// 支持同一序列下多个原料药 / 多个制剂 / 多个适应症 / 多个生产商等场景
const REPEATABLE_NODE_CONFIG: Record<string, string[]> = {
  'm2-3-s-drug-substance': ['substance', 'manufacturer'],                       // 2.3.S
  'm2-3-p-drug-product': ['productName', 'dosageForm', 'manufacturer'],         // 2.3.P
  'm2-7-3-summary-of-clinical-efficacy': ['indication'],                         // 2.7.3
  'm3-2-s-drug-substance': ['substance', 'manufacturer'],                       // 3.2.S
  'm3-2-p-drug-product': ['productName', 'dosageForm', 'manufacturer'],         // 3.2.P
};

// ==================== Build Template Nodes ====================

interface TemplateNode {
  elementName: string;
  ctdSectionNumber: string;
  titleZh: string;
  titleEn: string;
  module: number;
  parentSectionNumber: string | null;
  sortOrder: number;
  requiresStf: boolean;
  requiresESeal: boolean;
  allowsExtension: boolean;
  defaultStfCategories: StfCategoryDimension[] | null;
  // Plan 13
  isRepeatable: boolean;
  instanceKeyFields: string[] | null;
}

function buildTemplateNodes(): TemplateNode[] {
  const nodes: TemplateNode[] = [];
  let sortCounter = 0;

  // Parse ICH elements (modules 1-5 roots + modules 2-5 details)
  const ichParsed = parseXmlFile('element-property_ICH.xml');
  const ichElements = extractElements(ichParsed);

  // Parse CN elements (module 1 details)
  const cnParsed = parseXmlFile('element-property_CN.xml');
  const cnElements = extractElements(cnParsed);

  // Process ICH elements first (module roots + modules 2-5)
  for (const el of ichElements) {
    const sno = el['@_structureno'];
    const name = el['@_name'];
    const module = getModuleNumber(sno);

    const repeatKeys = REPEATABLE_NODE_CONFIG[name];
    nodes.push({
      elementName: name,
      ctdSectionNumber: sno,
      titleZh: getDescription(el, 'zh'),
      titleEn: getDescription(el, 'en'),
      module,
      parentSectionNumber: getParentStructureNo(sno),
      sortOrder: sortCounter++,
      requiresStf: requiresStf(sno),
      requiresESeal: false,
      allowsExtension: isExtensionPoint(name, sno),
      defaultStfCategories: STF_DEFAULTS[sno] ?? null,
      isRepeatable: !!repeatKeys,
      instanceKeyFields: repeatKeys ?? null,
    });
  }

  // Process CN elements (module 1 children)
  for (const el of cnElements) {
    const sno = el['@_structureno'];
    const name = el['@_name'];

    nodes.push({
      elementName: name,
      ctdSectionNumber: sno,
      titleZh: getDescription(el, 'zh'),
      titleEn: getDescription(el, 'en'),
      module: 1,
      parentSectionNumber: getParentStructureNo(sno),
      sortOrder: sortCounter++,
      requiresStf: false,
      requiresESeal: E_SEAL_SECTIONS.has(name),
      allowsExtension: false,
      defaultStfCategories: null,
      isRepeatable: false,
      instanceKeyFields: null,
    });
  }

  return nodes;
}

// Determine node type after building the full tree
function determineNodeTypes(nodes: TemplateNode[]): Map<string, CtdNodeType> {
  const snoSet = new Set(nodes.map((n) => n.ctdSectionNumber));
  const hasChildren = new Set<string>();

  for (const node of nodes) {
    if (node.parentSectionNumber && snoSet.has(node.parentSectionNumber)) {
      hasChildren.add(node.parentSectionNumber);
    }
  }

  const types = new Map<string, CtdNodeType>();
  for (const node of nodes) {
    const sno = node.ctdSectionNumber;
    if (sno.length <= 1 && !sno.includes('.')) {
      // Root module nodes (1, 2, 3, 4, 5)
      types.set(sno, CtdNodeType.MODULE);
    } else if (node.allowsExtension) {
      types.set(sno, CtdNodeType.EXTENSION_POINT);
    } else if (hasChildren.has(sno)) {
      types.set(sno, CtdNodeType.SECTION);
    } else {
      types.set(sno, CtdNodeType.LEAF);
    }
  }
  return types;
}

// ==================== Completeness Rules (4.3.x) ====================

interface CompletenessRuleInput {
  ruleId: string;
  applicationTypeCodes: string[];
  regulatoryActivityTypeCodes: string[];
  elementNames: string[];
  ruleType: CompletenessRuleType;
  severity: CompletenessRuleSeverity;
}

// Based on eCTD验证标准V1.1 section 4.3
const COMPLETENESS_RULES: CompletenessRuleInput[] = [
  // 4.3.1 NDA (cnapt2) + Original/New Indication (cnrat1/cnrat6) + Original (cnsqt1) — MUST contain
  {
    ruleId: '4.3.1',
    applicationTypeCodes: ['cnapt2'],
    regulatoryActivityTypeCodes: ['cnrat1', 'cnrat6'],
    elementNames: [
      'cn-1-0', 'cn-1-2', 'cn-1-3', 'cn-1-3-1', 'cn-1-3-1-2',
      'cn-1-3-2', 'cn-1-3-2-2', 'cn-1-3-3', 'cn-1-3-8',
      'cn-1-3-8-1', 'cn-1-3-8-2', 'cn-1-11',
    ],
    ruleType: CompletenessRuleType.REQUIRED,
    severity: CompletenessRuleSeverity.ERROR,
  },
  // 4.3.2 NDA (cnapt2) + Original/New Indication (cnrat1/cnrat6) + Original (cnsqt1) — MUST NOT contain
  {
    ruleId: '4.3.2',
    applicationTypeCodes: ['cnapt2'],
    regulatoryActivityTypeCodes: ['cnrat1', 'cnrat6'],
    elementNames: [
      'cn-1-3-1-1', 'cn-1-3-2-1', 'cn-1-3-4',
      'cn-1-3-4-1', 'cn-1-3-4-2', 'cn-1-3-4-3',
    ],
    ruleType: CompletenessRuleType.FORBIDDEN,
    severity: CompletenessRuleSeverity.ERROR,
  },
  // 4.3.3 ANDA (cnapt3) + Original/New Indication (cnrat1/cnrat6) + Original (cnsqt1) — MUST contain
  {
    ruleId: '4.3.3',
    applicationTypeCodes: ['cnapt3'],
    regulatoryActivityTypeCodes: ['cnrat1', 'cnrat6'],
    elementNames: [
      'cn-1-0', 'cn-1-2', 'cn-1-3', 'cn-1-3-1', 'cn-1-3-1-2',
      'cn-1-3-2', 'cn-1-3-2-2', 'cn-1-3-3', 'cn-1-3-8',
      'cn-1-3-8-1', 'cn-1-3-8-2', 'cn-1-11',
    ],
    ruleType: CompletenessRuleType.REQUIRED,
    severity: CompletenessRuleSeverity.ERROR,
  },
  // 4.3.4 ANDA (cnapt3) + Original/New Indication (cnrat1/cnrat6) + Original (cnsqt1) — MUST NOT contain
  {
    ruleId: '4.3.4',
    applicationTypeCodes: ['cnapt3'],
    regulatoryActivityTypeCodes: ['cnrat1', 'cnrat6'],
    elementNames: [
      'cn-1-3-1-1', 'cn-1-3-2-1', 'cn-1-3-4',
      'cn-1-3-4-1', 'cn-1-3-4-2', 'cn-1-3-4-3', 'cn-1-12',
    ],
    ruleType: CompletenessRuleType.FORBIDDEN,
    severity: CompletenessRuleSeverity.ERROR,
  },
  // 4.3.5 IND (cnapt1) + Original/New Indication+Combo (cnrat1/cnrat5) + Original (cnsqt1) — MUST contain
  {
    ruleId: '4.3.5',
    applicationTypeCodes: ['cnapt1'],
    regulatoryActivityTypeCodes: ['cnrat1', 'cnrat5'],
    elementNames: [
      'cn-1-0', 'cn-1-2', 'cn-1-3', 'cn-1-3-1', 'cn-1-3-1-1',
      'cn-1-3-2', 'cn-1-3-2-1', 'cn-1-3-4', 'cn-1-3-4-1',
      'cn-1-3-4-2', 'cn-1-3-4-3', 'cn-1-3-8', 'cn-1-3-8-1',
      'cn-1-3-8-2', 'cn-1-11',
    ],
    ruleType: CompletenessRuleType.REQUIRED,
    severity: CompletenessRuleSeverity.ERROR,
  },
  // 4.3.6 IND (cnapt1) + Original/New Indication+Combo (cnrat1/cnrat5) + Original (cnsqt1) — MUST NOT contain
  {
    ruleId: '4.3.6',
    applicationTypeCodes: ['cnapt1'],
    regulatoryActivityTypeCodes: ['cnrat1', 'cnrat5'],
    elementNames: [
      'cn-1-3-1-2', 'cn-1-3-2-2', 'cn-1-3-5', 'cn-1-3-6',
    ],
    ruleType: CompletenessRuleType.FORBIDDEN,
    severity: CompletenessRuleSeverity.ERROR,
  },
  // 4.3.7 IND (cnapt1) + Dev Safety Report (cnrat7) + Original (cnsqt1)
  // Must contain at least one of: cn-1-8-1, cn-1-8-2
  // This is a conditional rule — we store both as REQUIRED with WARNING to indicate "at least one needed"
  // The actual validation logic handles the OR condition in code
  {
    ruleId: '4.3.7',
    applicationTypeCodes: ['cnapt1'],
    regulatoryActivityTypeCodes: ['cnrat7'],
    elementNames: ['cn-1-8-1', 'cn-1-8-2'],
    ruleType: CompletenessRuleType.REQUIRED,
    severity: CompletenessRuleSeverity.WARNING, // OR condition, handled specially in validation
  },
  // 4.3.10 Drug Substance (cnapt4) + Original (cnrat1) + Original (cnsqt1) — MUST contain
  {
    ruleId: '4.3.10',
    applicationTypeCodes: ['cnapt4'],
    regulatoryActivityTypeCodes: ['cnrat1'],
    elementNames: [
      'cn-1-0', 'cn-1-2', 'cn-1-3', 'cn-1-3-2', 'cn-1-3-2-2',
      'cn-1-3-3', 'cn-1-3-8', 'cn-1-3-8-1', 'cn-1-3-8-2', 'cn-1-11',
    ],
    ruleType: CompletenessRuleType.REQUIRED,
    severity: CompletenessRuleSeverity.ERROR,
  },
  // 4.3.11 Drug Substance (cnapt4) + Original (cnrat1) + Original (cnsqt1) — MUST NOT contain
  {
    ruleId: '4.3.11',
    applicationTypeCodes: ['cnapt4'],
    regulatoryActivityTypeCodes: ['cnrat1'],
    elementNames: [
      'cn-1-3-1-1', 'cn-1-3-2-1', 'cn-1-3-4',
      'cn-1-3-4-1', 'cn-1-3-4-2', 'cn-1-3-4-3',
    ],
    ruleType: CompletenessRuleType.FORBIDDEN,
    severity: CompletenessRuleSeverity.ERROR,
  },

  // ========== 补充申请 / 备案 / 报告 / 再注册 场景规则 (2026-04-24 增补) ==========
  // 依据: reference/现行申报资料要求与eCTD目录元素、CTD目录层级对应表.xlsx
  //       药品补充申请 / 境外生产药品再注册申请 两个 sheet
  // 合法性已核对 reference/eCTD技术规范V1.1附件包/附件1-2：受控词汇文件包/depend-apt-rat-sqt.xml
  // 跳过 4.3.8/4.3.9 沿用现有编号断档惯例

  // 4.3.12 补充申请 (cnrat2) + 首次提交 (cnsqt1) - NDA/ANDA/原料药通用 MUST contain
  // 依据: Excel "药品补充申请" sheet 第 3-32 行 M1 无"如适用"限定条目的交集
  {
    ruleId: '4.3.12',
    applicationTypeCodes: ['cnapt2', 'cnapt3', 'cnapt4'],
    regulatoryActivityTypeCodes: ['cnrat2'],
    elementNames: ['cn-1-0', 'cn-1-2', 'cn-1-4-1', 'cn-1-11'],
    ruleType: CompletenessRuleType.REQUIRED,
    severity: CompletenessRuleSeverity.ERROR,
  },
  // 4.3.13 补充申请 (cnrat2) - NDA/ANDA/原料药 MUST NOT contain
  // 依据: 补充申请针对已上市药品, 未上市药品专用章节禁用
  {
    ruleId: '4.3.13',
    applicationTypeCodes: ['cnapt2', 'cnapt3', 'cnapt4'],
    regulatoryActivityTypeCodes: ['cnrat2'],
    elementNames: ['cn-1-3-1-1', 'cn-1-3-2-1'],
    ruleType: CompletenessRuleType.FORBIDDEN,
    severity: CompletenessRuleSeverity.ERROR,
  },
  // 4.3.14 IND 补充申请 (cnapt1 + cnrat2 + cnsqt1) MUST contain
  // 说明: IND 阶段未批准上市, 不强制 cn-1-4-1
  {
    ruleId: '4.3.14',
    applicationTypeCodes: ['cnapt1'],
    regulatoryActivityTypeCodes: ['cnrat2'],
    elementNames: ['cn-1-0', 'cn-1-2', 'cn-1-11'],
    ruleType: CompletenessRuleType.REQUIRED,
    severity: CompletenessRuleSeverity.ERROR,
  },
  // 4.3.15 备案 (cnrat3) + 首次提交 - NDA/ANDA/原料药 MUST contain
  // 依据: 备案属于上市后变更简化形式, 共用药品补充申请 M1 核心清单
  {
    ruleId: '4.3.15',
    applicationTypeCodes: ['cnapt2', 'cnapt3', 'cnapt4'],
    regulatoryActivityTypeCodes: ['cnrat3'],
    elementNames: ['cn-1-0', 'cn-1-2', 'cn-1-4-1'],
    ruleType: CompletenessRuleType.REQUIRED,
    severity: CompletenessRuleSeverity.ERROR,
  },
  // 4.3.16 报告 (cnrat4) + 首次提交 - NDA/ANDA/原料药 MUST contain
  // 依据: 上市后报告类变更, 与 cnrat3 备案同源
  {
    ruleId: '4.3.16',
    applicationTypeCodes: ['cnapt2', 'cnapt3', 'cnapt4'],
    regulatoryActivityTypeCodes: ['cnrat4'],
    elementNames: ['cn-1-0', 'cn-1-2', 'cn-1-4-1'],
    ruleType: CompletenessRuleType.REQUIRED,
    severity: CompletenessRuleSeverity.ERROR,
  },
  // 跳过 4.3.17 (原分析中 cnapt2/3 + cnrat5 经核对为非法组合, 不纳入规则)

  // 4.3.18 NDA 再注册 (cnapt2 + cnrat8 + cnsqt1) MUST contain
  // 依据: Excel "境外生产药品再注册申请" sheet 制剂段 + "药品补充申请" sheet 4/5 分组交集
  {
    ruleId: '4.3.18',
    applicationTypeCodes: ['cnapt2'],
    regulatoryActivityTypeCodes: ['cnrat8'],
    elementNames: [
      'cn-1-0', 'cn-1-2', 'cn-1-3-8-9', 'cn-1-4-1', 'cn-1-11',
      'cn-1-3-3', 'cn-1-3-1-2', 'cn-1-3-2-2',
    ],
    ruleType: CompletenessRuleType.REQUIRED,
    severity: CompletenessRuleSeverity.ERROR,
  },
  // 4.3.19 NDA 再注册 (cnapt2 + cnrat8) MUST NOT contain
  // 依据: 再注册阶段药品必已上市, 未上市和临床试验专用章节禁用
  {
    ruleId: '4.3.19',
    applicationTypeCodes: ['cnapt2'],
    regulatoryActivityTypeCodes: ['cnrat8'],
    elementNames: ['cn-1-3-1-1', 'cn-1-3-2-1', 'cn-1-3-4-1', 'cn-1-3-4-2', 'cn-1-3-4-3'],
    ruleType: CompletenessRuleType.FORBIDDEN,
    severity: CompletenessRuleSeverity.ERROR,
  },
  // 4.3.20 ANDA 再注册 (cnapt3 + cnrat8 + cnsqt1) MUST contain
  {
    ruleId: '4.3.20',
    applicationTypeCodes: ['cnapt3'],
    regulatoryActivityTypeCodes: ['cnrat8'],
    elementNames: [
      'cn-1-0', 'cn-1-2', 'cn-1-3-8-9', 'cn-1-4-1', 'cn-1-11',
      'cn-1-3-3', 'cn-1-3-1-2', 'cn-1-3-2-2',
    ],
    ruleType: CompletenessRuleType.REQUIRED,
    severity: CompletenessRuleSeverity.ERROR,
  },
  // 4.3.21 原料药再注册 (cnapt4 + cnrat8 + cnsqt1) MUST contain
  // 说明: 原料药再注册不要求说明书 / 包装标签
  {
    ruleId: '4.3.21',
    applicationTypeCodes: ['cnapt4'],
    regulatoryActivityTypeCodes: ['cnrat8'],
    elementNames: ['cn-1-0', 'cn-1-2', 'cn-1-3-8-9', 'cn-1-4-1', 'cn-1-11', 'cn-1-3-3'],
    ruleType: CompletenessRuleType.REQUIRED,
    severity: CompletenessRuleSeverity.ERROR,
  },
];

// ==================== Seed Functions ====================

async function seedTemplateNodes() {
  // Always validate the STF defaults table before touching the DB so that any
  // accidental typo in category names (e.g. route-admin vs route-of-admin)
  // fails loud at seed time instead of silently corrupting data.
  validateStfDefaults();

  const existing = await prisma.ctdTemplateNode.count();
  if (existing > 0) {
    console.log(`CTD template nodes already seeded (${existing} nodes). Skipping structural seed.`);
    // Still apply STF default categories idempotently so that DBs seeded before
    // Plan 12 can be backfilled in-place without a full re-seed.
    const { updatedSections, unmatchedSections } = await applyStfDefaultCategories(prisma);
    console.log(
      `  Backfilled default_stf_categories for ${updatedSections} nodes ` +
        `(${unmatchedSections.length} sections unmatched)`,
    );
    if (unmatchedSections.length > 0) {
      console.warn(
        `  Warning: STF_DEFAULTS references sections not present in DB: ${unmatchedSections.join(', ')}`,
      );
    }
    // Plan 13 (2026-04-23): 为已 seed 库回填 isRepeatable / instanceKeyFields
    let backfilledRepeatable = 0;
    for (const [elementName, keys] of Object.entries(REPEATABLE_NODE_CONFIG)) {
      const result = await prisma.ctdTemplateNode.updateMany({
        where: { elementName },
        data: {
          isRepeatable: true,
          instanceKeyFields: serializeJsonField(keys),
        },
      });
      backfilledRepeatable += result.count;
    }
    console.log(
      `  Backfilled isRepeatable flag for ${backfilledRepeatable}/${Object.keys(REPEATABLE_NODE_CONFIG).length} repeatable nodes`,
    );
    return;
  }

  console.log('Building CTD template tree from XML...');
  const nodes = buildTemplateNodes();
  const nodeTypes = determineNodeTypes(nodes);

  // Create a map of structureno -> elementName for parent lookup
  const snoToName = new Map<string, string>();
  for (const n of nodes) {
    snoToName.set(n.ctdSectionNumber, n.elementName);
  }

  // First pass: create all nodes without parent references
  console.log(`Inserting ${nodes.length} template nodes...`);

  // Insert nodes in order, keeping track of IDs
  const nameToId = new Map<string, string>();

  for (const node of nodes) {
    const nodeType = nodeTypes.get(node.ctdSectionNumber) || CtdNodeType.LEAF;
    const isLeaf = nodeType === CtdNodeType.LEAF;

    const nodeRequiresStf = isLeaf && node.requiresStf;
    // defaultStfCategories 只对"需要 STF 的叶节点"有意义：
    // - 非叶节点 / 非 STF 节点 -> undefined (落库 null)
    // - 叶节点但 STF_DEFAULTS 里没定义 -> undefined (前端走"高级区"手动添加)
    const defaultStfCategoriesValue =
      nodeRequiresStf && node.defaultStfCategories
        ? (node.defaultStfCategories as unknown as object)
        : undefined;

    const created = await prisma.ctdTemplateNode.create({
      data: {
        module: node.module,
        elementName: node.elementName,
        ctdSectionNumber: node.ctdSectionNumber,
        titleZh: node.titleZh,
        titleEn: node.titleEn,
        nodeType,
        isLeaf,
        requiresStf: nodeRequiresStf,
        requiresESeal: node.requiresESeal,
        allowsExtension: node.allowsExtension,
        defaultStfCategories: serializeJsonField(defaultStfCategoriesValue ?? null),
        // Plan 13: 多实例节点元数据
        isRepeatable: node.isRepeatable,
        instanceKeyFields: serializeJsonField(node.instanceKeyFields ?? null),
        sortOrder: node.sortOrder,
      },
    });
    nameToId.set(node.elementName, created.id);
  }

  // Second pass: set parent references
  console.log('Setting parent references...');
  for (const node of nodes) {
    if (node.parentSectionNumber) {
      const parentName = snoToName.get(node.parentSectionNumber);
      if (parentName) {
        const parentId = nameToId.get(parentName);
        const nodeId = nameToId.get(node.elementName);
        if (parentId && nodeId) {
          await prisma.ctdTemplateNode.update({
            where: { id: nodeId },
            data: { parentId },
          });
        }
      }
    }
  }

  console.log(`✓ Seeded ${nodes.length} CTD template nodes.`);

  // Print summary
  const moduleStats = new Map<number, number>();
  for (const n of nodes) {
    moduleStats.set(n.module, (moduleStats.get(n.module) || 0) + 1);
  }
  for (const [mod, count] of Array.from(moduleStats.entries()).sort((a, b) => a[0] - b[0])) {
    console.log(`  Module ${mod}: ${count} nodes`);
  }

  // Count how many nodes ended up with a preset default_stf_categories.
  // (In-memory — avoids the Prisma DbNull/AnyNull filter dance on Json? columns.)
  const stfPresetCount = nodes.filter((n) => {
    const isLeafNode = nodeTypes.get(n.ctdSectionNumber) === CtdNodeType.LEAF;
    return isLeafNode && n.requiresStf && n.defaultStfCategories !== null;
  }).length;
  console.log(`  ✓ ${stfPresetCount} leaf nodes have preset default_stf_categories`);

  return nameToId;
}

async function seedCompletenessRules(nameToId?: Map<string, string>) {
  const existing = await prisma.ctdCompletenessRule.count();
  if (existing > 0) {
    console.log(`Completeness rules already seeded (${existing} rules). Skipping.`);
    return;
  }

  // Build name->id map if not provided
  if (!nameToId) {
    nameToId = new Map();
    const allNodes = await prisma.ctdTemplateNode.findMany({ select: { id: true, elementName: true } });
    for (const n of allNodes) {
      nameToId.set(n.elementName, n.id);
    }
  }

  console.log('Seeding completeness rules (4.3.x)...');
  let ruleCount = 0;

  for (const rule of COMPLETENESS_RULES) {
    for (const aptCode of rule.applicationTypeCodes) {
      for (const ratCode of rule.regulatoryActivityTypeCodes) {
        for (const elementName of rule.elementNames) {
          const templateNodeId = nameToId.get(elementName);
          if (!templateNodeId) {
            console.warn(`  Warning: element "${elementName}" not found in template nodes (rule ${rule.ruleId})`);
            continue;
          }
          await prisma.ctdCompletenessRule.create({
            data: {
              applicationTypeCode: aptCode,
              regulatoryActivityTypeCode: ratCode,
              templateNodeId,
              ruleType: rule.ruleType,
              severity: rule.severity,
            },
          });
          ruleCount++;
        }
      }
    }
  }

  console.log(`✓ Seeded ${ruleCount} completeness rules.`);
}

// ==================== Main ====================

/**
 * Programmatic entry point. Pass either the PG `@prisma/client` or the SQLite
 * one (`backend/src/generated/prisma-sqlite`); JSON-shaped fields are
 * automatically stringified when DB_PROVIDER=sqlite.
 */
export async function runCtdSeed(client: any): Promise<void> {
  prisma = client;
  console.log('=== CTD Template Seed ===');
  const nameToId = await seedTemplateNodes();
  await seedCompletenessRules(nameToId);
  console.log('=== CTD Template Seed Complete ===');
}

async function cliMain() {
  prisma = new PrismaClient();
  try {
    await runCtdSeed(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  cliMain().catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  });
}
