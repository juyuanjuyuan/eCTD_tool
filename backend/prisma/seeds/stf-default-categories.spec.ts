/**
 * Plan 12 决策 4: `STF_DEFAULTS` 种子数据的自检脚本
 *
 * Jest 的 rootDir 是 `backend/src`，所以这个文件不会被 `npm run test` 自动
 * 捕获。它是一个独立的 ts-node 可执行脚本，可以用以下命令手动跑：
 *
 *     cd backend && npx ts-node prisma/seeds/stf-default-categories.spec.ts
 *
 * 它只对 STF_DEFAULTS 纯数据做断言，不连接数据库。
 */

import assert from 'node:assert/strict';
import {
  ALLOWED_STF_CATEGORY_NAMES,
  STF_DEFAULTS,
  getStfDefaultsForSection,
  validateStfDefaults,
  type StfCategoryDimension,
} from './stf-default-categories.js';

// ============================================================
// 工具
// ============================================================

type TestCase = { name: string; run: () => void };

const tests: TestCase[] = [];

function test(name: string, run: () => void): void {
  tests.push({ name, run });
}

function dimensionNames(dims: StfCategoryDimension[]): string[] {
  return dims.map((d) => d.name);
}

// ============================================================
// 用例
// ============================================================

test('validateStfDefaults() 不抛错 (所有 name 合法 / 无重复 / 格式正确)', () => {
  validateStfDefaults();
});

test('所有 name 必须来自 ALLOWED_STF_CATEGORY_NAMES', () => {
  const allowed = new Set<string>(ALLOWED_STF_CATEGORY_NAMES);
  for (const [sectionNumber, dims] of Object.entries(STF_DEFAULTS)) {
    for (const dim of dims) {
      assert.ok(
        allowed.has(dim.name),
        `Section ${sectionNumber} references category "${dim.name}" which is NOT in ` +
          `ALLOWED_STF_CATEGORY_NAMES (${Array.from(allowed).join(', ')}). ` +
          `Only ICH valid-values.xml v6.0 categories are allowed.`,
      );
    }
  }
});

test('ALLOWED_STF_CATEGORY_NAMES 恰好是 4 个 ICH 维度', () => {
  assert.deepEqual(
    [...ALLOWED_STF_CATEGORY_NAMES].sort(),
    ['duration', 'route-of-admin', 'species', 'type-of-control'],
  );
});

test('M4 4.2.1.x 药效学 -> species + route-of-admin', () => {
  const sections = ['4.2.1.1', '4.2.1.2', '4.2.1.3', '4.2.1.4'];
  for (const sno of sections) {
    const dims = STF_DEFAULTS[sno];
    assert.ok(dims, `Expected STF_DEFAULTS to contain ${sno}`);
    assert.deepEqual(
      dimensionNames(dims).sort(),
      ['route-of-admin', 'species'],
      `Section ${sno} should have exactly [species, route-of-admin]`,
    );
    for (const d of dims) assert.equal(d.required, true);
  }
});

test('M4 4.2.2.x 药代动力学 -> species + route-of-admin + duration (不含 4.2.2.1 方法学)', () => {
  const sections = ['4.2.2.2', '4.2.2.3', '4.2.2.4', '4.2.2.5', '4.2.2.6', '4.2.2.7'];
  for (const sno of sections) {
    const dims = STF_DEFAULTS[sno];
    assert.ok(dims, `Expected STF_DEFAULTS to contain ${sno}`);
    assert.deepEqual(
      dimensionNames(dims).sort(),
      ['duration', 'route-of-admin', 'species'],
      `Section ${sno} should have exactly [species, route-of-admin, duration]`,
    );
  }
});

test('M4 4.2.2.1 analytical methods 不设默认 (null)', () => {
  assert.equal(
    getStfDefaultsForSection('4.2.2.1'),
    null,
    '4.2.2.1 analytical methods should NOT have a preset — users fill via advanced area',
  );
});

test('M4 4.2.3.x 毒理学 -> 全 4 个维度 (species + route + duration + type-of-control)', () => {
  const toxSections = [
    '4.2.3.1',
    '4.2.3.2',
    '4.2.3.3.1',
    '4.2.3.3.2',
    '4.2.3.4.1',
    '4.2.3.4.2',
    '4.2.3.4.3',
    '4.2.3.5.1',
    '4.2.3.5.2',
    '4.2.3.5.3',
    '4.2.3.5.4',
    '4.2.3.6',
    '4.2.3.7.1',
    '4.2.3.7.2',
    '4.2.3.7.3',
    '4.2.3.7.4',
    '4.2.3.7.5',
    '4.2.3.7.6',
    '4.2.3.7.7',
  ];
  for (const sno of toxSections) {
    const dims = STF_DEFAULTS[sno];
    assert.ok(dims, `Expected STF_DEFAULTS to contain ${sno}`);
    assert.equal(
      dims.length,
      4,
      `Toxicology section ${sno} should have exactly 4 dimensions, got ${dims.length}`,
    );
    assert.deepEqual(
      dimensionNames(dims).sort(),
      ['duration', 'route-of-admin', 'species', 'type-of-control'],
      `Toxicology section ${sno} should have all 4 ICH dimensions`,
    );
  }
});

test('M4 4.2.3.x 的所有父节点 (4.2.3.3, 4.2.3.4, 4.2.3.5, 4.2.3.7) 不在 STF_DEFAULTS 内', () => {
  // Parent / section nodes are not leaves, so they must not carry preset dims
  const parents = ['4.2.3.3', '4.2.3.4', '4.2.3.5', '4.2.3.7'];
  for (const sno of parents) {
    assert.equal(
      STF_DEFAULTS[sno],
      undefined,
      `${sno} is a section node (has children) and must NOT be in STF_DEFAULTS`,
    );
  }
});

test('M5 5.3.1.x 生物药剂学 -> route-of-admin (不含 5.3.1.4 生物分析方法学)', () => {
  const sections = ['5.3.1.1', '5.3.1.2', '5.3.1.3'];
  for (const sno of sections) {
    const dims = STF_DEFAULTS[sno];
    assert.ok(dims, `Expected STF_DEFAULTS to contain ${sno}`);
    assert.deepEqual(dimensionNames(dims), ['route-of-admin']);
  }
  assert.equal(
    getStfDefaultsForSection('5.3.1.4'),
    null,
    '5.3.1.4 bioanalytical methods should NOT have a preset',
  );
});

test('M5 5.3.2.x 人体生物样本体外研究 全为 null (体外研究无 route-of-admin)', () => {
  const sections = ['5.3.2.1', '5.3.2.2', '5.3.2.3'];
  for (const sno of sections) {
    assert.equal(
      getStfDefaultsForSection(sno),
      null,
      `${sno} is an in-vitro study with human biomaterials; no ICH dimensions apply`,
    );
  }
});

test('M5 5.3.3.x 人体 PK -> route-of-admin', () => {
  const sections = ['5.3.3.1', '5.3.3.2', '5.3.3.3', '5.3.3.4', '5.3.3.5'];
  for (const sno of sections) {
    const dims = STF_DEFAULTS[sno];
    assert.ok(dims, `Expected STF_DEFAULTS to contain ${sno}`);
    assert.deepEqual(dimensionNames(dims), ['route-of-admin']);
  }
});

test('M5 5.3.4.x 人体 PD/PK-PD -> route-of-admin', () => {
  for (const sno of ['5.3.4.1', '5.3.4.2']) {
    const dims = STF_DEFAULTS[sno];
    assert.ok(dims, `Expected STF_DEFAULTS to contain ${sno}`);
    assert.deepEqual(dimensionNames(dims), ['route-of-admin']);
  }
});

test('M5 5.3.5.x 临床有效性/安全性 -> type-of-control', () => {
  for (const sno of ['5.3.5.1', '5.3.5.2', '5.3.5.3', '5.3.5.4']) {
    const dims = STF_DEFAULTS[sno];
    assert.ok(dims, `Expected STF_DEFAULTS to contain ${sno}`);
    assert.deepEqual(dimensionNames(dims), ['type-of-control']);
  }
});

test('M5 5.3.6 / 5.3.7 不需要 STF -> 不在 STF_DEFAULTS', () => {
  // seed-ctd.ts 的 requiresStf() 只匹配 5.3.[1-5].*, 所以 5.3.6 / 5.3.7 不需要 STF
  const notStf = ['5.3.6', '5.3.7'];
  for (const sno of notStf) {
    assert.equal(
      STF_DEFAULTS[sno],
      undefined,
      `${sno} does not require STF and must not be in STF_DEFAULTS`,
    );
    assert.equal(getStfDefaultsForSection(sno), null);
  }
});

test('所有 dimension 的 required 字段都是 boolean (当前全为 true)', () => {
  for (const [sectionNumber, dims] of Object.entries(STF_DEFAULTS)) {
    for (const d of dims) {
      assert.equal(
        typeof d.required,
        'boolean',
        `Section ${sectionNumber} dim "${d.name}" required must be boolean`,
      );
    }
  }
});

test('每个章节内没有重复 category name', () => {
  for (const [sectionNumber, dims] of Object.entries(STF_DEFAULTS)) {
    const names = dimensionNames(dims);
    const unique = new Set(names);
    assert.equal(
      names.length,
      unique.size,
      `Section ${sectionNumber} has duplicate category names: ${names.join(', ')}`,
    );
  }
});

test('getStfDefaultsForSection() 对未定义章节返回 null', () => {
  assert.equal(getStfDefaultsForSection('1.0'), null);
  assert.equal(getStfDefaultsForSection('3.2.S.1'), null);
  assert.equal(getStfDefaultsForSection('nonexistent'), null);
});

test('STF_DEFAULTS 覆盖 seed-ctd.ts requiresStf() 预期范围 (sanity summary)', () => {
  // 统计 STF_DEFAULTS 中 M4 / M5 条目数量, 确保在合理范围
  const m4 = Object.keys(STF_DEFAULTS).filter((k) => k.startsWith('4.2.'));
  const m5 = Object.keys(STF_DEFAULTS).filter((k) => k.startsWith('5.3.'));
  // M4: 4 (药效) + 6 (药代, 不含 4.2.2.1) + 19 (毒理) = 29
  assert.equal(m4.length, 29, `Expected 29 M4 presets, got ${m4.length}`);
  // M5: 3 (5.3.1) + 5 (5.3.3) + 2 (5.3.4) + 4 (5.3.5) = 14
  assert.equal(m5.length, 14, `Expected 14 M5 presets, got ${m5.length}`);
});

// ============================================================
// 驱动
// ============================================================

let passed = 0;
let failed = 0;
const failures: Array<{ name: string; error: unknown }> = [];

for (const t of tests) {
  try {
    t.run();
    passed++;
    console.log(`  ok  ${t.name}`);
  } catch (err) {
    failed++;
    failures.push({ name: t.name, error: err });
    console.error(`  FAIL  ${t.name}`);
    console.error(`        ${(err as Error).message}`);
  }
}

console.log('');
console.log(`Tests: ${passed} passed, ${failed} failed, ${tests.length} total`);

if (failed > 0) {
  for (const f of failures) {
    console.error(`\n--- ${f.name} ---`);
    console.error(f.error);
  }
  process.exit(1);
}
