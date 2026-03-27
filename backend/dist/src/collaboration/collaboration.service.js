"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CollaborationService = void 0;
const common_1 = require("@nestjs/common");
const redis_cache_service_1 = require("../common/redis-cache.service");
let CollaborationService = class CollaborationService {
    redis;
    constructor(redis) {
        this.redis = redis;
    }
    async getProjectPresence(projectId) {
        const pattern = `presence:${projectId}:*`;
        const keys = await this.redis.scanKeys(pattern);
        const results = [];
        for (const key of keys) {
            const info = await this.redis.get(key);
            if (info)
                results.push(info);
        }
        return results;
    }
};
exports.CollaborationService = CollaborationService;
exports.CollaborationService = CollaborationService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [redis_cache_service_1.RedisCacheService])
], CollaborationService);
//# sourceMappingURL=collaboration.service.js.map