/**
 * World Package Public API Tests
 * 
 * Requirements:
 * - createWorldEngine exposes: getCurrentTime, tick, getNpcState
 * - tick advances world time and affects NPC state lookup
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createWorldEngine } from '../src/index.js';

describe('@dnd-platform/world public API', () => {
  it('exposes core world functions', () => {
    const world = createWorldEngine();
    assert.strictEqual(typeof world.getCurrentTime, 'function');
    assert.strictEqual(typeof world.tick, 'function');
    assert.strictEqual(typeof world.getNpcState, 'function');
  });

  it('advances time and resolves npc state at the current hour', () => {
    const world = createWorldEngine({
      initialMinute: 8 * 60,
      schedules: {
        bree: {
          8: { location: 'Bakery', activity: 'Baking', mood: 'focused' },
          12: { location: 'Market', activity: 'Selling', mood: 'friendly' },
        },
      },
    });

    assert.deepStrictEqual(world.getNpcState('bree'), { location: 'Bakery', activity: 'Baking', mood: 'focused' });
    world.tick(4 * 60);
    assert.deepStrictEqual(world.getNpcState('bree'), { location: 'Market', activity: 'Selling', mood: 'friendly' });
  });
});
