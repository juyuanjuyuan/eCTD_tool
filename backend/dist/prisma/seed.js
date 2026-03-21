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
const bcrypt = __importStar(require("bcrypt"));
const prisma = new client_1.PrismaClient();
async function main() {
    console.log('Seeding database...');
    const adminPassword = await bcrypt.hash('admin123', 10);
    await prisma.user.upsert({
        where: { email: 'admin@ectd.com' },
        update: {},
        create: {
            email: 'admin@ectd.com',
            passwordHash: adminPassword,
            name: '系统管理员',
            role: 'ADMIN',
        },
    });
    const editorPassword = await bcrypt.hash('editor123', 10);
    await prisma.user.upsert({
        where: { email: 'editor@ectd.com' },
        update: {},
        create: {
            email: 'editor@ectd.com',
            passwordHash: editorPassword,
            name: '测试编辑',
            role: 'EDITOR',
        },
    });
    const managerPassword = await bcrypt.hash('manager123', 10);
    await prisma.user.upsert({
        where: { email: 'manager@ectd.com' },
        update: {},
        create: {
            email: 'manager@ectd.com',
            passwordHash: managerPassword,
            name: '测试经理',
            role: 'MANAGER',
        },
    });
    console.log('Seed completed.');
    console.log('Default users:');
    console.log('  admin@ectd.com / admin123 (ADMIN)');
    console.log('  manager@ectd.com / manager123 (MANAGER)');
    console.log('  editor@ectd.com / editor123 (EDITOR)');
}
main()
    .catch((e) => {
    console.error(e);
    process.exit(1);
})
    .finally(async () => {
    await prisma.$disconnect();
});
//# sourceMappingURL=seed.js.map