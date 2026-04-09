/**
 * Plan 12 决策 4: CTD 章节预设 STF category 维度种子数据
 *
 * 为 M4 (4.2.x) / M5 (5.3.1.x ~ 5.3.5.x) 的叶节点预设 STF category 维度。
 * 90% 的常规研究"开箱即填"，特殊研究通过前端"高级区"补充其它维度。
 *
 * 维度名称必须严格匹配 ICH valid-values.xml v6.0 中的 category 名称：
 *   - species          (M4 非临床: 物种)
 *   - route-of-admin   (给药途径)
 *   - duration         (持续时间)
 *   - type-of-control  (对照类型)
 *
 * 规则（风险点 #7 "宁缺勿滥"）:
 *   - 不允许出现 valid-values.xml 之外的 category 名称
 *   - 若某章节的所有 ICH 维度都不适用（如 4.2.2.1 analytical methods / 5.3.2.x
 *     使用人体生物样本的体外研究），则该章节不加入 STF_DEFAULTS，其
 *     default_stf_categories 字段保持为 null —— 前端完全走"高级区"让用户手动添加
 *   - M5 5.3.6 / 5.3.7 本项目 requiresStf 设为 false，不需要 STF，不在此表中
 *
 * 数据来源:
 *   - ICH STF Specification v2.6.1 (reference/实施规范指南/STFV2-6-1_0.pdf)
 *   - ICH E3 Clinical Study Reports convention
 *   - reference/eCTD技术规范V1.1附件包/附件2-6：STF标签值文件/valid-values.xml v6.0
 */

import type { PrismaClient } from '@prisma/client';

// ============================================================
// 类型定义
// ============================================================

export interface StfCategoryDimension {
  name: string;
  required: boolean;
}

/**
 * ICH valid-values.xml v6.0 定义的 4 个合法 category 维度名称。
 * STF_DEFAULTS 中出现的 name 必须来自该集合。
 */
export const ALLOWED_STF_CATEGORY_NAMES = [
  'species',
  'route-of-admin',
  'duration',
  'type-of-control',
] as const;

export type AllowedStfCategoryName = (typeof ALLOWED_STF_CATEGORY_NAMES)[number];

const ALLOWED_SET: ReadonlySet<string> = new Set<string>(ALLOWED_STF_CATEGORY_NAMES);

// ============================================================
// 预设维度表
// ============================================================

/**
 * 维度模板常量（便于复用 + 在 spec 里断言）
 */
const M4_PHARMACOLOGY: StfCategoryDimension[] = [
  { name: 'species', required: true },
  { name: 'route-of-admin', required: true },
];

const M4_PHARMACOKINETICS: StfCategoryDimension[] = [
  { name: 'species', required: true },
  { name: 'route-of-admin', required: true },
  { name: 'duration', required: true },
];

const M4_TOXICOLOGY: StfCategoryDimension[] = [
  { name: 'species', required: true },
  { name: 'route-of-admin', required: true },
  { name: 'duration', required: true },
  { name: 'type-of-control', required: true },
];

const M5_ROUTE_ONLY: StfCategoryDimension[] = [
  { name: 'route-of-admin', required: true },
];

const M5_EFFICACY_SAFETY: StfCategoryDimension[] = [
  { name: 'type-of-control', required: true },
];

/**
 * ctdSectionNumber -> 预设维度清单
 *
 * 不在此表中的 CTD 章节（或明确设为 null 的章节）将保持 default_stf_categories = null，
 * 前端完全由"高级区"让用户手动添加维度。
 */
export const STF_DEFAULTS: Readonly<Record<string, StfCategoryDimension[]>> = {
  // ========== M4 4.2.1.x 药效学 ==========
  // species + route-of-admin
  '4.2.1.1': M4_PHARMACOLOGY, // primary pharmacodynamics
  '4.2.1.2': M4_PHARMACOLOGY, // secondary pharmacodynamics
  '4.2.1.3': M4_PHARMACOLOGY, // safety pharmacology
  '4.2.1.4': M4_PHARMACOLOGY, // pharmacodynamic drug interactions

  // ========== M4 4.2.2.x 药代动力学 ==========
  // species + route-of-admin + duration
  // 注: 4.2.2.1 analytical-methods-and-validation-reports 是方法学报告，
  //     没有 species / route / duration 含义, 保持 null -> 不在此表
  '4.2.2.2': M4_PHARMACOKINETICS, // absorption
  '4.2.2.3': M4_PHARMACOKINETICS, // distribution
  '4.2.2.4': M4_PHARMACOKINETICS, // metabolism
  '4.2.2.5': M4_PHARMACOKINETICS, // excretion
  '4.2.2.6': M4_PHARMACOKINETICS, // PK drug interactions
  '4.2.2.7': M4_PHARMACOKINETICS, // other PK studies

  // ========== M4 4.2.3.x 毒理学 ==========
  // species + route-of-admin + duration + type-of-control (4 维全)
  '4.2.3.1': M4_TOXICOLOGY, // single-dose toxicity
  '4.2.3.2': M4_TOXICOLOGY, // repeat-dose toxicity
  // 4.2.3.3 遗传毒性 (父节点, 不是叶子, 不参与)
  '4.2.3.3.1': M4_TOXICOLOGY, // genotoxicity in-vitro
  '4.2.3.3.2': M4_TOXICOLOGY, // genotoxicity in-vivo
  // 4.2.3.4 致癌性 (父节点)
  '4.2.3.4.1': M4_TOXICOLOGY, // long-term carcinogenicity
  '4.2.3.4.2': M4_TOXICOLOGY, // short/medium-term carcinogenicity
  '4.2.3.4.3': M4_TOXICOLOGY, // other carcinogenicity studies
  // 4.2.3.5 生殖发育毒性 (父节点)
  '4.2.3.5.1': M4_TOXICOLOGY, // fertility & early embryonic development
  '4.2.3.5.2': M4_TOXICOLOGY, // embryo-fetal development
  '4.2.3.5.3': M4_TOXICOLOGY, // prenatal & postnatal development
  '4.2.3.5.4': M4_TOXICOLOGY, // juvenile animal studies
  '4.2.3.6': M4_TOXICOLOGY, // local tolerance
  // 4.2.3.7 其他毒性研究 (父节点)
  '4.2.3.7.1': M4_TOXICOLOGY, // antigenicity
  '4.2.3.7.2': M4_TOXICOLOGY, // immunotoxicity
  '4.2.3.7.3': M4_TOXICOLOGY, // mechanistic studies
  '4.2.3.7.4': M4_TOXICOLOGY, // dependence
  '4.2.3.7.5': M4_TOXICOLOGY, // metabolites
  '4.2.3.7.6': M4_TOXICOLOGY, // impurities
  '4.2.3.7.7': M4_TOXICOLOGY, // other toxicity

  // ========== M5 5.3.1.x 生物药剂学 ==========
  // 仅 route-of-admin 明确可用
  // 注: 5.3.1.4 bioanalytical/analytical methods 是方法学报告, 保持 null
  '5.3.1.1': M5_ROUTE_ONLY, // bioavailability
  '5.3.1.2': M5_ROUTE_ONLY, // comparative BA / BE
  '5.3.1.3': M5_ROUTE_ONLY, // in-vitro in-vivo correlation

  // ========== M5 5.3.2.x 体外/体内代谢 (使用人体生物样本) ==========
  // 这些是体外研究 (plasma protein binding / hepatic metabolism / other
  // human biomaterials), route-of-admin 不适用 -> 全部 null
  // 不在此表中

  // ========== M5 5.3.3.x 人体药代动力学 (PK) ==========
  // route-of-admin 有意义
  '5.3.3.1': M5_ROUTE_ONLY, // healthy subject PK
  '5.3.3.2': M5_ROUTE_ONLY, // patient PK
  '5.3.3.3': M5_ROUTE_ONLY, // intrinsic factor PK
  '5.3.3.4': M5_ROUTE_ONLY, // extrinsic factor PK
  '5.3.3.5': M5_ROUTE_ONLY, // population PK

  // ========== M5 5.3.4.x 人体药效学 / PK-PD ==========
  // route-of-admin 有意义
  '5.3.4.1': M5_ROUTE_ONLY, // healthy subject PD & PK-PD
  '5.3.4.2': M5_ROUTE_ONLY, // patient PD & PK-PD

  // ========== M5 5.3.5.x 临床有效性 / 安全性 ==========
  // type-of-control 是 E3 临床研究的核心分类维度
  '5.3.5.1': M5_EFFICACY_SAFETY, // controlled clinical studies
  '5.3.5.2': M5_EFFICACY_SAFETY, // uncontrolled clinical studies
  '5.3.5.3': M5_EFFICACY_SAFETY, // analyses of data from more than one study
  '5.3.5.4': M5_EFFICACY_SAFETY, // other study reports

  // ========== M5 5.3.6 / 5.3.7 ==========
  // 本项目 requiresStf=false (seed-ctd.ts 的 requiresStf() 函数不包含这些),
  // 不应出现在 STF_DEFAULTS 中
};

// ============================================================
// 校验器（在种子与测试中复用）
// ============================================================

/**
 * 校验 STF_DEFAULTS 自身的合法性：
 * - 所有 name 必须在 ALLOWED_STF_CATEGORY_NAMES 集合中
 * - 同一章节内不允许重复 name
 * - 每个章节至少包含 1 个维度
 *
 * 如果 STF_DEFAULTS 有非法项则抛错。
 */
export function validateStfDefaults(): void {
  for (const [sectionNumber, dims] of Object.entries(STF_DEFAULTS)) {
    if (!Array.isArray(dims) || dims.length === 0) {
      throw new Error(
        `STF_DEFAULTS["${sectionNumber}"] must be a non-empty array (got ${JSON.stringify(dims)})`,
      );
    }
    const seen = new Set<string>();
    for (const dim of dims) {
      if (!dim || typeof dim.name !== 'string') {
        throw new Error(
          `STF_DEFAULTS["${sectionNumber}"] has malformed entry ${JSON.stringify(dim)}`,
        );
      }
      if (!ALLOWED_SET.has(dim.name)) {
        throw new Error(
          `STF_DEFAULTS["${sectionNumber}"] uses disallowed category name "${dim.name}". ` +
            `Allowed names: ${Array.from(ALLOWED_SET).join(', ')}`,
        );
      }
      if (seen.has(dim.name)) {
        throw new Error(
          `STF_DEFAULTS["${sectionNumber}"] has duplicate category name "${dim.name}"`,
        );
      }
      seen.add(dim.name);
      if (typeof dim.required !== 'boolean') {
        throw new Error(
          `STF_DEFAULTS["${sectionNumber}"] entry "${dim.name}" is missing boolean "required" field`,
        );
      }
    }
  }
}

// ============================================================
// 应用到数据库（幂等 updateMany，可在已有数据的环境下运行）
// ============================================================

export interface ApplyStfDefaultCategoriesResult {
  updatedSections: number;
  unmatchedSections: string[];
}

/**
 * 把 STF_DEFAULTS 写入数据库。使用 updateMany 是幂等的：
 * - 在全新环境（seed-ctd 第一次跑）下，buildTemplateNodes 已经写入了
 *   default_stf_categories；此处再跑一次 updateMany 不产生差异
 * - 在已有数据的环境下，此函数可单独被调用以"追加"字段值
 *
 * 注意：此函数不清空非 M4/M5 节点的 default_stf_categories 字段
 * （那些节点出厂值就是 null）
 */
export async function applyStfDefaultCategories(
  prisma: PrismaClient,
): Promise<ApplyStfDefaultCategoriesResult> {
  validateStfDefaults();

  let updatedSections = 0;
  const unmatchedSections: string[] = [];

  for (const [sectionNumber, dims] of Object.entries(STF_DEFAULTS)) {
    const result = await prisma.ctdTemplateNode.updateMany({
      where: { ctdSectionNumber: sectionNumber },
      data: { defaultStfCategories: dims as unknown as object },
    });
    if (result.count === 0) {
      unmatchedSections.push(sectionNumber);
    } else {
      updatedSections += result.count;
    }
  }

  return { updatedSections, unmatchedSections };
}

/**
 * 查询 STF_DEFAULTS 中某个章节号对应的维度清单。
 * 未定义则返回 null（代表前端只走"高级区"）。
 */
export function getStfDefaultsForSection(
  sectionNumber: string,
): StfCategoryDimension[] | null {
  const dims = STF_DEFAULTS[sectionNumber];
  return dims ? dims : null;
}
