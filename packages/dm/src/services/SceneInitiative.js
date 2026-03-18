/**
 * SceneInitiative — CHA-based initiative roller for social scenes.
 *
 * Pure function: participants in → sorted order + rolls out.
 * No side effects. No state. Accepts optional dice roller for testing.
 *
 * @module SceneInitiative
 */

/**
 * Roll a d20.
 * @returns {number} 1–20
 */
function d20() {
  return Math.floor(Math.random() * 20) + 1;
}

/**
 * Roll CHA-based initiative for all participants.
 *
 * @param {Array<{ id: string, name: string, chaMod: number }>} participants
 * @param {function(): number} [diceRoller=d20] — injectable for testing
 * @returns {{ order: string[], rolls: Map<string, { roll: number, mod: number, total: number }> }}
 */
export function rollSceneInitiative(participants, diceRoller = d20) {
  const entries = participants.map(p => {
    const roll = diceRoller();
    const mod = p.chaMod || 0;
    const total = roll + mod;
    return { id: p.id, roll, mod, total };
  });

  // Sort descending by total, ties broken by higher CHA mod
  entries.sort((a, b) => {
    if (b.total !== a.total) return b.total - a.total;
    return b.mod - a.mod;
  });

  const order = entries.map(e => e.id);
  const rolls = new Map(entries.map(e => [e.id, { roll: e.roll, mod: e.mod, total: e.total }]));

  return { order, rolls };
}
