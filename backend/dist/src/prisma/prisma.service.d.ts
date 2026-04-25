import { OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient as PrismaPostgresClient } from '@prisma/client';
export declare class PrismaService extends PrismaPostgresClient implements OnModuleInit, OnModuleDestroy {
    private readonly logger;
    private readonly dbProvider;
    private readonly sqliteClient?;
    constructor();
    private getActiveClient;
    onModuleInit(): Promise<void>;
    onModuleDestroy(): Promise<void>;
}
