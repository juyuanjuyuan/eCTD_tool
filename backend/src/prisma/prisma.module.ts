import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { RedisCacheService } from '../common/redis-cache.service';
import { MemoryCacheService } from '../common/cache/memory-cache.service';

const REDIS_CACHE_IMPL = 'REDIS_CACHE_IMPL';

@Global()
@Module({
  providers: [
    PrismaService,
    { provide: REDIS_CACHE_IMPL, useClass: RedisCacheService },
    MemoryCacheService,
    {
      provide: RedisCacheService,
      useFactory: (
        redisImpl: RedisCacheService,
        memoryCache: MemoryCacheService,
      ) => {
        const provider = process.env.CACHE_PROVIDER || 'memory';
        return provider === 'redis' ? redisImpl : (memoryCache as unknown as RedisCacheService);
      },
      inject: [REDIS_CACHE_IMPL, MemoryCacheService],
    },
  ],
  exports: [PrismaService, RedisCacheService],
})
export class PrismaModule {}
