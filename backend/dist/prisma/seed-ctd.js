"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const fast_xml_parser_1 = require("fast-xml-parser");
const stf_default_categories_js_1 = require("./seeds/stf-default-categories.js");
const prisma = new client_1.PrismaClient();
const XML_DIR = path.resolve(process.cwd(), '../reference/eCTD技术规范V1.1附件包/附件1-2：受控词汇文件包');
function parseXmlFile(filename) {
    const filePath = path.join(XML_DIR, filename);
    const xml = fs.readFileSync(filePath, 'utf-8');
    const parser = new fast_xml_parser_1.XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: '@_',
        isArray: (name) => name === 'element' || name === 'description',
    });
    return parser.parse(xml);
}
function extractElements(parsed) {
    const version = parsed['element-properties']?.version;
    if (!version)
        return [];
    const elements = version.element;
    return Array.isArray(elements) ? elements : elements ? [elements] : [];
}
function getDescription(el, lang) {
    const descs = el.description || [];
    const found = descs.find((d) => d['@_xml:lang'] === lang);
    return found ? found['#text'] : '';
}
function getParentStructureNo(sno) {
    const parts = sno.split('.');
    if (parts.length <= 1)
        return null;
    return parts.slice(0, -1).join('.');
}
function getModuleNumber(sno) {
    return parseInt(sno.split('.')[0], 10);
}
function requiresStf(sno) {
    if (sno.startsWith('4.2.'))
        return true;
    const m5match = sno.match(/^5\.3\.([1-5])\./);
    if (m5match)
        return true;
    return false;
}
const E_SEAL_SECTIONS = new Set([
    'cn-1-0', 'cn-1-2', 'cn-1-3-8', 'cn-1-10', 'cn-1-11', 'cn-1-12',
]);
function isExtensionPoint(elementName, sno) {
    return sno === '3.2.R';
}
const REPEATABLE_NODE_CONFIG = {
    'm2-3-s-drug-substance': ['substance', 'manufacturer'],
    'm2-3-p-drug-product': ['productName', 'dosageForm', 'manufacturer'],
    'm2-7-3-summary-of-clinical-efficacy': ['indication'],
    'm3-2-s-drug-substance': ['substance', 'manufacturer'],
    'm3-2-p-drug-product': ['productName', 'dosageForm', 'manufacturer'],
};
function buildTemplateNodes() {
    const nodes = [];
    let sortCounter = 0;
    const ichParsed = parseXmlFile('element-property_ICH.xml');
    const ichElements = extractElements(ichParsed);
    const cnParsed = parseXmlFile('element-property_CN.xml');
    const cnElements = extractElements(cnParsed);
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
            defaultStfCategories: stf_default_categories_js_1.STF_DEFAULTS[sno] ?? null,
            isRepeatable: !!repeatKeys,
            instanceKeyFields: repeatKeys ?? null,
        });
    }
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
function determineNodeTypes(nodes) {
    const snoSet = new Set(nodes.map((n) => n.ctdSectionNumber));
    const hasChildren = new Set();
    for (const node of nodes) {
        if (node.parentSectionNumber && snoSet.has(node.parentSectionNumber)) {
            hasChildren.add(node.parentSectionNumber);
        }
    }
    const types = new Map();
    for (const node of nodes) {
        const sno = node.ctdSectionNumber;
        if (sno.length <= 1 && !sno.includes('.')) {
            types.set(sno, client_1.CtdNodeType.MODULE);
        }
        else if (node.allowsExtension) {
            types.set(sno, client_1.CtdNodeType.EXTENSION_POINT);
        }
        else if (hasChildren.has(sno)) {
            types.set(sno, client_1.CtdNodeType.SECTION);
        }
        else {
            types.set(sno, client_1.CtdNodeType.LEAF);
        }
    }
    return types;
}
const COMPLETENESS_RULES = [
    {
        ruleId: '4.3.1',
        applicationTypeCodes: ['cnapt2'],
        regulatoryActivityTypeCodes: ['cnrat1', 'cnrat6'],
        elementNames: [
            'cn-1-0', 'cn-1-2', 'cn-1-3', 'cn-1-3-1', 'cn-1-3-1-2',
            'cn-1-3-2', 'cn-1-3-2-2', 'cn-1-3-3', 'cn-1-3-8',
            'cn-1-3-8-1', 'cn-1-3-8-2', 'cn-1-11',
        ],
        ruleType: client_1.CompletenessRuleType.REQUIRED,
        severity: client_1.CompletenessRuleSeverity.ERROR,
    },
    {
        ruleId: '4.3.2',
        applicationTypeCodes: ['cnapt2'],
        regulatoryActivityTypeCodes: ['cnrat1', 'cnrat6'],
        elementNames: [
            'cn-1-3-1-1', 'cn-1-3-2-1', 'cn-1-3-4',
            'cn-1-3-4-1', 'cn-1-3-4-2', 'cn-1-3-4-3',
        ],
        ruleType: client_1.CompletenessRuleType.FORBIDDEN,
        severity: client_1.CompletenessRuleSeverity.ERROR,
    },
    {
        ruleId: '4.3.3',
        applicationTypeCodes: ['cnapt3'],
        regulatoryActivityTypeCodes: ['cnrat1', 'cnrat6'],
        elementNames: [
            'cn-1-0', 'cn-1-2', 'cn-1-3', 'cn-1-3-1', 'cn-1-3-1-2',
            'cn-1-3-2', 'cn-1-3-2-2', 'cn-1-3-3', 'cn-1-3-8',
            'cn-1-3-8-1', 'cn-1-3-8-2', 'cn-1-11',
        ],
        ruleType: client_1.CompletenessRuleType.REQUIRED,
        severity: client_1.CompletenessRuleSeverity.ERROR,
    },
    {
        ruleId: '4.3.4',
        applicationTypeCodes: ['cnapt3'],
        regulatoryActivityTypeCodes: ['cnrat1', 'cnrat6'],
        elementNames: [
            'cn-1-3-1-1', 'cn-1-3-2-1', 'cn-1-3-4',
            'cn-1-3-4-1', 'cn-1-3-4-2', 'cn-1-3-4-3', 'cn-1-12',
        ],
        ruleType: client_1.CompletenessRuleType.FORBIDDEN,
        severity: client_1.CompletenessRuleSeverity.ERROR,
    },
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
        ruleType: client_1.CompletenessRuleType.REQUIRED,
        severity: client_1.CompletenessRuleSeverity.ERROR,
    },
    {
        ruleId: '4.3.6',
        applicationTypeCodes: ['cnapt1'],
        regulatoryActivityTypeCodes: ['cnrat1', 'cnrat5'],
        elementNames: [
            'cn-1-3-1-2', 'cn-1-3-2-2', 'cn-1-3-5', 'cn-1-3-6',
        ],
        ruleType: client_1.CompletenessRuleType.FORBIDDEN,
        severity: client_1.CompletenessRuleSeverity.ERROR,
    },
    {
        ruleId: '4.3.7',
        applicationTypeCodes: ['cnapt1'],
        regulatoryActivityTypeCodes: ['cnrat7'],
        elementNames: ['cn-1-8-1', 'cn-1-8-2'],
        ruleType: client_1.CompletenessRuleType.REQUIRED,
        severity: client_1.CompletenessRuleSeverity.WARNING,
    },
    {
        ruleId: '4.3.10',
        applicationTypeCodes: ['cnapt4'],
        regulatoryActivityTypeCodes: ['cnrat1'],
        elementNames: [
            'cn-1-0', 'cn-1-2', 'cn-1-3', 'cn-1-3-2', 'cn-1-3-2-2',
            'cn-1-3-3', 'cn-1-3-8', 'cn-1-3-8-1', 'cn-1-3-8-2', 'cn-1-11',
        ],
        ruleType: client_1.CompletenessRuleType.REQUIRED,
        severity: client_1.CompletenessRuleSeverity.ERROR,
    },
    {
        ruleId: '4.3.11',
        applicationTypeCodes: ['cnapt4'],
        regulatoryActivityTypeCodes: ['cnrat1'],
        elementNames: [
            'cn-1-3-1-1', 'cn-1-3-2-1', 'cn-1-3-4',
            'cn-1-3-4-1', 'cn-1-3-4-2', 'cn-1-3-4-3',
        ],
        ruleType: client_1.CompletenessRuleType.FORBIDDEN,
        severity: client_1.CompletenessRuleSeverity.ERROR,
    },
    {
        ruleId: '4.3.12',
        applicationTypeCodes: ['cnapt2', 'cnapt3', 'cnapt4'],
        regulatoryActivityTypeCodes: ['cnrat2'],
        elementNames: ['cn-1-0', 'cn-1-2', 'cn-1-4-1', 'cn-1-11'],
        ruleType: client_1.CompletenessRuleType.REQUIRED,
        severity: client_1.CompletenessRuleSeverity.ERROR,
    },
    {
        ruleId: '4.3.13',
        applicationTypeCodes: ['cnapt2', 'cnapt3', 'cnapt4'],
        regulatoryActivityTypeCodes: ['cnrat2'],
        elementNames: ['cn-1-3-1-1', 'cn-1-3-2-1'],
        ruleType: client_1.CompletenessRuleType.FORBIDDEN,
        severity: client_1.CompletenessRuleSeverity.ERROR,
    },
    {
        ruleId: '4.3.14',
        applicationTypeCodes: ['cnapt1'],
        regulatoryActivityTypeCodes: ['cnrat2'],
        elementNames: ['cn-1-0', 'cn-1-2', 'cn-1-11'],
        ruleType: client_1.CompletenessRuleType.REQUIRED,
        severity: client_1.CompletenessRuleSeverity.ERROR,
    },
    {
        ruleId: '4.3.15',
        applicationTypeCodes: ['cnapt2', 'cnapt3', 'cnapt4'],
        regulatoryActivityTypeCodes: ['cnrat3'],
        elementNames: ['cn-1-0', 'cn-1-2', 'cn-1-4-1'],
        ruleType: client_1.CompletenessRuleType.REQUIRED,
        severity: client_1.CompletenessRuleSeverity.ERROR,
    },
    {
        ruleId: '4.3.16',
        applicationTypeCodes: ['cnapt2', 'cnapt3', 'cnapt4'],
        regulatoryActivityTypeCodes: ['cnrat4'],
        elementNames: ['cn-1-0', 'cn-1-2', 'cn-1-4-1'],
        ruleType: client_1.CompletenessRuleType.REQUIRED,
        severity: client_1.CompletenessRuleSeverity.ERROR,
    },
    {
        ruleId: '4.3.18',
        applicationTypeCodes: ['cnapt2'],
        regulatoryActivityTypeCodes: ['cnrat8'],
        elementNames: [
            'cn-1-0', 'cn-1-2', 'cn-1-3-8-9', 'cn-1-4-1', 'cn-1-11',
            'cn-1-3-3', 'cn-1-3-1-2', 'cn-1-3-2-2',
        ],
        ruleType: client_1.CompletenessRuleType.REQUIRED,
        severity: client_1.CompletenessRuleSeverity.ERROR,
    },
    {
        ruleId: '4.3.19',
        applicationTypeCodes: ['cnapt2'],
        regulatoryActivityTypeCodes: ['cnrat8'],
        elementNames: ['cn-1-3-1-1', 'cn-1-3-2-1', 'cn-1-3-4-1', 'cn-1-3-4-2', 'cn-1-3-4-3'],
        ruleType: client_1.CompletenessRuleType.FORBIDDEN,
        severity: client_1.CompletenessRuleSeverity.ERROR,
    },
    {
        ruleId: '4.3.20',
        applicationTypeCodes: ['cnapt3'],
        regulatoryActivityTypeCodes: ['cnrat8'],
        elementNames: [
            'cn-1-0', 'cn-1-2', 'cn-1-3-8-9', 'cn-1-4-1', 'cn-1-11',
            'cn-1-3-3', 'cn-1-3-1-2', 'cn-1-3-2-2',
        ],
        ruleType: client_1.CompletenessRuleType.REQUIRED,
        severity: client_1.CompletenessRuleSeverity.ERROR,
    },
    {
        ruleId: '4.3.21',
        applicationTypeCodes: ['cnapt4'],
        regulatoryActivityTypeCodes: ['cnrat8'],
        elementNames: ['cn-1-0', 'cn-1-2', 'cn-1-3-8-9', 'cn-1-4-1', 'cn-1-11', 'cn-1-3-3'],
        ruleType: client_1.CompletenessRuleType.REQUIRED,
        severity: client_1.CompletenessRuleSeverity.ERROR,
    },
];
async function seedTemplateNodes() {
    (0, stf_default_categories_js_1.validateStfDefaults)();
    const existing = await prisma.ctdTemplateNode.count();
    if (existing > 0) {
        console.log(`CTD template nodes already seeded (${existing} nodes). Skipping structural seed.`);
        const { updatedSections, unmatchedSections } = await (0, stf_default_categories_js_1.applyStfDefaultCategories)(prisma);
        console.log(`  Backfilled default_stf_categories for ${updatedSections} nodes ` +
            `(${unmatchedSections.length} sections unmatched)`);
        if (unmatchedSections.length > 0) {
            console.warn(`  Warning: STF_DEFAULTS references sections not present in DB: ${unmatchedSections.join(', ')}`);
        }
        let backfilledRepeatable = 0;
        for (const [elementName, keys] of Object.entries(REPEATABLE_NODE_CONFIG)) {
            const result = await prisma.ctdTemplateNode.updateMany({
                where: { elementName },
                data: {
                    isRepeatable: true,
                    instanceKeyFields: keys,
                },
            });
            backfilledRepeatable += result.count;
        }
        console.log(`  Backfilled isRepeatable flag for ${backfilledRepeatable}/${Object.keys(REPEATABLE_NODE_CONFIG).length} repeatable nodes`);
        return;
    }
    console.log('Building CTD template tree from XML...');
    const nodes = buildTemplateNodes();
    const nodeTypes = determineNodeTypes(nodes);
    const snoToName = new Map();
    for (const n of nodes) {
        snoToName.set(n.ctdSectionNumber, n.elementName);
    }
    console.log(`Inserting ${nodes.length} template nodes...`);
    const nameToId = new Map();
    for (const node of nodes) {
        const nodeType = nodeTypes.get(node.ctdSectionNumber) || client_1.CtdNodeType.LEAF;
        const isLeaf = nodeType === client_1.CtdNodeType.LEAF;
        const nodeRequiresStf = isLeaf && node.requiresStf;
        const defaultStfCategoriesValue = nodeRequiresStf && node.defaultStfCategories
            ? node.defaultStfCategories
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
                defaultStfCategories: defaultStfCategoriesValue,
                isRepeatable: node.isRepeatable,
                instanceKeyFields: node.instanceKeyFields
                    ? node.instanceKeyFields
                    : undefined,
                sortOrder: node.sortOrder,
            },
        });
        nameToId.set(node.elementName, created.id);
    }
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
    const moduleStats = new Map();
    for (const n of nodes) {
        moduleStats.set(n.module, (moduleStats.get(n.module) || 0) + 1);
    }
    for (const [mod, count] of Array.from(moduleStats.entries()).sort((a, b) => a[0] - b[0])) {
        console.log(`  Module ${mod}: ${count} nodes`);
    }
    const stfPresetCount = nodes.filter((n) => {
        const isLeafNode = nodeTypes.get(n.ctdSectionNumber) === client_1.CtdNodeType.LEAF;
        return isLeafNode && n.requiresStf && n.defaultStfCategories !== null;
    }).length;
    console.log(`  ✓ ${stfPresetCount} leaf nodes have preset default_stf_categories`);
    return nameToId;
}
async function seedCompletenessRules(nameToId) {
    const existing = await prisma.ctdCompletenessRule.count();
    if (existing > 0) {
        console.log(`Completeness rules already seeded (${existing} rules). Skipping.`);
        return;
    }
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
async function main() {
    console.log('=== CTD Template Seed ===');
    const nameToId = await seedTemplateNodes();
    await seedCompletenessRules(nameToId);
    console.log('=== CTD Template Seed Complete ===');
}
main()
    .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
})
    .finally(async () => {
    await prisma.$disconnect();
});
//# sourceMappingURL=seed-ctd.js.map