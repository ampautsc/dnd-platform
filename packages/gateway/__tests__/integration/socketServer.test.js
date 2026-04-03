/**
 * Gateway Socket Server Integration Tests
 * 
 * Requirements:
 * - rejects connection with invalid JWT
 * - accepts valid JWT and joins room
 * - broadcasts channel envelopes to room members
 */
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { io as ioClient } from 'socket.io-client';
import jwt from 'jsonwebtoken';
import { createGatewayServer } from '../../src/index.js';

const SECRET = 'gateway-integration-secret-32-chars!!';

function waitForEvent(socket, eventName) {
  return new Promise((resolve) => {
    socket.once(eventName, resolve);
  });
}

describe('Gateway Socket Server', () => {
  let gateway;
  let url;

  beforeEach(async () => {
    gateway = createGatewayServer({ jwtSecret: SECRET, port: 0 });
    const started = await gateway.start();
    url = started.url;
  });

  afterEach(async () => {
    await gateway.stop();
  });

  it('rejects invalid JWT connections', async () => {
    const socket = ioClient(url, {
      auth: { token: 'invalid.token.here' },
      transports: ['websocket'],
      reconnection: false,
    });

    const error = await waitForEvent(socket, 'connect_error');
    assert.match(String(error.message), /auth|token|invalid/i);
    socket.close();
  });

  it('allows valid JWT connections and room join', async () => {
    const token = jwt.sign({ userId: 'u1', email: 'u1@test.com' }, SECRET, { expiresIn: '1h' });

    const socket = ioClient(url, {
      auth: { token },
      transports: ['websocket'],
      reconnection: false,
    });

    await waitForEvent(socket, 'connect');

    socket.emit('room:join', { sessionId: 'session-1', role: 'player' });
    const joined = await waitForEvent(socket, 'room:joined');
    assert.strictEqual(joined.sessionId, 'session-1');
    assert.strictEqual(joined.userId, 'u1');

    socket.close();
  });

  it('broadcasts channel messages to room members', async () => {
    const tokenA = jwt.sign({ userId: 'uA', email: 'a@test.com' }, SECRET, { expiresIn: '1h' });
    const tokenB = jwt.sign({ userId: 'uB', email: 'b@test.com' }, SECRET, { expiresIn: '1h' });

    const socketA = ioClient(url, { auth: { token: tokenA }, transports: ['websocket'], reconnection: false });
    const socketB = ioClient(url, { auth: { token: tokenB }, transports: ['websocket'], reconnection: false });

    await waitForEvent(socketA, 'connect');
    await waitForEvent(socketB, 'connect');

    socketA.emit('room:join', { sessionId: 'session-1', role: 'player' });
    socketB.emit('room:join', { sessionId: 'session-1', role: 'player' });

    await waitForEvent(socketA, 'room:joined');
    await waitForEvent(socketB, 'room:joined');

    const envelope = {
      channel: 'chat',
      type: 'message',
      payload: { text: 'hello room' },
      timestamp: new Date().toISOString(),
      senderId: 'uA',
    };

    const receivedPromise = waitForEvent(socketB, 'channel:message');
    socketA.emit('channel:message', envelope);

    const received = await receivedPromise;
    assert.strictEqual(received.channel, 'chat');
    assert.strictEqual(received.payload.text, 'hello room');

    socketA.close();
    socketB.close();
  });
});
