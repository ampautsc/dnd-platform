/**
 * Target Resolver — game engine module for determining AoE targets
 *
 * This is the authoritative module for answering "who gets hit by an AoE?"
 * The AI declares intent (spell + center point), and this module resolves
 * which combatants are inside the area of effect.
 *
 * Separation of concerns:
 *   AI (tactics.js)      → decides WHAT spell and WHERE to place it
 *   Target Resolver       → decides WHO is affected (this module)
 *   Spell Resolver        → resolves saves, damage, and effects
 *
 * Dependencies: aoeGeometry.js for pure spatial calculations.
 */

import * as geo from './aoeGeometry.js'

/**
 * Resolve which combatants are inside an AoE spell's area of effect.
 *
 * @param {object}   caster          - the creature casting the spell
 * @param {object}   spellDef        - spell definition with .targeting (structured)
 * @param {{ x: number, y: number }} aoeCenter - where the AoE is placed
 * @param {object[]} allCombatants   - every creature in the encounter
 * @param {object}   [options]       - additional options
 * @param {boolean}  [options.excludeFriendly=true] - exclude same-side combatants
 * @returns {object[]} array of combatants within the AoE (excluding caster, dead)
 */
export function resolveAoETargets(caster, spellDef, aoeCenter, allCombatants, options = {}) {
  const excludeFriendly = options.excludeFriendly !== false
  const targeting = spellDef?.targeting

  if (!targeting || targeting.type !== 'area') return []

  return allCombatants.filter(c => {
    // Never target the caster
    if (c === caster) return false

    // Skip dead combatants
    if (c.currentHP <= 0) return false

    // Skip same-side combatants unless friendly fire is enabled
    if (excludeFriendly && c.side === caster.side) return false

    // Spatial check: is this combatant within the AoE?
    const pos = c.position || { x: 0, y: 0 }
    return geo.isInAoE(pos, aoeCenter, targeting, {
      flying: !!c.flying,
      casterPosition: caster?.position,
    })
  })
}
