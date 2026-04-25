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
exports.autoSeedIfEmpty = autoSeedIfEmpty;
const bcrypt = __importStar(require("bcrypt"));
async function autoSeedIfEmpty(options) {
    const { prisma } = options;
    const log = options.logger ?? {
        info: (m) => console.log(`[auto-seed] ${m}`),
        warn: (m) => console.warn(`[auto-seed] ${m}`),
    };
    const result = { seededUsers: false, seededCtdTemplate: false };
    const userCount = await prisma.user.count();
    if (userCount === 0) {
        const adminPassword = await bcrypt.hash('admin123', 10);
        await prisma.user.create({
            data: {
                email: 'admin@ectd.com',
                passwordHash: adminPassword,
                name: '系统管理员',
                role: 'ADMIN',
            },
        });
        log.info('seeded default admin user (admin@ectd.com / admin123)');
        result.seededUsers = true;
    }
    else {
        log.info(`users exist (${userCount}), skipping user seed`);
    }
    const ctdCount = await prisma.ctdTemplateNode.count();
    if (ctdCount === 0) {
        if (typeof options.ctdSeed === 'function') {
            await options.ctdSeed(prisma);
            log.info('seeded CTD template + completeness rules via caller-supplied runner');
            result.seededCtdTemplate = true;
        }
        else {
            log.warn('ctd_template_node is empty; CTD authoring will be unusable. ' +
                'Expected the bundled first-run.db snapshot to populate it. ' +
                'Run `npm run seed:ctd` against this DB if you need to recover.');
        }
    }
    else {
        log.info(`ctd_template_node exists (${ctdCount} rows), skipping ctd seed`);
    }
    return result;
}
//# sourceMappingURL=auto-seed.js.map