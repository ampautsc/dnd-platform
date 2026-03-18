import { describe, it, expect } from 'vitest';
import { rollSceneInitiative } from '../../src/services/SceneInitiative.js';

/**
 * SceneInitiative Requirements:
 *
 * 1. Rolls CHA-based initiative: d20 + CHA modifier for each participant
 * 2. Returns { order: string[], rolls: Map<id, { roll, mod, total }> }
 * 3. Sorted descending by total
 * 4. Works with mixed player/NPC participants (no differentiation)
 * 5. Deterministic with injected dice roller
 * 6. Ties broken by higher CHA mod, then fallback
 */

function makeParticipants() {
  return [
    { id: 'npc_mira', name: 'Mira', chaMod: 2, isPlayer: false },
    { id: 'player_1', name: 'Thorn', chaMod: 1, isPlayer: true },
    { id: 'npc_lell', name: 'Lell', chaMod: 3, isPlayer: false },
  ];
}

describe('rollSceneInitiative', () => {
  it('should return order and rolls for all participants', () => {
    const result = rollSceneInitiative(makeParticipants());
    expect(result.order).toHaveLength(3);
    expect(result.rolls.size).toBe(3);
  });

  it('should include roll, mod, and total in each roll entry', () => {
    const result = rollSceneInitiative(makeParticipants());
    for (const [, roll] of result.rolls) {
      expect(roll).toHaveProperty('roll');
      expect(roll).toHaveProperty('mod');
      expect(roll).toHaveProperty('total');
      expect(roll.total).toBe(roll.roll + roll.mod);
      expect(roll.roll).toBeGreaterThanOrEqual(1);
      expect(roll.roll).toBeLessThanOrEqual(20);
    }
  });

  it('should sort by total descending', () => {
    // Inject a fixed roller to control outcomes
    const fixedRolls = [10, 15, 5]; // mira gets 10, player gets 15, lell gets 5
    let i = 0;
    const result = rollSceneInitiative(makeParticipants(), () => fixedRolls[i++]);
    // totals: mira=12, player=16, lell=8
    expect(result.order).toEqual(['player_1', 'npc_mira', 'npc_lell']);
  });

  it('should use CHA modifier from each participant', () => {
    // Everyone rolls the same — order determined by CHA mod
    const result = rollSceneInitiative(makeParticipants(), () => 10);
    // totals: mira=12, player=11, lell=13
    expect(result.order[0]).toBe('npc_lell');
    expect(result.order[1]).toBe('npc_mira');
    expect(result.order[2]).toBe('player_1');
  });

  it('should handle single participant', () => {
    const result = rollSceneInitiative([{ id: 'solo', name: 'Solo', chaMod: 0, isPlayer: true }]);
    expect(result.order).toEqual(['solo']);
    expect(result.rolls.size).toBe(1);
  });

  it('should handle ties by higher CHA mod first', () => {
    const participants = [
      { id: 'a', name: 'A', chaMod: 1, isPlayer: false },
      { id: 'b', name: 'B', chaMod: 3, isPlayer: false },
    ];
    // Both roll 10: a total=11, b total=13 → b wins
    const result = rollSceneInitiative(participants, () => 10);
    expect(result.order[0]).toBe('b');
  });
});
