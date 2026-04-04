/**
 * WorldTickEngine Tests
 *
 * Requirements:
 * - start(intervalMs) begins calling tick at the given interval
 * - stop() clears the interval; time no longer advances
 * - pause() halts ticking; isPaused() returns true
 * - resume() restarts ticking after pause
 * - isRunning() returns true only while the interval is active
 * - Calling start() twice is a no-op (does not double-tick)
 * - getCurrentTime() returns the current world time
 * - getNpcState(id) returns NPC state based on current time
 */
import { describe, it, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { createWorldTickEngine } from '../../src/tick/WorldTickEngine.js';

describe('WorldTickEngine', () => {
  beforeEach(() => {
    mock.timers.enable({ apis: ['setInterval'] });
  });

  afterEach(() => {
    mock.timers.reset();
  });

  it('is not running before start()', () => {
    const engine = createWorldTickEngine();
    assert.strictEqual(engine.isRunning(), false);
  });

  it('is not paused before start()', () => {
    const engine = createWorldTickEngine();
    assert.strictEqual(engine.isPaused(), false);
  });

  it('isRunning returns true after start()', () => {
    const engine = createWorldTickEngine();
    engine.start(60_000);
    assert.strictEqual(engine.isRunning(), true);
    engine.stop();
  });

  it('advances time by tickMinutes on each interval tick', () => {
    const engine = createWorldTickEngine({ initialMinute: 0, tickMinutes: 5 });
    engine.start(60_000);
    mock.timers.tick(60_000);
    assert.strictEqual(engine.getCurrentTime().absoluteMinute, 5);
    mock.timers.tick(60_000);
    assert.strictEqual(engine.getCurrentTime().absoluteMinute, 10);
    engine.stop();
  });

  it('stops advancing after stop()', () => {
    const engine = createWorldTickEngine({ initialMinute: 0, tickMinutes: 1 });
    engine.start(60_000);
    mock.timers.tick(60_000);
    assert.strictEqual(engine.getCurrentTime().absoluteMinute, 1);
    engine.stop();
    mock.timers.tick(60_000);
    assert.strictEqual(engine.getCurrentTime().absoluteMinute, 1); // unchanged
  });

  it('isRunning returns false after stop()', () => {
    const engine = createWorldTickEngine();
    engine.start(60_000);
    engine.stop();
    assert.strictEqual(engine.isRunning(), false);
  });

  it('pauses ticking without resetting time', () => {
    const engine = createWorldTickEngine({ initialMinute: 0, tickMinutes: 1 });
    engine.start(60_000);
    mock.timers.tick(60_000);
    engine.pause();
    mock.timers.tick(60_000);
    assert.strictEqual(engine.getCurrentTime().absoluteMinute, 1); // no further advance
    assert.strictEqual(engine.isPaused(), true);
    assert.strictEqual(engine.isRunning(), false);
  });

  it('resumes ticking after pause', () => {
    const engine = createWorldTickEngine({ initialMinute: 0, tickMinutes: 1 });
    engine.start(60_000);
    mock.timers.tick(60_000);
    engine.pause();
    engine.resume(60_000);
    mock.timers.tick(60_000);
    assert.strictEqual(engine.getCurrentTime().absoluteMinute, 2);
    assert.strictEqual(engine.isPaused(), false);
    assert.strictEqual(engine.isRunning(), true);
    engine.stop();
  });

  it('calling start() twice does not double-tick', () => {
    const engine = createWorldTickEngine({ initialMinute: 0, tickMinutes: 1 });
    engine.start(60_000);
    engine.start(60_000); // second call should be ignored
    mock.timers.tick(60_000);
    assert.strictEqual(engine.getCurrentTime().absoluteMinute, 1); // not 2
    engine.stop();
  });

  it('getNpcState returns correct state at current time', () => {
    const engine = createWorldTickEngine({
      initialMinute: 8 * 60,
      tickMinutes: 0,
      schedules: {
        bree: {
          8: { location: 'Bakery', activity: 'Baking', mood: 'focused' },
          12: { location: 'Market', activity: 'Selling', mood: 'friendly' },
        },
      },
    });
    const state = engine.getNpcState('bree');
    assert.deepStrictEqual(state, { location: 'Bakery', activity: 'Baking', mood: 'focused' });
  });

  it('defaults to tickMinutes=1 if not specified', () => {
    const engine = createWorldTickEngine({ initialMinute: 0 });
    engine.start(60_000);
    mock.timers.tick(60_000);
    assert.strictEqual(engine.getCurrentTime().absoluteMinute, 1);
    engine.stop();
  });
});
