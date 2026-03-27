import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { RedisCacheService } from '../common/redis-cache.service';
import { PrismaService } from '../prisma/prisma.service';

interface PresenceInfo {
  userId: string;
  name: string;
  currentPage: string;
  currentNodeId: string | null;
  lastSeen: string;
}

const PRESENCE_TTL = 120; // 2 minutes

@WebSocketGateway({
  namespace: '/ws/collaboration',
  cors: { origin: '*' },
})
@Injectable()
export class CollaborationGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private logger = new Logger('CollaborationGateway');
  private userSockets = new Map<string, Set<string>>(); // userId -> Set<socketId>

  constructor(
    private jwtService: JwtService,
    private configService: ConfigService,
    private redis: RedisCacheService,
    private prisma: PrismaService,
  ) {}

  afterInit() {
    this.logger.log('Collaboration WebSocket Gateway initialized');
  }

  async handleConnection(client: Socket) {
    try {
      const token =
        client.handshake.auth?.token ||
        client.handshake.query?.token as string;

      if (!token) {
        client.disconnect();
        return;
      }

      const secret = this.configService.get<string>('JWT_SECRET');
      const payload = this.jwtService.verify(token, { secret });
      const userId = payload.sub;

      // Verify user exists
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, name: true, status: true },
      });

      if (!user || user.status !== 'ACTIVE') {
        client.disconnect();
        return;
      }

      // Store user info on socket
      (client as any).userId = userId;
      (client as any).userName = user.name;

      // Track socket
      if (!this.userSockets.has(userId)) {
        this.userSockets.set(userId, new Set());
      }
      this.userSockets.get(userId)!.add(client.id);

      this.logger.log(`User ${user.name} (${userId}) connected: ${client.id}`);
    } catch (error) {
      this.logger.warn(`Auth failed for socket ${client.id}`);
      client.disconnect();
    }
  }

  async handleDisconnect(client: Socket) {
    const userId = (client as any).userId as string;
    if (!userId) return;

    // Remove socket tracking
    const sockets = this.userSockets.get(userId);
    if (sockets) {
      sockets.delete(client.id);
      if (sockets.size === 0) {
        this.userSockets.delete(userId);

        // Broadcast offline to all rooms this client was in
        for (const room of client.rooms) {
          if (room !== client.id) {
            client.to(room).emit('user:offline', { userId });
          }
        }
      }
    }

    this.logger.log(`User ${userId} disconnected: ${client.id}`);
  }

  @SubscribeMessage('join:project')
  async handleJoinProject(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { projectId: string },
  ) {
    const userId = (client as any).userId;
    const userName = (client as any).userName;
    const room = `project:${data.projectId}`;

    client.join(room);

    // Set presence
    const presenceKey = `presence:${data.projectId}:${userId}`;
    const presence: PresenceInfo = {
      userId,
      name: userName,
      currentPage: 'project',
      currentNodeId: null,
      lastSeen: new Date().toISOString(),
    };
    await this.redis.set(presenceKey, presence, PRESENCE_TTL);

    // Broadcast user online
    client.to(room).emit('user:online', { userId, name: userName });

    return { status: 'joined', room };
  }

  @SubscribeMessage('join:sequence')
  async handleJoinSequence(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { sequenceId: string },
  ) {
    const room = `sequence:${data.sequenceId}`;
    client.join(room);
    return { status: 'joined', room };
  }

  @SubscribeMessage('user:location')
  async handleLocationUpdate(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: { projectId: string; currentPage: string; currentNodeId?: string },
  ) {
    const userId = (client as any).userId;
    const userName = (client as any).userName;

    // Update presence in Redis
    const presenceKey = `presence:${data.projectId}:${userId}`;
    const presence: PresenceInfo = {
      userId,
      name: userName,
      currentPage: data.currentPage,
      currentNodeId: data.currentNodeId || null,
      lastSeen: new Date().toISOString(),
    };
    await this.redis.set(presenceKey, presence, PRESENCE_TTL);

    // Broadcast to project room
    const room = `project:${data.projectId}`;
    client.to(room).emit('user:location', {
      userId,
      name: userName,
      currentPage: data.currentPage,
      currentNodeId: data.currentNodeId,
    });
  }

  @SubscribeMessage('heartbeat')
  async handleHeartbeat(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { projectId: string },
  ) {
    const userId = (client as any).userId;
    const presenceKey = `presence:${data.projectId}:${userId}`;
    // Refresh TTL
    await this.redis.expire(presenceKey, PRESENCE_TTL);
    return { status: 'ok' };
  }

  // ==================== Server-side emit helpers ====================

  emitToSequence(sequenceId: string, event: string, data: any) {
    this.server.to(`sequence:${sequenceId}`).emit(event, data);
  }

  emitToProject(projectId: string, event: string, data: any) {
    this.server.to(`project:${projectId}`).emit(event, data);
  }

  emitToUser(userId: string, event: string, data: any) {
    const sockets = this.userSockets.get(userId);
    if (sockets) {
      for (const socketId of sockets) {
        this.server.to(socketId).emit(event, data);
      }
    }
  }
}
