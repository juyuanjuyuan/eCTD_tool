"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.STF_DEFAULTS = exports.ALLOWED_STF_CATEGORY_NAMES = void 0;
exports.validateStfDefaults = validateStfDefaults;
exports.applyStfDefaultCategories = applyStfDefaultCategories;
exports.getStfDefaultsForSection = getStfDefaultsForSection;
exports.ALLOWED_STF_CATEGORY_NAMES = [
    'species',
    'route-of-admin',
    'duration',
    'type-of-control',
];
const ALLOWED_SET = new Set(exports.ALLOWED_STF_CATEGORY_NAMES);
const M4_PHARMACOLOGY = [
    { name: 'species', required: true },
    { name: 'route-of-admin', required: true },
];
const M4_PHARMACOKINETICS = [
    { name: 'species', required: true },
    { name: 'route-of-admin', required: true },
    { name: 'duration', required: true },
];
const M4_TOXICOLOGY = [
    { name: 'species', required: true },
    { name: 'route-of-admin', required: true },
    { name: 'duration', required: true },
    { name: 'type-of-control', required: true },
];
const M5_ROUTE_ONLY = [
    { name: 'route-of-admin', required: true },
];
const M5_EFFICACY_SAFETY = [
    { name: 'type-of-control', required: true },
];
exports.STF_DEFAULTS = {
    '4.2.1.1': M4_PHARMACOLOGY,
    '4.2.1.2': M4_PHARMACOLOGY,
    '4.2.1.3': M4_PHARMACOLOGY,
    '4.2.1.4': M4_PHARMACOLOGY,
    '4.2.2.2': M4_PHARMACOKINETICS,
    '4.2.2.3': M4_PHARMACOKINETICS,
    '4.2.2.4': M4_PHARMACOKINETICS,
    '4.2.2.5': M4_PHARMACOKINETICS,
    '4.2.2.6': M4_PHARMACOKINETICS,
    '4.2.2.7': M4_PHARMACOKINETICS,
    '4.2.3.1': M4_TOXICOLOGY,
    '4.2.3.2': M4_TOXICOLOGY,
    '4.2.3.3.1': M4_TOXICOLOGY,
    '4.2.3.3.2': M4_TOXICOLOGY,
    '4.2.3.4.1': M4_TOXICOLOGY,
    '4.2.3.4.2': M4_TOXICOLOGY,
    '4.2.3.4.3': M4_TOXICOLOGY,
    '4.2.3.5.1': M4_TOXICOLOGY,
    '4.2.3.5.2': M4_TOXICOLOGY,
    '4.2.3.5.3': M4_TOXICOLOGY,
    '4.2.3.5.4': M4_TOXICOLOGY,
    '4.2.3.6': M4_TOXICOLOGY,
    '4.2.3.7.1': M4_TOXICOLOGY,
    '4.2.3.7.2': M4_TOXICOLOGY,
    '4.2.3.7.3': M4_TOXICOLOGY,
    '4.2.3.7.4': M4_TOXICOLOGY,
    '4.2.3.7.5': M4_TOXICOLOGY,
    '4.2.3.7.6': M4_TOXICOLOGY,
    '4.2.3.7.7': M4_TOXICOLOGY,
    '5.3.1.1': M5_ROUTE_ONLY,
    '5.3.1.2': M5_ROUTE_ONLY,
    '5.3.1.3': M5_ROUTE_ONLY,
    '5.3.3.1': M5_ROUTE_ONLY,
    '5.3.3.2': M5_ROUTE_ONLY,
    '5.3.3.3': M5_ROUTE_ONLY,
    '5.3.3.4': M5_ROUTE_ONLY,
    '5.3.3.5': M5_ROUTE_ONLY,
    '5.3.4.1': M5_ROUTE_ONLY,
    '5.3.4.2': M5_ROUTE_ONLY,
    '5.3.5.1': M5_EFFICACY_SAFETY,
    '5.3.5.2': M5_EFFICACY_SAFETY,
    '5.3.5.3': M5_EFFICACY_SAFETY,
    '5.3.5.4': M5_EFFICACY_SAFETY,
};
function validateStfDefaults() {
    for (const [sectionNumber, dims] of Object.entries(exports.STF_DEFAULTS)) {
        if (!Array.isArray(dims) || dims.length === 0) {
            throw new Error(`STF_DEFAULTS["${sectionNumber}"] must be a non-empty array (got ${JSON.stringify(dims)})`);
        }
        const seen = new Set();
        for (const dim of dims) {
            if (!dim || typeof dim.name !== 'string') {
                throw new Error(`STF_DEFAULTS["${sectionNumber}"] has malformed entry ${JSON.stringify(dim)}`);
            }
            if (!ALLOWED_SET.has(dim.name)) {
                throw new Error(`STF_DEFAULTS["${sectionNumber}"] uses disallowed category name "${dim.name}". ` +
                    `Allowed names: ${Array.from(ALLOWED_SET).join(', ')}`);
            }
            if (seen.has(dim.name)) {
                throw new Error(`STF_DEFAULTS["${sectionNumber}"] has duplicate category name "${dim.name}"`);
            }
            seen.add(dim.name);
            if (typeof dim.required !== 'boolean') {
                throw new Error(`STF_DEFAULTS["${sectionNumber}"] entry "${dim.name}" is missing boolean "required" field`);
            }
        }
    }
}
async function applyStfDefaultCategories(prisma) {
    validateStfDefaults();
    let updatedSections = 0;
    const unmatchedSections = [];
    for (const [sectionNumber, dims] of Object.entries(exports.STF_DEFAULTS)) {
        const result = await prisma.ctdTemplateNode.updateMany({
            where: { ctdSectionNumber: sectionNumber },
            data: { defaultStfCategories: dims },
        });
        if (result.count === 0) {
            unmatchedSections.push(sectionNumber);
        }
        else {
            updatedSections += result.count;
        }
    }
    return { updatedSections, unmatchedSections };
}
function getStfDefaultsForSection(sectionNumber) {
    const dims = exports.STF_DEFAULTS[sectionNumber];
    return dims ? dims : null;
}
//# sourceMappingURL=stf-default-categories.js.map