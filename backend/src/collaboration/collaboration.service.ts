import { Injectable } from '@nestjs/common';
import { RedisCacheService } from '../common/redis-cache.service';

export interface PresenceInfo {
  userId: string;
  name: string;
  currentPage: string;
  currentNodeId: string | null;
  lastSeen: string;
}

@Injectable()
export class CollaborationService {
  constructor(private readonly redis: RedisCacheService) {}

  async getProjectPresence(projectId: string): Promise<PresenceInfo[]> {
    // Scan for presence keys matching pattern
    const pattern = `presence:${projectId}:*`;
    const keys = await this.redis.scanKeys(pattern);

    const results: PresenceInfo[] = [];
    for (const key of keys) {
      const info = await this.redis.get<PresenceInfo>(key);
      if (info) results.push(info);
    }

    return results;
  }
}
