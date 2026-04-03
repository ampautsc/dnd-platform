/**
 * ReactionPriorityResolver — unit tests (no model needed).
 *
 * Requirements:
 * - Priority = d20 + reactionStrength + CHA modifier
 * - Results sorted by priority descending
 * - Ties broken by CHA mod, then alphabetical name
 * - Max 3 responders (configurable)
 * - Seeded d20 produces deterministic results
 * - CHA modifier calculated correctly (D&D 5e formula)
 * - Empty input returns empty array
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  ReactionPriorityResolver,
  createSeededD20,
  getChaMod,
  defaultD20,
} from '../../src/ambient/ReactionPriorityResolver.js';

describe('getChaMod', () => {
  it('should return 0 for CHA 10-11', () => {
    assert.strictEqual(getChaMod(10), 0);
    assert.strictEqual(getChaMod(11), 0);
  });

  it('should return +4 for CHA 18', () => {
    assert.strictEqual(getChaMod(18), 4);
  });

  it('should return +1 for CHA 13', () => {
    assert.strictEqual(getChaMod(13), 1);
  });

  it('should return -1 for CHA 8', () => {
    assert.strictEqual(getChaMod(8), -1);
  });

  it('should return 0 for null/undefined', () => {
    assert.strictEqual(getChaMod(null), 0);
    assert.strictEqual(getChaMod(undefined), 0);
  });
});

describe('createSeededD20', () => {
  it('should return values in range [1, 20]', () => {
    const roll = createSeededD20(42);
    for (let i = 0; i < 100; i++) {
      const val = roll();
      assert.ok(val >= 1);
      assert.ok(val <= 20);
    }
  });

  it('should produce deterministic sequence from same seed', () => {
    const roll1 = createSeededD20(42);
    const roll2 = createSeededD20(42);
    for (let i = 0; i < 20; i++) {
      assert.strictEqual(roll1(), roll2());
    }
  });

  it('should produce different sequences from different seeds', () => {
    const roll1 = createSeededD20(42);
    const roll2 = createSeededD20(99);
    const seq1 = Array.from({ length: 10 }, () => roll1());
    const seq2 = Array.from({ length: 10 }, () => roll2());
    assert.notDeepStrictEqual(seq1, seq2);
  });
});

describe('defaultD20', () => {
  it('should return values in range [1, 20]', () => {
    for (let i = 0; i < 100; i++) {
      const val = defaultD20();
      assert.ok(val >= 1);
      assert.ok(val <= 20);
    }
  });
});

describe('ReactionPriorityResolver', () => {
  const makeReaction = (npcKey, npcName, reactionStrength) => ({
    npcKey,
    npcName,
    shouldReact: true,
    reactionStrength,
    reactionType: 'speak',
    reason: 'test',
  });

  describe('priority calculation', () => {
    it('should calculate priority as d20 + reactionStrength + chaMod', () => {
      // Seeded roll: first roll from seed 42
      const roll = createSeededD20(42);
      const firstRoll = createSeededD20(42)(); // peek at first value

      const resolver = new ReactionPriorityResolver({ rollD20: roll });
      const result = resolver.resolve(
        [makeReaction('norvin', 'Norvin', 3)],
        { norvin: { charisma: 13 } }
      );

      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].d20, firstRoll);
      assert.strictEqual(result[0].chaMod, 1); // CHA 13 → +1
      assert.strictEqual(result[0].reactionStrength, 3);
      assert.strictEqual(result[0].priority, firstRoll + 3 + 1);
    });
  });

  describe('sorting', () => {
    it('should sort by priority descending', () => {
      // Use a roller that returns predictable values
      let callCount = 0;
      const fixedRolls = [10, 20, 5]; // norvin gets 10, clifton gets 20, carza gets 5
      const roller = () => fixedRolls[callCount++];

      const resolver = new ReactionPriorityResolver({ rollD20: roller });
      const result = resolver.resolve(
        [
          makeReaction('norvin', 'Norvin', 3),
          makeReaction('clifton', 'Clifton', 2),
          makeReaction('carza', 'Carza', 4),
        ],
        {
          norvin: { charisma: 13 },
          clifton: { charisma: 10 },
          carza: { charisma: 14 },
        }
      );

      // Clifton: 20 + 2 + 0 = 22
      // Norvin: 10 + 3 + 1 = 14
      // Carza: 5 + 4 + 2 = 11
      assert.strictEqual(result[0].npcKey, 'clifton');
      assert.strictEqual(result[0].priority, 22);
      assert.strictEqual(result[1].npcKey, 'norvin');
      assert.strictEqual(result[1].priority, 14);
      assert.strictEqual(result[2].npcKey, 'carza');
      assert.strictEqual(result[2].priority, 11);
    });

    it('should break ties by CHA mod (desc), then name (asc)', () => {
      // Both roll 10, both strength 3
      let callCount = 0;
      const roller = () => 10;

      const resolver = new ReactionPriorityResolver({ rollD20: roller });
      const result = resolver.resolve(
        [
          makeReaction('zara', 'Zara', 3),
          makeReaction('alpha', 'Alpha', 3),
        ],
        {
          zara: { charisma: 14 },  // +2
          alpha: { charisma: 14 }, // +2
        }
      );

      // Same priority (10+3+2=15), same chaMod (+2), so alphabetical: Alpha first
      assert.strictEqual(result[0].npcKey, 'alpha');
      assert.strictEqual(result[1].npcKey, 'zara');
    });
  });

  describe('maxResponders', () => {
    it('should limit to 3 responders by default', () => {
      const roller = () => 10;
      const resolver = new ReactionPriorityResolver({ rollD20: roller });
      const reactions = [
        makeReaction('a', 'A', 5),
        makeReaction('b', 'B', 4),
        makeReaction('c', 'C', 3),
        makeReaction('d', 'D', 2),
        makeReaction('e', 'E', 1),
      ];
      const stats = {};
      const result = resolver.resolve(reactions, stats);
      assert.strictEqual(result.length, 3);
    });

    it('should respect custom maxResponders', () => {
      const roller = () => 10;
      const resolver = new ReactionPriorityResolver({ rollD20: roller, maxResponders: 2 });
      const reactions = [
        makeReaction('a', 'A', 5),
        makeReaction('b', 'B', 4),
        makeReaction('c', 'C', 3),
      ];
      const result = resolver.resolve(reactions, {});
      assert.strictEqual(result.length, 2);
    });

    it('should return all when fewer than maxResponders', () => {
      const roller = () => 10;
      const resolver = new ReactionPriorityResolver({ rollD20: roller });
      const reactions = [makeReaction('a', 'A', 3)];
      const result = resolver.resolve(reactions, {});
      assert.strictEqual(result.length, 1);
    });
  });

  describe('edge cases', () => {
    it('should return empty array for empty input', () => {
      const resolver = new ReactionPriorityResolver();
      assert.deepStrictEqual(resolver.resolve([]), []);
      assert.deepStrictEqual(resolver.resolve(null), []);
    });

    it('should use CHA 10 (mod 0) when stats not provided', () => {
      const roller = () => 10;
      const resolver = new ReactionPriorityResolver({ rollD20: roller });
      const result = resolver.resolve(
        [makeReaction('unknown', 'Unknown', 3)],
        {} // no stats
      );
      assert.strictEqual(result[0].chaMod, 0);
      assert.strictEqual(result[0].priority, 13); // 10 + 3 + 0
    });
  });
});
