/**
 * TacticsAdapter â€” Bridge between v1 AI tactics and v2 menu-based engine.
 *
 * The v1 tactics system (tactics.js) produces decision objects like:
 *   { action: { spell: 'Hold Person', level: 2, target: obj }, bonusAction: { type: 'gem_flight' } }
 *
 * The v2 engine requires validated menu choices like:
 *   { action: { optionId: 'action-5', targetId: 'enemy1' }, bonusAction: { optionId: 'bonus-3' } }
 *
 * This adapter:
 *   1. Calls v1 tactics to get a decision for the active combatant
 *   2. Queries TurnMenu for available options
 *   3. Maps v1 decision fields to matching menu option IDs
 *   4. Falls back gracefully when v1 decisions don't match available menu options
 *
 * Exports:
 *   adaptDecision(state, combatantId, v1Decision) â†’ v2 choice | null
 *   makeAdaptedAI(profileMap) â†’ getDecision(state, combatantId) for EncounterRunner v2
 */

import * as tactics from '../ai/tactics.js'
import * as TurnMenu from './TurnMenu.js'
import * as ActionResolver from './ActionResolver.js'
import * as mech from '../engine/mechanics.js'

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// OPTION MATCHING
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * Find a menu action option that matches a v1 action decision.
 *
 * @param {Array} options - TurnMenu action or bonus action options
 * @param {object} v1Action - v1 decision action, e.g. { type: 'attack', target: creatureObj }
 * @param {GameState} state - current game state for target ID resolution
 * @returns {object|null} - { optionId, targetId?, aoeCenter? } or null
 */
export function matchAction(options, v1Action, state) {
  if (!v1Action || !options || options.length === 0) return null

  const type = v1Action.type
  const spellName = v1Action.spell

  // â”€â”€ Weapon Attack â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (type === 'attack') {
    const targetId = v1Action.target?.id
    if (!targetId) return null

    // Try to match weapon attack to target
    const match = options.find(o =>
      o.type === 'attack' && o.targetId === targetId
    )
    if (match) return { optionId: match.optionId }

    // Fallback: any attack on this target
    const anyAttack = options.find(o =>
      (o.type === 'attack' || o.type === 'multiattack') && o.targetId === targetId
    )
    if (anyAttack) return { optionId: anyAttack.optionId }

    // Fallback: attack a different enemy
    const anyEnemy = options.find(o => o.type === 'attack')
    if (anyEnemy) return { optionId: anyEnemy.optionId }

    return null
  }

  // â”€â”€ Multiattack â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (type === 'multiattack') {
    const targetId = v1Action.target?.id
    const match = options.find(o =>
      o.type === 'multiattack' && o.targetId === targetId
    )
    if (match) return { optionId: match.optionId }

    // Fallback: multiattack any valid target
    const anyMulti = options.find(o => o.type === 'multiattack')
    if (anyMulti) return { optionId: anyMulti.optionId }

    // Fallback: regular attack on same target
    if (targetId) {
      const regular = options.find(o => o.type === 'attack' && o.targetId === targetId)
      if (regular) return { optionId: regular.optionId }
    }

    return null
  }

  // â”€â”€ Dodge â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (type === 'dodge') {
    const match = options.find(o => o.type === 'dodge')
    return match ? { optionId: match.optionId } : null
  }

  // â”€â”€ Dash â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (type === 'dash') {
    const match = options.find(o => o.type === 'dash')
    return match ? { optionId: match.optionId } : null
  }

  // â”€â”€ Disengage â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (type === 'disengage') {
    const match = options.find(o => o.type === 'disengage')
    return match ? { optionId: match.optionId } : null
  }

  // â”€â”€ Spell (via .spell field â€” covers both explicit type and implicit)
  if (spellName || type === 'cast_spell') {
    const name = spellName || v1Action.spellName
    return matchSpellOption(options, name, v1Action, state)
  }

  // â”€â”€ v1 special actions â”€â”€â”€â”€
  if (type === 'shake_awake') {
    const target = v1Action.target
    if (!target) return null
    const match = options.find(o => o.type === 'shake_awake' && o.targetId === target.id)
    return match || null
  }

  if (type === 'breath_weapon') {
    const match = options.find(o => o.type === 'breath_weapon')
    if (!match) return null
    const choice = { optionId: match.optionId }
    if (v1Action.aoeCenter) choice.aoeCenter = v1Action.aoeCenter
    return choice
  }

  if (type === 'dragon_fear') {
    const match = options.find(o => o.type === 'dragon_fear')
    if (!match) return null
    const choice = { optionId: match.optionId }
    if (v1Action.aoeCenter) choice.aoeCenter = v1Action.aoeCenter
    return choice
  }

  return null
}

/**
 * Match a spell from the v1 decision to a menu spell option.
 */
export function matchSpellOption(options, spellName, v1Action, state) {
  if (!spellName) return null

  const slotLevel = v1Action.level || 0
  const targetId = v1Action.target?.id
  const aoeCenter = v1Action.aoeCenter

  // Exact match: spell name + slot level
  let match = options.find(o =>
    o.type === 'spell' &&
    o.spellName === spellName &&
    o.slotLevel === slotLevel
  )

  // Relaxed match: just spell name (any slot level)
  if (!match) {
    match = options.find(o =>
      o.type === 'spell' && o.spellName === spellName
    )
  }

  if (!match) return null

  // Build the choice object based on targeting type
  const choice = { optionId: match.optionId }

  if (match.targetType === 'single') {
    if (targetId) {
      // Verify target is in validTargets
      const isValid = match.validTargets?.some(t => t.id === targetId)
      if (isValid) {
        choice.targetId = targetId
      } else if (match.validTargets?.length > 0) {
        // Fallback: pick first valid target
        choice.targetId = match.validTargets[0].id
      }
    } else if (match.validTargets?.length > 0) {
      // v1 didn't specify a target â€” auto-select from valid targets
      choice.targetId = match.validTargets[0].id
    }

    // Safety: single-target spell MUST have a targetId or it will fail validation
    if (!choice.targetId) return null
  }

  if (match.targetType === 'area' && aoeCenter) {
    choice.aoeCenter = aoeCenter
  }

  return choice
}

/**
 * Match a v1 bonus action to a v2 menu option.
 */
export function matchBonusAction(options, v1BonusAction, state) {
  if (!v1BonusAction || !options || options.length === 0) return null

  const type = v1BonusAction.type
  const spellName = v1BonusAction.spell

  // â”€â”€ Gem Flight â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (type === 'gem_flight') {
    const match = options.find(o => o.type === 'gemFlight')
    return match ? { optionId: match.optionId } : null
  }

  // â”€â”€ Cast Healing Word â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (type === 'cast_healing_word' || spellName === 'Healing Word') {
    return matchSpellOption(options, 'Healing Word', v1BonusAction, state)
  }

  // â”€â”€ Spiritual Weapon â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (spellName === 'Spiritual Weapon') {
    return matchSpellOption(options, 'Spiritual Weapon', v1BonusAction, state)
  }

  // â”€â”€ Misty Step â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (spellName === 'Misty Step') {
    return matchSpellOption(options, 'Misty Step', v1BonusAction, state)
  }

  // â”€â”€ Generic spell bonus action â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (spellName) {
    return matchSpellOption(options, spellName, v1BonusAction, state)
  }

  return null
}

/**
 * Translate a v1 movement decision into a v2 position.
 * v1 uses `{ type: 'move_toward', target: creatureObj }`.
 * v2 uses `{ optionId: 'move-to', position: { x, y } }`.
 */
export function matchMovement(movementOptions, v1Movement, actorId, state) {
  if (!v1Movement || !movementOptions || movementOptions.length === 0) return null
  if (v1Movement.type !== 'move_toward' || !v1Movement.target) return null

  const moveOption = movementOptions.find(o => o.type === 'move')
  if (!moveOption) return null

  const actor = state.getCombatant(actorId)
  const target = v1Movement.target
  const targetPos = target.position || { x: 0, y: 0 }
  const actorPos = actor.position || { x: 0, y: 0 }

  // Compute move position: move toward target, up to movementRemaining
  const speed = actor.movementRemaining || 30
  const maxSquares = Math.max(1, Math.floor(speed / 5))

  const dx = targetPos.x - actorPos.x
  const dy = targetPos.y - actorPos.y
  const dist = Math.max(Math.abs(dx), Math.abs(dy))
  const steps = Math.min(maxSquares, dist)

  if (steps === 0) return null

  const sx = Math.sign(dx)
  const sy = Math.sign(dy)
  const newPos = {
    x: actorPos.x + sx * steps,
    y: actorPos.y + sy * steps,
  }

  const result = { optionId: 'move-to', position: newPos }

  // Auto-land when a flying creature moves toward a ground target for melee
  if (actor.flying && !target.flying) {
    result.land = true
  }

  return result
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// MAIN ADAPTER
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * Adapt a v1 tactical decision into a v2 menu-validated choice.
 *
 * IMPORTANT: When movement is involved, action/bonus-action menus are generated
 * from a post-movement state projection so that optionIds are stable across
 * the movement â†’ action sequence in EncounterRunner.
 *
 * @param {GameState} state        - Current game state
 * @param {string}    combatantId  - Who is acting
 * @param {object}    v1Decision   - The v1 tactics decision { action, bonusAction, movement, reasoning }
 * @returns {object|null} - { action?, bonusAction?, movement? } with v2 choice shapes, or null
 */
export function adaptDecision(state, combatantId, v1Decision) {
  if (!v1Decision) return null

  const result = {}
  let hasAny = false

  // â”€â”€ Map movement first (needed to project post-move state) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  let postMoveState = state
  if (v1Decision.movement) {
    const preMenu = TurnMenu.getMenu(state, combatantId)
    const moveChoice = matchMovement(preMenu.movements, v1Decision.movement, combatantId, state)
    if (moveChoice) {
      result.movement = moveChoice
      hasAny = true

      // Project state after movement so action/BA menus use post-move position
      try {
        const moveResult = ActionResolver.resolve(state, combatantId, moveChoice)
        postMoveState = moveResult.state
      } catch (_) {
        // If movement projection fails, fall back to pre-move state for menus
        postMoveState = state
      }
    }
  }

  // Use post-move state for action and bonus action menus
  const menu = TurnMenu.getMenu(postMoveState, combatantId)

  // â”€â”€ Map action â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (v1Decision.action) {
    const actionChoice = matchAction(menu.actions, v1Decision.action, postMoveState)
    if (actionChoice) {
      result.action = actionChoice
      hasAny = true
    }
  }

  // â”€â”€ Map bonus action â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (v1Decision.bonusAction) {
    const baChoice = matchBonusAction(menu.bonusActions, v1Decision.bonusAction, postMoveState)
    if (baChoice) {
      result.bonusAction = baChoice
      hasAny = true
    }
  }

  // â”€â”€ Fallback: if v1 gave a main action but we couldn't match, try dodge
  if (v1Decision.action && !result.action) {
    const dodge = menu.actions.find(o => o.type === 'dodge')
    if (dodge) {
      result.action = { optionId: dodge.optionId }
      hasAny = true
    }
  }

  return hasAny ? result : null
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// AI FACTORY
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * Create a getDecision function for EncounterRunner v2 that uses v1 tactics.
 *
 * @param {object|Function} profileMap - { [creatureId]: profileKey } or (creature) => profileKey
 * @returns {Function} getDecision(state, combatantId) â†’ v2 choice | null
 */
export function makeAdaptedAI(profileMap) {
  const resolveProfile = typeof profileMap === 'function'
    ? profileMap
    : (creature) => profileMap[creature.id] || creature.tacticsProfile || 'generic_melee'

  return function getDecision(state, combatantId) {
    const creature = state.getCombatant(combatantId)
    if (!creature) return null

    const profileKey = resolveProfile(creature) || 'generic_melee'

    // Build v1-compatible context: allCombatants as mutable array
    const allCombatants = state.getAllCombatants()
    const round = state.round

    // Run v1 tactics engine
    let v1Decision = null
    try {
      v1Decision = tactics.makeDecision(profileKey, creature, allCombatants, round)
    } catch (err) {
      // Fallback to generic_melee on error
      try {
        v1Decision = tactics.makeDecision('generic_melee', creature, allCombatants, round)
      } catch (_) {
        return null
      }
    }

    if (!v1Decision) return null

    // Adapt v1 decision to v2 menu choices
    return adaptDecision(state, combatantId, v1Decision)
  }
}

/**
 * Create a getReaction function for EncounterRunner v2 that uses v1 reaction tactics.
 *
 * Adapts the v2 signature getReaction(state, reactorId, event)
 * to the v1 signature getReaction(creature, event).
 *
 * @param {object|Function} profileMap - { [creatureId]: profileKey } or (creature) => profileKey
 * @returns {Function} getReaction(state, reactorId, event) â†’ reaction | null
 */
export function makeAdaptedReactionAI(profileMap) {
  const v1ReactionAI = tactics.makeReactionAI(profileMap)

  return function getReaction(state, reactorId, event) {
    const creature = state.getCombatant(reactorId)
    if (!creature) return null
    return v1ReactionAI(creature, event)
  }
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// EXPORTS
