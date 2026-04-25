import { Injectable } from '@nestjs/common';
import { ICacheService } from './cache.interface';

type CacheEntry = {
  value: unknown;
  expiresAt: number;
};

@Injectable()
export class MemoryCacheService implements ICacheService {
  private readonly cache = new Map<string, CacheEntry>();

  async get<T>(key: string): Promise<T | null> {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() >= entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return entry.value as T;
  }

  async set(key: string, value: unknown, ttlSeconds = 3600): Promise<void> {
    this.cache.set(key, {
      value,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }

  async del(key: string): Promise<void> {
    this.cache.delete(key);
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
    const regex = new RegExp(`^${pattern.replace(/\*/g, '.*')}$`);
    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        this.cache.delete(key);
      }
    }
  }

  async setnx(key: string, value: unknown, ttlSeconds: number): Promise<boolean> {
    const existing = await this.get(key);
    if (existing !== null) {
      return false;
    }

    await this.set(key, value, ttlSeconds);
    return true;
  }

  async expire(key: string, ttlSeconds: number): Promise<boolean> {
    const entry = this.cache.get(key);
    if (!entry) return false;

    entry.expiresAt = Date.now() + ttlSeconds * 1000;
    this.cache.set(key, entry);
    return true;
  }

  async scanKeys(pattern: string): Promise<string[]> {
    const regex = new RegExp(`^${pattern.replace(/\*/g, '.*')}$`);
    const matched: string[] = [];

    for (const key of this.cache.keys()) {
      if ((await this.get(key)) === null) continue;
      if (regex.test(key)) {
        matched.push(key);
      }
    }

    return matched;
  }
}
