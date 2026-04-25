"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PrismaModule = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("./prisma.service");
const redis_cache_service_1 = require("../common/redis-cache.service");
const memory_cache_service_1 = require("../common/cache/memory-cache.service");
const REDIS_CACHE_IMPL = 'REDIS_CACHE_IMPL';
let PrismaModule = class PrismaModule {
};
exports.PrismaModule = PrismaModule;
exports.PrismaModule = PrismaModule = __decorate([
    (0, common_1.Global)(),
    (0, common_1.Module)({
        providers: [
            prisma_service_1.PrismaService,
            { provide: REDIS_CACHE_IMPL, useClass: redis_cache_service_1.RedisCacheService },
            memory_cache_service_1.MemoryCacheService,
            {
                provide: redis_cache_service_1.RedisCacheService,
                useFactory: (redisImpl, memoryCache) => {
                    const provider = process.env.CACHE_PROVIDER || 'memory';
                    return provider === 'redis' ? redisImpl : memoryCache;
                },
                inject: [REDIS_CACHE_IMPL, memory_cache_service_1.MemoryCacheService],
            },
        ],
        exports: [prisma_service_1.PrismaService, redis_cache_service_1.RedisCacheService],
    })
], PrismaModule);
//# sourceMappingURL=prisma.module.js.map