/**
 * NpcScheduler Tests
 * 
 * Requirements:
 * - returns an NPC state for a given hour from schedule data
 * - supports hourly entries 0-23
 * - falls back to nearest earlier hour when exact hour missing
 * - returns null for unknown NPC
 */
import { describe, it, expect } from 'vitest';
import { createNpcScheduler } from '../../src/npcs/NpcScheduler.js';

const schedules = {
  'bree-millhaven': {
    0: { location: 'Home', activity: 'Sleeping', mood: 'calm' },
    8: { location: 'Bakery', activity: 'Baking', mood: 'focused' },
    12: { location: 'Market', activity: 'Selling bread', mood: 'friendly' },
    20: { location: 'Home', activity: 'Resting', mood: 'tired' },
  },
};

describe('NpcScheduler', () => {
  it('returns exact hour schedule when available', () => {
    const scheduler = createNpcScheduler({ schedules });
    const state = scheduler.getNpcStateAtHour('bree-millhaven', 8);
    expect(state).toEqual({ location: 'Bakery', activity: 'Baking', mood: 'focused' });
  });

  it('falls back to nearest earlier hour when exact hour is missing', () => {
    const scheduler = createNpcScheduler({ schedules });
    const state = scheduler.getNpcStateAtHour('bree-millhaven', 10);
    expect(state).toEqual({ location: 'Bakery', activity: 'Baking', mood: 'focused' });
  });

  it('wraps around to previous day for early hours with no earlier entry', () => {
    const scheduler = createNpcScheduler({ schedules });
    const state = scheduler.getNpcStateAtHour('bree-millhaven', 1);
    expect(state).toEqual({ location: 'Home', activity: 'Sleeping', mood: 'calm' });
  });

  it('returns null for unknown npc', () => {
    const scheduler = createNpcScheduler({ schedules });
    expect(scheduler.getNpcStateAtHour('unknown-npc', 8)).toBeNull();
  });
});
