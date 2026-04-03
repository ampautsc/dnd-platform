/**
 * Room Tests
 * 
 * Requirements:
 * - room has id and tracks members by userId
 * - joinMember adds member metadata
 * - leaveMember removes member
 * - getMembers returns all current members
 * - event buffer stores latest N events (default 100)
 * - getEventsSince(timestamp) returns buffered events after timestamp
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createRoom } from '../../src/rooms/Room.js';

describe('Room', () => {
  it('tracks members joining and leaving', () => {
    const room = createRoom('session-1');
    room.joinMember({ userId: 'u1', socketId: 's1', role: 'player' });
    room.joinMember({ userId: 'u2', socketId: 's2', role: 'player' });

    assert.strictEqual(room.getMembers().length, 2);

    room.leaveMember('u1');
    assert.strictEqual(room.getMembers().length, 1);
    assert.strictEqual(room.getMembers()[0].userId, 'u2');
  });

  it('keeps latest events in bounded buffer', () => {
    const room = createRoom('session-1', { eventBufferSize: 2 });
    room.addEvent({ type: 'a', timestamp: '2026-03-16T00:00:00.000Z' });
    room.addEvent({ type: 'b', timestamp: '2026-03-16T00:00:01.000Z' });
    room.addEvent({ type: 'c', timestamp: '2026-03-16T00:00:02.000Z' });

    const events = room.getBufferedEvents();
    assert.strictEqual(events.length, 2);
    assert.strictEqual(events[0].type, 'b');
    assert.strictEqual(events[1].type, 'c');
  });

  it('returns events since a timestamp', () => {
    const room = createRoom('session-1');
    room.addEvent({ type: 'a', timestamp: '2026-03-16T00:00:00.000Z' });
    room.addEvent({ type: 'b', timestamp: '2026-03-16T00:00:01.000Z' });
    room.addEvent({ type: 'c', timestamp: '2026-03-16T00:00:02.000Z' });

    const events = room.getEventsSince('2026-03-16T00:00:00.500Z');
    assert.deepStrictEqual(events.map(e => e.type), ['b', 'c']);
  });
});
