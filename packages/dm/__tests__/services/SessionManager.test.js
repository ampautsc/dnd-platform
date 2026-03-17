/**
 * SessionManager service tests
 *
 * Requirements:
 * - initializes sessions in lobby state
 * - supports valid lifecycle transitions: lobby -> intro -> play -> wrap
 * - rejects invalid transitions with structured errors
 */
import { describe, it, expect } from 'vitest';
import { createSessionManager } from '../../src/services/SessionManager.js';

describe('SessionManager', () => {
  it('creates session in lobby state', () => {
    const manager = createSessionManager();
    const session = manager.createSession({ sessionId: 's1', campaignId: 'c1' });

    expect(session.id).toBe('s1');
    expect(session.state).toBe('lobby');
  });

  it('applies valid lifecycle transitions in order', () => {
    const manager = createSessionManager();
    manager.createSession({ sessionId: 's1', campaignId: 'c1' });

    const intro = manager.transition('s1', 'intro');
    const play = manager.transition('s1', 'play');
    const wrap = manager.transition('s1', 'wrap');

    expect(intro.state).toBe('intro');
    expect(play.state).toBe('play');
    expect(wrap.state).toBe('wrap');
  });

  it('throws structured error for invalid transition', () => {
    const manager = createSessionManager();
    manager.createSession({ sessionId: 's1', campaignId: 'c1' });

    expect(() => manager.transition('s1', 'wrap')).toThrow(/SESSION_TRANSITION_INVALID/);
  });
});
