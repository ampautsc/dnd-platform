import { describe, it, expect } from 'vitest';
import { createNpcScheduler } from '../../src/npc/NpcScheduler.js';

/**
 * NpcScheduler Requirements:
 *
 * 1. getScheduleEntry(templateKey, hour, npcType?)
 *    a. returns exact hourly entry for known template schedules
 *    b. falls back to friendly/enemy default schedule when template is unknown
 *    c. returns a sleeping-at-home fallback when hour is invalid/missing
 *    d. defaults npcType to friendly
 *
 * 2. getFullSchedule(templateKey, npcType?)
 *    a. returns full schedule array for known template schedules
 *    b. falls back to friendly/enemy default schedule for unknown templates
 *    c. returns a cloned array (no mutable reference leaks)
 *
 * 3. Exposes NPC_SCHEDULES data map
 */

describe('NpcScheduler', () => {
  it('returns exact schedule entry for a known template and hour', () => {
    const scheduler = createNpcScheduler({
      schedules: {
        bree_millhaven: [
          { location: 'Home', activity: 'Sleeping', moodHint: 'restful' },
          { location: 'Bakery', activity: 'Opening shop', moodHint: 'busy' },
        ],
      },
      defaultFriendlySchedule: [
        { location: 'Inn', activity: 'Relaxing', moodHint: 'calm' },
      ],
      defaultEnemySchedule: [
        { location: 'Hideout', activity: 'Plotting', moodHint: 'hostile' },
      ],
    });

    const result = scheduler.getScheduleEntry('bree_millhaven', 1);
    expect(result).toEqual({ location: 'Bakery', activity: 'Opening shop', moodHint: 'busy' });
  });

  it('falls back to friendly default schedule for unknown template', () => {
    const scheduler = createNpcScheduler({
      schedules: {},
      defaultFriendlySchedule: [
        { location: 'Inn', activity: 'Relaxing', moodHint: 'calm' },
      ],
      defaultEnemySchedule: [
        { location: 'Hideout', activity: 'Plotting', moodHint: 'hostile' },
      ],
    });

    const result = scheduler.getScheduleEntry('unknown_npc', 0, 'friendly');
    expect(result).toEqual({ location: 'Inn', activity: 'Relaxing', moodHint: 'calm' });
  });

  it('falls back to enemy default schedule for unknown enemy template', () => {
    const scheduler = createNpcScheduler({
      schedules: {},
      defaultFriendlySchedule: [
        { location: 'Inn', activity: 'Relaxing', moodHint: 'calm' },
      ],
      defaultEnemySchedule: [
        { location: 'Hideout', activity: 'Plotting', moodHint: 'hostile' },
      ],
    });

    const result = scheduler.getScheduleEntry('unknown_enemy', 0, 'enemy');
    expect(result).toEqual({ location: 'Hideout', activity: 'Plotting', moodHint: 'hostile' });
  });

  it('returns sleeping fallback for out-of-range hour', () => {
    const scheduler = createNpcScheduler({
      schedules: {},
      defaultFriendlySchedule: [
        { location: 'Inn', activity: 'Relaxing', moodHint: 'calm' },
      ],
      defaultEnemySchedule: [
        { location: 'Hideout', activity: 'Plotting', moodHint: 'hostile' },
      ],
    });

    const result = scheduler.getScheduleEntry('unknown_npc', 30, 'friendly');
    expect(result).toEqual({ location: 'home', activity: 'sleeping', moodHint: null });
  });

  it('defaults npcType to friendly', () => {
    const scheduler = createNpcScheduler({
      schedules: {},
      defaultFriendlySchedule: [
        { location: 'Inn', activity: 'Relaxing', moodHint: 'calm' },
      ],
      defaultEnemySchedule: [
        { location: 'Hideout', activity: 'Plotting', moodHint: 'hostile' },
      ],
    });

    const result = scheduler.getScheduleEntry('unknown_npc', 0);
    expect(result).toEqual({ location: 'Inn', activity: 'Relaxing', moodHint: 'calm' });
  });

  it('returns full schedule for known template', () => {
    const scheduler = createNpcScheduler({
      schedules: {
        bree_millhaven: [
          { location: 'Home', activity: 'Sleeping', moodHint: 'restful' },
        ],
      },
      defaultFriendlySchedule: [
        { location: 'Inn', activity: 'Relaxing', moodHint: 'calm' },
      ],
      defaultEnemySchedule: [
        { location: 'Hideout', activity: 'Plotting', moodHint: 'hostile' },
      ],
    });

    const result = scheduler.getFullSchedule('bree_millhaven');
    expect(result).toEqual([
      { location: 'Home', activity: 'Sleeping', moodHint: 'restful' },
    ]);
  });

  it('returns cloned schedule data to avoid mutation leaks', () => {
    const scheduler = createNpcScheduler({
      schedules: {
        bree_millhaven: [
          { location: 'Home', activity: 'Sleeping', moodHint: 'restful' },
        ],
      },
      defaultFriendlySchedule: [
        { location: 'Inn', activity: 'Relaxing', moodHint: 'calm' },
      ],
      defaultEnemySchedule: [
        { location: 'Hideout', activity: 'Plotting', moodHint: 'hostile' },
      ],
    });

    const schedule = scheduler.getFullSchedule('bree_millhaven');
    schedule[0].location = 'Changed';

    const reread = scheduler.getFullSchedule('bree_millhaven');
    expect(reread[0].location).toBe('Home');
  });

  it('exposes NPC_SCHEDULES from scheduler instance', () => {
    const scheduler = createNpcScheduler({
      schedules: {
        bree_millhaven: [
          { location: 'Home', activity: 'Sleeping', moodHint: 'restful' },
        ],
      },
      defaultFriendlySchedule: [
        { location: 'Inn', activity: 'Relaxing', moodHint: 'calm' },
      ],
      defaultEnemySchedule: [
        { location: 'Hideout', activity: 'Plotting', moodHint: 'hostile' },
      ],
    });

    expect(scheduler.NPC_SCHEDULES.bree_millhaven).toBeDefined();
  });
});
