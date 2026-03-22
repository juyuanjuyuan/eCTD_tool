import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class RedisCacheService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisCacheService.name);
  private client: Redis;

  onModuleInit() {
    this.client = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
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
}
