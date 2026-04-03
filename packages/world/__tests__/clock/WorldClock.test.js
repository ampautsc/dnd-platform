/**
 * WorldClock Tests
 * 
 * Requirements:
 * - starts at configurable initial minute index
 * - tick(minutes) advances time deterministically
 * - getCurrentTime returns day/hour/minute breakdown
 * - getTimeOfDay returns night/morning/afternoon/evening by hour
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createWorldClock } from '../../src/clock/WorldClock.js';

describe('WorldClock', () => {
  it('starts at configured minute index', () => {
    const clock = createWorldClock({ initialMinute: 0 });
    assert.deepStrictEqual(clock.getCurrentTime(), { day: 1, hour: 0, minute: 0, absoluteMinute: 0 });
  });

  it('advances deterministically by tick minutes', () => {
    const clock = createWorldClock({ initialMinute: 0 });
    clock.tick(90);
    assert.deepStrictEqual(clock.getCurrentTime(), { day: 1, hour: 1, minute: 30, absoluteMinute: 90 });

    clock.tick(24 * 60);
    assert.strictEqual(clock.getCurrentTime().day, 2);
    assert.strictEqual(clock.getCurrentTime().hour, 1);
    assert.strictEqual(clock.getCurrentTime().minute, 30);
  });

  it('returns correct time-of-day bucket', () => {
    const clock = createWorldClock({ initialMinute: 0 });

    assert.strictEqual(clock.getTimeOfDay(), 'night'); // 00:00
    clock.tick(6 * 60);
    assert.strictEqual(clock.getTimeOfDay(), 'morning');
    clock.tick(6 * 60);
    assert.strictEqual(clock.getTimeOfDay(), 'afternoon');
    clock.tick(6 * 60);
    assert.strictEqual(clock.getTimeOfDay(), 'evening');
  });
});
