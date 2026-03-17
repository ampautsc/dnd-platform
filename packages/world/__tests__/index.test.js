/**
 * World Package Public API Tests
 * 
 * Requirements:
 * - createWorldEngine exposes: getCurrentTime, tick, getNpcState
 * - tick advances world time and affects NPC state lookup
 */
import { describe, it, expect } from 'vitest';
import { createWorldEngine } from '../src/index.js';

describe('@dnd-platform/world public API', () => {
  it('exposes core world functions', () => {
    const world = createWorldEngine();
    expect(typeof world.getCurrentTime).toBe('function');
    expect(typeof world.tick).toBe('function');
    expect(typeof world.getNpcState).toBe('function');
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

    expect(world.getNpcState('bree')).toEqual({ location: 'Bakery', activity: 'Baking', mood: 'focused' });
    world.tick(4 * 60);
    expect(world.getNpcState('bree')).toEqual({ location: 'Market', activity: 'Selling', mood: 'friendly' });
  });
});
