/**
 * WorldClock Tests
 * 
 * Requirements:
 * - starts at configurable initial minute index
 * - tick(minutes) advances time deterministically
 * - getCurrentTime returns day/hour/minute breakdown
 * - getTimeOfDay returns night/morning/afternoon/evening by hour
 */
import { describe, it, expect } from 'vitest';
import { createWorldClock } from '../../src/clock/WorldClock.js';

describe('WorldClock', () => {
  it('starts at configured minute index', () => {
    const clock = createWorldClock({ initialMinute: 0 });
    expect(clock.getCurrentTime()).toEqual({ day: 1, hour: 0, minute: 0, absoluteMinute: 0 });
  });

  it('advances deterministically by tick minutes', () => {
    const clock = createWorldClock({ initialMinute: 0 });
    clock.tick(90);
    expect(clock.getCurrentTime()).toEqual({ day: 1, hour: 1, minute: 30, absoluteMinute: 90 });

    clock.tick(24 * 60);
    expect(clock.getCurrentTime().day).toBe(2);
    expect(clock.getCurrentTime().hour).toBe(1);
    expect(clock.getCurrentTime().minute).toBe(30);
  });

  it('returns correct time-of-day bucket', () => {
    const clock = createWorldClock({ initialMinute: 0 });

    expect(clock.getTimeOfDay()).toBe('night'); // 00:00
    clock.tick(6 * 60);
    expect(clock.getTimeOfDay()).toBe('morning');
    clock.tick(6 * 60);
    expect(clock.getTimeOfDay()).toBe('afternoon');
    clock.tick(6 * 60);
    expect(clock.getTimeOfDay()).toBe('evening');
  });
});
