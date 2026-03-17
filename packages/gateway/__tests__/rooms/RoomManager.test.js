/**
 * RoomManager Tests
 * 
 * Requirements:
 * - getOrCreateRoom(sessionId) returns existing room if present, creates if absent
 * - removeRoom(sessionId) removes room and returns boolean
 * - getRoom(sessionId) returns room or null
 * - listRoomIds() returns known room IDs
 */
import { describe, it, expect } from 'vitest';
import { createRoomManager } from '../../src/rooms/RoomManager.js';

describe('RoomManager', () => {
  it('creates and reuses rooms by session ID', () => {
    const manager = createRoomManager();
    const first = manager.getOrCreateRoom('session-1');
    const second = manager.getOrCreateRoom('session-1');

    expect(first).toBe(second);
    expect(manager.listRoomIds()).toEqual(['session-1']);
  });

  it('returns null for missing room', () => {
    const manager = createRoomManager();
    expect(manager.getRoom('missing')).toBeNull();
  });

  it('removes existing room', () => {
    const manager = createRoomManager();
    manager.getOrCreateRoom('session-1');

    expect(manager.removeRoom('session-1')).toBe(true);
    expect(manager.getRoom('session-1')).toBeNull();
  });

  it('returns false when removing unknown room', () => {
    const manager = createRoomManager();
    expect(manager.removeRoom('missing')).toBe(false);
  });
});
