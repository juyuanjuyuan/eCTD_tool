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
    constructor() {
        const connectionLimit = parseInt(process.env.DB_CONNECTION_LIMIT || '10', 10);
        const poolTimeout = parseInt(process.env.DB_POOL_TIMEOUT || '30', 10);
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
            log: process.env.NODE_ENV === 'production'
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
};
exports.PrismaService = PrismaService;
exports.PrismaService = PrismaService = PrismaService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [])
], PrismaService);
//# sourceMappingURL=prisma.service.js.map