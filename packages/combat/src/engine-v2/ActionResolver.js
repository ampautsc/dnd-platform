/**
 * ActionResolver â€” Zero-trust action execution for engine-v2.
 *
 * Takes a validated option (from TurnMenu) and executes it against the
 * GameState, returning a new immutable GameState + result metadata.
 *
 * Design:
 *   - Every resolve function takes GameState â†’ returns { state: GameState, result }
 *   - Reuses v1 mechanics (dice, mechanics.js, aoeGeometry) for D&D math
 *   - All state changes go through GameState.withUpdatedCombatant()
 *   - No direct mutation of creature objects
 *   - Logs every significant event
 *
 * Resolution pipeline per action type:
 *   attack      â†’ roll attack â†’ roll damage â†’ apply â†’ concentration check
 *   multiattack â†’ repeat attack N times
 *   spell       â†’ spend slot â†’ concentration switch â†’ targeting â†’ attack/save â†’ damage â†’ effects
 *   dodge       â†’ add dodging condition
 *   dash        â†’ double remaining movement
 *   disengage   â†’ set disengage flag
 *   move        â†’ update position + deduct movement
 *   hold        â†’ no-op
 *   bardicInspiration â†’ grant die to ally
 *   gemFlight   â†’ activate flight
 *   endTurn     â†’ no-op (EncounterRunner handles turn transition)
 */

import * as dice from '../engine/dice.js'
import * as mech from '../engine/mechanics.js'
import { SPELLS, getSpell, hasSpell } from '@dnd-platform/content/spells'
import { resolveAoETargets } from '../engine/targetResolver.js'
import * as TurnMenu from './TurnMenu.js'

// Effects that trigger Dark Devotion advantage on saves
export const CHARM_FEAR_EFFECTS = new Set(['charmed_hp', 'charmed', 'frightened'])

// Conditions that cause auto-fail on STR/DEX saves (D&D 5e PHB)
export const AUTO_FAIL_STR_DEX_CONDITIONS = new Set(['paralyzed', 'stunned', 'unconscious'])
export const AUTO_FAIL_ABILITIES = new Set(['str', 'dex'])

/**
 * Check if a target gets advantage on a save due to magicResistance or darkDevotion.
 */
function hasSaveAdvantage(target, spellDef) {
  if (target.magicResistance) return true
  if (target.darkDevotion && spellDef.effects && spellDef.effects.some(e => CHARM_FEAR_EFFECTS.has(e))) return true
  return false
}

/**
 * Apply damage resistance / immunity.
 * Returns the effective damage after accounting for the target's resistances.
 * Immunity â†’ 0 damage.  Resistance â†’ half damage (rounded down).
 */
function applyDamageResistance(target, rawDamage, damageType) {
  if (!damageType || rawDamage <= 0) return rawDamage
  if (target.damageImmunities && target.damageImmunities.includes(damageType)) return 0
  if (target.damageResistances && target.damageResistances.includes(damageType)) {
    return Math.floor(rawDamage / 2)
  }
  return rawDamage
}

/**
 * Check if a polymorphed creature should revert to original form when its HP reaches 0.
 * Excess damage carries over to the original form.
 *
 * @param {GameState} state  - current state (creature already at 0 HP)
 * @param {string}    targetId
 * @param {number}    overkillDamage - damage beyond 0 that carries over
 * @returns {{ state: GameState, logs: string[], reverted: boolean }}
 */
export function checkPolymorphRevert(state, targetId, overkillDamage = 0) {
  const target = state.getCombatant(targetId)
  if (!target.prePolymorphState || !target.polymorphedAs) {
    return { state, logs: [], reverted: false }
  }

  const pre = target.prePolymorphState
  const logs = []
  const carryover = Math.max(0, overkillDamage)
  const restoredHP = Math.max(0, pre.currentHP - carryover)

  // Restore original stats (including saves, mental stats, and special abilities)
  let newState = state.withUpdatedCombatant(targetId, {
    currentHP: restoredHP,
    maxHP: pre.maxHP,
    ac: pre.ac,
    speed: pre.speed,
    str: pre.str, strMod: pre.strMod,
    dex: pre.dex, dexMod: pre.dexMod,
    con: pre.con, conMod: pre.conMod,
    wis: pre.wis, wisMod: pre.wisMod,
    saves: pre.saves,
    weapons: pre.weapons,
    weapon: pre.weapon,
    multiattack: pre.multiattack,
    multiattackWeapons: pre.multiattackWeapons || null,
    spellSlots: pre.spellSlots,
    spellsKnown: pre.spellsKnown,
    cantrips: pre.cantrips,
    spellSaveDC: pre.spellSaveDC,
    flying: pre.flying || false,
    breathWeapon: pre.breathWeapon || null,
    legendaryResistance: pre.legendaryResistance || null,
    legendaryActions: pre.legendaryActions || null,
    type: pre.type || undefined,
    prePolymorphState: null,
    polymorphedAs: null,
    conditions: (target.conditions || []).filter(c => c !== 'polymorphed'),
  })

  // If the reverted creature was self-polymorphed (concentrating on Polymorph),
  // the spell ends when the beast form is destroyed â€” clear concentration.
  const revertedCreature = newState.getCombatant(targetId)
  if (revertedCreature.concentrating === 'Polymorph') {
    newState = newState.withUpdatedCombatant(targetId, {
      concentrating: null,
      concentrationRoundsRemaining: 0,
    })
  }

  const beastName = target.polymorphedAs
  logs.push(`  â†’ ${target.name}'s ${beastName} form is destroyed! Reverts to original form. HP: ${restoredHP}/${pre.maxHP}${carryover > 0 ? ` (${carryover} excess damage carried over)` : ''}`)

  return { state: newState, logs, reverted: true }
}

/**
 * Check if a target automatically fails a saving throw.
 * Per D&D 5e: paralyzed, stunned, and unconscious creatures auto-fail STR and DEX saves.
 */
function autoFailsSave(target, saveAbility) {
  if (!AUTO_FAIL_ABILITIES.has(saveAbility)) return false
  const conditions = target.conditions || []
  return conditions.some(c => AUTO_FAIL_STR_DEX_CONDITIONS.has(c))
}

// â”€â”€ Damage Side-Effects â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * When a creature with charmed_hp takes damage, the charm breaks on THAT
 * creature only (D&D 5e Hypnotic Pattern: "The effect ends for an affected
 * creature if it takes any damage or if someone uses an action to shake
 * the creature out of its stupor.").
 *
 * @param {GameState} state    - Current state
 * @param {string}    targetId - Who just took damage
 * @param {number}    damage   - How much damage was dealt
 * @returns {{ state: GameState, logs: string[] }}
 */
function removeCharmedHPOnDamage(state, targetId, damage) {
  if (damage <= 0) return { state, logs: [] }
  const target = state.getCombatant(targetId)
  if (!target) return { state, logs: [] }
  const conditions = target.conditions || []
  const logs = []
  let newState = state
  let newConditions = [...conditions]

  // Hypnotic Pattern charm break on damage
  if (newConditions.includes('charmed_hp')) {
    newConditions = newConditions.filter(c => c !== 'charmed_hp' && c !== 'incapacitated')
    logs.push(`    â†’ ${target.name} takes damage â€” Hypnotic Pattern charm breaks!`)
  }

  // Sleep: taking damage wakes the creature
  if (newConditions.includes('asleep')) {
    newConditions = newConditions.filter(c => c !== 'asleep' && c !== 'unconscious')
    logs.push(`    â†’ ${target.name} takes damage â€” wakes from Sleep!`)
  }

  if (newConditions.length !== conditions.length) {
    newState = newState.withUpdatedCombatant(targetId, { conditions: newConditions })
  }

  return { state: newState, logs }
}

// â”€â”€ Main Resolve Entry Point â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * Resolve a player's choice, returning a new GameState and result metadata.
 *
 * @param {GameState} state        - Current game state
 * @param {string}    combatantId  - Who is acting
 * @param {object}    choice       - { optionId, targetId?, aoeCenter?, position? }
 * @returns {{ state: GameState, result: object }}
 * @throws {Error} if choice is invalid
 */
export function resolve(state, combatantId, choice) {
  // Zero-trust: validate the choice first
  const validation = TurnMenu.validateChoice(state, combatantId, choice)
  if (!validation.valid) {
    throw new Error(`Invalid choice: ${validation.reason}`)
  }

  const option = validation.option

  switch (option.type) {
    case 'attack':
      return resolveAttack(state, combatantId, option)
    case 'multiattack':
      return resolveMultiattack(state, combatantId, option)
    case 'spell':
      return resolveSpell(state, combatantId, option, choice)
    case 'dodge':
      return resolveDodge(state, combatantId)
    case 'dash':
      return resolveDash(state, combatantId)
    case 'disengage':
      return resolveDisengage(state, combatantId)
    case 'move':
      return resolveMove(state, combatantId, choice)
    case 'hold':
      return resolveHold(state, combatantId)
    case 'bardicInspiration':
      return resolveBardicInspiration(state, combatantId, option)
    case 'gemFlight':
      return resolveGemFlight(state, combatantId)
    case 'shake_awake':
      return resolveShakeAwake(state, combatantId, option)
    case 'breath_weapon':
      return resolveBreathWeapon(state, combatantId, choice)
    case 'dragon_fear':
      return resolveDragonFear(state, combatantId, choice)
    case 'loot_corpse':
      return resolveLootCorpse(state, combatantId, option)
    case 'endTurn':
      return { state, result: { type: 'endTurn' } }
    default:
      throw new Error(`Unknown action type: ${option.type}`)
  }
}

// â”€â”€ Weapon Attack â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * For distinct-weapon multiattack creatures, check if the action should be
 * force-consumed because no remaining multiattack weapon has a valid target.
 * E.g. T-Rex bit the only enemy â€” no Tail target exists, so action is spent.
 */
export function finalizeMultiattackAction(state, attackerId) {
  const actor = state.getCombatant(attackerId)
  if (actor.usedAction) return state // already consumed

  const weapons = actor.weapons || []
  const multiattackWeaponList = actor.multiattackWeapons || weapons.map(w => w.name)
  const uniqueMultiattackWeapons = new Set(multiattackWeaponList)
  const hasDistinctWeapons = actor.multiattack > 0 && uniqueMultiattackWeapons.size > 1
  if (!hasDistinctWeapons) return state

  // Check if any unused multiattack weapon still has a valid target
  const usedWeapons = actor.multiattackWeaponsUsed || []
  const excludedTargetId = actor.multiattackBiteTargetId || null

  // Gather alive enemies
  const enemies = state.getAllCombatants().filter(c =>
    c.id !== attackerId && c.side !== actor.side && c.currentHP > 0
  )

  // Only check weapons that participate in the multiattack
  const multiattackWeaponsOnly = weapons.filter(w => multiattackWeaponList.includes(w.name))
  for (const w of multiattackWeaponsOnly) {
    if (usedWeapons.includes(w.name)) continue // already used
    const weaponRange = w.range || (w.type === 'ranged' ? 80 : 5)
    for (const enemy of enemies) {
      if (excludedTargetId && enemy.id === excludedTargetId) continue
      const dist = TurnMenu.combatDistance(actor, enemy)
      if (dist <= weaponRange) return state // valid target exists â€” don't consume
    }
  }

  // No valid targets for remaining weapons â€” consume the action
  return state.withUpdatedCombatant(attackerId, { usedAction: true })
}

export function resolveAttack(state, attackerId, option) {
  const attacker = state.getCombatant(attackerId)
  const target = state.getCombatant(option.targetId)
  const weapon = attacker.weapons[option.weaponIndex]

  // Determine advantage/disadvantage
  const isTargetParalyzed = (target.conditions || []).includes('paralyzed')
  const isTargetFaerieFired = (target.conditions || []).includes('faerie_fire')
  const within5ft = TurnMenu.combatDistance(attacker, target) <= 5
  const hasAdv = (attacker.conditions || []).includes('invisible') ||
    isTargetFaerieFired ||
    (isTargetParalyzed && within5ft)
  const hasVmDisadv = (attacker.conditions || []).includes('vm_disadvantage')
  const isFrightened = (attacker.conditions || []).includes('frightened')
  const hasDisadv = ((target.conditions || []).includes('dodging') || hasVmDisadv || isFrightened) && !hasAdv
  const forceCrit = isTargetParalyzed && within5ft

  const atkResult = mech.makeAttackRoll(weapon.attackBonus || 0, target.ac, hasAdv, hasDisadv)
  const isCrit = forceCrit || atkResult.isCrit
  const hits = isCrit || atkResult.hits

  // Consume vm_disadvantage after the attack roll (applies to next attack roll only)
  let newState = state
  if (hasVmDisadv) {
    const newConds = (attacker.conditions || []).filter(c => c !== 'vm_disadvantage')
    newState = newState.withUpdatedCombatant(attackerId, { conditions: newConds })
  }
  // â”€â”€ Distinct-weapon multiattack action economy â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // For creatures with multiattack AND differently-named weapons (e.g. T-Rex
  // with Bite + Tail), each weapon gets its own individual attack action.
  // The action is only fully consumed once all distinct weapons have been used.
  // Same-weapon multiattack (e.g. Brute: Greataxe Ã—2) is handled by the
  // separate resolveMultiattack path and always consumes the action at once.
  const multiattackWeaponList = attacker.multiattackWeapons || (attacker.weapons || []).map(w => w.name)
  const uniqueMultiattackWeapons = new Set(multiattackWeaponList)
  const hasDistinctWeapons = attacker.multiattack > 0 && uniqueMultiattackWeapons.size > 1
  const weaponName = weapon.name
  const usedWeapons = [...(attacker.multiattackWeaponsUsed || []), weaponName]
  const allDistinctWeaponsUsed = hasDistinctWeapons
    ? [...uniqueMultiattackWeapons].every(wn => usedWeapons.includes(wn))
    : true
  const actionFullyConsumed = !hasDistinctWeapons || allDistinctWeaponsUsed

  const multiattackUpdate = hasDistinctWeapons
    ? {
        multiattackWeaponsUsed: usedWeapons,
        // Track target for "can't attack same target" enforcement
        multiattackBiteTargetId: option.targetId,
      }
    : {}

  newState = newState.withUpdatedCombatant(attackerId, {
    usedAction: actionFullyConsumed,
    attacksMade: (attacker.attacksMade || 0) + 1,
    ...multiattackUpdate,
  })

  const logs = []

  if (hits) {
    const dmg = mech.rollDamage(weapon.damageDice, weapon.damageBonus || 0, isCrit)
    const newHP = Math.max(0, target.currentHP - dmg.total)
    const critStr = isCrit ? 'CRITICAL ' : ''

    newState = newState.withUpdatedCombatant(attackerId, a => ({
      attacksHit: (a.attacksHit || 0) + 1,
      totalDamageDealt: (a.totalDamageDealt || 0) + dmg.total,
    }))

    newState = newState.withUpdatedCombatant(option.targetId, {
      currentHP: newHP,
      totalDamageTaken: (target.totalDamageTaken || 0) + dmg.total,
    })

    logs.push(`${attacker.name} attacks ${target.name} with ${weapon.name}: ` +
      `[d20:${atkResult.natural}+${weapon.attackBonus}=${atkResult.total} vs AC ${target.ac}] ` +
      `${critStr}HIT! ${dmg.total} damage. ${target.name} HP: ${newHP}/${target.maxHP}`)

    // Polymorph revert: if polymorphed creature reaches 0 HP, revert to original form
    if (newHP <= 0) {
      const polyRevert = checkPolymorphRevert(newState, option.targetId, dmg.total - target.currentHP)
      newState = polyRevert.state
      logs.push(...polyRevert.logs)
    }

    // Hypnotic Pattern: damage breaks charm on this creature
    const charmBreak = removeCharmedHPOnDamage(newState, option.targetId, dmg.total)
    newState = charmBreak.state
    logs.push(...charmBreak.logs)

    // Concentration check (skip if dead or just reverted from polymorph and alive)
    const updatedTarget = newState.getCombatant(option.targetId)
    if (updatedTarget.concentrating && updatedTarget.currentHP > 0) {
      const conResult = checkConcentration(newState, option.targetId, dmg.total)
      newState = conResult.state
      logs.push(...conResult.logs)
    }

    return { state: finalizeMultiattackAction(newState, attackerId).withLogEntries(logs), result: { type: 'attack', hit: true, damage: dmg.total, damageRolls: dmg.rolls, damageDice: weapon.damageDice, crit: isCrit, roll: atkResult.total, natural: atkResult.natural, targetAC: target.ac, targetId: option.targetId, attackerId } }
  } else {
    logs.push(`${attacker.name} attacks ${target.name} with ${weapon.name}: ` +
      `[d20:${atkResult.natural}+${weapon.attackBonus}=${atkResult.total} vs AC ${target.ac}] ${atkResult.natural === 1 ? 'CRITICAL FAILURE!' : 'MISS!'}`)

    return { state: finalizeMultiattackAction(newState, attackerId).withLogEntries(logs), result: { type: 'attack', hit: false, damage: 0, damageRolls: [], damageDice: weapon.damageDice, crit: false, roll: atkResult.total, natural: atkResult.natural, targetAC: target.ac, targetId: option.targetId, attackerId } }
  }
}

// â”€â”€ Multiattack â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function resolveMultiattack(state, attackerId, option) {
  const attacker = state.getCombatant(attackerId)
  const weapons = attacker.weapons || []
  // Use multiattackWeapons to pick the correct weapon for same-weapon multiattack
  const multiattackWeaponName = (attacker.multiattackWeapons || [])[0]
  const defaultWeapon = (multiattackWeaponName ? weapons.find(w => w.name === multiattackWeaponName) : null) || attacker.weapon || weapons[0]
  const biteWeapon = weapons.find(w => w.name === 'Bite')
  const tailWeapon = weapons.find(w => w.name === 'Tail')
  const isTrexMultiattack =
    option.attackCount >= 2 &&
    biteWeapon &&
    tailWeapon &&
    (
      attacker.polymorphedAs === 'T-Rex' ||
      attacker.name === 'T-Rex' ||
      attacker.name === 'Tyrannosaurus Rex'
    )

  if (!defaultWeapon) {
    return {
      state: state.withUpdatedCombatant(attackerId, { usedAction: true }),
      result: { type: 'multiattack', totalDamage: 0, hits: 0, attackCount: option.attackCount, attacks: [] },
    }
  }

  const totalDamage = { total: 0, hits: 0 }
  const attacks = []  // Individual attack results for reaction processing

  let currentState = state.withUpdatedCombatant(attackerId, { usedAction: true })
  const logs = []
  let firstTrexTargetId = null

  for (let i = 0; i < option.attackCount; i++) {
    const weapon = isTrexMultiattack
      ? (i === 0 ? biteWeapon : tailWeapon)
      : defaultWeapon

    let targetId = option.targetId
    let target = currentState.getCombatant(targetId)
    const mustAvoidFirstTarget = isTrexMultiattack && i > 0 && firstTrexTargetId

    if (mustAvoidFirstTarget && targetId === firstTrexTargetId) {
      target = null
    }

    // If original target is dead/invalid, redirect to nearest living enemy
    if (!target || target.currentHP <= 0) {
      const curAttacker = currentState.getCombatant(attackerId)
      const allCombatants = currentState.getAllCombatants()
      const livingEnemies = allCombatants.filter(c =>
        c.side !== curAttacker.side &&
        c.currentHP > 0 &&
        (!mustAvoidFirstTarget || c.id !== firstTrexTargetId)
      )
      if (livingEnemies.length === 0) break

      // Pick closest enemy
      let closest = livingEnemies[0]
      let closestDist = TurnMenu.combatDistance(curAttacker, closest)
      for (const e of livingEnemies) {
        const d = TurnMenu.combatDistance(curAttacker, e)
        if (d < closestDist) { closest = e; closestDist = d }
      }

      // Check weapon range
      if (closestDist > (weapon.range || 5)) break

      targetId = closest.id
      target = closest
      if (mustAvoidFirstTarget) {
        logs.push(`  â†’ ${target.name} is next target for Tail (cannot target the same creature as Bite)`)
      } else {
        logs.push(`  â†’ ${target.name} is next target (redirect)`)
      }
    }

    if (mustAvoidFirstTarget && targetId === firstTrexTargetId) {
      logs.push(`  ${attacker.name} cannot use Tail on the same target as Bite â€” no valid second target in range.`)
      break
    }

    const isTargetParalyzed = (target.conditions || []).includes('paralyzed')
    const isTargetFaerieFired = (target.conditions || []).includes('faerie_fire')
    const curAttacker = currentState.getCombatant(attackerId)
    const within5ft = TurnMenu.combatDistance(curAttacker, target) <= 5
    const hasAdv = (curAttacker.conditions || []).includes('invisible') ||
      isTargetFaerieFired ||
      (isTargetParalyzed && within5ft)
    const hasVmDisadv = (curAttacker.conditions || []).includes('vm_disadvantage')
    const isFrightened = (curAttacker.conditions || []).includes('frightened')
    const hasDisadv = ((target.conditions || []).includes('dodging') || hasVmDisadv || isFrightened) && !hasAdv
    const forceCrit = isTargetParalyzed && within5ft

    const atkResult = mech.makeAttackRoll(weapon.attackBonus || 0, target.ac, hasAdv, hasDisadv)
    const isCrit = forceCrit || atkResult.isCrit
    const hits = isCrit || atkResult.hits

    // Consume vm_disadvantage after first attack roll
    if (hasVmDisadv) {
      const newConds = (curAttacker.conditions || []).filter(c => c !== 'vm_disadvantage')
      currentState = currentState.withUpdatedCombatant(attackerId, { conditions: newConds })
    }

    currentState = currentState.withUpdatedCombatant(attackerId, a => ({
      attacksMade: (a.attacksMade || 0) + 1,
    }))

    if (hits) {
      const dmg = mech.rollDamage(weapon.damageDice, weapon.damageBonus || 0, isCrit)
      const newHP = Math.max(0, target.currentHP - dmg.total)
      totalDamage.total += dmg.total
      totalDamage.hits++

      currentState = currentState.withUpdatedCombatant(attackerId, a => ({
        attacksHit: (a.attacksHit || 0) + 1,
        totalDamageDealt: (a.totalDamageDealt || 0) + dmg.total,
      }))

      currentState = currentState.withUpdatedCombatant(targetId, {
        currentHP: newHP,
        totalDamageTaken: (target.totalDamageTaken || 0) + dmg.total,
      })

      const critStr = isCrit ? 'CRITICAL ' : ''
      logs.push(`  ${curAttacker.name} attack ${i + 1}: ` +
        `(${weapon.name}) [d20:${atkResult.natural}+${weapon.attackBonus}=${atkResult.total} vs AC ${target.ac}] ` +
        `${critStr}HIT! ${dmg.total} damage. ${target.name} HP: ${newHP}/${target.maxHP}`)

      // Polymorph revert: if polymorphed creature reaches 0 HP, revert to original form
      if (newHP <= 0) {
        const polyRevert = checkPolymorphRevert(currentState, targetId, dmg.total - target.currentHP)
        currentState = polyRevert.state
        logs.push(...polyRevert.logs)
      }

      // Hypnotic Pattern: damage breaks charm on this creature
      const charmBreak = removeCharmedHPOnDamage(currentState, targetId, dmg.total)
      currentState = charmBreak.state
      logs.push(...charmBreak.logs)

      const updatedMultiTarget = currentState.getCombatant(targetId)
      if (updatedMultiTarget.concentrating && updatedMultiTarget.currentHP > 0) {
        const conResult = checkConcentration(currentState, targetId, dmg.total)
        currentState = conResult.state
        logs.push(...conResult.logs)
      }

      attacks.push({ hit: true, damage: dmg.total, damageRolls: dmg.rolls, damageDice: weapon.damageDice, weaponName: weapon.name, crit: isCrit, roll: atkResult.total, natural: atkResult.natural, targetAC: target.ac, targetId, attackerId })
    } else {
      logs.push(`  ${curAttacker.name} attack ${i + 1}: ` +
        `(${weapon.name}) [d20:${atkResult.natural}+${weapon.attackBonus}=${atkResult.total} vs AC ${target.ac}] ${atkResult.natural === 1 ? 'CRITICAL FAILURE!' : 'MISS!'}`)
      attacks.push({ hit: false, damage: 0, damageRolls: [], damageDice: weapon.damageDice, weaponName: weapon.name, crit: false, roll: atkResult.total, natural: atkResult.natural, targetAC: target.ac, targetId, attackerId })
    }

    if (isTrexMultiattack && i === 0) {
      firstTrexTargetId = targetId
    }
  }

  return {
    state: currentState.withLogEntries(logs),
    result: { type: 'multiattack', totalDamage: totalDamage.total, hits: totalDamage.hits, attackCount: option.attackCount, attacks },
  }
}

// â”€â”€ Spell Resolution â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function resolveSpell(state, casterId, option, choice) {
  const caster = state.getCombatant(casterId)
  const spellDef = getSpell(option.spellName)
  const slotLevel = option.slotLevel
  const logs = []
  let currentState = state

  // 1. Spend slot
  if (slotLevel > 0) {
    const slots = { ...caster.spellSlots }
    slots[slotLevel]--
    currentState = currentState.withUpdatedCombatant(casterId, {
      spellSlots: slots,
      spellsCast: (caster.spellsCast || 0) + 1,
    })
  }

  // 2. Mark action/bonus used + bonus-action spell restriction
  if (option.category === 'bonusAction') {
    currentState = currentState.withUpdatedCombatant(casterId, {
      usedBonusAction: true,
      bonusActionSpellCastThisTurn: true,
    })
  } else {
    currentState = currentState.withUpdatedCombatant(casterId, { usedAction: true })
  }

  // 3. Break existing concentration if needed
  if (spellDef.concentration && caster.concentrating) {
    const breakResult = breakConcentration(currentState, casterId)
    currentState = breakResult.state
    logs.push(...breakResult.logs)
  }

  // 4. Resolve by targeting type
  const targeting = spellDef.targeting || {}
  let spellResultDetails = {}

  if (targeting.type === 'single') {
    const resolution = resolveSingleTargetSpell(currentState, casterId, spellDef, slotLevel, choice.targetId, logs, choice)
    currentState = resolution.state
    logs.push(...resolution.logs)
    spellResultDetails = resolution.result || {}
  } else if (targeting.type === 'area') {
    const resolution = resolveAreaSpell(currentState, casterId, spellDef, slotLevel, choice.aoeCenter, logs)
    currentState = resolution.state
    logs.push(...resolution.logs)
    spellResultDetails = resolution.result || {}
  } else if (targeting.type === 'self') {
    const resolution = resolveSelfSpell(currentState, casterId, spellDef, slotLevel, logs)
    currentState = resolution.state
    logs.push(...resolution.logs)
    spellResultDetails = resolution.result || {}
  }

  // 5. Set up concentration tracking
  if (spellDef.concentration) {
    currentState = currentState.withUpdatedCombatant(casterId, {
      concentrating: spellDef.name,
      concentrationRoundsRemaining: spellDef.duration || 10,
    })
  }

  const levelLabel = slotLevel > 0 ? ` (${slotLevel}${ordinalSuffix(slotLevel)} level)` : ''
  logs.unshift(`${caster.name} casts ${spellDef.name}${levelLabel}`)

  return {
    state: currentState.withLogEntries(logs),
    result: { type: 'spell', spellName: spellDef.name, slotLevel, ...spellResultDetails },
  }
}

/** Spells that only work on humanoid creature types */
const HUMANOID_ONLY_SPELLS = new Set(['Hold Person'])

/**
 * Check if a creature can use Legendary Resistance to turn a failed save
 * into a success. Spends one use if available.
 * @param {GameState} state
 * @param {string}    targetId
 * @param {string[]}  logs
 * @returns {{ state: GameState, used: boolean }}
 */
function tryLegendaryResistance(state, targetId, logs) {
  const target = state.getCombatant(targetId)
  if (!target.legendaryResistance || target.legendaryResistance.uses <= 0) {
    return { state, used: false }
  }
  const remaining = target.legendaryResistance.uses - 1
  logs.push(`    \u2192 ${target.name} uses Legendary Resistance! (${remaining} remaining)`)
  const newState = state.withUpdatedCombatant(targetId, {
    legendaryResistance: { ...target.legendaryResistance, uses: remaining },
  })
  return { state: newState, used: true }
}

function resolveSingleTargetSpell(state, casterId, spellDef, slotLevel, targetId, parentLogs, choice) {
  const caster = state.getCombatant(casterId)
  const target = state.getCombatant(targetId)
  const logs = []
  let currentState = state

  // Hold Person only works on humanoids (D&D 5e PHB p.251)
  if (HUMANOID_ONLY_SPELLS.has(spellDef.name) && target.type && target.type !== 'humanoid') {
    logs.push(`  â†’ ${target.name} is not humanoid (${target.type}) â€” ${spellDef.name} has no effect!`)
    return { state: currentState, logs, result: {} }
  }

  // â”€â”€ Polymorph: special stat-replacement mechanic â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (spellDef.name === 'Polymorph') {
    return resolvePolymorphSpell(currentState, casterId, targetId, spellDef, slotLevel, logs, choice)
  }

  // â”€â”€ Magic Missile: auto-hit multi-dart spell â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (spellDef.special && Array.isArray(spellDef.special) && spellDef.special.includes('auto_hit')) {
    const baseDarts = 3
    const upcastExtra = Math.max(0, slotLevel - (spellDef.level || 1))
    const darts = (spellDef.dartsAtLevel && spellDef.dartsAtLevel[slotLevel]) || (baseDarts + upcastExtra)
    let totalDamage = 0
    const damageRolls = []
    for (let i = 0; i < darts; i++) {
      const dartResult = applySpellDamage(currentState, casterId, targetId, spellDef, slotLevel, false)
      currentState = dartResult.state
      totalDamage += dartResult.damage
      if (Array.isArray(dartResult.damageRolls)) damageRolls.push(...dartResult.damageRolls)
    }
    logs.push(`  â†’ Magic Missile: ${darts} darts, ${totalDamage} total ${spellDef.damage?.type || 'force'} damage.`)
    return {
      state: currentState,
      logs,
      result: {
        damage: totalDamage,
        damageRolls,
        damageDice: spellDef.damage?.dice || null,
      },
    }
  }

  // â”€â”€ Power Word Stun: auto-stun if target HP â‰¤ 150 â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (spellDef.special && Array.isArray(spellDef.special) && spellDef.special.includes('hp_threshold_150')) {
    const freshTarget = currentState.getCombatant(targetId)
    if (freshTarget.currentHP <= 150) {
      currentState = applySpellEffects(currentState, targetId, spellDef, logs)
      logs.push(`  â†’ ${freshTarget.name} is stunned! (${freshTarget.currentHP} HP â‰¤ 150)`)
    } else {
      logs.push(`  â†’ ${freshTarget.name} has too many HP (${freshTarget.currentHP} > 150) â€” Power Word Stun fails!`)
    }
    return { state: currentState, logs, result: {} }
  }

  // Healing spell
  if (spellDef.healing) {
    const healDice = spellDef.healing.dice || '1d4'
    const healRoll = dice.parseDiceAndRoll(healDice)
    const castingMod = caster.chaMod || 0
    const healAmount = healRoll.total + castingMod
    const newHP = Math.min(target.maxHP, target.currentHP + healAmount)

    currentState = currentState.withUpdatedCombatant(targetId, { currentHP: newHP })
    logs.push(`  â†’ Heals ${target.name} for ${healAmount}. HP: ${newHP}/${target.maxHP}`)

    return {
      state: currentState,
      logs,
      result: {
        healing: healAmount,
        healingRolls: healRoll.rolls,
        healingDice: healDice,
      },
    }
  }

  // Attack spell
  if (spellDef.attack) {
    const atkResult = mech.makeAttackRoll(caster.spellAttackBonus || 0, target.ac, false, false)
    let spellAttackResult = {
      attackRoll: {
        natural: atkResult.natural,
        total: atkResult.total,
      },
      hit: atkResult.hits,
      damage: 0,
      damageRolls: [],
      damageDice: spellDef.damage?.dice || null,
    }
    if (atkResult.hits) {
      const dmgResult = applySpellDamage(currentState, casterId, targetId, spellDef, slotLevel, atkResult.isCrit)
      currentState = dmgResult.state
      spellAttackResult = {
        attackRoll: {
          natural: atkResult.natural,
          total: atkResult.total,
        },
        hit: true,
        damage: dmgResult.damage,
        damageRolls: dmgResult.damageRolls || [],
        damageDice: dmgResult.damageDice || spellDef.damage?.dice || null,
      }
      logs.push(`  â†’ Attack roll: [d20:${atkResult.natural}+${caster.spellAttackBonus}=${atkResult.total} vs AC ${target.ac}] HIT! ${dmgResult.damage} damage.`)
      logs.push(...dmgResult.logs)
      // Apply on-hit effects (Chill Touch: no_healing, Ray of Frost: speed_reduced_10, etc.)
      currentState = applySpellEffects(currentState, targetId, spellDef, logs)
    } else {
      logs.push(`  â†’ Attack roll: [d20:${atkResult.natural}+${caster.spellAttackBonus}=${atkResult.total} vs AC ${target.ac}] ${atkResult.natural === 1 ? 'CRITICAL FAILURE!' : 'MISS!'}`)
    }
    return { state: currentState, logs, result: spellAttackResult }
  }

  // Save spell
  if (spellDef.save) {
    const dc = caster.spellSaveDC || 10
    const saveAbility = spellDef.save.ability
    const saveBonus = (target.saves && target.saves[saveAbility]) || 0
    const hasAdv = hasSaveAdvantage(target, spellDef)
    const isAutoFail = autoFailsSave(target, saveAbility)
    const saveResult = isAutoFail
      ? { success: false, total: 0 }
      : mech.makeSavingThrow(saveBonus, dc, hasAdv, false)

    const saves = [{
      roll: saveResult.total,
      total: saveResult.total,
      saveBonus,
      success: saveResult.success,
      targetName: target.name,
    }]
    let spellDamage = 0
    let damageRolls = []
    let damageDice = spellDef.damage?.dice || null

    if (saveResult.success) {
      logs.push(`  â†’ ${target.name} ${saveAbility.toUpperCase()} save: [${saveResult.total} vs DC ${dc}] SUCCESS!${hasAdv ? ' (advantage)' : ''}`)
      if (!spellDef.save.negatesAll && spellDef.damage) {
        // Half damage on save
        const dmgResult = applySpellDamage(currentState, casterId, targetId, spellDef, slotLevel, false, 0.5)
        currentState = dmgResult.state
        spellDamage += dmgResult.damage
        if (Array.isArray(dmgResult.damageRolls)) damageRolls.push(...dmgResult.damageRolls)
        damageDice = dmgResult.damageDice || damageDice
        logs.push(`    â†’ Half damage: ${dmgResult.damage}`)
        logs.push(...dmgResult.logs)
      }
    } else {
      // Check Legendary Resistance on failed single-target save
      const lr = tryLegendaryResistance(currentState, targetId, logs)
      currentState = lr.state

      if (lr.used) {
        saves[0].success = true
        logs.push(`  â†’ ${target.name} ${saveAbility.toUpperCase()} save: [${saveResult.total} vs DC ${dc}] SUCCESS (Legendary Resistance)`)
        if (!spellDef.save.negatesAll && spellDef.damage) {
          const dmgResult = applySpellDamage(currentState, casterId, targetId, spellDef, slotLevel, false, 0.5)
          currentState = dmgResult.state
          spellDamage += dmgResult.damage
          if (Array.isArray(dmgResult.damageRolls)) damageRolls.push(...dmgResult.damageRolls)
          damageDice = dmgResult.damageDice || damageDice
          logs.push(`    â†’ Half damage: ${dmgResult.damage}`)
          logs.push(...dmgResult.logs)
        }
      } else {
        logs.push(`  â†’ ${target.name} ${saveAbility.toUpperCase()} save: [${saveResult.total} vs DC ${dc}] FAIL!`)
        if (spellDef.damage) {
          const dmgResult = applySpellDamage(currentState, casterId, targetId, spellDef, slotLevel, false)
          currentState = dmgResult.state
          spellDamage += dmgResult.damage
          if (Array.isArray(dmgResult.damageRolls)) damageRolls.push(...dmgResult.damageRolls)
          damageDice = dmgResult.damageDice || damageDice
          logs.push(`    â†’ ${dmgResult.damage} damage.`)
          logs.push(...dmgResult.logs)
        }
        // Apply conditions
        currentState = applySpellEffects(currentState, targetId, spellDef, logs)

        // Forced reaction movement (Dissonant Whispers: must use reaction to move away)
        const reactionMove = resolveReactionMovement(currentState, casterId, targetId, logs)
        currentState = reactionMove.state
      }
    }
    return {
      state: currentState,
      logs,
      result: {
        saves,
        damage: spellDamage,
        damageRolls,
        damageDice,
      },
    }
  }

  // â”€â”€ Buff/utility spells with no attack/save/healing â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // e.g. Shield of Faith (+2 AC on target), Mage Armor (set AC 13+DEX), Counterspell
  if (!spellDef.attack && !spellDef.save && !spellDef.healing) {
    currentState = applySpellBuff(currentState, targetId, spellDef, logs)
  }

  return { state: currentState, logs, result: {} }
}

function resolveAreaSpell(state, casterId, spellDef, slotLevel, aoeCenter, parentLogs) {
  const caster = state.getCombatant(casterId)
  const allCombatants = state.getAllCombatants()
  const logs = []
  let currentState = state
  const saves = []
  let totalDamage = 0
  const damageRolls = []
  let damageDice = spellDef.damage?.dice || null

  // Build virtual combatant objects for targetResolver compatibility
  const virtualCombatants = allCombatants.map(c => ({
    ...c,
    side: c.side,
    position: c.position,
  }))
  const virtualCaster = virtualCombatants.find(c => c.id === casterId)

  const targets = resolveAoETargets(virtualCaster, spellDef, aoeCenter, virtualCombatants)
  logs.push(`  â†’ AoE hits ${targets.length} target(s)`)

  const dc = caster.spellSaveDC || 10

  // â”€â”€ Sleep: HP-pool mechanic (no save) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (spellDef.special && spellDef.special.includes('hp_pool')) {
    return resolveSleepSpell(currentState, casterId, spellDef, slotLevel, targets, logs)
  }

  for (const virtualTarget of targets) {
    const target = currentState.getCombatant(virtualTarget.id)
    if (!target || target.currentHP <= 0) continue

    if (spellDef.save) {
      const saveAbility = spellDef.save.ability
      const saveBonus = (target.saves && target.saves[saveAbility]) || 0
      const hasAdv = hasSaveAdvantage(target, spellDef)
      const isAutoFail = autoFailsSave(target, saveAbility)
      const saveResult = isAutoFail
        ? { success: false, total: 0 }
        : mech.makeSavingThrow(saveBonus, dc, hasAdv, false)
      saves.push({
        roll: saveResult.total,
        total: saveResult.total,
        saveBonus,
        success: saveResult.success,
        targetName: target.name,
      })

      if (saveResult.success) {
        logs.push(`  â†’ ${target.name} ${saveAbility.toUpperCase()} save: SUCCESS`)
        if (!spellDef.save.negatesAll && spellDef.damage) {
          const dmgResult = applySpellDamage(currentState, casterId, virtualTarget.id, spellDef, slotLevel, false, 0.5)
          currentState = dmgResult.state
          totalDamage += dmgResult.damage
          if (Array.isArray(dmgResult.damageRolls)) damageRolls.push(...dmgResult.damageRolls)
          damageDice = dmgResult.damageDice || damageDice
          logs.push(...dmgResult.logs)
        }
      } else {
        // Check Legendary Resistance on failed AoE save
        let aoeSaveSucceeded = false
        const lr = tryLegendaryResistance(currentState, virtualTarget.id, logs)
        currentState = lr.state
        if (lr.used) aoeSaveSucceeded = true
        if (lr.used && saves.length > 0) saves[saves.length - 1].success = true

        if (aoeSaveSucceeded) {
          logs.push(`  \u2192 ${target.name} ${saveAbility.toUpperCase()} save: SUCCESS (Legendary Resistance)`)
          if (!spellDef.save.negatesAll && spellDef.damage) {
            const dmgResult = applySpellDamage(currentState, casterId, virtualTarget.id, spellDef, slotLevel, false, 0.5)
            currentState = dmgResult.state
            totalDamage += dmgResult.damage
            if (Array.isArray(dmgResult.damageRolls)) damageRolls.push(...dmgResult.damageRolls)
            damageDice = dmgResult.damageDice || damageDice
            logs.push(...dmgResult.logs)
          }
        } else {
          logs.push(`  \u2192 ${target.name} ${saveAbility.toUpperCase()} save: FAIL`)
          if (spellDef.damage) {
            const dmgResult = applySpellDamage(currentState, casterId, virtualTarget.id, spellDef, slotLevel, false)
            currentState = dmgResult.state
            totalDamage += dmgResult.damage
            if (Array.isArray(dmgResult.damageRolls)) damageRolls.push(...dmgResult.damageRolls)
            damageDice = dmgResult.damageDice || damageDice
            logs.push(...dmgResult.logs)
          }
          currentState = applySpellEffects(currentState, virtualTarget.id, spellDef, logs)
        }
      }
    }
  }

  return {
    state: currentState,
    logs,
    result: {
      saves,
      damage: totalDamage,
      totalDamage,
      damageRolls,
      damageDice,
    },
  }
}

/**
 * Polymorph: replace creature's stats with a beast form.
 *
 * On enemy: WIS save or become the chosen beast (player picks, e.g. Sheep).
 * On self: no save, become the chosen beast (player picks, e.g. T-Rex/Giant Ape).
 *
 * The player's choice is in choice.beastFormName. If not provided, falls back
 * to legacy behavior (Sheep for enemy, highest-HP for self).
 *
 * When polymorphed creature drops to 0 HP, original form returns.
 * Original stats are stored in prePolymorphState.
 */
export function resolvePolymorphSpell(state, casterId, targetId, spellDef, slotLevel, parentLogs, choice) {
  const caster = state.getCombatant(casterId)
  const target = state.getCombatant(targetId)
  const logs = []
  let currentState = state
  const isSelfTarget = casterId === targetId

  // Enemy target: WIS save
  if (!isSelfTarget && spellDef.save) {
    const dc = caster.spellSaveDC || 10
    const saveAbility = spellDef.save.ability
    const saveBonus = (target.saves && target.saves[saveAbility]) || 0
    const hasAdv = hasSaveAdvantage(target, spellDef)
    const isAutoFail = autoFailsSave(target, saveAbility)
    const saveResult = isAutoFail
      ? { success: false, total: 0 }
      : mech.makeSavingThrow(saveBonus, dc, hasAdv, false)

    // Check Legendary Resistance
    if (!saveResult.success) {
      const lr = tryLegendaryResistance(currentState, targetId, logs)
      currentState = lr.state
      if (lr.used) {
        logs.push(`  â†’ ${target.name} ${saveAbility.toUpperCase()} save: SUCCESS (Legendary Resistance) â€” Polymorph resisted!`)
        return { state: currentState, logs }
      }
    }

    if (saveResult.success) {
      logs.push(`  â†’ ${target.name} ${saveAbility.toUpperCase()} save: [${saveResult.total} vs DC ${dc}] SUCCESS â€” resists Polymorph!`)
      return { state: currentState, logs }
    }

    logs.push(`  â†’ ${target.name} ${saveAbility.toUpperCase()} save: [${saveResult.total} vs DC ${dc}] FAIL!`)

    // Transform into sheep â€” Polymorph replaces ALL game statistics
    // Use player-chosen beast form, or default to Sheep for enemy
    const chosenName = choice?.beastFormName
    let sheepForm
    if (chosenName) {
      // Look up chosen form from all beast forms
      const allForms = [...(spellDef.beastForms?.self || []), ...(spellDef.beastForms?.enemy ? [spellDef.beastForms.enemy] : [])]
      sheepForm = allForms.find(f => f.name === chosenName) || spellDef.beastForms?.enemy || { name: 'Sheep', maxHP: 1, ac: 10, speed: 20, str: 2, dex: 10, con: 6, wis: 10, weapons: [] }
    } else {
      sheepForm = spellDef.beastForms?.enemy || { name: 'Sheep', maxHP: 1, ac: 10, speed: 20, str: 2, dex: 10, con: 6, wis: 10, weapons: [] }
    }
    const preState = {
      currentHP: target.currentHP, maxHP: target.maxHP, ac: target.ac,
      speed: target.speed,
      str: target.str, strMod: target.strMod,
      dex: target.dex, dexMod: target.dexMod,
      con: target.con, conMod: target.conMod,
      wis: target.wis, wisMod: target.wisMod,
      saves: target.saves,
      weapons: target.weapons, weapon: target.weapon, multiattack: target.multiattack,
      multiattackWeapons: target.multiattackWeapons || null,
      spellSlots: target.spellSlots, spellsKnown: target.spellsKnown,
      cantrips: target.cantrips, spellSaveDC: target.spellSaveDC,
      concentrating: target.concentrating,
      flying: target.flying,
      breathWeapon: target.breathWeapon,
      legendaryResistance: target.legendaryResistance,
      legendaryActions: target.legendaryActions,
      type: target.type,
    }
    currentState = currentState.withUpdatedCombatant(targetId, {
      prePolymorphState: preState,
      polymorphedAs: sheepForm.name,
      currentHP: sheepForm.maxHP,
      maxHP: sheepForm.maxHP,
      ac: sheepForm.ac || 10,
      speed: sheepForm.speed || 20,
      str: sheepForm.str || 2,
      strMod: Math.floor(((sheepForm.str || 2) - 10) / 2),
      dex: sheepForm.dex || 10,
      dexMod: Math.floor(((sheepForm.dex || 10) - 10) / 2),
      con: sheepForm.con || 6,
      conMod: Math.floor(((sheepForm.con || 6) - 10) / 2),
      wis: sheepForm.wis || 10,
      wisMod: Math.floor(((sheepForm.wis || 10) - 10) / 2),
      saves: {},          // Sheep has no save proficiencies
      weapons: sheepForm.weapons || [],
      weapon: sheepForm.weapons?.[0] || null,
      multiattack: 0,
      spellSlots: {},
      spellsKnown: [],
      cantrips: [],
      spellSaveDC: 0,
      flying: false,       // Sheep can't fly
      breathWeapon: null,  // Lose all special abilities
      legendaryResistance: null,
      legendaryActions: null,
      type: 'beast',
      conditions: [...(target.conditions || []), 'polymorphed'],
    })
    currentState = currentState.withUpdatedCombatant(casterId, c => ({
      conditionsInflicted: (c.conditionsInflicted || 0) + 1,
    }))
    logs.push(`  â†’ ${target.name} is polymorphed into a ${sheepForm.name}! (${sheepForm.maxHP} HP, AC ${sheepForm.ac || 10})`)

    return { state: currentState, logs }
  }

  // Self target: no save, use player-chosen beast form or pick best
  const selfForms = spellDef.beastForms?.self || []
  const chosenSelfName = choice?.beastFormName
  let beastForm
  if (chosenSelfName) {
    beastForm = selfForms.find(f => f.name === chosenSelfName)
  }
  if (!beastForm) {
    // Fallback: pick the highest-HP form (T-Rex: 136 HP is best for combat)
    beastForm = selfForms.length > 0
      ? selfForms.reduce((best, f) => f.maxHP > best.maxHP ? f : best, selfForms[0])
      : { name: 'T-Rex', maxHP: 136, ac: 13, speed: 50, str: 25, strMod: 7, dex: 10, dexMod: 0, con: 19, conMod: 4, multiattack: 2, multiattackWeapons: ['Bite', 'Tail'], weapons: [
          { name: 'Bite', attackBonus: 10, damageDice: '4d12', damageBonus: 7, type: 'melee', range: 10 },
          { name: 'Tail', attackBonus: 10, damageDice: '3d8', damageBonus: 7, type: 'melee', range: 10 },
        ] }
  }

  const preState = {
    currentHP: target.currentHP, maxHP: target.maxHP, ac: target.ac,
    speed: target.speed, str: target.str, strMod: target.strMod,
    dex: target.dex, dexMod: target.dexMod, con: target.con, conMod: target.conMod,
    weapons: target.weapons, weapon: target.weapon, multiattack: target.multiattack,
    multiattackWeapons: target.multiattackWeapons || null,
    spellSlots: target.spellSlots, spellsKnown: target.spellsKnown,
    cantrips: target.cantrips, spellSaveDC: target.spellSaveDC,
    flying: target.flying,
  }
  currentState = currentState.withUpdatedCombatant(targetId, {
    prePolymorphState: preState,
    polymorphedAs: beastForm.name,
    currentHP: beastForm.maxHP,
    maxHP: beastForm.maxHP,
    ac: beastForm.ac || 13,
    speed: beastForm.speed || 50,
    str: beastForm.str || 25,
    strMod: beastForm.strMod || Math.floor((beastForm.str - 10) / 2),
    dex: beastForm.dex || 10,
    dexMod: beastForm.dexMod || Math.floor((beastForm.dex - 10) / 2),
    con: beastForm.con || 19,
    conMod: beastForm.conMod || Math.floor((beastForm.con - 10) / 2),
    weapons: beastForm.weapons || [],
    weapon: beastForm.weapons?.[0] || null,
    multiattack: beastForm.multiattack || 0,
    multiattackWeapons: beastForm.multiattackWeapons || null,
    flying: beastForm.flying || false,
    // Lose spellcasting in beast form
    spellSlots: {},
    spellsKnown: [],
    cantrips: [],
    spellSaveDC: 0,
    conditions: [...(target.conditions || []), 'polymorphed'],
  })
  logs.push(`  â†’ ${target.name} polymorphs into a ${beastForm.name}! (${beastForm.maxHP} HP, AC ${beastForm.ac || 13}, multiattack: ${beastForm.multiattack || 0})`)

  return { state: currentState, logs }
}

/**
 * Sleep: roll HP pool, put lowest-HP creatures to sleep first.
 * No saving throw. Undead and creatures immune to charm are unaffected.
 */
export function resolveSleepSpell(state, casterId, spellDef, slotLevel, targets, parentLogs) {
  const logs = []
  let currentState = state

  // Calculate HP pool: 5d8 base + 2d8 per slot level above 1
  const baseDice = 5 + 2 * Math.max(0, slotLevel - 1)
  const poolRoll = dice.parseDiceAndRoll(`${baseDice}d8`)
  let remainingPool = poolRoll.total
  logs.push(`  â†’ Sleep HP pool: ${poolRoll.total} (${baseDice}d8)`)

  // Sort targets by current HP ascending (sleep hits lowest HP first)
  const sortedTargets = [...targets]
    .map(vt => ({ ...vt, ...currentState.getCombatant(vt.id) }))
    .filter(t => t.currentHP > 0)
    .filter(t => t.type !== 'undead')
    .filter(t => !t.immuneCharmed && !t.immuneSleep)
    .sort((a, b) => a.currentHP - b.currentHP)

  let sleptCount = 0
  for (const target of sortedTargets) {
    if (target.currentHP <= remainingPool) {
      remainingPool -= target.currentHP
      // Apply asleep condition (wake on damage)
      const oldConds = (target.conditions || [])
      const newConds = [...oldConds.filter(c => c !== 'asleep' && c !== 'unconscious'), 'asleep', 'unconscious']
      currentState = currentState.withUpdatedCombatant(target.id, {
        conditions: newConds,
      })
      currentState = currentState.withUpdatedCombatant(casterId, c => ({
        conditionsInflicted: (c.conditionsInflicted || 0) + 1,
      }))
      sleptCount++
      logs.push(`    â†’ ${target.name} (${target.currentHP} HP) falls asleep! Pool remaining: ${remainingPool}`)
    } else {
      logs.push(`    â†’ ${target.name} (${target.currentHP} HP) â€” not enough pool remaining (${remainingPool})`)
      break
    }
  }

  if (sleptCount === 0) {
    logs.push(`  â†’ No creatures affected by Sleep`)
  }

  return { state: currentState, logs }
}

function resolveSelfSpell(state, casterId, spellDef, slotLevel, parentLogs) {
  const logs = []
  let currentState = state

  currentState = applySpellEffects(currentState, casterId, spellDef, logs)

  // Apply self-targeted buff effects (invisible, teleport, globe_of_invulnerability, etc.) â€” BUG-2 fix
  if (spellDef.selfEffects && spellDef.selfEffects.length > 0) {
    const caster = currentState.getCombatant(casterId)
    const newConditions = [...(caster.conditions || [])]
    for (const effect of spellDef.selfEffects) {
      if (!newConditions.includes(effect)) {
        newConditions.push(effect)
      }
    }
    currentState = currentState.withUpdatedCombatant(casterId, { conditions: newConditions })
    logs.push(`  â†’ ${caster.name} gains: ${spellDef.selfEffects.join(', ')}`)
  }

  return { state: currentState, logs }
}

// â”€â”€ Spell Sub-helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * Apply buffing selfEffects to a target combatant.
 * Handles AC modifications (ac_bonus_2, ac_set_13_plus_dex) and
 * adds any other selfEffects as conditions.
 */
function applySpellBuff(state, targetId, spellDef, logs) {
  const target = state.getCombatant(targetId)
  if (!spellDef.selfEffects || spellDef.selfEffects.length === 0) return state

  let newState = state
  const updates = {}
  const conditionsToAdd = []

  for (const effect of spellDef.selfEffects) {
    if (effect === 'ac_bonus_2') {
      updates.ac = (target.ac || 0) + 2
      logs.push(`    â†’ ${target.name} gains +2 AC (${target.ac} â†’ ${updates.ac})`)
    } else if (effect === 'ac_set_13_plus_dex') {
      const newAC = 13 + (target.dexMod || 0)
      updates.ac = newAC
      logs.push(`    â†’ ${target.name} gains Mage Armor: AC set to ${newAC} (13 + DEX ${target.dexMod || 0})`)
    } else if (effect === 'ac_bonus_5') {
      updates.ac = (target.ac || 0) + 5
      logs.push(`    â†’ ${target.name} gains +5 AC (${target.ac} â†’ ${updates.ac})`)
    } else {
      conditionsToAdd.push(effect)
    }
  }

  if (conditionsToAdd.length > 0) {
    const existing = target.conditions || []
    updates.conditions = [...existing, ...conditionsToAdd.filter(e => !existing.includes(e))]
    logs.push(`    â†’ ${target.name} gains: ${conditionsToAdd.join(', ')}`)
  }

  if (Object.keys(updates).length > 0) {
    newState = newState.withUpdatedCombatant(targetId, updates)
  }
  return newState
}

function applySpellDamage(state, casterId, targetId, spellDef, slotLevel, isCrit = false, multiplier = 1) {
  if (!spellDef.damage) return { state, damage: 0, logs: [] }

  const caster = state.getCombatant(casterId)
  // Resolve 'casting_mod' string to actual caster modifier (Spiritual Weapon, etc.) â€” BUG-7 fix
  const rawBonus = spellDef.damage.bonus === 'casting_mod'
    ? (caster.chaMod || caster.wisMod || caster.intMod || 0)
    : (spellDef.damage.bonus || 0)

  const dmgRoll = mech.rollDamage(spellDef.damage.dice, rawBonus, isCrit)
  let baseDamage = dmgRoll.total

  // Bonus dice for spells with combined damage types (Ice Storm: 2d8 bludgeoning + 4d6 cold) â€” BUG-6 fix
  if (spellDef.damage.bonusDice) {
    const bonusRoll = mech.rollDamage(spellDef.damage.bonusDice, 0, isCrit)
    baseDamage += bonusRoll.total
  }

  // Upcast bonus: +1 die per level above spell's base level
  const upcastLevels = slotLevel - (spellDef.level || 0)
  if (upcastLevels > 0) {
    const dieMatch = spellDef.damage.dice.match(/\d+d(\d+)/)
    if (dieMatch) {
      const upcastDice = `${upcastLevels}d${dieMatch[1]}`
      const upcastRoll = mech.rollDamage(upcastDice, 0, isCrit)
      baseDamage += upcastRoll.total
    }
  }

  const rawDamage = Math.floor(baseDamage * multiplier)

  const target = state.getCombatant(targetId)
  const damage = applyDamageResistance(target, rawDamage, spellDef.damage?.type)
  const newHP = Math.max(0, target.currentHP - damage)
  const sideEffectLogs = []

  if (damage < rawDamage) {
    sideEffectLogs.push(`    â†’ ${target.name} resists ${spellDef.damage.type} damage (${rawDamage} â†’ ${damage})`)
  }

  let newState = state.withUpdatedCombatant(targetId, {
    currentHP: newHP,
    totalDamageTaken: (target.totalDamageTaken || 0) + damage,
  })

  newState = newState.withUpdatedCombatant(casterId, c => ({
    totalDamageDealt: (c.totalDamageDealt || 0) + damage,
  }))

  // Polymorph revert: if polymorphed creature reaches 0 HP, revert to original form
  if (newHP <= 0 && damage > 0) {
    const polyRevert = checkPolymorphRevert(newState, targetId, damage - target.currentHP)
    newState = polyRevert.state
    sideEffectLogs.push(...polyRevert.logs)
  }

  // Hypnotic Pattern: damage breaks charm on this creature
  if (damage > 0) {
    const charmBreak = removeCharmedHPOnDamage(newState, targetId, damage)
    newState = charmBreak.state
    sideEffectLogs.push(...charmBreak.logs)
  }

  // Concentration check on target
  const spellDmgTarget = newState.getCombatant(targetId)
  if (spellDmgTarget.concentrating && spellDmgTarget.currentHP > 0 && damage > 0) {
    const conResult = checkConcentration(newState, targetId, damage)
    newState = conResult.state
    sideEffectLogs.push(...conResult.logs)
  }

  return { state: newState, damage, damageRolls: dmgRoll.rolls, damageDice: spellDef.damage?.dice || null, logs: sideEffectLogs }
}

function applySpellEffects(state, targetId, spellDef, logs) {
  if (!spellDef.effects || spellDef.effects.length === 0) return state

  const target = state.getCombatant(targetId)

  // Charm immunity: creatures with immuneCharmed ignore charm-based effects entirely
  const CHARM_EFFECTS = new Set(['charmed_hp', 'charmed', 'incapacitated'])
  const hasCharmEffect = spellDef.effects.some(e => CHARM_EFFECTS.has(e))
  if (hasCharmEffect && target.immuneCharmed) {
    logs.push(`    â†’ ${target.name} is immune to charm â€” effect blocked!`)
    return state
  }

  const newConditions = [...(target.conditions || [])]
  let conditionsAdded = 0

  for (const effect of spellDef.effects) {
    if (!newConditions.includes(effect)) {
      newConditions.push(effect)
      conditionsAdded++
    }
  }

  if (conditionsAdded > 0) {
    logs.push(`    â†’ ${target.name} gains: ${spellDef.effects.join(', ')}`)
    return state.withUpdatedCombatant(targetId, { conditions: newConditions })
  }

  return state
}

// â”€â”€ Concentration â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function checkConcentration(state, targetId, damage) {
  const target = state.getCombatant(targetId)
  if (!target.concentrating) return { state, logs: [] }

  const conSave = mech.concentrationSave(target, damage)
  const logs = []

  if (conSave.success) {
    logs.push(`    â†’ Concentration save: [${conSave.total} vs DC ${conSave.dc}] MAINTAINED!`)
    return { state, logs }
  } else {
    logs.push(`    â†’ Concentration save: BROKEN! ${target.concentrating} ends!`)
    return breakConcentration(state, targetId)
  }
}

export function breakConcentration(state, casterId) {
  const caster = state.getCombatant(casterId)
  if (!caster.concentrating) return { state, logs: [] }

  const spell = caster.concentrating
  const logs = [`  â†’ ${caster.name} loses concentration on ${spell}`]

  let newState = state.withUpdatedCombatant(casterId, {
    concentrating: null,
    concentrationRoundsRemaining: 0,
  })

  // Clean up spell effects on other combatants
  const allCombatants = newState.getAllCombatants()
  const updates = []

  for (const c of allCombatants) {
    let changed = false
    let newConditions = [...(c.conditions || [])]

    switch (spell) {
      case 'Hypnotic Pattern':
        if (newConditions.includes('charmed_hp') || newConditions.includes('incapacitated')) {
          newConditions = newConditions.filter(cond => cond !== 'charmed_hp' && cond !== 'incapacitated')
          changed = true
        }
        break
      case 'Hold Person':
      case 'Hold Monster':
        if (newConditions.includes('paralyzed')) {
          newConditions = newConditions.filter(cond => cond !== 'paralyzed')
          changed = true
        }
        break
      case 'Greater Invisibility':
        if (c.id === casterId && newConditions.includes('invisible')) {
          newConditions = newConditions.filter(cond => cond !== 'invisible')
          changed = true
        }
        break
      case 'Faerie Fire':
        if (newConditions.includes('faerie_fire')) {
          newConditions = newConditions.filter(cond => cond !== 'faerie_fire')
          changed = true
        }
        break
      case 'Polymorph': {
        // When Polymorph concentration ends, revert the polymorphed creature
        if (newConditions.includes('polymorphed') && c.prePolymorphState) {
          const pre = c.prePolymorphState
          newConditions = newConditions.filter(cond => cond !== 'polymorphed')
          updates.push({
            id: c.id,
            changes: {
              currentHP: pre.currentHP,
              maxHP: pre.maxHP,
              ac: pre.ac,
              speed: pre.speed,
              str: pre.str, strMod: pre.strMod,
              dex: pre.dex, dexMod: pre.dexMod,
              con: pre.con, conMod: pre.conMod,
              wis: pre.wis, wisMod: pre.wisMod,
              saves: pre.saves,
              weapons: pre.weapons,
              weapon: pre.weapon,
              multiattack: pre.multiattack,
              spellSlots: pre.spellSlots,
              spellsKnown: pre.spellsKnown,
              cantrips: pre.cantrips,
              spellSaveDC: pre.spellSaveDC,
              flying: pre.flying || false,
              breathWeapon: pre.breathWeapon || null,
              legendaryResistance: pre.legendaryResistance || null,
              legendaryActions: pre.legendaryActions || null,
              type: pre.type || undefined,
              prePolymorphState: null,
              polymorphedAs: null,
              conditions: newConditions,
            },
          })
          logs.push(`  â†’ ${c.name} reverts from Polymorph to original form (HP: ${pre.currentHP}/${pre.maxHP})`)
          continue // already pushed full update, skip the generic push below
        }
        break
      }
    }

    if (changed) {
      updates.push({ id: c.id, changes: { conditions: newConditions } })
    }
  }

  if (updates.length > 0) {
    newState = newState.withUpdatedCombatants(updates)
  }

  return { state: newState, logs }
}

// â”€â”€ Simple Actions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function resolveDodge(state, combatantId) {
  const actor = state.getCombatant(combatantId)
  const newConditions = [...(actor.conditions || []), 'dodging']

  return {
    state: state
      .withUpdatedCombatant(combatantId, { usedAction: true, conditions: newConditions })
      .withLog(`${actor.name} takes the Dodge action.`),
    result: { type: 'dodge' },
  }
}

function resolveDash(state, combatantId) {
  const actor = state.getCombatant(combatantId)
  const extraMovement = actor.speed || 30

  return {
    state: state
      .withUpdatedCombatant(combatantId, {
        usedAction: true,
        movementRemaining: (actor.movementRemaining || 0) + extraMovement,
      })
      .withLog(`${actor.name} takes the Dash action. +${extraMovement}ft movement.`),
    result: { type: 'dash', extraMovement },
  }
}

function resolveDisengage(state, combatantId) {
  const actor = state.getCombatant(combatantId)

  return {
    state: state
      .withUpdatedCombatant(combatantId, { usedAction: true, disengaged: true })
      .withLog(`${actor.name} takes the Disengage action.`),
    result: { type: 'disengage' },
  }
}

// â”€â”€ Forced Reaction Movement â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Dissonant Whispers: on failed save, target must use its reaction to move its
// full speed away from the caster. The condition is cleared afterward.

/**
 * If the target has the 'must_use_reaction_to_move_away' condition and hasn't
 * used its reaction, force it to move its speed directly away from the caster.
 * Consumes the target's reaction and removes the condition.
 *
 * @param {GameState} state      Current game state (after spell effects applied)
 * @param {string}    casterId   The caster who triggered the forced movement
 * @param {string}    targetId   The target that must move away
 * @param {string[]}  logs       Log array to append entries to
 * @returns {{ state: GameState }}
 */
function resolveReactionMovement(state, casterId, targetId, logs) {
  const target = state.getCombatant(targetId)
  if (!target.conditions || !target.conditions.includes('must_use_reaction_to_move_away')) {
    return { state }
  }

  // If the target already used its reaction this round, it can't move away
  if (target.reactedThisRound) {
    logs.push(`    â†’ ${target.name} has no reaction available â€” cannot move away`)
    // Clear the condition even though movement didn't happen
    const cleaned = (target.conditions || []).filter(c => c !== 'must_use_reaction_to_move_away')
    return { state: state.withUpdatedCombatant(targetId, { conditions: cleaned }) }
  }

  // Dead creatures don't move
  if (target.currentHP <= 0) {
    const cleaned = (target.conditions || []).filter(c => c !== 'must_use_reaction_to_move_away')
    return { state: state.withUpdatedCombatant(targetId, { conditions: cleaned }) }
  }

  const caster = state.getCombatant(casterId)
  const speed = target.speed || 30
  const moveSquares = Math.floor(speed / 5) // number of grid squares to move

  // Calculate direction away from caster
  const tPos = target.position || {}
  const cPos = caster.position || {}

  let newPos
  if (tPos.q != null || tPos.r != null) {
    // Hex axial coordinates: move along the axis that increases distance most
    const tq = tPos.q ?? 0, tr = tPos.r ?? 0
    const cq = cPos.q ?? 0, cr = cPos.r ?? 0
    const dq = tq - cq, dr = tr - cr
    // Normalize direction â€” pick the dominant hex axis
    const ds = -(dq + dr) // cube s coordinate difference
    const adq = Math.abs(dq), adr = Math.abs(dr), ads = Math.abs(ds)
    let stepQ = 0, stepR = 0
    if (adq >= adr && adq >= ads) {
      stepQ = dq > 0 ? 1 : -1
    } else if (adr >= adq && adr >= ads) {
      stepR = dr > 0 ? 1 : -1
    } else {
      // s axis dominant: step so s increases (dq and dr both shift)
      stepQ = ds > 0 ? -1 : 1
      stepR = ds > 0 ? -1 : 1
    }
    newPos = { q: tq + stepQ * moveSquares, r: tr + stepR * moveSquares }
  } else {
    // Cartesian grid: move directly away from caster
    const tx = tPos.x ?? 0, ty = tPos.y ?? 0
    const cx = cPos.x ?? 0, cy = cPos.y ?? 0
    const dx = tx - cx, dy = ty - cy
    const len = Math.sqrt(dx * dx + dy * dy) || 1
    // Round to integer grid squares
    newPos = {
      x: Math.round(tx + (dx / len) * moveSquares),
      y: Math.round(ty + (dy / len) * moveSquares),
    }
  }

  // Remove the condition and consume reaction
  const cleaned = (target.conditions || []).filter(c => c !== 'must_use_reaction_to_move_away')
  const posStr = (p) => (p && p.q != null) ? `(${p.q},${p.r})` : `(${(p && p.x) ?? 0},${(p && p.y) ?? 0})`
  logs.push(`    â†’ ${target.name} uses its reaction to move away: ${posStr(tPos)} â†’ ${posStr(newPos)} [${speed}ft]`)

  return {
    state: state.withUpdatedCombatant(targetId, {
      position: newPos,
      conditions: cleaned,
      reactedThisRound: true,
      movementRemaining: 0, // reaction movement consumes all remaining movement
    }),
  }
}

// â”€â”€ Movement â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function resolveMove(state, combatantId, choice) {
  const actor = state.getCombatant(combatantId)
  const from = actor.position
  const to = choice.position
  const dist = TurnMenu.gridDistance(from, to)

  // Detect opportunity attack triggers: enemies within 5 ft reach BEFORE the move
  // who are no longer within 5 ft AFTER the move, and the mover hasn't Disengaged.
  const oaTriggers = []
  if (!actor.disengaged) {
    const opponents = state.getAllCombatants().filter(c =>
      c.side !== actor.side && c.currentHP > 0 && !c.reactedThisRound
    )
    for (const opp of opponents) {
      const distBefore = TurnMenu.gridDistance(from, opp.position)
      const distAfter  = TurnMenu.gridDistance(to,   opp.position)
      if (distBefore <= 5 && distAfter > 5) {
        oaTriggers.push(opp.id)
      }
    }
  }

  const updates = {
    // Preserve the coordinate system used by the caller: {q,r} for the frontend
    // (hex axial), {x,y} for the AI tactics engine (Cartesian grid).
    position: to.q != null ? { q: to.q, r: to.r } : { x: to.x, y: to.y },
    movementRemaining: Math.max(0, (actor.movementRemaining || 0) - dist),
  }

  // Auto-land when a flying creature descends to attack a ground target
  const landing = choice.land && actor.flying
  if (landing) {
    updates.flying = false
  }

  const posStr = (p) => (p && p.q != null) ? `(${p.q},${p.r})` : `(${(p && p.x) ?? 0},${(p && p.y) ?? 0})`
  const logMsg = landing
    ? `${actor.name} descends and moves from ${posStr(from)} to ${posStr(to)} [${dist}ft].`
    : `${actor.name} moves from ${posStr(from)} to ${posStr(to)} [${dist}ft].`

  return {
    state: state
      .withUpdatedCombatant(combatantId, updates)
      .withLog(logMsg),
    result: { type: 'move', from, to, distance: dist, landed: !!landing, opportunityAttackTriggers: oaTriggers },
  }
}

function resolveHold(state, combatantId) {
  return {
    state: state,
    result: { type: 'hold' },
  }
}

// â”€â”€ Bonus Action Features â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function resolveBardicInspiration(state, combatantId, option) {
  const actor = state.getCombatant(combatantId)
  const bi = actor.bardicInspiration

  return {
    state: state
      .withUpdatedCombatant(combatantId, {
        usedBonusAction: true,
        bardicInspiration: { ...bi, uses: bi.uses - 1 },
      })
      .withUpdatedCombatant(option.targetId, t => ({
        bardicInspirationDie: option.die || bi.die,
      }))
      .withLog(`${actor.name} inspires ${option.targetName} with Bardic Inspiration (${bi.die}).`),
    result: { type: 'bardicInspiration', targetId: option.targetId, die: bi.die },
  }
}

function resolveGemFlight(state, combatantId) {
  const actor = state.getCombatant(combatantId)
  const gf = actor.gemFlight

  return {
    state: state
      .withUpdatedCombatant(combatantId, {
        usedBonusAction: true,
        flying: true,
        gemFlight: { ...gf, uses: gf.uses - 1, active: true, roundsRemaining: 10 },
      })
      .withLog(`${actor.name} activates Gem Flight!`),
    result: { type: 'gemFlight' },
  }
}

// â”€â”€ Shake Awake â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function resolveShakeAwake(state, combatantId, option) {
  const actor = state.getCombatant(combatantId)
  const target = state.getCombatant(option.targetId)
  const newConditions = (target.conditions || []).filter(c => c !== 'charmed_hp' && c !== 'incapacitated')

  return {
    state: state
      .withUpdatedCombatant(combatantId, { usedAction: true })
      .withUpdatedCombatant(option.targetId, { conditions: newConditions })
      .withLog(`${actor.name} shakes ${target.name} awake, ending the charm!`),
    result: { type: 'shake_awake', targetId: option.targetId },
  }
}

// â”€â”€ Breath Weapon â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * Resolve a Dragonborn Breath Weapon action.
 * AoE damage with a save for half. Uses resolveAoETargets for targeting.
 */
export function resolveBreathWeapon(state, combatantId, choice) {
  const actor = state.getCombatant(combatantId)
  const bw = actor.breathWeapon
  const logs = []
  const saves = []
  const damageRolls = []
  let totalDamage = 0
  let currentState = state

  // Spend use + mark action used
  currentState = currentState.withUpdatedCombatant(combatantId, {
    usedAction: true,
    breathWeapon: { ...bw, uses: bw.uses - 1 },
  })

  logs.push(`${actor.name} uses Breath Weapon!`)

  // Build pseudo-spellDef for AoE targeting
  const spellLikeShape = {
    targeting: bw.targeting || { type: 'area', shape: 'cone', length: bw.range || 15 },
  }

  const allCombatants = currentState.getAllCombatants()
  const virtualCombatants = allCombatants.map(c => ({ ...c }))
  const virtualCaster = virtualCombatants.find(c => c.id === combatantId)

  const targets = resolveAoETargets(virtualCaster, spellLikeShape, choice.aoeCenter, virtualCombatants)
  logs.push(`  â†’ Breath Weapon hits ${targets.length} target(s)`)

  const dc = bw.dc || 13
  const saveAbility = bw.save || 'dex'

  for (const virtualTarget of targets) {
    const target = currentState.getCombatant(virtualTarget.id)
    if (!target || target.currentHP <= 0) continue

    const saveBonus = (target.saves && target.saves[saveAbility]) || 0
    const hasAdv = !!target.magicResistance  // breath weapon is not magical in most cases, but respect resistance
    const isAutoFail = autoFailsSave(target, saveAbility)
    const saveResult = isAutoFail
      ? { success: false, total: 0 }
      : mech.makeSavingThrow(saveBonus, dc, hasAdv, false)
    saves.push({
      roll: saveResult.total,
      total: saveResult.total,
      saveBonus,
      success: saveResult.success,
      targetName: target.name,
    })

    // Roll damage
    const dmgRoll = mech.rollDamage(bw.damage || '2d8', 0, false)
    if (Array.isArray(dmgRoll.rolls)) damageRolls.push(...dmgRoll.rolls)
    const breathDamageType = bw.damageType || null

    if (saveResult.success) {
      // Half damage on success, then apply resistance
      const rawHalf = Math.floor(dmgRoll.total / 2)
      const halfDmg = applyDamageResistance(target, rawHalf, breathDamageType)
      totalDamage += halfDmg
      const newHP = Math.max(0, target.currentHP - halfDmg)
      currentState = currentState.withUpdatedCombatant(virtualTarget.id, {
        currentHP: newHP,
        totalDamageTaken: (target.totalDamageTaken || 0) + halfDmg,
      })
      currentState = currentState.withUpdatedCombatant(combatantId, a => ({
        totalDamageDealt: (a.totalDamageDealt || 0) + halfDmg,
      }))
      const resistNote = halfDmg < rawHalf ? ` (resisted ${breathDamageType})` : ''
      logs.push(`  â†’ ${target.name} ${saveAbility.toUpperCase()} save: [${saveResult.total} vs DC ${dc}] SUCCESS â€” ${halfDmg} damage (half)${resistNote}`)

      // Damage breaks charmed_hp
      const charmBreak = removeCharmedHPOnDamage(currentState, virtualTarget.id, halfDmg)
      currentState = charmBreak.state
      logs.push(...charmBreak.logs)
    } else {
      // Check Legendary Resistance
      let saved = false
      const lr = tryLegendaryResistance(currentState, virtualTarget.id, logs)
      currentState = lr.state
      if (lr.used) saved = true
      if (lr.used && saves.length > 0) saves[saves.length - 1].success = true

      if (saved) {
        const rawHalf = Math.floor(dmgRoll.total / 2)
        const halfDmg = applyDamageResistance(currentState.getCombatant(virtualTarget.id), rawHalf, breathDamageType)
        totalDamage += halfDmg
        const newHP = Math.max(0, currentState.getCombatant(virtualTarget.id).currentHP - halfDmg)
        currentState = currentState.withUpdatedCombatant(virtualTarget.id, {
          currentHP: newHP,
          totalDamageTaken: (currentState.getCombatant(virtualTarget.id).totalDamageTaken || 0) + halfDmg,
        })
        currentState = currentState.withUpdatedCombatant(combatantId, a => ({
          totalDamageDealt: (a.totalDamageDealt || 0) + halfDmg,
        }))
        logs.push(`  â†’ ${target.name} ${saveAbility.toUpperCase()} save: SUCCESS (Legendary Resistance) â€” ${halfDmg} damage (half)`)
      } else {
        const rawFull = dmgRoll.total
        const fullDmg = applyDamageResistance(target, rawFull, breathDamageType)
        totalDamage += fullDmg
        const newHP = Math.max(0, target.currentHP - fullDmg)
        currentState = currentState.withUpdatedCombatant(virtualTarget.id, {
          currentHP: newHP,
          totalDamageTaken: (target.totalDamageTaken || 0) + fullDmg,
        })
        currentState = currentState.withUpdatedCombatant(combatantId, a => ({
          totalDamageDealt: (a.totalDamageDealt || 0) + fullDmg,
        }))
        const resistNote = fullDmg < rawFull ? ` (resisted ${breathDamageType})` : ''
        logs.push(`  â†’ ${target.name} ${saveAbility.toUpperCase()} save: [${saveResult.total} vs DC ${dc}] FAIL â€” ${fullDmg} damage${resistNote}`)

        // Damage breaks charmed_hp
        const charmBreak = removeCharmedHPOnDamage(currentState, virtualTarget.id, fullDmg)
        currentState = charmBreak.state
        logs.push(...charmBreak.logs)
      }
    }

    // Concentration check on damaged target
    const postTarget = currentState.getCombatant(virtualTarget.id)
    if (postTarget && postTarget.concentrating && postTarget.currentHP > 0) {
      const damageTaken = target.currentHP - postTarget.currentHP
      if (damageTaken > 0) {
        const conResult = checkConcentration(currentState, virtualTarget.id, damageTaken)
        currentState = conResult.state
        logs.push(...conResult.logs)
      }
    }
  }

  return {
    state: currentState.withLogEntries(logs),
    result: {
      type: 'breath_weapon',
      targetsHit: targets.length,
      totalDamage,
      saves,
      damageRolls,
      damageDice: bw.damage || '2d8',
    },
  }
}

// â”€â”€ Dragon Fear â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * Resolve Dragon Fear â€” AoE frightened condition with WIS save.
 * Uses the Dragonborn's breath weapon charge (replaces breath weapon use).
 * Targets must make a WIS save or become frightened.
 */
export function resolveDragonFear(state, combatantId, choice) {
  const actor = state.getCombatant(combatantId)
  const df = actor.dragonFear
  const logs = []
  let currentState = state

  // Dragon Fear replaces a Breath Weapon use
  const updatedBreathWeapon = actor.breathWeapon
    ? { ...actor.breathWeapon, uses: Math.max(0, actor.breathWeapon.uses - 1) }
    : actor.breathWeapon
  currentState = currentState.withUpdatedCombatant(combatantId, {
    usedAction: true,
    dragonFear: { ...df, uses: df.uses - 1 },
    breathWeapon: updatedBreathWeapon,
  })

  logs.push(`${actor.name} uses Dragon Fear!`)

  // Build pseudo-spellDef for AoE targeting
  const spellLikeShape = {
    targeting: df.targeting || { type: 'area', shape: 'cone', length: df.range || 30 },
  }

  const allCombatants = currentState.getAllCombatants()
  const virtualCombatants = allCombatants.map(c => ({ ...c }))
  const virtualCaster = virtualCombatants.find(c => c.id === combatantId)

  const targets = resolveAoETargets(virtualCaster, spellLikeShape, choice.aoeCenter, virtualCombatants)
  logs.push(`  â†’ Dragon Fear targets ${targets.length} creature(s)`)

  const dc = df.dc || 13
  let frightenedCount = 0

  for (const virtualTarget of targets) {
    const target = currentState.getCombatant(virtualTarget.id)
    if (!target || target.currentHP <= 0) continue

    // Charm/fear immunity check
    if (target.immuneFrightened) {
      logs.push(`  â†’ ${target.name} is immune to frightened â€” no effect!`)
      continue
    }

    const saveAbility = df.save || 'wis'
    const saveBonus = (target.saves && target.saves[saveAbility]) || 0
    // Dark Devotion: advantage on saves vs frightened
    const hasAdv = !!target.darkDevotion
    const isAutoFail = autoFailsSave(target, saveAbility)
    const saveResult = isAutoFail
      ? { success: false, total: 0 }
      : mech.makeSavingThrow(saveBonus, dc, hasAdv, false)

    if (saveResult.success) {
      logs.push(`  â†’ ${target.name} WIS save: [${saveResult.total} vs DC ${dc}] SUCCESS â€” resists fear!`)
    } else {
      // Check Legendary Resistance
      let saved = false
      const lr = tryLegendaryResistance(currentState, virtualTarget.id, logs)
      currentState = lr.state
      if (lr.used) {
        saved = true
        logs.push(`  â†’ ${target.name} WIS save: SUCCESS (Legendary Resistance) â€” resists fear!`)
      }

      if (!saved) {
        const newConditions = [...(target.conditions || [])]
        if (!newConditions.includes('frightened')) {
          newConditions.push('frightened')
        }
        currentState = currentState.withUpdatedCombatant(virtualTarget.id, {
          conditions: newConditions,
        })
        currentState = currentState.withUpdatedCombatant(combatantId, a => ({
          conditionsInflicted: (a.conditionsInflicted || 0) + 1,
        }))
        frightenedCount++
        logs.push(`  â†’ ${target.name} WIS save: [${saveResult.total} vs DC ${dc}] FAIL â€” frightened!`)
      }
    }
  }

  return {
    state: currentState.withLogEntries(logs),
    result: { type: 'dragon_fear', frightenedCount },
  }
}

// â”€â”€ Loot Corpse â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * Resolve a loot_corpse action.
 * Marks the corpse as looted and consumes the actor's action.
 * The actual inventory transfer is handled by CombatSessionManager.
 *
 * @param {GameState} state
 * @param {string}    combatantId - Who is looting
 * @param {object}    option      - { corpseId, corpseName }
 * @returns {{ state: GameState, result: object }}
 */
export function resolveLootCorpse(state, combatantId, option) {
  const actor = state.getCombatant(combatantId)
  const corpse = state.getCorpse(option.corpseId)

  if (!corpse) {
    throw new Error(`Corpse not found: ${option.corpseId}`)
  }
  if (corpse.looted) {
    throw new Error(`Corpse already looted: ${option.corpseId}`)
  }

  let newState = state.withUpdatedCombatant(combatantId, { usedAction: true })

  // Mark corpse as looted in the GameState
  newState = newState.withCorpseLooted(option.corpseId)

  const loot = corpse.loot || { items: [], currency: {} }
  const lootDescParts = []

  if (loot.items && loot.items.length > 0) {
    for (const item of loot.items) {
      lootDescParts.push(`${item.quantity}Ã— ${item.itemId}`)
    }
  }
  if (loot.currency) {
    for (const [type, amount] of Object.entries(loot.currency)) {
      if (amount > 0) lootDescParts.push(`${amount} ${type}`)
    }
  }

  const lootDesc = lootDescParts.length > 0
    ? lootDescParts.join(', ')
    : 'nothing'

  newState = newState.withLog(
    `${actor.name} loots ${corpse.name}'s corpse: ${lootDesc}`
  )

  return {
    state: newState,
    result: {
      type: 'loot_corpse',
      corpseId: option.corpseId,
      corpseName: corpse.name,
      loot,
    },
  }
}

// â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function ordinalSuffix(n) {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return (s[(v - 20) % 10] || s[v] || s[0])
}

