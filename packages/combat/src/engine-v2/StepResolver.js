/**
 * StepResolver â€” Step-by-step action resolution with dice requests.
 *
 * The core design insight: D&D dice rolls are CONDITIONAL.
 * You only roll damage if you hit. You only roll a concentration save if the
 * target was concentrating AND took damage. A crit doubles the dice count.
 *
 * StepResolver breaks each action into sequential "steps" where each step
 * may require dice. It yields a DiceRequest, waits for results, then continues
 * to the next step based on the outcome.
 *
 * Flow:
 *   1. Client submits a choice (action + targets)
 *   2. StepResolver starts resolving, hits the first dice need
 *   3. Returns { pendingDice, displayDice, phase, ... } â€” engine pauses
 *   4. Client provides dice results (seeds for player, auto-rolled for enemies)
 *   5. StepResolver continues from where it left off
 *   6. Repeat until action is fully resolved
 *   7. Returns final { state, result } â€” no more dice needed
 *
 * This module does NOT touch the session layer â€” it operates purely on
 * GameState + choice â†’ steps. The CombatSessionManager orchestrates the
 * pause/resume lifecycle and decides which dice need player interaction.
 *
 * Key types:
 *   DiceRequest = {
 *     reason: string,        // 'attack_roll', 'damage', 'saving_throw', 'concentration_save'
 *     dice: Array<{ type: string, count: number }>,  // e.g. [{type:'d20',count:1}] or [{type:'d8',count:2}]
 *     modifier: number,      // flat bonus to add after roll
 *     owner: string,         // combatantId who "owns" this roll
 *     label: string,         // human-readable e.g. "Aldric attacks Goblin with Greataxe"
 *     context: object,       // opaque state needed to continue resolution
 *   }
 *
 *   DiceResult = {
 *     rolls: number[],       // individual die results, e.g. [14] or [3, 5]
 *   }
 *
 *   Step = {
 *     diceRequest: DiceRequest | null,  // null means no dice needed for this step
 *     apply: (state, diceResult?) => { state, logs, nextStep?, result? }
 *   }
 */

import * as mech from '../engine/mechanics.js'
import * as dice from '../engine/dice.js'
import * as TurnMenu from './TurnMenu.js'
import * as ActionResolver from './ActionResolver.js'
import { GameState } from './GameState.js'

// â”€â”€ Step Context â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Each in-flight action is tracked as a StepContext â€” a serializable object
// that captures where we are in the resolution chain.

/**
 * @typedef {Object} StepContext
 * @property {string}   actionType      - 'attack', 'spell', 'breath_weapon', etc.
 * @property {string}   actorId         - who is acting
 * @property {Object}   choice          - original choice object
 * @property {Object}   option          - validated TurnMenu option
 * @property {string}   phase           - where in the multi-step chain we are
 * @property {Object}   accumulated     - accumulated results from earlier steps
 * @property {Object}   stateSnapshot   - serialized state for resumption (or null if held in-memory)
 */

// â”€â”€ Public API â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * Begin resolving an action. Returns either a completed result or a pending
 * dice request that must be fulfilled before continuing.
 *
 * @param {GameState} state
 * @param {string}    combatantId
 * @param {Object}    choice       - { optionId, targetId?, aoeCenter?, position? }
 * @returns {StepResult}
 */
export function beginResolve(state, combatantId, choice) {
  const validation = TurnMenu.validateChoice(state, combatantId, choice)
  if (!validation.valid) {
    throw new Error(`Invalid choice: ${validation.reason}`)
  }

  const option = validation.option
  const actor = state.getCombatant(combatantId)

  // Actions that need no dice â€” resolve immediately via ActionResolver  
  const noDiceTypes = new Set([
    'dodge', 'dash', 'disengage', 'move', 'hold',
    'bardicInspiration', 'gemFlight', 'shake_awake', 'loot_corpse', 'endTurn',
  ])

  if (noDiceTypes.has(option.type)) {
    const resolution = ActionResolver.resolve(state, combatantId, choice)
    return {
      done: true,
      state: resolution.state,
      result: resolution.result,
      diceRequests: [],     // all dice that were rolled (for display)
      pendingDice: null,    // nothing pending
    }
  }

  // Dice-requiring actions â€” build the first step
  switch (option.type) {
    case 'attack':
      return _beginAttack(state, combatantId, option, choice)
    case 'multiattack':
      return _beginMultiattack(state, combatantId, option, choice)
    case 'spell':
      return _beginSpell(state, combatantId, option, choice)
    case 'breath_weapon':
      return _beginBreathWeapon(state, combatantId, option, choice)
    case 'dragon_fear':
      return _beginDragonFear(state, combatantId, option, choice)
    default:
      // Fallback: anything we haven't step-ified yet â€” resolve synchronously
      const resolution = ActionResolver.resolve(state, combatantId, choice)
      return {
        done: true,
        state: resolution.state,
        result: resolution.result,
        diceRequests: [],
        pendingDice: null,
      }
  }
}

/**
 * Continue resolving an action after dice have been provided.
 *
 * @param {StepContext}  context    - the context from the previous step
 * @param {DiceResult}   diceResult - { rolls: number[] } from the player/auto-roller
 * @returns {StepResult}
 */
export function continueResolve(context, diceResult) {
  switch (context.actionType) {
    case 'attack':
      return _continueAttack(context, diceResult)
    case 'multiattack':
      return _continueMultiattack(context, diceResult)
    case 'spell':
      return _continueSpell(context, diceResult)
    case 'breath_weapon':
      return _continueBreathWeapon(context, diceResult)
    case 'dragon_fear':
      return _continueDragonFear(context, diceResult)
    default:
      throw new Error(`Cannot continue unknown action type: ${context.actionType}`)
  }
}

// â”€â”€ Attack Resolution (stepped) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function _beginAttack(state, attackerId, option, choice) {
  const attacker = state.getCombatant(attackerId)
  const target = state.getCombatant(option.targetId)
  const weapon = attacker.weapons[option.weaponIndex]

  // Compute advantage/disadvantage
  const advDisadv = _computeAdvantage(attacker, target, state)
  const diceCount = (advDisadv.hasAdv !== advDisadv.hasDisadv) ? 2 : 1

  return {
    done: false,
    pendingDice: {
      reason: 'attack_roll',
      dice: [{ type: 'd20', count: diceCount }],
      modifier: weapon.attackBonus || 0,
      owner: attackerId,
      label: `${attacker.name} attacks ${target.name} with ${weapon.name}`,
      targetAC: target.ac,
      advantage: advDisadv.hasAdv && !advDisadv.hasDisadv ? 'advantage' :
                 advDisadv.hasDisadv && !advDisadv.hasAdv ? 'disadvantage' : 'normal',
    },
    diceRequests: [],
    context: {
      actionType: 'attack',
      actorId: attackerId,
      choice,
      option,
      phase: 'attack_roll',
      state: _serializeState(state),
      accumulated: {
        weapon,
        targetId: option.targetId,
        advDisadv,
        forceCrit: _isForceCrit(attacker, target, state),
      },
    },
  }
}

function _continueAttack(context, diceResult) {
  const state = _deserializeState(context.state)
  const { weapon, targetId, advDisadv, forceCrit } = context.accumulated
  const attackerId = context.actorId
  const attacker = state.getCombatant(attackerId)
  const target = state.getCombatant(targetId)

  if (context.phase === 'attack_roll') {
    // Interpret the d20 result
    const natural = _interpretD20(diceResult.rolls, advDisadv)
    const total = natural + (weapon.attackBonus || 0)
    const isCrit = forceCrit || natural === 20
    const isMiss = natural === 1
    const hits = isCrit || (!isMiss && total >= target.ac)

    // Consume vm_disadvantage
    let newState = state
    if (advDisadv.hasVmDisadv) {
      const newConds = (attacker.conditions || []).filter(c => c !== 'vm_disadvantage')
      newState = newState.withUpdatedCombatant(attackerId, { conditions: newConds })
    }

    // Update action economy (distinct-weapon multiattack tracking)
    newState = _updateAttackActionEconomy(newState, attackerId, weapon)

    const attackRollDisplay = {
      reason: 'attack_roll',
      rolls: diceResult.rolls,
      natural,
      modifier: weapon.attackBonus || 0,
      total,
      targetAC: target.ac,
      hits,
      isCrit,
      isMiss,
      advantage: advDisadv.hasAdv && !advDisadv.hasDisadv ? 'advantage' :
                 advDisadv.hasDisadv && !advDisadv.hasAdv ? 'disadvantage' : 'normal',
    }

    if (!hits) {
      // Miss â€” action complete
      const logs = [`${attacker.name} attacks ${target.name} with ${weapon.name}: ` +
        `[d20:${natural}+${weapon.attackBonus || 0}=${total} vs AC ${target.ac}] ${natural === 1 ? 'CRITICAL FAILURE!' : 'MISS!'}`]

      newState = _finalizeMultiattackAction(newState, attackerId)

      return {
        done: true,
        state: newState.withLogEntries(logs),
        result: {
          type: 'attack', hit: false, damage: 0, damageRolls: [],
          damageDice: weapon.damageDice, crit: false,
          roll: total, natural, targetAC: target.ac,
          targetId, attackerId,
        },
        diceRequests: [attackRollDisplay],
        pendingDice: null,
      }
    }

    // Hit â€” need damage dice
    const diceStr = weapon.damageDice
    const match = diceStr.match(/^(\d+)d(\d+)$/)
    const diceCount = parseInt(match[1], 10) * (isCrit ? 2 : 1)
    const diceSides = parseInt(match[2], 10)

    return {
      done: false,
      pendingDice: {
        reason: 'damage',
        dice: [{ type: `d${diceSides}`, count: diceCount }],
        modifier: weapon.damageBonus || 0,
        owner: attackerId,
        label: `${attacker.name} deals ${isCrit ? 'CRITICAL ' : ''}damage to ${target.name}`,
      },
      diceRequests: [attackRollDisplay],
      context: {
        ...context,
        phase: 'damage',
        state: _serializeState(newState),
        accumulated: {
          ...context.accumulated,
          attackRoll: { natural, total, isCrit, isMiss, hits },
          attackRollDisplay,
        },
      },
    }
  }

  if (context.phase === 'damage') {
    const { attackRoll, attackRollDisplay } = context.accumulated
    const damageTotal = diceResult.rolls.reduce((s, r) => s + r, 0) + (weapon.damageBonus || 0)
    const critStr = attackRoll.isCrit ? 'CRITICAL ' : ''

    let newState = state
    const newHP = Math.max(0, target.currentHP - damageTotal)

    newState = newState.withUpdatedCombatant(attackerId, a => ({
      attacksHit: (a.attacksHit || 0) + 1,
      totalDamageDealt: (a.totalDamageDealt || 0) + damageTotal,
    }))
    newState = newState.withUpdatedCombatant(targetId, {
      currentHP: newHP,
      totalDamageTaken: (target.totalDamageTaken || 0) + damageTotal,
    })

    const logs = [`${attacker.name} attacks ${target.name} with ${weapon.name}: ` +
      `[d20:${attackRoll.natural}+${weapon.attackBonus || 0}=${attackRoll.total} vs AC ${target.ac}] ` +
      `${critStr}HIT! ${damageTotal} damage. ${target.name} HP: ${newHP}/${target.maxHP}`]

    const damageDisplay = {
      reason: 'damage',
      rolls: diceResult.rolls,
      modifier: weapon.damageBonus || 0,
      total: damageTotal,
      crit: attackRoll.isCrit,
    }

    // Check polymorph revert
    if (newHP <= 0) {
      const polyRevert = _checkPolymorphRevert(newState, targetId, damageTotal - target.currentHP)
      newState = polyRevert.state
      logs.push(...polyRevert.logs)
    }

    // Hypnotic Pattern charm break
    const charmBreak = _removeCharmedOnDamage(newState, targetId, damageTotal)
    newState = charmBreak.state
    logs.push(...charmBreak.logs)

    // Check if concentration save is needed
    const updatedTarget = newState.getCombatant(targetId)
    if (updatedTarget.concentrating && updatedTarget.currentHP > 0) {
      const dc = Math.max(10, Math.floor(damageTotal / 2))
      const saveBonus = updatedTarget.saves ? (updatedTarget.saves.con || 0) : 0
      const hasWarCaster = !!updatedTarget.hasWarCaster

      return {
        done: false,
        pendingDice: {
          reason: 'concentration_save',
          dice: [{ type: 'd20', count: hasWarCaster ? 2 : 1 }],
          modifier: saveBonus,
          owner: targetId,
          label: `${updatedTarget.name} concentration save (DC ${dc})`,
          dc,
          advantage: hasWarCaster ? 'advantage' : 'normal',
        },
        diceRequests: [attackRollDisplay, damageDisplay],
        context: {
          ...context,
          phase: 'concentration_save',
          state: _serializeState(newState.withLogEntries(logs)),
          accumulated: {
            ...context.accumulated,
            damageDisplay,
            damageTotal,
            logs,
            conSaveDC: dc,
            conSaveBonus: saveBonus,
            conSaveAdvantage: hasWarCaster,
          },
        },
      }
    }

    // No concentration save needed â€” we're done
    newState = _finalizeMultiattackAction(newState, attackerId)

    return {
      done: true,
      state: newState.withLogEntries(logs),
      result: {
        type: 'attack', hit: true, damage: damageTotal,
        damageRolls: diceResult.rolls, damageDice: weapon.damageDice,
        crit: attackRoll.isCrit, roll: attackRoll.total,
        natural: attackRoll.natural, targetAC: target.ac,
        targetId, attackerId,
      },
      diceRequests: [attackRollDisplay, damageDisplay],
      pendingDice: null,
    }
  }

  if (context.phase === 'concentration_save') {
    const { damageDisplay, attackRollDisplay, attackRoll, conSaveDC, conSaveBonus, conSaveAdvantage } = context.accumulated
    const natural = conSaveAdvantage
      ? Math.max(...diceResult.rolls)
      : diceResult.rolls[0]
    const total = natural + conSaveBonus
    const success = total >= conSaveDC
    const updatedTarget = state.getCombatant(context.accumulated.targetId)

    const conSaveDisplay = {
      reason: 'concentration_save',
      rolls: diceResult.rolls,
      natural,
      modifier: conSaveBonus,
      total,
      dc: conSaveDC,
      success,
    }

    let newState = state
    const logs = []

    if (!success) {
      // Break concentration
      const allCombatants = newState.getAllCombatants()
      mech.breakConcentration(updatedTarget, allCombatants)
      // Update state with broken concentration
      newState = newState.withUpdatedCombatant(context.accumulated.targetId, {
        concentrating: null,
        concentrationRoundsRemaining: 0,
      })
      logs.push(`  ðŸ’” ${updatedTarget.name} fails concentration save (${total} vs DC ${conSaveDC}) â€” ${updatedTarget.concentrating} ends!`)
    } else {
      logs.push(`  âœ… ${updatedTarget.name} maintains concentration (${total} vs DC ${conSaveDC})`)
    }

    newState = _finalizeMultiattackAction(newState, context.actorId)

    return {
      done: true,
      state: newState.withLogEntries(logs),
      result: {
        type: 'attack', hit: true, damage: context.accumulated.damageTotal,
        damageRolls: [], damageDice: context.accumulated.weapon.damageDice,
        crit: attackRoll.isCrit, roll: attackRoll.total,
        natural: attackRoll.natural, targetAC: state.getCombatant(context.accumulated.targetId).ac,
        targetId: context.accumulated.targetId, attackerId: context.actorId,
        concentrationSave: conSaveDisplay,
      },
      diceRequests: [attackRollDisplay, damageDisplay, conSaveDisplay],
      pendingDice: null,
    }
  }

  throw new Error(`Unknown attack phase: ${context.phase}`)
}

// â”€â”€ Multiattack Resolution (stepped) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function _beginMultiattack(state, attackerId, option, choice) {
  // Multiattack is a sequence of individual attacks.
  // We step through each attack one by one.
  const attacker = state.getCombatant(attackerId)
  const weapons = attacker.weapons || []
  const multiattackWeaponName = (attacker.multiattackWeapons || [])[0]
  const weapon = (multiattackWeaponName ? weapons.find(w => w.name === multiattackWeaponName) : null) || attacker.weapon || weapons[0]

  const attackCount = option.attackCount || attacker.multiattack || 2
  const target = state.getCombatant(option.targetId)

  // Start the first attack
  const advDisadv = _computeAdvantage(attacker, target, state)
  const diceCount = (advDisadv.hasAdv !== advDisadv.hasDisadv) ? 2 : 1

  return {
    done: false,
    pendingDice: {
      reason: 'attack_roll',
      dice: [{ type: 'd20', count: diceCount }],
      modifier: weapon.attackBonus || 0,
      owner: attackerId,
      label: `${attacker.name} attacks ${target.name} with ${weapon.name} (attack 1/${attackCount})`,
      targetAC: target.ac,
      advantage: advDisadv.hasAdv && !advDisadv.hasDisadv ? 'advantage' :
                 advDisadv.hasDisadv && !advDisadv.hasAdv ? 'disadvantage' : 'normal',
    },
    diceRequests: [],
    context: {
      actionType: 'multiattack',
      actorId: attackerId,
      choice,
      option,
      phase: 'attack_roll',
      state: _serializeState(state),
      accumulated: {
        weapon,
        targetId: option.targetId,
        attackCount,
        currentAttack: 1,
        advDisadv,
        forceCrit: _isForceCrit(attacker, target, state),
        allResults: [],  // results from each sub-attack
        allDiceRequests: [],
      },
    },
  }
}

function _continueMultiattack(context, diceResult) {
  const state = _deserializeState(context.state)
  const { weapon, targetId, attackCount, currentAttack, advDisadv, forceCrit, allResults, allDiceRequests } = context.accumulated
  const attackerId = context.actorId
  const attacker = state.getCombatant(attackerId)
  const target = state.getCombatant(targetId)

  if (context.phase === 'attack_roll') {
    const natural = _interpretD20(diceResult.rolls, advDisadv)
    const total = natural + (weapon.attackBonus || 0)
    const isCrit = forceCrit || natural === 20
    const isMiss = natural === 1
    const hits = isCrit || (!isMiss && total >= target.ac)

    const attackRollDisplay = {
      reason: 'attack_roll',
      rolls: diceResult.rolls,
      natural, modifier: weapon.attackBonus || 0, total,
      targetAC: target.ac, hits, isCrit, isMiss,
      label: `Attack ${currentAttack}/${attackCount}`,
    }

    if (!hits) {
      // Miss â€” check if more attacks remain
      const updatedResults = [...allResults, { hit: false, damage: 0, natural, total, isCrit }]
      const updatedDiceReqs = [...allDiceRequests, attackRollDisplay]

      if (currentAttack < attackCount && target.currentHP > 0) {
        // More attacks â€” request next attack roll
        return _nextMultiattackRoll(state, context, updatedResults, updatedDiceReqs, currentAttack + 1)
      }

      // All attacks done
      return _finishMultiattack(state, context, updatedResults, updatedDiceReqs)
    }

    // Hit â€” need damage
    const diceStr = weapon.damageDice
    const match = diceStr.match(/^(\d+)d(\d+)$/)
    const diceCount = parseInt(match[1], 10) * (isCrit ? 2 : 1)
    const diceSides = parseInt(match[2], 10)

    return {
      done: false,
      pendingDice: {
        reason: 'damage',
        dice: [{ type: `d${diceSides}`, count: diceCount }],
        modifier: weapon.damageBonus || 0,
        owner: attackerId,
        label: `${attacker.name} deals ${isCrit ? 'CRITICAL ' : ''}damage (attack ${currentAttack}/${attackCount})`,
      },
      diceRequests: [...allDiceRequests, attackRollDisplay],
      context: {
        ...context,
        phase: 'multi_damage',
        state: _serializeState(state),
        accumulated: {
          ...context.accumulated,
          currentAttackRoll: { natural, total, isCrit, isMiss, hits },
          currentAttackRollDisplay: attackRollDisplay,
          allResults: [...allResults],
          allDiceRequests: [...allDiceRequests, attackRollDisplay],
        },
      },
    }
  }

  if (context.phase === 'multi_damage') {
    const { currentAttackRoll, currentAttackRollDisplay } = context.accumulated
    const damageTotal = diceResult.rolls.reduce((s, r) => s + r, 0) + (weapon.damageBonus || 0)

    let newState = state
    const newHP = Math.max(0, target.currentHP - damageTotal)

    newState = newState.withUpdatedCombatant(attackerId, a => ({
      attacksHit: (a.attacksHit || 0) + 1,
      totalDamageDealt: (a.totalDamageDealt || 0) + damageTotal,
    }))
    newState = newState.withUpdatedCombatant(targetId, {
      currentHP: newHP,
      totalDamageTaken: (target.totalDamageTaken || 0) + damageTotal,
    })

    const damageDisplay = {
      reason: 'damage',
      rolls: diceResult.rolls,
      modifier: weapon.damageBonus || 0,
      total: damageTotal,
      crit: currentAttackRoll.isCrit,
      label: `Damage for attack ${currentAttack}/${attackCount}`,
    }

    const critStr = currentAttackRoll.isCrit ? 'CRITICAL ' : ''
    const logs = [`${attacker.name} attacks ${target.name} with ${weapon.name}: ` +
      `${critStr}HIT! ${damageTotal} damage. ${target.name} HP: ${newHP}/${target.maxHP}`]

    newState = newState.withLogEntries(logs)

    const updatedResult = { hit: true, damage: damageTotal, natural: currentAttackRoll.natural, total: currentAttackRoll.total, isCrit: currentAttackRoll.isCrit }
    const updatedResults = [...context.accumulated.allResults, updatedResult]
    const updatedDiceReqs = [...context.accumulated.allDiceRequests, damageDisplay]

    // Check if target died
    if (newHP <= 0) {
      // Polymorph revert
      const polyRevert = _checkPolymorphRevert(newState, targetId, damageTotal - target.currentHP)
      newState = polyRevert.state
    }

    // Concentration check â€” request a save if needed
    const updatedTarget = newState.getCombatant(targetId)
    if (updatedTarget.concentrating && updatedTarget.currentHP > 0) {
      const dc = Math.max(10, Math.floor(damageTotal / 2))
      const saveBonus = updatedTarget.saves ? (updatedTarget.saves.con || 0) : 0
      const hasWarCaster = !!updatedTarget.hasWarCaster

      return {
        done: false,
        pendingDice: {
          reason: 'concentration_save',
          dice: [{ type: 'd20', count: hasWarCaster ? 2 : 1 }],
          modifier: saveBonus,
          owner: targetId,
          label: `${updatedTarget.name} concentration save (DC ${dc})`,
          dc,
          advantage: hasWarCaster ? 'advantage' : 'normal',
        },
        diceRequests: updatedDiceReqs,
        context: {
          ...context,
          phase: 'multi_con_save',
          state: _serializeState(newState),
          accumulated: {
            ...context.accumulated,
            currentDamageTotal: damageTotal,
            conSaveDC: dc,
            conSaveBonus: saveBonus,
            conSaveAdvantage: hasWarCaster,
            allResults: updatedResults,
            allDiceRequests: updatedDiceReqs,
          },
        },
      }
    }

    // No con save â€” continue to next attack or finalize
    if (currentAttack < attackCount && updatedTarget.currentHP > 0) {
      return _nextMultiattackRoll(newState, {
        ...context,
        accumulated: { ...context.accumulated, allResults: updatedResults, allDiceRequests: updatedDiceReqs },
      }, updatedResults, updatedDiceReqs, currentAttack + 1)
    }

    return _finishMultiattack(newState, context, updatedResults, updatedDiceReqs)
  }

  if (context.phase === 'multi_con_save') {
    const { conSaveDC, conSaveBonus, conSaveAdvantage, allResults, allDiceRequests, currentDamageTotal } = context.accumulated
    const natural = conSaveAdvantage ? Math.max(...diceResult.rolls) : diceResult.rolls[0]
    const total = natural + conSaveBonus
    const success = total >= conSaveDC

    const conSaveDisplay = {
      reason: 'concentration_save',
      rolls: diceResult.rolls, natural, modifier: conSaveBonus,
      total, dc: conSaveDC, success,
    }

    let newState = state
    const logs = []
    const updatedTarget = newState.getCombatant(context.accumulated.targetId)

    if (!success) {
      mech.breakConcentration(updatedTarget, newState.getAllCombatants())
      newState = newState.withUpdatedCombatant(context.accumulated.targetId, {
        concentrating: null, concentrationRoundsRemaining: 0,
      })
      logs.push(`  ðŸ’” ${updatedTarget.name} fails concentration save â€” ${updatedTarget.concentrating} ends!`)
    } else {
      logs.push(`  âœ… ${updatedTarget.name} maintains concentration`)
    }

    newState = newState.withLogEntries(logs)
    const updatedDiceReqs = [...allDiceRequests, conSaveDisplay]

    // Continue to next attack or finalize
    const target = newState.getCombatant(context.accumulated.targetId)
    if (currentAttack < attackCount && target && target.currentHP > 0) {
      return _nextMultiattackRoll(newState, {
        ...context,
        accumulated: { ...context.accumulated, allResults, allDiceRequests: updatedDiceReqs },
      }, allResults, updatedDiceReqs, currentAttack + 1)
    }

    return _finishMultiattack(newState, context, allResults, updatedDiceReqs)
  }

  throw new Error(`Unknown multiattack phase: ${context.phase}`)
}

function _nextMultiattackRoll(state, context, results, diceReqs, nextAttackNum) {
  const attacker = state.getCombatant(context.actorId)
  const target = state.getCombatant(context.accumulated.targetId)
  if (!target || target.currentHP <= 0) {
    return _finishMultiattack(state, context, results, diceReqs)
  }

  const advDisadv = _computeAdvantage(attacker, target, state)
  const diceCount = (advDisadv.hasAdv !== advDisadv.hasDisadv) ? 2 : 1

  return {
    done: false,
    pendingDice: {
      reason: 'attack_roll',
      dice: [{ type: 'd20', count: diceCount }],
      modifier: (context.accumulated.weapon.attackBonus || 0),
      owner: context.actorId,
      label: `${attacker.name} attacks ${target.name} (attack ${nextAttackNum}/${context.accumulated.attackCount})`,
      targetAC: target.ac,
    },
    diceRequests: diceReqs,
    context: {
      ...context,
      phase: 'attack_roll',
      state: _serializeState(state),
      accumulated: {
        ...context.accumulated,
        currentAttack: nextAttackNum,
        advDisadv,
        forceCrit: _isForceCrit(attacker, target, state),
        allResults: results,
        allDiceRequests: diceReqs,
      },
    },
  }
}

function _finishMultiattack(state, context, results, diceReqs) {
  const totalDamage = results.reduce((s, r) => s + r.damage, 0)
  const totalHits = results.filter(r => r.hit).length

  let newState = state
  newState = newState.withUpdatedCombatant(context.actorId, { usedAction: true })

  return {
    done: true,
    state: newState,
    result: {
      type: 'multiattack',
      attacks: results,
      totalDamage,
      totalHits,
      attackCount: context.accumulated.attackCount,
      targetId: context.accumulated.targetId,
      attackerId: context.actorId,
    },
    diceRequests: diceReqs,
    pendingDice: null,
  }
}

// â”€â”€ Spell Resolution (stepped) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function _beginSpell(state, casterId, option, choice) {
  // Spells are complex â€” many subtypes.
  // For now, we handle the most common patterns:
  // - Spell attack (d20 â†’ damage)
  // - Save-based (targets make saves â†’ damage on fail)
  // - Self/buff (no dice needed from targets)

  const caster = state.getCombatant(casterId)

  if (option.targetType === 'single' && option.spellAttack) {
    return _beginSpellAttack(state, casterId, option, choice)
  }

  if (option.targetType === 'area' || option.requiresSave) {
    return _beginSaveSpell(state, casterId, option, choice)
  }

  // Self-buff, utility spells, polymorphs, etc. â€” resolve synchronously for now
  // These can be stepped later if needed
  const resolution = ActionResolver.resolve(state, casterId, choice)
  return {
    done: true,
    state: resolution.state,
    result: resolution.result,
    diceRequests: [],
    pendingDice: null,
  }
}

function _beginSpellAttack(state, casterId, option, choice) {
  const caster = state.getCombatant(casterId)
  const target = state.getCombatant(option.targetId || choice.targetId)
  const spellAttackBonus = caster.spellAttackBonus || 0

  const advDisadv = _computeAdvantage(caster, target, state)
  const diceCount = (advDisadv.hasAdv !== advDisadv.hasDisadv) ? 2 : 1

  return {
    done: false,
    pendingDice: {
      reason: 'attack_roll',
      dice: [{ type: 'd20', count: diceCount }],
      modifier: spellAttackBonus,
      owner: casterId,
      label: `${caster.name} casts ${option.spellName} at ${target.name}`,
      targetAC: target.ac,
      advantage: advDisadv.hasAdv && !advDisadv.hasDisadv ? 'advantage' :
                 advDisadv.hasDisadv && !advDisadv.hasAdv ? 'disadvantage' : 'normal',
    },
    diceRequests: [],
    context: {
      actionType: 'spell',
      actorId: casterId,
      choice,
      option,
      phase: 'spell_attack_roll',
      state: _serializeState(state),
      accumulated: {
        targetId: option.targetId || choice.targetId,
        spellAttackBonus,
        advDisadv,
      },
    },
  }
}

function _continueSpell(context, diceResult) {
  // For spell attack â†’ damage â†’ concentration save chain,
  // and for save-based spells â†’ damage chain.
  // The pattern mirrors _continueAttack but for spell rolls.

  // For the initial release, delegate complex spell step-through to ActionResolver
  // and just report the dice that were rolled. This is the pragmatic approach:
  // we step the attack/damage/save chain, but for exotic spells (Polymorph,
  // Sleep, Hypnotic Pattern) we fall back to synchronous resolution.

  if (context.phase === 'spell_attack_roll') {
    return _continueSpellAttack(context, diceResult)
  }

  if (context.phase === 'spell_damage') {
    return _continueSpellDamage(context, diceResult)
  }

  if (context.phase === 'save_spell_rolls') {
    return _continueSaveSpellRolls(context, diceResult)
  }

  // Fallback â€” resolve synchronously
  const state = _deserializeState(context.state)
  const resolution = ActionResolver.resolve(state, context.actorId, context.choice)
  return {
    done: true,
    state: resolution.state,
    result: resolution.result,
    diceRequests: context.accumulated?.allDiceRequests || [],
    pendingDice: null,
  }
}

function _continueSpellAttack(context, diceResult) {
  const state = _deserializeState(context.state)
  const { targetId, spellAttackBonus, advDisadv } = context.accumulated
  const caster = state.getCombatant(context.actorId)
  const target = state.getCombatant(targetId)

  const natural = _interpretD20(diceResult.rolls, advDisadv)
  const total = natural + spellAttackBonus
  const isCrit = natural === 20
  const isMiss = natural === 1
  const hits = isCrit || (!isMiss && total >= target.ac)

  const attackRollDisplay = {
    reason: 'attack_roll',
    rolls: diceResult.rolls, natural, modifier: spellAttackBonus, total,
    targetAC: target.ac, hits, isCrit, isMiss,
  }

  if (!hits) {
    // Spell misses â€” still consume the spell slot/action
    // Use ActionResolver for the full spell-miss bookkeeping
    const resolution = ActionResolver.resolve(state, context.actorId, context.choice)
    return {
      done: true,
      state: resolution.state,
      result: { ...resolution.result, attackRoll: attackRollDisplay },
      diceRequests: [attackRollDisplay],
      pendingDice: null,
    }
  }

  // Hit â€” now we need damage dice.
  // Get the spell damage info from the option
  const spellDamage = context.option.damage || context.option.spellDamage
  if (!spellDamage) {
    // Spell hit but no damage (e.g. some debuff spells) â€” resolve fully
    const resolution = ActionResolver.resolve(state, context.actorId, context.choice)
    return {
      done: true,
      state: resolution.state,
      result: { ...resolution.result, attackRoll: attackRollDisplay },
      diceRequests: [attackRollDisplay],
      pendingDice: null,
    }
  }

  const match = spellDamage.match(/^(\d+)d(\d+)$/)
  if (!match) {
    // Can't parse damage dice â€” fall back to synchronous
    const resolution = ActionResolver.resolve(state, context.actorId, context.choice)
    return {
      done: true,
      state: resolution.state,
      result: { ...resolution.result, attackRoll: attackRollDisplay },
      diceRequests: [attackRollDisplay],
      pendingDice: null,
    }
  }

  const diceCount = parseInt(match[1], 10) * (isCrit ? 2 : 1)
  const diceSides = parseInt(match[2], 10)

  return {
    done: false,
    pendingDice: {
      reason: 'damage',
      dice: [{ type: `d${diceSides}`, count: diceCount }],
      modifier: 0,
      owner: context.actorId,
      label: `${caster.name}'s ${context.option.spellName} deals ${isCrit ? 'CRITICAL ' : ''}damage`,
    },
    diceRequests: [attackRollDisplay],
    context: {
      ...context,
      phase: 'spell_damage',
      state: context.state,
      accumulated: {
        ...context.accumulated,
        attackRoll: { natural, total, isCrit, hits },
        attackRollDisplay,
        allDiceRequests: [attackRollDisplay],
      },
    },
  }
}

function _continueSpellDamage(context, diceResult) {
  // Spell damage resolved â€” apply via ActionResolver for full effect
  // This is the pragmatic approach: we've shown the dice steps to the user,
  // now let ActionResolver handle all the bookkeeping.
  const state = _deserializeState(context.state)
  const resolution = ActionResolver.resolve(state, context.actorId, context.choice)
  const { attackRollDisplay } = context.accumulated

  const damageDisplay = {
    reason: 'damage',
    rolls: diceResult.rolls,
    modifier: 0,
    total: diceResult.rolls.reduce((s, r) => s + r, 0),
    crit: context.accumulated.attackRoll.isCrit,
  }

  return {
    done: true,
    state: resolution.state,
    result: resolution.result,
    diceRequests: [...(context.accumulated.allDiceRequests || []), damageDisplay],
    pendingDice: null,
  }
}

function _beginSaveSpell(state, casterId, option, choice) {
  // Save-based spells: targets make saving throws.
  // For AoE spells, multiple targets roll. For single-target saves, one target rolls.
  // The saves happen "at once" from the user's perspective.
  
  // For the initial release, resolve save spells synchronously via ActionResolver.
  // The saves happen on the enemy side, so they'd auto-roll anyway.
  // We still report what dice were needed for display.
  const resolution = ActionResolver.resolve(state, casterId, choice)
  return {
    done: true,
    state: resolution.state,
    result: resolution.result,
    diceRequests: _extractDiceFromResult(resolution.result),
    pendingDice: null,
  }
}

function _continueSaveSpellRolls(context, diceResult) {
  // Placeholder for future stepped save resolution
  const state = _deserializeState(context.state)
  const resolution = ActionResolver.resolve(state, context.actorId, context.choice)
  return {
    done: true,
    state: resolution.state,
    result: resolution.result,
    diceRequests: context.accumulated?.allDiceRequests || [],
    pendingDice: null,
  }
}

// â”€â”€ Breath Weapon Resolution (stepped) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function _beginBreathWeapon(state, actorId, option, choice) {
  // Breath weapon: actor rolls damage, then each target makes a save.
  // The damage roll belongs to the actor.
  const actor = state.getCombatant(actorId)
  const breathDamage = actor.breathWeapon?.damage
  if (!breathDamage) {
    // No breath weapon data â€” fall back
    const resolution = ActionResolver.resolve(state, actorId, choice)
    return { done: true, state: resolution.state, result: resolution.result, diceRequests: [], pendingDice: null }
  }

  const match = breathDamage.match(/^(\d+)d(\d+)$/)
  if (!match) {
    const resolution = ActionResolver.resolve(state, actorId, choice)
    return { done: true, state: resolution.state, result: resolution.result, diceRequests: [], pendingDice: null }
  }

  const diceCount = parseInt(match[1], 10)
  const diceSides = parseInt(match[2], 10)

  return {
    done: false,
    pendingDice: {
      reason: 'damage',
      dice: [{ type: `d${diceSides}`, count: diceCount }],
      modifier: 0,
      owner: actorId,
      label: `${actor.name} uses ${actor.breathWeapon?.name || 'Breath Weapon'}`,
    },
    diceRequests: [],
    context: {
      actionType: 'breath_weapon',
      actorId,
      choice,
      option,
      phase: 'breath_damage',
      state: _serializeState(state),
      accumulated: {},
    },
  }
}

function _continueBreathWeapon(context, diceResult) {
  // After damage is rolled, targets make saves.
  // For initial release: resolve via ActionResolver (saves are enemy rolls â†’ auto)
  const state = _deserializeState(context.state)
  const resolution = ActionResolver.resolve(state, context.actorId, context.choice)

  const damageDisplay = {
    reason: 'damage',
    rolls: diceResult.rolls,
    modifier: 0,
    total: diceResult.rolls.reduce((s, r) => s + r, 0),
  }

  return {
    done: true,
    state: resolution.state,
    result: resolution.result,
    diceRequests: [damageDisplay, ..._extractDiceFromResult(resolution.result)],
    pendingDice: null,
  }
}

// â”€â”€ Dragon Fear Resolution (stepped) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function _beginDragonFear(state, actorId, option, choice) {
  // Dragon Fear: each target makes a Wisdom save.
  // All saves are enemy dice â†’ auto-rolled.
  // Resolve synchronously.
  const resolution = ActionResolver.resolve(state, actorId, choice)
  return {
    done: true,
    state: resolution.state,
    result: resolution.result,
    diceRequests: _extractDiceFromResult(resolution.result),
    pendingDice: null,
  }
}

function _continueDragonFear(context, diceResult) {
  const state = _deserializeState(context.state)
  const resolution = ActionResolver.resolve(state, context.actorId, context.choice)
  return {
    done: true,
    state: resolution.state,
    result: resolution.result,
    diceRequests: [],
    pendingDice: null,
  }
}

// â”€â”€ Helper Functions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/** Compute advantage/disadvantage for an attack */
export function _computeAdvantage(attacker, target, state) {
  const isTargetParalyzed = (target.conditions || []).includes('paralyzed')
  const isTargetFaerieFired = (target.conditions || []).includes('faerie_fire')
  const within5ft = TurnMenu.combatDistance(attacker, target) <= 5
  const hasAdv = (attacker.conditions || []).includes('invisible') ||
    isTargetFaerieFired ||
    (isTargetParalyzed && within5ft)
  const hasVmDisadv = (attacker.conditions || []).includes('vm_disadvantage')
  const isFrightened = (attacker.conditions || []).includes('frightened')
  const hasDisadv = ((target.conditions || []).includes('dodging') || hasVmDisadv || isFrightened) && !hasAdv

  return { hasAdv, hasDisadv, hasVmDisadv, isFrightened }
}

/** Check if attacks against this target should auto-crit */
export function _isForceCrit(attacker, target, state) {
  const isTargetParalyzed = (target.conditions || []).includes('paralyzed')
  const within5ft = TurnMenu.combatDistance(attacker, target) <= 5
  return isTargetParalyzed && within5ft
}

/** Interpret a d20 roll with advantage/disadvantage */
export function _interpretD20(rolls, advDisadv) {
  if (advDisadv.hasAdv && !advDisadv.hasDisadv) {
    return Math.max(...rolls)
  }
  if (advDisadv.hasDisadv && !advDisadv.hasAdv) {
    return Math.min(...rolls)
  }
  return rolls[0]
}

/** Update action economy after an attack (multiattack weapon tracking) */
function _updateAttackActionEconomy(state, attackerId, weapon) {
  const attacker = state.getCombatant(attackerId)
  const multiattackWeaponList = attacker.multiattackWeapons || (attacker.weapons || []).map(w => w.name)
  const uniqueMultiattackWeapons = new Set(multiattackWeaponList)
  const hasDistinctWeapons = attacker.multiattack > 0 && uniqueMultiattackWeapons.size > 1
  const usedWeapons = [...(attacker.multiattackWeaponsUsed || []), weapon.name]
  const allUsed = hasDistinctWeapons
    ? [...uniqueMultiattackWeapons].every(wn => usedWeapons.includes(wn))
    : true
  const actionConsumed = !hasDistinctWeapons || allUsed

  const multiattackUpdate = hasDistinctWeapons
    ? { multiattackWeaponsUsed: usedWeapons, multiattackBiteTargetId: null }
    : {}

  return state.withUpdatedCombatant(attackerId, {
    usedAction: actionConsumed,
    attacksMade: (attacker.attacksMade || 0) + 1,
    ...multiattackUpdate,
  })
}

/** Finalize multiattack action economy (same as ActionResolver) */
function _finalizeMultiattackAction(state, attackerId) {
  // Delegate to ActionResolver's internal helper if available
  if (typeof ActionResolver.finalizeMultiattackAction === 'function') {
    return ActionResolver.finalizeMultiattackAction(state, attackerId)
  }

  // Fallback: just check if action should be consumed
  const actor = state.getCombatant(attackerId)
  if (actor.usedAction) return state

  const weapons = actor.weapons || []
  const multiattackWeaponList = actor.multiattackWeapons || weapons.map(w => w.name)
  const uniqueMultiattackWeapons = new Set(multiattackWeaponList)
  if (uniqueMultiattackWeapons.size <= 1) return state

  const usedWeapons = actor.multiattackWeaponsUsed || []
  const allUsed = [...uniqueMultiattackWeapons].every(wn => usedWeapons.includes(wn))
  if (allUsed) {
    return state.withUpdatedCombatant(attackerId, { usedAction: true })
  }
  return state
}

/** Check polymorph revert on death */
function _checkPolymorphRevert(state, targetId, overflowDamage) {
  const target = state.getCombatant(targetId)
  if (!target.polymorphedFrom) {
    return { state, logs: [] }
  }

  const logs = [`  ðŸ”„ ${target.name} reverts from beast form!`]
  const original = target.polymorphedFrom
  const revertHP = Math.max(0, (original.maxHP || original.currentHP) - overflowDamage)

  const newState = state.withUpdatedCombatant(targetId, {
    ...original,
    currentHP: revertHP,
    polymorphedFrom: null,
  })

  return { state: newState, logs }
}

/** Remove charmed_hp condition when target takes damage (Hypnotic Pattern) */
function _removeCharmedOnDamage(state, targetId, damage) {
  const target = state.getCombatant(targetId)
  if (!(target.conditions || []).includes('charmed_hp') || damage <= 0) {
    return { state, logs: [] }
  }

  const newConds = target.conditions.filter(c => c !== 'charmed_hp' && c !== 'incapacitated')
  const newState = state.withUpdatedCombatant(targetId, { conditions: newConds })
  return {
    state: newState,
    logs: [`  âœ¨ ${target.name} is freed from the charm!`],
  }
}

/** Extract dice display info from a synchronous ActionResolver result */
export function _extractDiceFromResult(result) {
  const diceReqs = []
  if (result.attackRoll || result.natural) {
    diceReqs.push({
      reason: 'attack_roll',
      natural: result.natural,
      total: result.roll || result.total,
      hits: result.hit,
      isCrit: result.crit,
    })
  }
  if (result.damage && result.damageRolls) {
    diceReqs.push({
      reason: 'damage',
      rolls: result.damageRolls,
      total: result.damage,
      crit: result.crit,
    })
  }
  if (result.saves) {
    for (const save of result.saves) {
      diceReqs.push({
        reason: 'saving_throw',
        total: save.total || save.roll,
        dc: save.dc,
        success: save.success || save.saved,
        targetName: save.name,
      })
    }
  }
  return diceReqs
}

/** Serialize GameState for context storage */
export function _serializeState(state) {
  return {
    combatants: state.getAllCombatants(),
    initiativeOrder: state.initiativeOrder,
    round: state.round,
    turnIndex: state.turnIndex,
    log: state.log,
    corpses: typeof state.getAllCorpses === 'function' ? state.getAllCorpses() : [],
  }
}

/** Deserialize GameState from context */
export function _deserializeState(serialized) {
  return new GameState({
    combatants: serialized.combatants,
    initiativeOrder: serialized.initiativeOrder,
    round: serialized.round,
    turnIndex: serialized.turnIndex,
    log: serialized.log,
  })
}

