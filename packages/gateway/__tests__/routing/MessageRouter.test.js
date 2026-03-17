/**
 * MessageRouter Tests
 * 
 * Requirements:
 * - routes message by channel to matching handler
 * - throws on unknown channel
 * - passes full envelope to handler
 */
import { describe, it, expect, vi } from 'vitest';
import { createMessageRouter } from '../../src/routing/MessageRouter.js';

describe('MessageRouter', () => {
  it('routes envelopes to the matching channel handler', () => {
    const narrationHandler = vi.fn();
    const combatHandler = vi.fn();

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

    expect(combatHandler).toHaveBeenCalledTimes(1);
    expect(combatHandler).toHaveBeenCalledWith(envelope, { roomId: 'session-1' });
    expect(narrationHandler).not.toHaveBeenCalled();
  });

  it('throws on unknown channel', () => {
    const router = createMessageRouter({});
    expect(() =>
      router.route({ channel: 'unknown', type: 'x', payload: {}, timestamp: '', senderId: 'u1' }, {})
    ).toThrow(/unknown channel/i);
  });
});
