import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    // Connection pool configuration via DATABASE_URL query parameters:
    //   ?connection_limit=10&pool_timeout=30
    // Or via environment variables for production tuning.
    const connectionLimit = parseInt(process.env.DB_CONNECTION_LIMIT || '10', 10);
    const poolTimeout = parseInt(process.env.DB_POOL_TIMEOUT || '30', 10);

    // Append pool params to DATABASE_URL if not already present
    let dbUrl = process.env.DATABASE_URL || '';
    if (dbUrl && !dbUrl.includes('connection_limit')) {
      const separator = dbUrl.includes('?') ? '&' : '?';
      dbUrl = `${dbUrl}${separator}connection_limit=${connectionLimit}&pool_timeout=${poolTimeout}`;
    }

    super({
      datasources: {
        db: {
          url: dbUrl,
        },
      },
      log:
        process.env.NODE_ENV === 'production'
          ? ['error', 'warn']
          : ['query', 'info', 'warn', 'error'],
    });
  }

  async onModuleInit() {
    await this.$connect();
    this.logger.log('Database connection established');
  }

  async onModuleDestroy() {
    await this.$disconnect();
    this.logger.log('Database connection closed');
  }
}
