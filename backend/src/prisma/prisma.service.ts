import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient as PrismaPostgresClient } from '@prisma/client';

type AnyPrismaClient = PrismaPostgresClient & Record<string, any>;

@Injectable()
export class PrismaService
  extends PrismaPostgresClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);
  private readonly dbProvider: 'postgres' | 'sqlite';
  private readonly sqliteClient?: AnyPrismaClient;

  constructor() {
    const dbProvider = process.env.DB_PROVIDER === 'sqlite' ? 'sqlite' : 'postgres';
    const connectionLimit = parseInt(process.env.DB_CONNECTION_LIMIT || '10', 10);
    const poolTimeout = parseInt(process.env.DB_POOL_TIMEOUT || '30', 10);

    let dbUrl = process.env.DATABASE_URL || '';
    if (
      dbProvider === 'postgres' &&
      dbUrl &&
      !dbUrl.includes('connection_limit')
    ) {
      const separator = dbUrl.includes('?') ? '&' : '?';
      dbUrl = `${dbUrl}${separator}connection_limit=${connectionLimit}&pool_timeout=${poolTimeout}`;
    }

    const log =
      (process.env.NODE_ENV === 'production'
        ? ['error', 'warn']
        : ['query', 'info', 'warn', 'error']) as any;

    super({
      datasources: {
        db: {
          url: dbUrl,
        },
      },
      log,
    });

    this.dbProvider = dbProvider;

    if (dbProvider === 'sqlite') {
      // Lazy-load SQLite client to avoid hard build-time dependency when running PG only.
      // Resolution order:
      //   1. PRISMA_SQLITE_CLIENT_PATH (set by Electron main / embedded build)
      //   2. Sibling `../generated/prisma-sqlite` (dev: src/prisma/.. → src/generated/...)
      //   3. Sibling `./generated/prisma-sqlite` (embedded build: dist-embed/backend.bundle.js + dist-embed/generated/...)
      let PrismaSqliteClient: new (...args: any[]) => AnyPrismaClient;
      const candidates = [
        process.env.PRISMA_SQLITE_CLIENT_PATH,
        '../generated/prisma-sqlite',
        './generated/prisma-sqlite',
      ].filter(Boolean) as string[];

      let lastError: unknown;
      for (const candidate of candidates) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          ({ PrismaClient: PrismaSqliteClient } = require(candidate));
          break;
        } catch (error) {
          lastError = error;
        }
      }

      if (!PrismaSqliteClient!) {
        this.logger.error(
          `SQLite Prisma client not found in any of: ${candidates.join(', ')}. ` +
            `Run: npm run prisma:sqlite:generate`,
        );
        throw lastError ?? new Error('SQLite Prisma client missing');
      }
      this.sqliteClient = new PrismaSqliteClient({
        datasources: {
          db: {
            url: dbUrl,
          },
        },
        log,
      }) as AnyPrismaClient;

      return new Proxy(this, {
        get: (target, prop, receiver) => {
          if (
            prop === 'onModuleInit' ||
            prop === 'onModuleDestroy' ||
            prop === 'getActiveClient' ||
            prop === 'logger' ||
            prop === 'dbProvider' ||
            prop === 'sqliteClient'
          ) {
            return Reflect.get(target, prop, receiver);
          }

          const active = target.getActiveClient();
          const value = active[prop as keyof typeof active];

          if (typeof value === 'function') {
            return value.bind(active);
          }

          return value;
        },
      });
    }
  }

  private getActiveClient(): AnyPrismaClient {
    return this.dbProvider === 'sqlite' && this.sqliteClient
      ? this.sqliteClient
      : (this as AnyPrismaClient);
  }

  async onModuleInit() {
    await this.getActiveClient().$connect();
    this.logger.log(`Database connection established (provider=${this.dbProvider})`);
  }

  async onModuleDestroy() {
    await this.getActiveClient().$disconnect();
    this.logger.log(`Database connection closed (provider=${this.dbProvider})`);
  }
}
