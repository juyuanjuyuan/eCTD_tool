import { OnModuleInit, OnModuleDestroy } from '@nestjs/common';
export declare class RedisCacheService implements OnModuleInit, OnModuleDestroy {
    private readonly logger;
    private client;
    onModuleInit(): void;
    onModuleDestroy(): void;
    private get isConnected();
    get<T>(key: string): Promise<T | null>;
    set(key: string, value: any, ttlSeconds?: number): Promise<void>;
    del(key: string): Promise<void>;
    delPattern(pattern: string): Promise<void>;
    setnx(key: string, value: any, ttlSeconds: number): Promise<boolean>;
    expire(key: string, ttlSeconds: number): Promise<boolean>;
    scanKeys(pattern: string): Promise<string[]>;
}
