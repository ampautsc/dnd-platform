import http from 'node:http';
import { Server } from 'socket.io';
import { validateJwt } from './auth/JwtValidator.js';
import { createRoomManager } from './rooms/RoomManager.js';

/**
 * Create and control a gateway server instance.
 *
 * @param {{ jwtSecret: string, port?: number }} options
 */
export function createGatewayServer(options) {
  const port = options.port ?? 3001;
  const jwtSecret = options.jwtSecret;

  const httpServer = http.createServer();
  const io = new Server(httpServer, {
    cors: { origin: '*' },
  });

  const roomManager = createRoomManager();

  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      const claims = validateJwt(token, jwtSecret);
      socket.data.user = claims;
      next();
    } catch (error) {
      next(new Error('Authentication failed'));
    }
  });

  io.on('connection', (socket) => {
    socket.on('room:join', ({ sessionId, role = 'player' }) => {
      const room = roomManager.getOrCreateRoom(sessionId);
      room.joinMember({
        userId: socket.data.user.userId,
        socketId: socket.id,
        role,
      });

      socket.join(sessionId);
      socket.data.sessionId = sessionId;

      socket.emit('room:joined', {
        sessionId,
        userId: socket.data.user.userId,
      });
    });

    socket.on('channel:message', (envelope) => {
      const sessionId = socket.data.sessionId;
      if (!sessionId) return;

      const room = roomManager.getRoom(sessionId);
      if (!room) return;

      room.addEvent(envelope);
      io.to(sessionId).emit('channel:message', envelope);
    });

    socket.on('disconnect', () => {
      const sessionId = socket.data.sessionId;
      if (!sessionId) return;

      const room = roomManager.getRoom(sessionId);
      if (!room) return;

      room.leaveMember(socket.data.user.userId);
      if (room.getMembers().length === 0) {
        roomManager.removeRoom(sessionId);
      }
    });
  });

  return {
    roomManager,
    io,
    async start() {
      await new Promise((resolve) => httpServer.listen(port, resolve));
      const address = httpServer.address();
      const actualPort = typeof address === 'string' ? port : address.port;
      return {
        port: actualPort,
        url: `http://localhost:${actualPort}`,
      };
    },
    async stop() {
      await new Promise((resolve) => io.close(resolve));
      await new Promise((resolve) => httpServer.close(resolve));
    },
  };
}

if (process.env.NODE_ENV !== 'test' && process.env.GATEWAY_AUTOSTART !== 'false') {
  const jwtSecret = process.env.JWT_SECRET || 'dev-gateway-secret-change-me';
  const server = createGatewayServer({
    jwtSecret,
    port: Number(process.env.PORT || 3001),
  });

  server.start().then(({ url }) => {
    console.log(`Gateway running on ${url}`);
  });
}
