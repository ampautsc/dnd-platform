/**
 * ReactionPriorityResolver — Determines the order in which reacting NPCs respond.
 *
 * When multiple NPCs react, this resolver determines who goes first using:
 *   priority = d20 roll + reactionStrength (1-5) + CHA modifier
 *
 * Highest priority goes first. Ties broken by CHA modifier, then alphabetical.
 *
 * Design:
 * - Dice roller is injectable for testing (seeded RNG produces deterministic results)
 * - Max 3 responders per round (configurable)
 * - No NPC acts more than once per round
 *
 * @module ReactionPriorityResolver
 */

/**
 * Default d20 roller using Math.random().
 * @returns {number} Integer 1-20
 */
export function defaultD20() {
  return Math.floor(Math.random() * 20) + 1;
}

/**
 * Create a seeded d20 roller for deterministic testing.
 * Uses a simple linear congruential generator.
 * @param {number} seed — RNG seed
 * @returns {function(): number}
 */
export function createSeededD20(seed) {
  let state = seed;
  return function seededD20() {
    // LCG: state = (a * state + c) mod m
    state = (state * 1664525 + 1013904223) & 0x7fffffff;
    return (state % 20) + 1;
  };
}

/**
 * Calculate the CHA modifier from a CHA score (D&D 5e formula).
 * @param {number} charisma — Charisma score
 * @returns {number} Modifier (floor((CHA - 10) / 2))
 */
export function getChaMod(charisma) {
  return Math.floor(((charisma ?? 10) - 10) / 2);
}

/**
 * @param {object} [options={}]
 * @param {function(): number} [options.rollD20] — d20 roller (default: Math.random-based)
 * @param {number} [options.maxResponders=3] — Maximum NPCs that can respond in a round
 */
export class ReactionPriorityResolver {
  constructor({ rollD20 = defaultD20, maxResponders = 3 } = {}) {
    this.rollD20 = rollD20;
    this.maxResponders = maxResponders;
  }

  /**
   * Resolve priority for a set of reaction results.
   *
   * @param {Array<{npcKey: string, npcName: string, reactionStrength: number}>} reactions
   *   Array of reaction results from NpcReactionEvaluator (only those with shouldReact=true)
   * @param {object} npcStats — Map of npcKey → { charisma: number }
   * @returns {Array<{npcKey: string, npcName: string, reactionStrength: number, d20: number, chaMod: number, priority: number}>}
   *   Sorted highest priority first, truncated to maxResponders.
   */
  resolve(reactions, npcStats = {}) {
    if (!reactions || reactions.length === 0) return [];

    const scored = reactions.map(r => {
      const cha = npcStats[r.npcKey]?.charisma ?? 10;
      const chaMod = getChaMod(cha);
      const d20 = this.rollD20();
      const priority = d20 + r.reactionStrength + chaMod;

      return {
        ...r,
        d20,
        chaMod,
        priority,
      };
    });

    // Sort by priority (desc), then CHA mod (desc), then name (asc) for tiebreaking
    scored.sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      if (b.chaMod !== a.chaMod) return b.chaMod - a.chaMod;
      return a.npcName.localeCompare(b.npcName);
    });

    return scored.slice(0, this.maxResponders);
  }
}
