"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const stf_default_categories_js_1 = require("./stf-default-categories.js");
const tests = [];
function test(name, run) {
    tests.push({ name, run });
}
function dimensionNames(dims) {
    return dims.map((d) => d.name);
}
test('validateStfDefaults() 不抛错 (所有 name 合法 / 无重复 / 格式正确)', () => {
    (0, stf_default_categories_js_1.validateStfDefaults)();
});
test('所有 name 必须来自 ALLOWED_STF_CATEGORY_NAMES', () => {
    const allowed = new Set(stf_default_categories_js_1.ALLOWED_STF_CATEGORY_NAMES);
    for (const [sectionNumber, dims] of Object.entries(stf_default_categories_js_1.STF_DEFAULTS)) {
        for (const dim of dims) {
            strict_1.default.ok(allowed.has(dim.name), `Section ${sectionNumber} references category "${dim.name}" which is NOT in ` +
                `ALLOWED_STF_CATEGORY_NAMES (${Array.from(allowed).join(', ')}). ` +
                `Only ICH valid-values.xml v6.0 categories are allowed.`);
        }
    }
});
test('ALLOWED_STF_CATEGORY_NAMES 恰好是 4 个 ICH 维度', () => {
    strict_1.default.deepEqual([...stf_default_categories_js_1.ALLOWED_STF_CATEGORY_NAMES].sort(), ['duration', 'route-of-admin', 'species', 'type-of-control']);
});
test('M4 4.2.1.x 药效学 -> species + route-of-admin', () => {
    const sections = ['4.2.1.1', '4.2.1.2', '4.2.1.3', '4.2.1.4'];
    for (const sno of sections) {
        const dims = stf_default_categories_js_1.STF_DEFAULTS[sno];
        strict_1.default.ok(dims, `Expected STF_DEFAULTS to contain ${sno}`);
        strict_1.default.deepEqual(dimensionNames(dims).sort(), ['route-of-admin', 'species'], `Section ${sno} should have exactly [species, route-of-admin]`);
        for (const d of dims)
            strict_1.default.equal(d.required, true);
    }
});
test('M4 4.2.2.x 药代动力学 -> species + route-of-admin + duration (不含 4.2.2.1 方法学)', () => {
    const sections = ['4.2.2.2', '4.2.2.3', '4.2.2.4', '4.2.2.5', '4.2.2.6', '4.2.2.7'];
    for (const sno of sections) {
        const dims = stf_default_categories_js_1.STF_DEFAULTS[sno];
        strict_1.default.ok(dims, `Expected STF_DEFAULTS to contain ${sno}`);
        strict_1.default.deepEqual(dimensionNames(dims).sort(), ['duration', 'route-of-admin', 'species'], `Section ${sno} should have exactly [species, route-of-admin, duration]`);
    }
});
test('M4 4.2.2.1 analytical methods 不设默认 (null)', () => {
    strict_1.default.equal((0, stf_default_categories_js_1.getStfDefaultsForSection)('4.2.2.1'), null, '4.2.2.1 analytical methods should NOT have a preset — users fill via advanced area');
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
        const dims = stf_default_categories_js_1.STF_DEFAULTS[sno];
        strict_1.default.ok(dims, `Expected STF_DEFAULTS to contain ${sno}`);
        strict_1.default.equal(dims.length, 4, `Toxicology section ${sno} should have exactly 4 dimensions, got ${dims.length}`);
        strict_1.default.deepEqual(dimensionNames(dims).sort(), ['duration', 'route-of-admin', 'species', 'type-of-control'], `Toxicology section ${sno} should have all 4 ICH dimensions`);
    }
});
test('M4 4.2.3.x 的所有父节点 (4.2.3.3, 4.2.3.4, 4.2.3.5, 4.2.3.7) 不在 STF_DEFAULTS 内', () => {
    const parents = ['4.2.3.3', '4.2.3.4', '4.2.3.5', '4.2.3.7'];
    for (const sno of parents) {
        strict_1.default.equal(stf_default_categories_js_1.STF_DEFAULTS[sno], undefined, `${sno} is a section node (has children) and must NOT be in STF_DEFAULTS`);
    }
});
test('M5 5.3.1.x 生物药剂学 -> route-of-admin (不含 5.3.1.4 生物分析方法学)', () => {
    const sections = ['5.3.1.1', '5.3.1.2', '5.3.1.3'];
    for (const sno of sections) {
        const dims = stf_default_categories_js_1.STF_DEFAULTS[sno];
        strict_1.default.ok(dims, `Expected STF_DEFAULTS to contain ${sno}`);
        strict_1.default.deepEqual(dimensionNames(dims), ['route-of-admin']);
    }
    strict_1.default.equal((0, stf_default_categories_js_1.getStfDefaultsForSection)('5.3.1.4'), null, '5.3.1.4 bioanalytical methods should NOT have a preset');
});
test('M5 5.3.2.x 人体生物样本体外研究 全为 null (体外研究无 route-of-admin)', () => {
    const sections = ['5.3.2.1', '5.3.2.2', '5.3.2.3'];
    for (const sno of sections) {
        strict_1.default.equal((0, stf_default_categories_js_1.getStfDefaultsForSection)(sno), null, `${sno} is an in-vitro study with human biomaterials; no ICH dimensions apply`);
    }
});
test('M5 5.3.3.x 人体 PK -> route-of-admin', () => {
    const sections = ['5.3.3.1', '5.3.3.2', '5.3.3.3', '5.3.3.4', '5.3.3.5'];
    for (const sno of sections) {
        const dims = stf_default_categories_js_1.STF_DEFAULTS[sno];
        strict_1.default.ok(dims, `Expected STF_DEFAULTS to contain ${sno}`);
        strict_1.default.deepEqual(dimensionNames(dims), ['route-of-admin']);
    }
});
test('M5 5.3.4.x 人体 PD/PK-PD -> route-of-admin', () => {
    for (const sno of ['5.3.4.1', '5.3.4.2']) {
        const dims = stf_default_categories_js_1.STF_DEFAULTS[sno];
        strict_1.default.ok(dims, `Expected STF_DEFAULTS to contain ${sno}`);
        strict_1.default.deepEqual(dimensionNames(dims), ['route-of-admin']);
    }
});
test('M5 5.3.5.x 临床有效性/安全性 -> type-of-control', () => {
    for (const sno of ['5.3.5.1', '5.3.5.2', '5.3.5.3', '5.3.5.4']) {
        const dims = stf_default_categories_js_1.STF_DEFAULTS[sno];
        strict_1.default.ok(dims, `Expected STF_DEFAULTS to contain ${sno}`);
        strict_1.default.deepEqual(dimensionNames(dims), ['type-of-control']);
    }
});
test('M5 5.3.6 / 5.3.7 不需要 STF -> 不在 STF_DEFAULTS', () => {
    const notStf = ['5.3.6', '5.3.7'];
    for (const sno of notStf) {
        strict_1.default.equal(stf_default_categories_js_1.STF_DEFAULTS[sno], undefined, `${sno} does not require STF and must not be in STF_DEFAULTS`);
        strict_1.default.equal((0, stf_default_categories_js_1.getStfDefaultsForSection)(sno), null);
    }
});
test('所有 dimension 的 required 字段都是 boolean (当前全为 true)', () => {
    for (const [sectionNumber, dims] of Object.entries(stf_default_categories_js_1.STF_DEFAULTS)) {
        for (const d of dims) {
            strict_1.default.equal(typeof d.required, 'boolean', `Section ${sectionNumber} dim "${d.name}" required must be boolean`);
        }
    }
});
test('每个章节内没有重复 category name', () => {
    for (const [sectionNumber, dims] of Object.entries(stf_default_categories_js_1.STF_DEFAULTS)) {
        const names = dimensionNames(dims);
        const unique = new Set(names);
        strict_1.default.equal(names.length, unique.size, `Section ${sectionNumber} has duplicate category names: ${names.join(', ')}`);
    }
});
test('getStfDefaultsForSection() 对未定义章节返回 null', () => {
    strict_1.default.equal((0, stf_default_categories_js_1.getStfDefaultsForSection)('1.0'), null);
    strict_1.default.equal((0, stf_default_categories_js_1.getStfDefaultsForSection)('3.2.S.1'), null);
    strict_1.default.equal((0, stf_default_categories_js_1.getStfDefaultsForSection)('nonexistent'), null);
});
test('STF_DEFAULTS 覆盖 seed-ctd.ts requiresStf() 预期范围 (sanity summary)', () => {
    const m4 = Object.keys(stf_default_categories_js_1.STF_DEFAULTS).filter((k) => k.startsWith('4.2.'));
    const m5 = Object.keys(stf_default_categories_js_1.STF_DEFAULTS).filter((k) => k.startsWith('5.3.'));
    strict_1.default.equal(m4.length, 29, `Expected 29 M4 presets, got ${m4.length}`);
    strict_1.default.equal(m5.length, 14, `Expected 14 M5 presets, got ${m5.length}`);
});
let passed = 0;
let failed = 0;
const failures = [];
for (const t of tests) {
    try {
        t.run();
        passed++;
        console.log(`  ok  ${t.name}`);
    }
    catch (err) {
        failed++;
        failures.push({ name: t.name, error: err });
        console.error(`  FAIL  ${t.name}`);
        console.error(`        ${err.message}`);
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
//# sourceMappingURL=stf-default-categories.spec.js.map