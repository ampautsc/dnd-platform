import { createWorldEngine } from '../index.js';

/**
 * WorldTickEngine
 *
 * Wraps createWorldEngine with a real setInterval so the world advances
 * automatically in production. Tests use mock.timers to control the clock.
 *
 * API:
 *   start(intervalMs)  — begin ticking every intervalMs real milliseconds
 *   stop()             — clear interval; time freezes
 *   pause()            — same as stop but sets isPaused flag for resume()
 *   resume(intervalMs) — restart after pause
 *   isRunning()        — true while interval is active
 *   isPaused()         — true after pause(), false after stop() or resume()
 *   tick(minutes)      — manual tick (also used internally by start)
 *   getCurrentTime()   — {day, hour, minute, absoluteMinute}
 *   getNpcState(id)    — current NPC state from scheduler
 *   getVillainStorylines() — current villain storyline states
 *   getLocationState(id)   — current location state (weather, season, events)
 */
export function createWorldTickEngine(options = {}) {
  const engine = createWorldEngine(options);
  const tickMinutes = options.tickMinutes ?? 1;

  let intervalId = null;
  let paused = false;

  function runTick() {
    engine.tick(tickMinutes);
  }

  return {
    start(intervalMs = 60_000) {
      if (intervalId !== null) return; // already running — no-op
      paused = false;
      intervalId = setInterval(runTick, intervalMs);
    },

    stop() {
      if (intervalId !== null) {
        clearInterval(intervalId);
        intervalId = null;
      }
      paused = false;
    },

    pause() {
      if (intervalId !== null) {
        clearInterval(intervalId);
        intervalId = null;
        paused = true;
      }
    },

    resume(intervalMs = 60_000) {
      if (paused) {
        this.start(intervalMs);
      }
    },

    isRunning() {
      return intervalId !== null;
    },

    isPaused() {
      return paused;
    },

    tick(minutes) {
      return engine.tick(minutes);
    },

    getCurrentTime() {
      return engine.getCurrentTime();
    },

    getNpcState(npcId) {
      return engine.getNpcState(npcId);
    },

    getVillainStorylines() {
      return engine.getVillainStorylines();
    },

    getLocationState(locationId) {
      return engine.getLocationState(locationId);
    },
  };
}
