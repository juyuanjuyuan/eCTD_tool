"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var RedisCacheService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.RedisCacheService = void 0;
const common_1 = require("@nestjs/common");
const ioredis_1 = __importDefault(require("ioredis"));
let RedisCacheService = RedisCacheService_1 = class RedisCacheService {
    logger = new common_1.Logger(RedisCacheService_1.name);
    client;
    onModuleInit() {
        if ((process.env.CACHE_PROVIDER || 'memory') !== 'redis') {
            this.logger.log('CACHE_PROVIDER!=redis, skipping Redis client init');
            return;
        }
        this.client = new ioredis_1.default({
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
    get isConnected() {
        return this.client?.status === 'ready';
    }
    async get(key) {
        if (!this.isConnected)
            return null;
        try {
            const data = await this.client.get(key);
            return data ? JSON.parse(data) : null;
        }
        catch {
            return null;
        }
    }
    async set(key, value, ttlSeconds = 3600) {
        if (!this.isConnected)
            return;
        try {
            await this.client.set(key, JSON.stringify(value), 'EX', ttlSeconds);
        }
        catch {
        }
    }
    async del(key) {
        if (!this.isConnected)
            return;
        try {
            await this.client.del(key);
        }
        catch {
        }
    }
    async wrap(key, factory, ttlSeconds = 3600) {
        const cached = await this.get(key);
        if (cached !== null) {
            return cached;
        }
        const value = await factory();
        await this.set(key, value, ttlSeconds);
        return value;
    }
    async delPattern(pattern) {
        if (!this.isConnected)
            return;
        try {
            const keys = await this.client.keys(pattern);
            if (keys.length > 0) {
                await this.client.del(...keys);
            }
        }
        catch {
        }
    }
    async setnx(key, value, ttlSeconds) {
        if (!this.isConnected)
            return true;
        try {
            const result = await this.client.set(key, JSON.stringify(value), 'EX', ttlSeconds, 'NX');
            return result === 'OK';
        }
        catch {
            return true;
        }
    }
    async expire(key, ttlSeconds) {
        if (!this.isConnected)
            return false;
        try {
            const result = await this.client.expire(key, ttlSeconds);
            return result === 1;
        }
        catch {
            return false;
        }
    }
    async scanKeys(pattern) {
        if (!this.isConnected)
            return [];
        try {
            const keys = [];
            let cursor = '0';
            do {
                const [nextCursor, batch] = await this.client.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
                cursor = nextCursor;
                keys.push(...batch);
            } while (cursor !== '0');
            return keys;
        }
        catch {
            return [];
        }
    }
};
exports.RedisCacheService = RedisCacheService;
exports.RedisCacheService = RedisCacheService = RedisCacheService_1 = __decorate([
    (0, common_1.Injectable)()
], RedisCacheService);
//# sourceMappingURL=redis-cache.service.js.map