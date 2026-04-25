import type { PrismaService } from '../prisma/prisma.service';
export interface AutoSeedOptions {
    prisma: PrismaService;
    logger?: {
        info: (msg: string) => void;
        warn: (msg: string) => void;
    };
    ctdSeed?: false | ((prisma: PrismaService) => Promise<void>);
}
export declare function autoSeedIfEmpty(options: AutoSeedOptions): Promise<{
    seededUsers: boolean;
    seededCtdTemplate: boolean;
}>;
