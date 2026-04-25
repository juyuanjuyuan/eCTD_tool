"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const auto_seed_1 = require("./auto-seed");
const silent = { info: () => { }, warn: () => { } };
function makePrisma() {
    return {
        user: {
            count: jest.fn(),
            create: jest.fn().mockResolvedValue({}),
        },
        ctdTemplateNode: {
            count: jest.fn(),
        },
    };
}
describe('autoSeedIfEmpty', () => {
    it('seeds an admin when user table is empty', async () => {
        const prisma = makePrisma();
        prisma.user.count.mockResolvedValue(0);
        prisma.ctdTemplateNode.count.mockResolvedValue(1);
        const result = await (0, auto_seed_1.autoSeedIfEmpty)({ prisma: prisma, logger: silent });
        expect(prisma.user.create).toHaveBeenCalled();
        const args = prisma.user.create.mock.calls[0][0];
        expect(args.data.email).toBe('admin@ectd.com');
        expect(args.data.role).toBe('ADMIN');
        expect(typeof args.data.passwordHash).toBe('string');
        expect(args.data.passwordHash.startsWith('$2')).toBe(true);
        expect(result.seededUsers).toBe(true);
        expect(result.seededCtdTemplate).toBe(false);
    });
    it('skips user seed when users already exist', async () => {
        const prisma = makePrisma();
        prisma.user.count.mockResolvedValue(3);
        prisma.ctdTemplateNode.count.mockResolvedValue(1);
        const result = await (0, auto_seed_1.autoSeedIfEmpty)({ prisma: prisma, logger: silent });
        expect(prisma.user.create).not.toHaveBeenCalled();
        expect(result.seededUsers).toBe(false);
    });
    it('warns + skips CTD seed by default when empty', async () => {
        const prisma = makePrisma();
        prisma.user.count.mockResolvedValue(1);
        prisma.ctdTemplateNode.count.mockResolvedValue(0);
        const warn = jest.fn();
        const result = await (0, auto_seed_1.autoSeedIfEmpty)({
            prisma: prisma,
            logger: { info: () => { }, warn },
        });
        expect(warn).toHaveBeenCalled();
        expect(result.seededCtdTemplate).toBe(false);
    });
    it('runs caller-supplied CTD seeder when ctd_template_node is empty', async () => {
        const prisma = makePrisma();
        prisma.user.count.mockResolvedValue(1);
        prisma.ctdTemplateNode.count.mockResolvedValue(0);
        const ctdSeed = jest.fn().mockResolvedValue(undefined);
        const result = await (0, auto_seed_1.autoSeedIfEmpty)({
            prisma: prisma,
            logger: silent,
            ctdSeed,
        });
        expect(ctdSeed).toHaveBeenCalledWith(prisma);
        expect(result.seededCtdTemplate).toBe(true);
    });
});
//# sourceMappingURL=auto-seed.spec.js.map