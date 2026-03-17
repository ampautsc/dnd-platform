import { createWorldClock } from './clock/WorldClock.js';
import { createNpcScheduler } from './npcs/NpcScheduler.js';

export { createWorldClock } from './clock/WorldClock.js';
export { createNpcScheduler } from './npcs/NpcScheduler.js';

/**
 * Create the world simulation engine.
 * Public API intentionally small for MVP phase:
 * - getCurrentTime
 * - tick
 * - getNpcState
 */
export function createWorldEngine(options = {}) {
  const clock = createWorldClock({ initialMinute: options.initialMinute ?? 0 });
  const scheduler = createNpcScheduler({ schedules: options.schedules ?? {} });

  return {
    getCurrentTime() {
      return clock.getCurrentTime();
    },

    tick(minutes = 1) {
      return clock.tick(minutes);
    },

    getNpcState(npcId) {
      const { hour } = clock.getCurrentTime();
      return scheduler.getNpcStateAtHour(npcId, hour);
    },
  };
}
