/**
 * World Package Public API Tests (WorldStateReader interface)
 *
 * Requirements:
 * - createWorldEngine exposes the full WorldStateReader interface
 * - tick advances world time and affects NPC state lookup
 * - getLocationState returns weather and season for a known location
 * - getVillainStorylines returns current storyline states
 * - villain storylines advance when tick pushes past stage duration
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createWorldEngine } from '../src/index.js';

describe('@dnd-platform/world public API', () => {
  it('exposes WorldStateReader interface methods', () => {
    const world = createWorldEngine();
    assert.strictEqual(typeof world.getCurrentTime, 'function');
    assert.strictEqual(typeof world.tick, 'function');
    assert.strictEqual(typeof world.getNpcState, 'function');
    assert.strictEqual(typeof world.getLocationState, 'function');
    assert.strictEqual(typeof world.getVillainStorylines, 'function');
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

  it('getLocationState returns season and weather for a known location', () => {
    const world = createWorldEngine({
      initialMinute: 0,
      locations: {
        millhaven: { id: 'millhaven', events: [] },
      },
    });
    const state = world.getLocationState('millhaven');
    assert.strictEqual(state.id, 'millhaven');
    assert.strictEqual(state.season, 'spring');
    assert.ok(typeof state.weather === 'string');
  });

  it('getLocationState returns null for unknown location', () => {
    const world = createWorldEngine();
    assert.strictEqual(world.getLocationState('unknown'), null);
  });

  it('getLocationState weather updates after ticking into a new season', () => {
    const world = createWorldEngine({
      initialMinute: 0,
      locations: { millhaven: { id: 'millhaven', events: [] } },
    });
    assert.strictEqual(world.getLocationState('millhaven').season, 'spring');
    world.tick(90 * 24 * 60); // advance one full season
    assert.strictEqual(world.getLocationState('millhaven').season, 'summer');
  });

  it('getVillainStorylines returns empty array when no storylines configured', () => {
    const world = createWorldEngine();
    assert.deepStrictEqual(world.getVillainStorylines(), []);
  });

  it('villain storylines advance when tick passes stage duration', () => {
    const world = createWorldEngine({
      villainStorylines: [{
        id: 'shadow-lord',
        currentStage: 0,
        stageStartedAt: 0,
        stages: [
          { id: 'gathering', durationMinutes: 1440 },
          { id: 'attack', durationMinutes: null },
        ],
      }],
    });
    assert.strictEqual(world.getVillainStorylines()[0].currentStage, 0);
    world.tick(1440);
    assert.strictEqual(world.getVillainStorylines()[0].currentStage, 1);
  });
});
