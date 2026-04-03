/**
 * MessageRouter Tests
 * 
 * Requirements:
 * - routes message by channel to matching handler
 * - throws on unknown channel
 * - passes full envelope to handler
 */
import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';

import { createMessageRouter } from '../../src/routing/MessageRouter.js';

describe('MessageRouter', () => {
  it('routes envelopes to the matching channel handler', () => {
    const narrationHandler = mock.fn();
    const combatHandler = mock.fn();

    const router = createMessageRouter({
      narration: narrationHandler,
      combat: combatHandler,
    });

    const envelope = {
      channel: 'combat',
      type: 'state_update',
      payload: { hp: 10 },
      timestamp: '2026-03-16T00:00:00.000Z',
      senderId: 'dm',
    };

    router.route(envelope, { roomId: 'session-1' });

    assert.strictEqual(combatHandler.mock.calls.length, 1);
    assert.deepStrictEqual(combatHandler.mock.calls.at(-1).arguments, [envelope, { roomId: 'session-1' }]);
    assert.strictEqual(narrationHandler.mock.calls.length, 0);
  });

  it('throws on unknown channel', () => {
    const router = createMessageRouter({});
    assert.throws(() =>
      router.route({ channel: 'unknown', type: 'x', payload: {}, timestamp: '', senderId: 'u1' }, {}),
      /unknown channel/i
    );
  });
});
