/**
 * RoomManager Tests
 * 
 * Requirements:
 * - getOrCreateRoom(sessionId) returns existing room if present, creates if absent
 * - removeRoom(sessionId) removes room and returns boolean
 * - getRoom(sessionId) returns room or null
 * - listRoomIds() returns known room IDs
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createRoomManager } from '../../src/rooms/RoomManager.js';

describe('RoomManager', () => {
  it('creates and reuses rooms by session ID', () => {
    const manager = createRoomManager();
    const first = manager.getOrCreateRoom('session-1');
    const second = manager.getOrCreateRoom('session-1');

    assert.strictEqual(first, second);
    assert.deepStrictEqual(manager.listRoomIds(), ['session-1']);
  });

  it('returns null for missing room', () => {
    const manager = createRoomManager();
    assert.strictEqual(manager.getRoom('missing'), null);
  });

  it('removes existing room', () => {
    const manager = createRoomManager();
    manager.getOrCreateRoom('session-1');

    assert.strictEqual(manager.removeRoom('session-1'), true);
    assert.strictEqual(manager.getRoom('session-1'), null);
  });

  it('returns false when removing unknown room', () => {
    const manager = createRoomManager();
    assert.strictEqual(manager.removeRoom('missing'), false);
  });
});
