import { OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { RedisCacheService } from '../common/redis-cache.service';
import { PrismaService } from '../prisma/prisma.service';
export declare class CollaborationGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
    private jwtService;
    private configService;
    private redis;
    private prisma;
    server: Server;
    private logger;
    private userSockets;
    constructor(jwtService: JwtService, configService: ConfigService, redis: RedisCacheService, prisma: PrismaService);
    afterInit(): void;
    handleConnection(client: Socket): Promise<void>;
    handleDisconnect(client: Socket): Promise<void>;
    handleJoinProject(client: Socket, data: {
        projectId: string;
    }): Promise<{
        status: string;
        room: string;
    }>;
    handleJoinSequence(client: Socket, data: {
        sequenceId: string;
    }): Promise<{
        status: string;
        room: string;
    }>;
    handleLocationUpdate(client: Socket, data: {
        projectId: string;
        currentPage: string;
        currentNodeId?: string;
    }): Promise<void>;
    handleHeartbeat(client: Socket, data: {
        projectId: string;
    }): Promise<{
        status: string;
    }>;
    emitToSequence(sequenceId: string, event: string, data: any): void;
    emitToProject(projectId: string, event: string, data: any): void;
    emitToUser(userId: string, event: string, data: any): void;
}
