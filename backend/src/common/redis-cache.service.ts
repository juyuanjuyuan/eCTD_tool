import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { ICacheService } from './cache/cache.interface';

@Injectable()
export class RedisCacheService implements OnModuleInit, OnModuleDestroy, ICacheService {
  private readonly logger = new Logger(RedisCacheService.name);
  private client: Redis;

  onModuleInit() {
    // When CACHE_PROVIDER!=redis the PrismaModule injects MemoryCacheService
    // instead of this service, but Nest still constructs (and inits) every
    // declared provider. Skip the Redis connect to avoid noisy retry logs in
    // desktop / sqlite mode where there is no Redis to begin with.
    if ((process.env.CACHE_PROVIDER || 'memory') !== 'redis') {
      this.logger.log('CACHE_PROVIDER!=redis, skipping Redis client init');
      return;
    }

    this.client = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      password: process.env.REDIS_PASSWORD || undefined,
      lazyConnect: true,
    });

    this.client.on('error', (err) => {
      this.logger.warn(`Redis connection error: ${err.message}`);
    });

    this.client.connect().catch(() => {
      this.logger.warn('Redis not available, caching disabled');
    });
  }

  onModuleDestroy() {
    this.client?.disconnect();
  }

  private get isConnected(): boolean {
    return this.client?.status === 'ready';
  }

  async get<T>(key: string): Promise<T | null> {
    if (!this.isConnected) return null;
    try {
      const data = await this.client.get(key);
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  }

  async set(key: string, value: any, ttlSeconds = 3600): Promise<void> {
    if (!this.isConnected) return;
    try {
      await this.client.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    } catch {
      // Ignore cache write failures
    }
  }

  async del(key: string): Promise<void> {
    if (!this.isConnected) return;
    try {
      await this.client.del(key);
    } catch {
      // Ignore cache delete failures
    }
  }

  async wrap<T>(
    key: string,
    factory: () => Promise<T>,
    ttlSeconds = 3600,
  ): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    const value = await factory();
    await this.set(key, value, ttlSeconds);
    return value;
  }

  async delPattern(pattern: string): Promise<void> {
    if (!this.isConnected) return;
    try {
      const keys = await this.client.keys(pattern);
      if (keys.length > 0) {
        await this.client.del(...keys);
      }
    } catch {
      // Ignore
    }
  }

  /** Atomic SET-if-not-exists with TTL. Returns true if key was set. */
  async setnx(key: string, value: any, ttlSeconds: number): Promise<boolean> {
    if (!this.isConnected) return true; // Fallback: allow if Redis unavailable
    try {
      const result = await this.client.set(
        key,
        JSON.stringify(value),
        'EX',
        ttlSeconds,
        'NX',
      );
      return result === 'OK';
    } catch {
      return true; // Fallback: allow
    }
  }

  /** Update TTL on existing key. Returns true if key exists. */
  async expire(key: string, ttlSeconds: number): Promise<boolean> {
    if (!this.isConnected) return false;
    try {
      const result = await this.client.expire(key, ttlSeconds);
      return result === 1;
    } catch {
      return false;
    }
  }

  /** Scan keys matching a pattern using SCAN (safe for production). */
  async scanKeys(pattern: string): Promise<string[]> {
    if (!this.isConnected) return [];
    try {
      const keys: string[] = [];
      let cursor = '0';
      do {
        const [nextCursor, batch] = await this.client.scan(
          cursor,
          'MATCH',
          pattern,
          'COUNT',
          100,
        );
        cursor = nextCursor;
        keys.push(...batch);
      } while (cursor !== '0');
      return keys;
    } catch {
      return [];
    }
  }
}
