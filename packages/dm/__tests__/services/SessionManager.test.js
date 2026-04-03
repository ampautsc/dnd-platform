/**
 * SessionManager service tests
 *
 * Requirements:
 * - initializes sessions in lobby state
 * - supports valid lifecycle transitions: lobby -> intro -> play -> wrap
 * - rejects invalid transitions with structured errors
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createSessionManager } from '../../src/services/SessionManager.js';

describe('SessionManager', () => {
  it('creates session in lobby state', () => {
    const manager = createSessionManager();
    const session = manager.createSession({ sessionId: 's1', campaignId: 'c1' });

    assert.strictEqual(session.id, 's1');
    assert.strictEqual(session.state, 'lobby');
  });

  it('applies valid lifecycle transitions in order', () => {
    const manager = createSessionManager();
    manager.createSession({ sessionId: 's1', campaignId: 'c1' });

    const intro = manager.transition('s1', 'intro');
    const play = manager.transition('s1', 'play');
    const wrap = manager.transition('s1', 'wrap');

    assert.strictEqual(intro.state, 'intro');
    assert.strictEqual(play.state, 'play');
    assert.strictEqual(wrap.state, 'wrap');
  });

  it('throws structured error for invalid transition', () => {
    const manager = createSessionManager();
    manager.createSession({ sessionId: 's1', campaignId: 'c1' });

    assert.throws(() => manager.transition('s1', 'wrap'), /SESSION_TRANSITION_INVALID/);
  });
});
