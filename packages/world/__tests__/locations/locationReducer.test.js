/**
 * locationReducer Tests
 *
 * Requirements:
 * - Returns correct season based on day of year (spring/summer/autumn/winter, 90 days each)
 * - Season cycles: year = 360 days, then repeats
 * - Returns deterministic weather (same inputs → same output)
 * - Weather varies by season (not always the same value)
 * - Preserves location events from input
 * - Returns new object (immutable — does not mutate input)
 * - Weather is always one of: clear, cloudy, rain, storm, snow
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { locationReducer } from '../../src/locations/locationReducer.js';

const VALID_WEATHER = ['clear', 'cloudy', 'rain', 'storm', 'snow'];

describe('locationReducer', () => {
  it('returns spring for day 1 (absoluteMinute 0)', () => {
    const result = locationReducer({ id: 'millhaven', events: [] }, 0);
    assert.strictEqual(result.season, 'spring');
  });

  it('returns spring for day 90 (last day of spring)', () => {
    const minuteForDay90 = (90 - 1) * 24 * 60; // day 90 starts at minute (89 * 1440)
    const result = locationReducer({ id: 'millhaven', events: [] }, minuteForDay90);
    assert.strictEqual(result.season, 'spring');
  });

  it('returns summer starting day 91', () => {
    const minuteForDay91 = 90 * 24 * 60;
    const result = locationReducer({ id: 'millhaven', events: [] }, minuteForDay91);
    assert.strictEqual(result.season, 'summer');
  });

  it('returns autumn starting day 181', () => {
    const minuteForDay181 = 180 * 24 * 60;
    const result = locationReducer({ id: 'millhaven', events: [] }, minuteForDay181);
    assert.strictEqual(result.season, 'autumn');
  });

  it('returns winter starting day 271', () => {
    const minuteForDay271 = 270 * 24 * 60;
    const result = locationReducer({ id: 'millhaven', events: [] }, minuteForDay271);
    assert.strictEqual(result.season, 'winter');
  });

  it('cycles back to spring after 360 days', () => {
    const minuteForDay361 = 360 * 24 * 60;
    const result = locationReducer({ id: 'millhaven', events: [] }, minuteForDay361);
    assert.strictEqual(result.season, 'spring');
  });

  it('returns valid weather type', () => {
    const result = locationReducer({ id: 'millhaven', events: [] }, 0);
    assert.ok(VALID_WEATHER.includes(result.weather), `unexpected weather: ${result.weather}`);
  });

  it('weather is deterministic for same inputs', () => {
    const loc = { id: 'millhaven', events: [] };
    const r1 = locationReducer(loc, 4000);
    const r2 = locationReducer(loc, 4000);
    assert.strictEqual(r1.weather, r2.weather);
  });

  it('weather can differ between different times', () => {
    // Scan many days until we find at least two different weather values
    const loc = { id: 'millhaven', events: [] };
    const weathers = new Set();
    for (let day = 0; day < 30; day += 1) {
      const result = locationReducer(loc, day * 24 * 60);
      weathers.add(result.weather);
    }
    assert.ok(weathers.size > 1, 'weather should vary across days');
  });

  it('preserves events from input', () => {
    const events = [{ id: 'harvest-festival', name: 'Harvest Festival' }];
    const result = locationReducer({ id: 'millhaven', events }, 0);
    assert.deepStrictEqual(result.events, events);
  });

  it('returns new object (immutable)', () => {
    const loc = { id: 'millhaven', events: [] };
    const result = locationReducer(loc, 0);
    assert.notStrictEqual(result, loc);
  });

  it('includes the location id in the result', () => {
    const result = locationReducer({ id: 'millhaven', events: [] }, 0);
    assert.strictEqual(result.id, 'millhaven');
  });
});
