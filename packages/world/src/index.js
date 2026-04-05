import { createWorldClock } from './clock/WorldClock.js';
import { createNpcScheduler } from './npcs/NpcScheduler.js';
import { villainStorylineReducer } from './villains/villainStorylineReducer.js';
import { locationReducer } from './locations/locationReducer.js';

export { createWorldClock } from './clock/WorldClock.js';
export { createNpcScheduler } from './npcs/NpcScheduler.js';
export { villainStorylineReducer } from './villains/villainStorylineReducer.js';
export { locationReducer } from './locations/locationReducer.js';
export { createWorldTickEngine } from './tick/WorldTickEngine.js';

/**
 * @typedef {Object} WorldStateReader
 * Interface consumed by packages/dm/ to query world state without importing world internals.
 *
 * @property {function(): {day: number, hour: number, minute: number, absoluteMinute: number}} getCurrentTime
 * @property {function(string): {location: string, activity: string, mood: string}|null} getNpcState
 * @property {function(string): {id: string, season: string, weather: string, events: Array}|null} getLocationState
 * @property {function(): Array} getVillainStorylines
 */

/**
 * Create the world simulation engine.
 *
 * Exposes the WorldStateReader interface:
 * - getCurrentTime()          → {day, hour, minute, absoluteMinute}
 * - tick(minutes)             → advances world time; returns new time
 * - getNpcState(npcId)        → current NPC state from scheduler
 * - getLocationState(id)      → {id, season, weather, events} for a location
 * - getVillainStorylines()    → array of current villain storyline states
 *
 * @param {Object} options
 * @param {number}  [options.initialMinute=0]        - starting absoluteMinute
 * @param {Object}  [options.schedules={}]           - NPC schedule map keyed by NPC id
 * @param {Array}   [options.villainStorylines=[]]   - initial storyline state array
 * @param {Object}  [options.locations={}]           - initial location map keyed by location id
 * @returns {WorldStateReader & { tick: function }}
 */
export function createWorldEngine(options = {}) {
  const clock = createWorldClock({ initialMinute: options.initialMinute ?? 0 });
  const scheduler = createNpcScheduler({ schedules: options.schedules ?? {} });

  let villainStorylines = options.villainStorylines ?? [];
  let locations = options.locations ?? {};

  return {
    getCurrentTime() {
      return clock.getCurrentTime();
    },

    tick(minutes = 1) {
      const time = clock.tick(minutes);

      // Advance villain storylines
      if (villainStorylines.length > 0) {
        villainStorylines = villainStorylineReducer(villainStorylines, time.absoluteMinute);
      }

      return time;
    },

    getNpcState(npcId) {
      const { hour } = clock.getCurrentTime();
      return scheduler.getNpcStateAtHour(npcId, hour);
    },

    getLocationState(locationId) {
      const template = locations[locationId] ?? null;
      if (!template) return null;
      return locationReducer(template, clock.getCurrentTime().absoluteMinute);
    },

    getVillainStorylines() {
      return villainStorylines;
    },
  };
}
