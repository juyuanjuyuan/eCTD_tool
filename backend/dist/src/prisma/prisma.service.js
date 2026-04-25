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
var PrismaService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PrismaService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
let PrismaService = PrismaService_1 = class PrismaService extends client_1.PrismaClient {
    logger = new common_1.Logger(PrismaService_1.name);
    dbProvider;
    sqliteClient;
    constructor() {
        const dbProvider = process.env.DB_PROVIDER === 'sqlite' ? 'sqlite' : 'postgres';
        const connectionLimit = parseInt(process.env.DB_CONNECTION_LIMIT || '10', 10);
        const poolTimeout = parseInt(process.env.DB_POOL_TIMEOUT || '30', 10);
        let dbUrl = process.env.DATABASE_URL || '';
        if (dbProvider === 'postgres' &&
            dbUrl &&
            !dbUrl.includes('connection_limit')) {
            const separator = dbUrl.includes('?') ? '&' : '?';
            dbUrl = `${dbUrl}${separator}connection_limit=${connectionLimit}&pool_timeout=${poolTimeout}`;
        }
        const log = (process.env.NODE_ENV === 'production'
            ? ['error', 'warn']
            : ['query', 'info', 'warn', 'error']);
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
            let PrismaSqliteClient;
            const candidates = [
                process.env.PRISMA_SQLITE_CLIENT_PATH,
                '../generated/prisma-sqlite',
                './generated/prisma-sqlite',
            ].filter(Boolean);
            let lastError;
            for (const candidate of candidates) {
                try {
                    ({ PrismaClient: PrismaSqliteClient } = require(candidate));
                    break;
                }
                catch (error) {
                    lastError = error;
                }
            }
            if (!PrismaSqliteClient) {
                this.logger.error(`SQLite Prisma client not found in any of: ${candidates.join(', ')}. ` +
                    `Run: npm run prisma:sqlite:generate`);
                throw lastError ?? new Error('SQLite Prisma client missing');
            }
            this.sqliteClient = new PrismaSqliteClient({
                datasources: {
                    db: {
                        url: dbUrl,
                    },
                },
                log,
            });
            return new Proxy(this, {
                get: (target, prop, receiver) => {
                    if (prop === 'onModuleInit' ||
                        prop === 'onModuleDestroy' ||
                        prop === 'getActiveClient' ||
                        prop === 'logger' ||
                        prop === 'dbProvider' ||
                        prop === 'sqliteClient') {
                        return Reflect.get(target, prop, receiver);
                    }
                    const active = target.getActiveClient();
                    const value = active[prop];
                    if (typeof value === 'function') {
                        return value.bind(active);
                    }
                    return value;
                },
            });
        }
    }
    getActiveClient() {
        return this.dbProvider === 'sqlite' && this.sqliteClient
            ? this.sqliteClient
            : this;
    }
    async onModuleInit() {
        await this.getActiveClient().$connect();
        this.logger.log(`Database connection established (provider=${this.dbProvider})`);
    }
    async onModuleDestroy() {
        await this.getActiveClient().$disconnect();
        this.logger.log(`Database connection closed (provider=${this.dbProvider})`);
    }
};
exports.PrismaService = PrismaService;
exports.PrismaService = PrismaService = PrismaService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [])
], PrismaService);
//# sourceMappingURL=prisma.service.js.map