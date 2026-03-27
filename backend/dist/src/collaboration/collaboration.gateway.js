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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CollaborationGateway = void 0;
const websockets_1 = require("@nestjs/websockets");
const socket_io_1 = require("socket.io");
const common_1 = require("@nestjs/common");
const jwt_1 = require("@nestjs/jwt");
const config_1 = require("@nestjs/config");
const redis_cache_service_1 = require("../common/redis-cache.service");
const prisma_service_1 = require("../prisma/prisma.service");
const PRESENCE_TTL = 120;
let CollaborationGateway = class CollaborationGateway {
    jwtService;
    configService;
    redis;
    prisma;
    server;
    logger = new common_1.Logger('CollaborationGateway');
    userSockets = new Map();
    constructor(jwtService, configService, redis, prisma) {
        this.jwtService = jwtService;
        this.configService = configService;
        this.redis = redis;
        this.prisma = prisma;
    }
    afterInit() {
        this.logger.log('Collaboration WebSocket Gateway initialized');
    }
    async handleConnection(client) {
        try {
            const token = client.handshake.auth?.token ||
                client.handshake.query?.token;
            if (!token) {
                client.disconnect();
                return;
            }
            const secret = this.configService.get('JWT_SECRET');
            const payload = this.jwtService.verify(token, { secret });
            const userId = payload.sub;
            const user = await this.prisma.user.findUnique({
                where: { id: userId },
                select: { id: true, name: true, status: true },
            });
            if (!user || user.status !== 'ACTIVE') {
                client.disconnect();
                return;
            }
            client.userId = userId;
            client.userName = user.name;
            if (!this.userSockets.has(userId)) {
                this.userSockets.set(userId, new Set());
            }
            this.userSockets.get(userId).add(client.id);
            this.logger.log(`User ${user.name} (${userId}) connected: ${client.id}`);
        }
        catch (error) {
            this.logger.warn(`Auth failed for socket ${client.id}`);
            client.disconnect();
        }
    }
    async handleDisconnect(client) {
        const userId = client.userId;
        if (!userId)
            return;
        const sockets = this.userSockets.get(userId);
        if (sockets) {
            sockets.delete(client.id);
            if (sockets.size === 0) {
                this.userSockets.delete(userId);
                for (const room of client.rooms) {
                    if (room !== client.id) {
                        client.to(room).emit('user:offline', { userId });
                    }
                }
            }
        }
        this.logger.log(`User ${userId} disconnected: ${client.id}`);
    }
    async handleJoinProject(client, data) {
        const userId = client.userId;
        const userName = client.userName;
        const room = `project:${data.projectId}`;
        client.join(room);
        const presenceKey = `presence:${data.projectId}:${userId}`;
        const presence = {
            userId,
            name: userName,
            currentPage: 'project',
            currentNodeId: null,
            lastSeen: new Date().toISOString(),
        };
        await this.redis.set(presenceKey, presence, PRESENCE_TTL);
        client.to(room).emit('user:online', { userId, name: userName });
        return { status: 'joined', room };
    }
    async handleJoinSequence(client, data) {
        const room = `sequence:${data.sequenceId}`;
        client.join(room);
        return { status: 'joined', room };
    }
    async handleLocationUpdate(client, data) {
        const userId = client.userId;
        const userName = client.userName;
        const presenceKey = `presence:${data.projectId}:${userId}`;
        const presence = {
            userId,
            name: userName,
            currentPage: data.currentPage,
            currentNodeId: data.currentNodeId || null,
            lastSeen: new Date().toISOString(),
        };
        await this.redis.set(presenceKey, presence, PRESENCE_TTL);
        const room = `project:${data.projectId}`;
        client.to(room).emit('user:location', {
            userId,
            name: userName,
            currentPage: data.currentPage,
            currentNodeId: data.currentNodeId,
        });
    }
    async handleHeartbeat(client, data) {
        const userId = client.userId;
        const presenceKey = `presence:${data.projectId}:${userId}`;
        await this.redis.expire(presenceKey, PRESENCE_TTL);
        return { status: 'ok' };
    }
    emitToSequence(sequenceId, event, data) {
        this.server.to(`sequence:${sequenceId}`).emit(event, data);
    }
    emitToProject(projectId, event, data) {
        this.server.to(`project:${projectId}`).emit(event, data);
    }
    emitToUser(userId, event, data) {
        const sockets = this.userSockets.get(userId);
        if (sockets) {
            for (const socketId of sockets) {
                this.server.to(socketId).emit(event, data);
            }
        }
    }
};
exports.CollaborationGateway = CollaborationGateway;
__decorate([
    (0, websockets_1.WebSocketServer)(),
    __metadata("design:type", socket_io_1.Server)
], CollaborationGateway.prototype, "server", void 0);
__decorate([
    (0, websockets_1.SubscribeMessage)('join:project'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], CollaborationGateway.prototype, "handleJoinProject", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('join:sequence'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], CollaborationGateway.prototype, "handleJoinSequence", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('user:location'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], CollaborationGateway.prototype, "handleLocationUpdate", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('heartbeat'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], CollaborationGateway.prototype, "handleHeartbeat", null);
exports.CollaborationGateway = CollaborationGateway = __decorate([
    (0, websockets_1.WebSocketGateway)({
        namespace: '/ws/collaboration',
        cors: { origin: '*' },
    }),
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [jwt_1.JwtService,
        config_1.ConfigService,
        redis_cache_service_1.RedisCacheService,
        prisma_service_1.PrismaService])
], CollaborationGateway);
//# sourceMappingURL=collaboration.gateway.js.map