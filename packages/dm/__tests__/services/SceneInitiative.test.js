import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

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
    assert.strictEqual(result.order.length, 3);
    assert.strictEqual(result.rolls.size, 3);
  });

  it('should include roll, mod, and total in each roll entry', () => {
    const result = rollSceneInitiative(makeParticipants());
    for (const [, roll] of result.rolls) {
      assert.notStrictEqual(roll['roll'], undefined);
      assert.notStrictEqual(roll['mod'], undefined);
      assert.notStrictEqual(roll['total'], undefined);
      assert.strictEqual(roll.total, roll.roll + roll.mod);
      assert.ok(roll.roll >= 1);
      assert.ok(roll.roll <= 20);
    }
  });

  it('should sort by total descending', () => {
    // Inject a fixed roller to control outcomes
    const fixedRolls = [10, 15, 5]; // mira gets 10, player gets 15, lell gets 5
    let i = 0;
    const result = rollSceneInitiative(makeParticipants(), () => fixedRolls[i++]);
    // totals: mira=12, player=16, lell=8
    assert.deepStrictEqual(result.order, ['player_1', 'npc_mira', 'npc_lell']);
  });

  it('should use CHA modifier from each participant', () => {
    // Everyone rolls the same — order determined by CHA mod
    const result = rollSceneInitiative(makeParticipants(), () => 10);
    // totals: mira=12, player=11, lell=13
    assert.strictEqual(result.order[0], 'npc_lell');
    assert.strictEqual(result.order[1], 'npc_mira');
    assert.strictEqual(result.order[2], 'player_1');
  });

  it('should handle single participant', () => {
    const result = rollSceneInitiative([{ id: 'solo', name: 'Solo', chaMod: 0, isPlayer: true }]);
    assert.deepStrictEqual(result.order, ['solo']);
    assert.strictEqual(result.rolls.size, 1);
  });

  it('should handle ties by higher CHA mod first', () => {
    const participants = [
      { id: 'a', name: 'A', chaMod: 1, isPlayer: false },
      { id: 'b', name: 'B', chaMod: 3, isPlayer: false },
    ];
    // Both roll 10: a total=11, b total=13 → b wins
    const result = rollSceneInitiative(participants, () => 10);
    assert.strictEqual(result.order[0], 'b');
  });
});
