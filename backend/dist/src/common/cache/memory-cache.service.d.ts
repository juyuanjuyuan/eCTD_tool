import { ICacheService } from './cache.interface';
export declare class MemoryCacheService implements ICacheService {
    private readonly cache;
    get<T>(key: string): Promise<T | null>;
    set(key: string, value: unknown, ttlSeconds?: number): Promise<void>;
    del(key: string): Promise<void>;
    wrap<T>(key: string, factory: () => Promise<T>, ttlSeconds?: number): Promise<T>;
    delPattern(pattern: string): Promise<void>;
    setnx(key: string, value: unknown, ttlSeconds: number): Promise<boolean>;
    expire(key: string, ttlSeconds: number): Promise<boolean>;
    scanKeys(pattern: string): Promise<string[]>;
}
