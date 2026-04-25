import { OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ICacheService } from './cache/cache.interface';
export declare class RedisCacheService implements OnModuleInit, OnModuleDestroy, ICacheService {
    private readonly logger;
    private client;
    onModuleInit(): void;
    onModuleDestroy(): void;
    private get isConnected();
    get<T>(key: string): Promise<T | null>;
    set(key: string, value: any, ttlSeconds?: number): Promise<void>;
    del(key: string): Promise<void>;
    wrap<T>(key: string, factory: () => Promise<T>, ttlSeconds?: number): Promise<T>;
    delPattern(pattern: string): Promise<void>;
    setnx(key: string, value: any, ttlSeconds: number): Promise<boolean>;
    expire(key: string, ttlSeconds: number): Promise<boolean>;
    scanKeys(pattern: string): Promise<string[]>;
}
