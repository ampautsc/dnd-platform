/**
 * WorldStateReader Integration — packages/dm/
 *
 * Requirements:
 * - dm/ services can accept a WorldStateReader without importing world internals
 * - A mock WorldStateReader satisfies the interface contract
 * - dm/ can query NPC state, location state, villain storylines, and current time
 *   via the reader without coupling to world/ implementation details
 *
 * This test validates the dm/ integration boundary described in
 * plans/world-simulation-tick-engine.md Phase 5.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

/**
 * Factory for a mock WorldStateReader — the same shape dm/ will receive
 * in production (backed by createWorldTickEngine from packages/world/).
 *
 * @param {Object} overrides - partial state for this test
 */
function createMockWorldStateReader(overrides = {}) {
  return {
    getCurrentTime() {
      return overrides.time ?? { day: 1, hour: 8, minute: 0, absoluteMinute: 480 };
    },
    getNpcState(npcId) {
      return overrides.npcs?.[npcId] ?? null;
    },
    getLocationState(locationId) {
      return overrides.locations?.[locationId] ?? null;
    },
    getVillainStorylines() {
      return overrides.villainStorylines ?? [];
    },
  };
}

/**
 * Example dm/ service that consumes a WorldStateReader.
 * Real services (e.g. SceneNarrator, ActionProcessor) will receive this
 * as a constructor dependency.
 */
function buildWorldContextSummary(worldReader) {
  const time = worldReader.getCurrentTime();
  return {
    timeOfDay: time.hour < 6 ? 'night' : time.hour < 12 ? 'morning' : time.hour < 18 ? 'afternoon' : 'evening',
    day: time.day,
  };
}

describe('WorldStateReader contract (dm/ integration boundary)', () => {
  it('mock reader satisfies getCurrentTime shape', () => {
    const reader = createMockWorldStateReader({ time: { day: 3, hour: 14, minute: 30, absoluteMinute: 3750 } });
    const time = reader.getCurrentTime();
    assert.strictEqual(time.day, 3);
    assert.strictEqual(time.hour, 14);
    assert.strictEqual(time.minute, 30);
    assert.strictEqual(time.absoluteMinute, 3750);
  });

  it('mock reader returns null for unknown NPC', () => {
    const reader = createMockWorldStateReader();
    assert.strictEqual(reader.getNpcState('unknown-npc'), null);
  });

  it('mock reader returns configured NPC state', () => {
    const reader = createMockWorldStateReader({
      npcs: {
        'bree-millhaven': { location: 'Bakery', activity: 'Baking', mood: 'focused' },
      },
    });
    const state = reader.getNpcState('bree-millhaven');
    assert.deepStrictEqual(state, { location: 'Bakery', activity: 'Baking', mood: 'focused' });
  });

  it('mock reader returns null for unknown location', () => {
    const reader = createMockWorldStateReader();
    assert.strictEqual(reader.getLocationState('unknown-place'), null);
  });

  it('mock reader returns configured location state', () => {
    const reader = createMockWorldStateReader({
      locations: {
        millhaven: { id: 'millhaven', season: 'spring', weather: 'clear', events: [] },
      },
    });
    const loc = reader.getLocationState('millhaven');
    assert.strictEqual(loc.season, 'spring');
    assert.strictEqual(loc.weather, 'clear');
  });

  it('mock reader returns empty villain storylines by default', () => {
    const reader = createMockWorldStateReader();
    assert.deepStrictEqual(reader.getVillainStorylines(), []);
  });

  it('mock reader returns configured villain storylines', () => {
    const storylines = [{ id: 'shadow-lord', currentStage: 1, stageStartedAt: 1440 }];
    const reader = createMockWorldStateReader({ villainStorylines: storylines });
    assert.deepStrictEqual(reader.getVillainStorylines(), storylines);
  });

  it('dm/ service can use WorldStateReader without world/ internals', () => {
    const reader = createMockWorldStateReader({ time: { day: 2, hour: 9, minute: 0, absoluteMinute: 1980 } });
    const summary = buildWorldContextSummary(reader);
    assert.strictEqual(summary.timeOfDay, 'morning');
    assert.strictEqual(summary.day, 2);
  });
});
