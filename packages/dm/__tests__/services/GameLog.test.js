/**
 * GameLog service tests
 *
 * Requirements:
 * - records timestamped events with type and payload
 * - preserves insertion order
 * - can return events since a given timestamp
 */
import { describe, it, expect } from 'vitest';
import { createGameLog } from '../../src/services/GameLog.js';

describe('GameLog', () => {
  it('records timestamped events in insertion order', () => {
    const log = createGameLog();

    log.record({ type: 'session.started', payload: { sessionId: 's1' }, timestamp: '2026-03-16T10:00:00.000Z' });
    log.record({ type: 'scene.changed', payload: { scene: 'intro' }, timestamp: '2026-03-16T10:01:00.000Z' });

    const events = log.getAll();
    expect(events).toHaveLength(2);
    expect(events[0].type).toBe('session.started');
    expect(events[1].type).toBe('scene.changed');
    expect(events[0].timestamp).toBe('2026-03-16T10:00:00.000Z');
  });

  it('returns events since an iso timestamp', () => {
    const log = createGameLog();

    log.record({ type: 'a', payload: {}, timestamp: '2026-03-16T10:00:00.000Z' });
    log.record({ type: 'b', payload: {}, timestamp: '2026-03-16T10:05:00.000Z' });
    log.record({ type: 'c', payload: {}, timestamp: '2026-03-16T10:10:00.000Z' });

    const events = log.getSince('2026-03-16T10:04:00.000Z');
    expect(events.map((event) => event.type)).toEqual(['b', 'c']);
  });
});
