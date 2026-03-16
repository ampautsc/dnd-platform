/**
 * EncounterRunner v2 â€” Immutable, zero-trust encounter loop.
 *
 * Orchestrates the full combat encounter:
 *   1. Initiative roll
 *   2. Turn loop: reset â†’ start-of-turn effects â†’ decision â†’ validate+resolve â†’ end-of-turn saves â†’ victory check
 *   3. Analytics
 *
 * Design:
 *   - All state flows through immutable GameState
 *   - Decisions come from injected `getDecision(state, combatantId)` function
 *   - Every decision is validated through TurnMenu before execution
 *   - ActionResolver handles all action execution
 *   - Start-of-turn / end-of-turn processing follows D&D 5e rules:
 *       â€¢ Paralyzed + flying â†’ fall damage
 *       â€¢ Gem Flight timer decrement
 *       â€¢ Concentration duration decrement
 *       â€¢ End-of-turn saves (Hold Person, Dragon Fear)
 *
 * Exports:
 *   rollInitiative(state) â†’ GameState with initiative order
 *   resetTurnState(state, id) â†’ GameState
 *   processStartOfTurn(state, id) â†’ { state, skipped }
 *   processEndOfTurnSaves(state, id) â†’ GameState
 *   checkVictory(state) â†’ { over, winner }
 *   buildAnalytics(state) â†’ analytics[]
 *   runEncounter({ state, getDecision, maxRounds }) â†’ result
 */

import * as dice from '../engine/dice.js'
import * as mech from '../engine/mechanics.js'
import { GameState } from './GameState.js'
import * as TurnMenu from './TurnMenu.js'
import * as ActionResolver from './ActionResolver.js'

const DEFAULT_MAX_ROUNDS = 20

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// REACTION PROCESSING
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * After an action resolves, check if any opposing-side creature wants to react.
 * Reactions are processed immediately and can modify game state.
 *
 * Supported reaction events:
 *   - enemy_attack_roll: an attack hit â†’ Cutting Words / Silvery Barbs can reduce the roll
 *   - enemy_casting_spell: a spell was cast â†’ Counterspell can negate it
 *
 * @param {GameState} state
 * @param {string}    actorId     - who just acted
 * @param {object}    actionResult - { type, hit?, roll?, targetAC?, spellName?, ... }
 * @param {Function}  getReaction  - (state, reactorId, event) â†’ reaction | null
 * @returns {GameState}
 */
export function processReactions(state, actorId, actionResult, getReaction, preSpellState) {
  if (!getReaction || !actionResult) return state

  const actor = state.getCombatant(actorId)
  if (!actor) return state

  let currentState = state

  // â”€â”€ Reaction to Attack Rolls â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (actionResult.type === 'attack' && actionResult.hit) {
    const event = {
      type: 'enemy_attack_roll',
      attackerId: actorId,
      targetId: actionResult.targetId,
      roll: actionResult.roll,
      natural: actionResult.natural,
      targetAC: actionResult.targetAC,
      damage: actionResult.damage,
    }

    // Find allies of the target who can react
    const target = currentState.getCombatant(actionResult.targetId)
    if (target) {
      const reactors = currentState.getAllCombatants().filter(c =>
        c.id !== actorId &&
        c.side === target.side &&
        c.currentHP > 0 &&
        !c.reactedThisRound &&
        !(c.conditions || []).includes('incapacitated') &&
        !(c.conditions || []).includes('paralyzed') &&
        !(c.conditions || []).includes('stunned')
      )

      for (const reactor of reactors) {
        let reaction = null
        try {
          reaction = getReaction(currentState, reactor.id, event)
        } catch (_) { /* ignore reaction errors */ }

        if (reaction) {
          currentState = applyReaction(currentState, reactor.id, actorId, reaction, event)
          break  // Only one reaction per triggering event
        }
      }
    }
  }

  // â”€â”€ Reaction to Multiattack â€” process each sub-attack â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (actionResult.type === 'multiattack' && actionResult.attacks) {
    for (const atk of actionResult.attacks) {
      if (!atk.hit) continue
      const event = {
        type: 'enemy_attack_roll',
        attackerId: actorId,
        targetId: atk.targetId,
        roll: atk.roll,
        natural: atk.natural,
        targetAC: atk.targetAC,
        damage: atk.damage,
      }

      const target = currentState.getCombatant(atk.targetId)
      if (!target) continue

      const reactors = currentState.getAllCombatants().filter(c =>
        c.id !== actorId &&
        c.side === target.side &&
        c.currentHP > 0 &&
        !c.reactedThisRound &&
        !(c.conditions || []).includes('incapacitated') &&
        !(c.conditions || []).includes('paralyzed') &&
        !(c.conditions || []).includes('stunned')
      )

      for (const reactor of reactors) {
        let reaction = null
        try {
          reaction = getReaction(currentState, reactor.id, event)
        } catch (_) {}

        if (reaction) {
          currentState = applyReaction(currentState, reactor.id, actorId, reaction, event)
          break
        }
      }
    }
  }

  // â”€â”€ Reaction to Movement â€” Opportunity Attacks â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (actionResult.type === 'move' && actionResult.opportunityAttackTriggers?.length) {
    for (const reactorId of actionResult.opportunityAttackTriggers) {
      const reactor = currentState.getCombatant(reactorId)
      if (!reactor || reactor.currentHP <= 0 || reactor.reactedThisRound) continue

      const event = {
        type: 'enemy_leaving_melee',
        moverId: actorId,
        moverName: actor?.name ?? 'target',
      }

      let reaction = null
      try {
        reaction = getReaction(currentState, reactorId, event)
      } catch (_) { /* ignore reaction errors */ }

      if (reaction) {
        currentState = applyReaction(currentState, reactorId, actorId, reaction, event)
      }
    }
  }

  // â”€â”€ Reaction to Spell Casting â€” Counterspell â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (actionResult.type === 'spell' && actionResult.spellName) {
    const event = {
      type: 'enemy_casting_spell',
      casterId: actorId,
      spell: actionResult.spellName,
      slotLevel: actionResult.slotLevel,
    }

    const reactors = currentState.getAllCombatants().filter(c =>
      c.id !== actorId &&
      c.side !== actor.side &&
      c.currentHP > 0 &&
      !c.reactedThisRound &&
      !(c.conditions || []).includes('incapacitated') &&
      !(c.conditions || []).includes('paralyzed') &&
      !(c.conditions || []).includes('stunned')
    )

    for (const reactor of reactors) {
      let reaction = null
      try {
        reaction = getReaction(currentState, reactor.id, event)
      } catch (_) {}

      if (reaction) {
        currentState = applyReaction(currentState, reactor.id, actorId, reaction, event, preSpellState)
        break
      }
    }
  }

  return currentState
}

/**
 * Apply a specific reaction to the game state.
 * @param {GameState} state
 * @param {string}    reactorId
 * @param {string}    actorId    - whose action triggered this
 * @param {object}    reaction   - { type: 'cutting_words'|'counterspell'|'silvery_barbs', ... }
 * @param {object}    event      - the triggering event
 * @param {GameState} [preSpellState] - state snapshot BEFORE the spell resolved (for counterspell revert)
 * @returns {GameState}
 */
export function applyReaction(state, reactorId, actorId, reaction, event, preSpellState) {
  const reactor = state.getCombatant(reactorId)
  let currentState = state.withUpdatedCombatant(reactorId, { reactedThisRound: true })

  switch (reaction.type) {
    case 'cutting_words': {
      // Roll bardic inspiration die and subtract from the attack roll
      const biDie = reactor.bardicInspiration?.die || 'd8'
      const biSides = parseInt(biDie.replace('d', ''))
      const reduction = dice.dieFns[biSides]()

      // Deduct BI use (both nested and flat fields for compatibility)
      const newBI = { ...reactor.bardicInspiration, uses: reactor.bardicInspiration.uses - 1 }
      const newBIUses = Math.max(0, (reactor.bardicInspirationUses || 0) - 1)
      currentState = currentState.withUpdatedCombatant(reactorId, {
        bardicInspiration: newBI,
        bardicInspirationUses: newBIUses,
      })

      const effectiveRoll = event.roll - reduction
      const actor = currentState.getCombatant(actorId)
      const target = currentState.getCombatant(event.targetId)

      if (effectiveRoll < event.targetAC) {
        // Attack now misses â€” undo the damage
        const restoredHP = Math.min(target.maxHP, target.currentHP + event.damage)
        currentState = currentState.withUpdatedCombatant(event.targetId, {
          currentHP: restoredHP,
          totalDamageTaken: Math.max(0, (target.totalDamageTaken || 0) - event.damage),
        })
        // Undo attacker's damage dealt tracking
        currentState = currentState.withUpdatedCombatant(actorId, a => ({
          totalDamageDealt: Math.max(0, (a.totalDamageDealt || 0) - event.damage),
          attacksHit: Math.max(0, (a.attacksHit || 0) - 1),
        }))

        currentState = currentState.withLog(
          `  âš¡ ${reactor.name} uses Cutting Words! ${biDie} roll: ${reduction}. ` +
          `Attack roll ${event.roll} â†’ ${effectiveRoll} vs AC ${event.targetAC} â€” now MISSES!`
        )
      } else {
        currentState = currentState.withLog(
          `  âš¡ ${reactor.name} uses Cutting Words! ${biDie} roll: ${reduction}. ` +
          `Attack roll ${event.roll} â†’ ${effectiveRoll} vs AC ${event.targetAC} â€” still hits.`
        )
      }
      break
    }

    case 'counterspell': {
      // Spend the slot
      const slots = { ...reactor.spellSlots }
      const slotLevel = reaction.slotLevel || 3
      slots[slotLevel] = Math.max(0, (slots[slotLevel] || 0) - 1)
      currentState = currentState.withUpdatedCombatant(reactorId, {
        spellSlots: slots,
        spellsCast: (reactor.spellsCast || 0) + 1,
      })

      // Counterspell automatically succeeds if cast at >= spell level, or spell level <= 3
      // For simplicity: auto-success when cast at 3rd level against spells up to 3rd level,
      // otherwise requires ability check. In our sim most enemy spells are â‰¤ 3rd level.
      const enemySpellLevel = event.slotLevel || 1
      const counterLevel = slotLevel
      let success = counterLevel >= enemySpellLevel

      if (!success) {
        // Ability check: d20 + spellcasting mod vs DC 10 + spell level
        const checkDC = 10 + enemySpellLevel
        const spellMod = reactor.chaMod || 3
        const checkRoll = dice.d20() + spellMod
        success = checkRoll >= checkDC
      }

      if (success) {
        // The spell is countered â€” revert ALL spell effects cleanly.
        // We use the pre-spell state snapshot to undo everything, then re-apply
        // only the resource spending (caster's slot + action, reactor's slot + reaction).
        if (preSpellState) {
          // Start from pre-spell state (before any spell effects were applied)
          let reverted = preSpellState

          // Keep the CASTER's slot spent and action used (they tried to cast)
          const casterPostSpell = currentState.getCombatant(actorId)
          reverted = reverted.withUpdatedCombatant(actorId, {
            spellSlots: casterPostSpell.spellSlots,
            usedAction: true,
            spellsCast: casterPostSpell.spellsCast,
          })

          // Apply the REACTOR's Counterspell cost and reaction used
          reverted = reverted.withUpdatedCombatant(reactorId, {
            spellSlots: slots,
            spellsCast: (reactor.spellsCast || 0) + 1,
            reactedThisRound: true,
          })

          reverted = reverted.withLog(
            `  âš¡ ${reactor.name} casts Counterspell (${slotLevel}${ordinalSuffix(slotLevel)} level)! ` +
            `${event.spell} is COUNTERED!`
          )

          return reverted  // Return reverted state directly, bypassing currentState
        }

        // Fallback: no pre-spell state (shouldn't happen but be safe)
        // Use the old partial-undo logic for concentration spells only
        const caster = currentState.getCombatant(actorId)
        if (caster.concentrating === event.spell) {
          const breakResult = ActionResolver.breakConcentration(currentState, actorId)
          currentState = breakResult.state
        }

        currentState = currentState.withLog(
          `  âš¡ ${reactor.name} casts Counterspell (${slotLevel}${ordinalSuffix(slotLevel)} level)! ` +
          `${event.spell} is COUNTERED!`
        )
      } else {
        currentState = currentState.withLog(
          `  âš¡ ${reactor.name} tries Counterspell but fails the check!`
        )
      }
      break
    }

    case 'silvery_barbs': {
      // Silvery Barbs (1st level): force a reroll on a successful attack/save.
      // Spend a 1st level slot
      const slots = { ...reactor.spellSlots }
      const slotLevel = reaction.slotLevel || 1
      slots[slotLevel] = Math.max(0, (slots[slotLevel] || 0) - 1)
      currentState = currentState.withUpdatedCombatant(reactorId, {
        spellSlots: slots,
        spellsCast: (reactor.spellsCast || 0) + 1,
      })

      if (event.type === 'enemy_attack_roll') {
        // Force attacker to reroll attack â€” use a new d20 roll
        const reroll = dice.d20()
        const rerollTotal = reroll + (event.roll - event.natural)  // add same attack bonus
        const actor = currentState.getCombatant(actorId)
        const target = currentState.getCombatant(event.targetId)

        if (rerollTotal < event.targetAC) {
          // Attack now misses â€” undo the damage
          const restoredHP = Math.min(target.maxHP, target.currentHP + event.damage)
          currentState = currentState.withUpdatedCombatant(event.targetId, {
            currentHP: restoredHP,
            totalDamageTaken: Math.max(0, (target.totalDamageTaken || 0) - event.damage),
          })
          currentState = currentState.withUpdatedCombatant(actorId, a => ({
            totalDamageDealt: Math.max(0, (a.totalDamageDealt || 0) - event.damage),
            attacksHit: Math.max(0, (a.attacksHit || 0) - 1),
          }))

          currentState = currentState.withLog(
            `  âš¡ ${reactor.name} casts Silvery Barbs! Forced reroll: d20:${reroll} total ${rerollTotal} ` +
            `vs AC ${event.targetAC} â€” now MISSES!`
          )
        } else {
          currentState = currentState.withLog(
            `  âš¡ ${reactor.name} casts Silvery Barbs! Forced reroll: d20:${reroll} total ${rerollTotal} ` +
            `vs AC ${event.targetAC} â€” still hits.`
          )
        }
      }
      break
    }

    case 'opportunity_attack': {
      // An opportunity attack uses the reactor's reaction (not their action).
      // We use _resolveAttack which sets usedAction:true â€” we restore it afterward.
      const weapon = reactor.weapons?.[0]
      if (!weapon) break
      const oaTarget = currentState.getCombatant(actorId)
      if (!oaTarget || oaTarget.currentHP <= 0) break

      currentState = currentState.withLog(
        `  âš¡ ${reactor.name} makes an opportunity attack as ${oaTarget.name} leaves their reach!`
      )

      const savedUsedAction = reactor.usedAction
      const attackOpt = {
        type: 'attack',
        optionId: 'opportunity-attack',
        category: 'reaction',
        weaponIndex: 0,
        weaponName: weapon.name,
        targetId: actorId,
        targetName: oaTarget.name,
      }
      const atkRes = ActionResolver.resolveAttack(currentState, reactorId, attackOpt)
      // Restore usedAction â€” OA spends the reaction, not the action
      currentState = atkRes.state.withUpdatedCombatant(reactorId, { usedAction: savedUsedAction })
      break
    }

    default:
      break
  }

  return currentState
}

function ordinalSuffix(n) {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return s[(v - 20) % 10] || s[v] || s[0]
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// INITIATIVE
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * Roll initiative for all combatants and set the initiative order on the state.
 * @param {GameState} state
 * @returns {GameState} with initiativeOrder set and a log entry
 */
export function rollInitiative(state) {
  const combatants = state.getAllCombatants()
  const entries = combatants
    .map(c => ({
      id: c.id,
      name: c.name,
      roll: dice.d20(),
      mod: c.dexMod !== undefined ? c.dexMod : mech.abilityModifier(c.dex || 10),
    }))
    .map(e => ({ ...e, total: e.roll + e.mod }))
    .sort((a, b) => b.total - a.total)

  const order = entries.map(e => e.id)
  const logEntries = [
    '=== INITIATIVE ===',
    ...entries.map(e => `  ${e.name}: ${e.total} (d20:${e.roll} + ${e.mod})`),
  ]

  return state
    .withInitiativeOrder(order)
    .withLogEntries(logEntries)
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// TURN STATE RESET
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * Reset per-turn flags for the active combatant.
 * Clears: usedAction, usedBonusAction, movementRemaining, reactedThisRound,
 *         vm_disadvantage, dodging, bonusActionSpellCastThisTurn, disengaged
 * @param {GameState} state
 * @param {string} id
 * @returns {GameState}
 */
export function resetTurnState(state, id) {
  const creature = state.getCombatant(id)
  // Note: vm_disadvantage is NOT cleared here â€” it persists until the creature
  // makes its first attack roll, then is consumed by resolveAttack/resolveMultiattack.
  const conditions = (creature.conditions || [])
    .filter(c => c !== 'dodging')

  return state.withUpdatedCombatant(id, {
    usedAction: false,
    usedBonusAction: false,
    movementRemaining: creature.speed || 30,
    reactedThisRound: false,
    bonusActionSpellCastThisTurn: false,
    disengaged: false,
    multiattackWeaponsUsed: [],
    multiattackBiteTargetId: null,
    conditions,
  })
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// START-OF-TURN PROCESSING
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * Process start-of-turn effects:
 *   - Paralyzed + flying â†’ fall damage
 *   - Gem Flight timer
 *   - Concentration duration
 *
 * @param {GameState} state
 * @param {string} id
 * @returns {{ state: GameState, skipped: boolean }}
 */
export function processStartOfTurn(state, id) {
  let currentState = state
  const creature = currentState.getCombatant(id)
  const logs = []

  // 1. Paralyzed + flying â†’ fall
  if (creature.flying && (creature.conditions || []).includes('paralyzed')) {
    const conditions = [...(creature.conditions || []), 'prone']
    const fallDmg = mech.rollDamage('2d6', 0, false).total
    const newHP = Math.max(0, creature.currentHP - fallDmg)

    currentState = currentState.withUpdatedCombatant(id, {
      flying: false,
      gemFlight: creature.gemFlight
        ? { ...creature.gemFlight, active: false, roundsRemaining: 0 }
        : undefined,
      conditions,
      currentHP: newHP,
    })

    logs.push(`${creature.name} is paralyzed and falls! ${fallDmg} falling damage. HP: ${newHP}/${creature.maxHP}`)

    // Check if dead from fall
    if (newHP <= 0) {
      return { state: currentState.withLogEntries(logs), skipped: true }
    }

    return { state: currentState.withLogEntries(logs), skipped: false }
  }

  // 2. Gem Flight duration
  if (creature.gemFlight && creature.gemFlight.active) {
    const remaining = (creature.gemFlight.roundsRemaining || 0) - 1
    if (remaining <= 0) {
      currentState = currentState.withUpdatedCombatant(id, {
        gemFlight: { ...creature.gemFlight, active: false, roundsRemaining: 0 },
        flying: false,
      })
      logs.push(`${creature.name}'s Gem Flight expires.`)
    } else {
      currentState = currentState.withUpdatedCombatant(id, {
        gemFlight: { ...creature.gemFlight, roundsRemaining: remaining },
      })
    }
  }

  // 3. Concentration timer
  const updatedCreature = currentState.getCombatant(id)
  if (updatedCreature.concentrating && updatedCreature.concentrationRoundsRemaining > 0) {
    const remaining = updatedCreature.concentrationRoundsRemaining - 1
    if (remaining <= 0) {
      logs.push(`${updatedCreature.name}'s ${updatedCreature.concentrating} expires.`)
      const breakResult = ActionResolver.breakConcentration(currentState, id)
      currentState = breakResult.state
      logs.push(...breakResult.logs)
    } else {
      currentState = currentState.withUpdatedCombatant(id, {
        concentrationRoundsRemaining: remaining,
      })
    }
  }

  return { state: currentState.withLogEntries(logs), skipped: false }
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// END-OF-TURN SAVES
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * Process end-of-turn saving throws:
 *   - Paralyzed â†’ WIS save vs Hold Person DC
 *   - Frightened â†’ WIS save vs Dragon Fear DC
 *
 * @param {GameState} state
 * @param {string} id
 * @returns {GameState}
 */
export function processEndOfTurnSaves(state, id) {
  let currentState = state
  const creature = currentState.getCombatant(id)
  const logs = []

  // Paralyzed â†’ WIS save vs Hold Person
  if ((creature.conditions || []).includes('paralyzed')) {
    const allCombatants = currentState.getAllCombatants()
    const caster = allCombatants.find(c => c.concentrating === 'Hold Person')
    if (caster) {
      const dc = caster.spellSaveDC || 10
      const mod = (creature.saves ? creature.saves.wis : mech.abilityModifier(creature.wis || 10)) || 0
      const raw = dice.d20()
      const roll = raw + mod

      if (roll >= dc) {
        const newConditions = (creature.conditions || []).filter(c => c !== 'paralyzed')
        currentState = currentState.withUpdatedCombatant(id, { conditions: newConditions })
        logs.push(`${creature.name} WIS save vs Hold Person: [d20:${raw}+${mod}=${roll} vs DC ${dc}] SUCCESS â€” no longer paralyzed.`)
      } else {
        logs.push(`${creature.name} WIS save vs Hold Person: [d20:${raw}+${mod}=${roll} vs DC ${dc}] FAIL â€” still paralyzed.`)
      }
    }
  }

  // Frightened â†’ WIS save vs Dragon Fear
  const updatedCreature = currentState.getCombatant(id)
  if ((updatedCreature.conditions || []).includes('frightened')) {
    const allCombatants = currentState.getAllCombatants()
    const source = allCombatants.find(c => c.dragonFear && c.id !== id)
    if (source && source.dragonFear) {
      const dc = source.dragonFear.dc || 10
      const mod = (updatedCreature.saves ? updatedCreature.saves.wis : mech.abilityModifier(updatedCreature.wis || 10)) || 0
      // Dark Devotion: advantage on saves vs frightened
      const hasAdv = !!updatedCreature.darkDevotion
      const raw = hasAdv ? Math.max(dice.d20(), dice.d20()) : dice.d20()
      const roll = raw + mod

      if (roll >= dc) {
        const newConditions = (updatedCreature.conditions || []).filter(c => c !== 'frightened')
        currentState = currentState.withUpdatedCombatant(id, { conditions: newConditions })
        logs.push(`${updatedCreature.name} WIS save vs Dragon Fear: [${roll} vs DC ${dc}] SUCCESS â€” no longer frightened.`)
      } else {
        logs.push(`${updatedCreature.name} WIS save vs Dragon Fear: [${roll} vs DC ${dc}] FAIL â€” still frightened.`)
      }
    }
  }

  if (logs.length > 0) {
    return currentState.withLogEntries(logs)
  }
  return currentState
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// VICTORY CHECK
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * Check if the encounter is over.
 * @param {GameState} state
 * @returns {{ over: boolean, winner: string|null }}
 */
export function checkVictory(state) {
  const all = state.getAllCombatants()
  const partyAlive = all.filter(c => c.side === 'party' && c.currentHP > 0)
  const enemyAlive = all.filter(c => c.side === 'enemy' && c.currentHP > 0)

  if (partyAlive.length === 0) return { over: true, winner: 'enemy' }
  if (enemyAlive.length === 0) return { over: true, winner: 'party' }

  // Late-game victory: if round 15+ and all living enemies are incapacitated,
  // the party effectively wins (they can finish them off at their leisure)
  if (state.round >= 15) {
    const allEnemyIncapacitated = enemyAlive.every(c =>
      (c.conditions || []).some(cond =>
        cond === 'paralyzed' || cond === 'incapacitated' || cond === 'stunned'
      )
    )
    if (allEnemyIncapacitated) return { over: true, winner: 'party' }
  }

  return { over: false, winner: null }
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// ANALYTICS
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * Build per-combatant analytics from the final game state.
 * @param {GameState} state
 * @returns {Array<object>}
 */
export function buildAnalytics(state) {
  return state.getAllCombatants().map(c => {
    const made = c.attacksMade || 0
    const hit = c.attacksHit || 0
    return {
      id: c.id,
      name: c.name,
      side: c.side,
      survived: c.currentHP > 0,
      finalHP: c.currentHP,
      maxHP: c.maxHP,
      damageDealt: c.totalDamageDealt || 0,
      damageTaken: c.totalDamageTaken || 0,
      attacksMade: made,
      attacksHit: hit,
      hitRate: made > 0 ? Math.round((hit / made) * 100) : 0,
      spellsCast: c.spellsCast || 0,
    }
  })
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// MAIN ENCOUNTER LOOP
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * Run a full encounter.
 *
 * @param {object} options
 * @param {GameState}   options.state        - Initial game state
 * @param {Function}    options.getDecision  - (state, combatantId) â†’ choice object { optionId, targetId?, ... }
 * @param {Function}    [options.getReaction] - (state, reactorId, event) â†’ reaction | null
 * @param {number}      [options.maxRounds]  - Max rounds before forced draw (default: 20)
 * @returns {{ winner, rounds, log, analytics, snapshots, finalState }}
 */
export function runEncounter(options) {
  const {
    state: initialState,
    getDecision,
    getReaction = null,
    maxRounds = DEFAULT_MAX_ROUNDS,
  } = options

  // Roll initiative and normalize to round 0
  let state = rollInitiative(initialState).withRound(0)
  let winner = null

  // Snapshot helper
  const snapshots = []
  const snap = (st, phase) => ({
    round: st.round,
    phase,
    combatants: st.getAllCombatants().map(c => ({
      id: c.id,
      name: c.name,
      side: c.side,
      currentHP: c.currentHP,
      maxHP: c.maxHP,
      conditions: [...(c.conditions || [])],
      position: c.position ? { ...c.position } : { x: 0, y: 0 },
      flying: !!c.flying,
    })),
  })

  snapshots.push(snap(state, 'start'))

  while (state.round < maxRounds && !winner) {
    state = state.withRound(state.round + 1)
    state = state.withLog(`\n=== ROUND ${state.round} ===`)

    for (const actorId of state.initiativeOrder) {
      const actor = state.getCombatant(actorId)
      if (!actor || actor.currentHP <= 0) continue

      // Reset turn state
      state = resetTurnState(state, actorId)

      // Process start of turn
      const sotResult = processStartOfTurn(state, actorId)
      state = sotResult.state

      // Check if actor died from start-of-turn effects (fall damage)
      const postSotActor = state.getCombatant(actorId)
      if (postSotActor.currentHP <= 0) continue

      // Incapacitated creatures skip but still get end-of-turn saves
      if (TurnMenu.isIncapacitated(postSotActor)) {
        state = state.withLog(`${postSotActor.name} is incapacitated â€” skipping turn.`)
        state = processEndOfTurnSaves(state, actorId)
        // Victory check after saves
        const vc = checkVictory(state)
        if (vc.over) { winner = vc.winner; break }
        continue
      }

      state = state.withLog(`\n  --- ${postSotActor.name}'s turn ---`)

      // Get decision (may return multiple phases: movement, action, bonusAction)
      let decision = null
      try {
        decision = getDecision(state, actorId)
      } catch (err) {
        state = state.withLog(`ERROR in getDecision for ${postSotActor.name}: ${err.message}`)
      }

      if (decision) {
        // Movement phase
        if (decision.movement) {
          try {
            const moveResult = ActionResolver.resolve(state, actorId, decision.movement)
            state = moveResult.state
          } catch (err) {
            state = state.withLog(`Movement error: ${err.message}`)
          }
        }

        // Action phase
        if (decision.action) {
          try {
            const preActionState = state  // Snapshot for counterspell revert
            const actionResult = ActionResolver.resolve(state, actorId, decision.action)
            state = actionResult.state
            // Process reactions to the action (Cutting Words, Counterspell, Silvery Barbs)
            if (getReaction) {
              state = processReactions(state, actorId, actionResult.result, getReaction, preActionState)
            }
          } catch (err) {
            state = state.withLog(`Action error: ${err.message}`)
          }
        }

        // Bonus action phase
        if (decision.bonusAction) {
          try {
            const preBaState = state  // Snapshot for counterspell on BA spells
            const baResult = ActionResolver.resolve(state, actorId, decision.bonusAction)
            state = baResult.state
            // Process reactions to the bonus action
            if (getReaction) {
              state = processReactions(state, actorId, baResult.result, getReaction, preBaState)
            }
          } catch (err) {
            state = state.withLog(`Bonus action error: ${err.message}`)
          }
        }
      } else {
        state = state.withLog(`${postSotActor.name} takes no action.`)
      }

      // End-of-turn saves
      state = processEndOfTurnSaves(state, actorId)

      // Victory check after each turn
      const vc = checkVictory(state)
      if (vc.over) { winner = vc.winner; break }
    }

    // End-of-round snapshot
    snapshots.push(snap(state, 'end'))

    // Victory check at end of round
    if (!winner) {
      const vc = checkVictory(state)
      if (vc.over) winner = vc.winner
    }
  }

  if (!winner) winner = 'draw'

  state = state.withLog(`\n=== ENCOUNTER ENDED â€” Winner: ${winner.toUpperCase()} after ${state.round} rounds ===`)

  return {
    winner,
    rounds: state.round,
    log: state.log,
    analytics: buildAnalytics(state),
    snapshots,
    finalState: state,
  }
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// EXPORTS
