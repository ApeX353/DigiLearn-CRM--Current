import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

// Mirror the HTTP CORS logic in main.ts. `CORS_ORIGIN` is a
// COMMA-SEPARATED list, so it must be split — passing the raw env
// string as one array entry (the previous behaviour) could never
// match a real browser Origin header, which meant the WebSocket
// handshake only ever accepted the hardcoded localhost:5173 and
// silently rejected every other origin (e.g. the 4173 preview
// build), killing real-time notifications.
const allowedSocketOrigins = [
  ...(process.env.CORS_ORIGIN?.split(',').map((o) => o.trim()) ?? []),
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
].filter(Boolean);

@WebSocketGateway({
  cors: {
    origin: allowedSocketOrigins,
    credentials: true,
  },
})
export class NotificationsGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(NotificationsGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const token =
        client.handshake.auth?.token ||
        client.handshake.query?.token;

      if (!token) {
        this.logger.warn(`Client ${client.id} connected without token`);
        client.disconnect();
        return;
      }

      const secret = this.configService.get<string>('JWT_SECRET_TOKEN');
      if (!secret) {
        // Never verify sockets against a guessable fallback key; the HTTP
        // strategies already hard-fail at boot when the env var is missing.
        this.logger.error('JWT_SECRET_TOKEN is not set; rejecting connection');
        client.disconnect();
        return;
      }

      const payload = this.jwtService.verify(token as string, { secret });

      if (!payload?.sub) {
        client.disconnect();
        return;
      }

      const userId = payload.sub;
      client.data.userId = userId;

      // Join user-specific room
      await client.join(`user:${userId}`);

      this.logger.log(`Client ${client.id} connected as user ${userId}`);
    } catch (error) {
      this.logger.warn(
        `Client ${client.id} authentication failed: ${error.message}`,
      );
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client ${client.id} disconnected`);
  }

  /**
   * Emit an event to a specific user
   */
  emitToUser(userId: string, event: string, payload: any) {
    this.server.to(`user:${userId}`).emit(event, payload);
  }

  /**
   * Emit an event to a named room
   */
  emitToRoom(room: string, event: string, payload: any) {
    this.server.to(room).emit(event, payload);
  }

  /**
   * Broadcast an event to every connected client.
   *
   * Used for cache-invalidation signals (e.g. a deal changed stage) that
   * any viewer of the affected board should react to. Clients never join
   * the old `pipeline:<id>` rooms — there was no @SubscribeMessage handler
   * to join them — so a room-scoped emit reached nobody and the live
   * pipeline never refreshed. Broadcasting is safe: the payload carries no
   * privileged data and the client just refetches data it can already see.
   */
  emitBroadcast(event: string, payload: any) {
    if (!this.server) return;
    this.server.emit(event, payload);
  }
}
