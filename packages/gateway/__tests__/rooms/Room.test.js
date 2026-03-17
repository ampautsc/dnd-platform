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
import { describe, it, expect } from 'vitest';
import { createRoom } from '../../src/rooms/Room.js';

describe('Room', () => {
  it('tracks members joining and leaving', () => {
    const room = createRoom('session-1');
    room.joinMember({ userId: 'u1', socketId: 's1', role: 'player' });
    room.joinMember({ userId: 'u2', socketId: 's2', role: 'player' });

    expect(room.getMembers()).toHaveLength(2);

    room.leaveMember('u1');
    expect(room.getMembers()).toHaveLength(1);
    expect(room.getMembers()[0].userId).toBe('u2');
  });

  it('keeps latest events in bounded buffer', () => {
    const room = createRoom('session-1', { eventBufferSize: 2 });
    room.addEvent({ type: 'a', timestamp: '2026-03-16T00:00:00.000Z' });
    room.addEvent({ type: 'b', timestamp: '2026-03-16T00:00:01.000Z' });
    room.addEvent({ type: 'c', timestamp: '2026-03-16T00:00:02.000Z' });

    const events = room.getBufferedEvents();
    expect(events).toHaveLength(2);
    expect(events[0].type).toBe('b');
    expect(events[1].type).toBe('c');
  });

  it('returns events since a timestamp', () => {
    const room = createRoom('session-1');
    room.addEvent({ type: 'a', timestamp: '2026-03-16T00:00:00.000Z' });
    room.addEvent({ type: 'b', timestamp: '2026-03-16T00:00:01.000Z' });
    room.addEvent({ type: 'c', timestamp: '2026-03-16T00:00:02.000Z' });

    const events = room.getEventsSince('2026-03-16T00:00:00.500Z');
    expect(events.map(e => e.type)).toEqual(['b', 'c']);
  });
});
