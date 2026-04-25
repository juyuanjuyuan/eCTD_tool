"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MemoryCacheService = void 0;
const common_1 = require("@nestjs/common");
let MemoryCacheService = class MemoryCacheService {
    cache = new Map();
    async get(key) {
        const entry = this.cache.get(key);
        if (!entry)
            return null;
        if (Date.now() >= entry.expiresAt) {
            this.cache.delete(key);
            return null;
        }
        return entry.value;
    }
    async set(key, value, ttlSeconds = 3600) {
        this.cache.set(key, {
            value,
            expiresAt: Date.now() + ttlSeconds * 1000,
        });
    }
    async del(key) {
        this.cache.delete(key);
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
        const regex = new RegExp(`^${pattern.replace(/\*/g, '.*')}$`);
        for (const key of this.cache.keys()) {
            if (regex.test(key)) {
                this.cache.delete(key);
            }
        }
    }
    async setnx(key, value, ttlSeconds) {
        const existing = await this.get(key);
        if (existing !== null) {
            return false;
        }
        await this.set(key, value, ttlSeconds);
        return true;
    }
    async expire(key, ttlSeconds) {
        const entry = this.cache.get(key);
        if (!entry)
            return false;
        entry.expiresAt = Date.now() + ttlSeconds * 1000;
        this.cache.set(key, entry);
        return true;
    }
    async scanKeys(pattern) {
        const regex = new RegExp(`^${pattern.replace(/\*/g, '.*')}$`);
        const matched = [];
        for (const key of this.cache.keys()) {
            if ((await this.get(key)) === null)
                continue;
            if (regex.test(key)) {
                matched.push(key);
            }
        }
        return matched;
    }
};
exports.MemoryCacheService = MemoryCacheService;
exports.MemoryCacheService = MemoryCacheService = __decorate([
    (0, common_1.Injectable)()
], MemoryCacheService);
//# sourceMappingURL=memory-cache.service.js.map