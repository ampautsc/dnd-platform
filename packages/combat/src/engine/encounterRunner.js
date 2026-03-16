/**
 * Encounter Runner — synchronous turn-by-turn combat engine.
 *
 * Exports:
 *   rollInitiative(combatants) → sorted initiative array
 *   resetTurnState(creature) → void
 *   processStartOfTurn(creature, allCombatants, log) → void
 *   processEndOfTurnSaves(creature, allCombatants, log) → void
 *   checkVictory(combatants, round) → { over, winner }
 *   resolveWeaponAttack(attacker, action, allCombatants, log) → void
 *   resolveBreathWeapon(attacker, action, allCombatants, log) → void
 *   resolveShakeAwake(actor, action, log) → void
 *   resolveDragonFear(actor, action, allCombatants, log) → void
 *   buildAnalytics(combatants) → analytics[]
 *   runEncounter({ combatants, getDecision, maxRounds, verbose }) → result
 */

import * as dice from './dice.js'
import * as mech from './mechanics.js'
import { resolveSpell } from './spellResolver.js'
import { resolveAoETargets } from './targetResolver.js'

const DEFAULT_MAX_ROUNDS = 20

// ───────────────────────────────────────────────────────────────────────────
// INITIATIVE
// ───────────────────────────────────────────────────────────────────────────

export function rollInitiative(combatants) {
  return combatants
    .map(c => ({
      id:   c.id,
      name: c.name,
      creature: c,
      roll:  dice.d20(),
      mod:   c.dexMod !== undefined ? c.dexMod : mech.abilityModifier(c.dex || 10),
    }))
    .map(e => ({ ...e, total: e.roll + e.mod }))
    .sort((a, b) => b.total - a.total)
}

// ───────────────────────────────────────────────────────────────────────────
// TURN STATE
// ───────────────────────────────────────────────────────────────────────────

export function resetTurnState(creature) {
  creature.usedAction        = false
  creature.usedBonusAction   = false
  creature.movementRemaining = creature.speed || 30
  creature.reactedThisRound  = false
  mech.removeCondition(creature, 'vm_disadvantage')
  mech.removeCondition(creature, 'dodging')
}

// ───────────────────────────────────────────────────────────────────────────
// START-OF-TURN PROCESSING
// ───────────────────────────────────────────────────────────────────────────

export function processStartOfTurn(creature, allCombatants, log) {
  // Paralyzed + flying → fall
  if (creature.flying && mech.hasCondition(creature, 'paralyzed')) {
    creature.flying = false
    if (creature.gemFlight) {
      creature.gemFlight.active = false
      creature.gemFlight.roundsRemaining = 0
    }
    mech.addCondition(creature, 'prone')
    const fallDmg = mech.rollDamage('2d6', 0, false).total
    creature.currentHP = Math.max(0, creature.currentHP - fallDmg)
    log.push(`  ${creature.name} is paralyzed and falls! ${fallDmg} falling damage. HP: ${creature.currentHP}/${creature.maxHP}`)
    return
  }

  // Gem flight duration
  if (creature.gemFlight && creature.gemFlight.active) {
    creature.gemFlight.roundsRemaining--
    if (creature.gemFlight.roundsRemaining <= 0) {
      creature.gemFlight.active = false
      creature.flying = false
      log.push(`  ${creature.name}'s Gem Flight expires.`)
    }
  }

  // Concentration timer
  if (creature.concentrating && creature.concentrationRoundsRemaining > 0) {
    creature.concentrationRoundsRemaining--
    if (creature.concentrationRoundsRemaining <= 0) {
      log.push(`  ${creature.name}'s ${creature.concentrating} expires.`)
      mech.breakConcentration(creature, allCombatants)
    }
  }
}

// ───────────────────────────────────────────────────────────────────────────
// END-OF-TURN SAVES
// ───────────────────────────────────────────────────────────────────────────

export function processEndOfTurnSaves(creature, allCombatants, log) {
  // Paralyzed → WIS save vs Hold Person DC
  if (mech.hasCondition(creature, 'paralyzed')) {
    const caster = allCombatants.find(c => c.concentrating === 'Hold Person')
    if (caster) {
      const dc    = caster.spellSaveDC || 10
      const mod   = (creature.saves ? creature.saves.wis : mech.abilityModifier(creature.wis || 10)) || 0
      const raw   = dice.d20()
      const roll  = raw + mod
      if (roll >= dc) {
        mech.removeCondition(creature, 'paralyzed')
        log.push(`  ${creature.name} WIS save vs Hold Person: [d20:${raw}+${mod}=${roll} vs DC ${dc}] SUCCESS — no longer paralyzed.`)
      } else {
        log.push(`  ${creature.name} WIS save vs Hold Person: [d20:${raw}+${mod}=${roll} vs DC ${dc}] FAIL — still paralyzed.`)
      }
    }
  }

  // Frightened → WIS save vs Dragon Fear DC
  if (mech.hasCondition(creature, 'frightened')) {
    const source = allCombatants.find(c => c.dragonFear && c.id !== creature.id)
    if (source && source.dragonFear) {
      const dc   = source.dragonFear.dc || 10
      const mod  = (creature.saves ? creature.saves.wis : mech.abilityModifier(creature.wis || 10)) || 0
      const raw  = dice.d20()
      const roll = raw + mod
      log.push(`  ${creature.name} WIS save vs Dragon Fear: [d20:${raw}+${mod}=${roll} vs DC ${dc}]`)
      if (roll >= dc) {
        mech.removeCondition(creature, 'frightened')
        log.push(`    → ${creature.name} no longer frightened.`)
      } else {
        log.push(`    → ${creature.name} still frightened.`)
      }
    }
  }
}

// ───────────────────────────────────────────────────────────────────────────
// VICTORY CHECK
// ───────────────────────────────────────────────────────────────────────────

export function checkVictory(combatants, round) {
  const partySide  = combatants.filter(c => c.side === 'party')
  const enemySide  = combatants.filter(c => c.side === 'enemy')

  const partyAlive  = partySide.filter(c  => mech.isAlive(c))
  const enemyAlive  = enemySide.filter(c  => mech.isAlive(c))

  if (partyAlive.length === 0)  return { over: true,  winner: 'enemy' }
  if (enemyAlive.length === 0)  return { over: true,  winner: 'party' }

  // If all remaining enemies are incapacitated at round 15+, it's a draw
  if (round >= 15) {
    const allEnemyIncapacitated = enemyAlive.every(c => mech.isIncapacitated(c))
    if (allEnemyIncapacitated) return { over: true, winner: 'draw' }
  }

  return { over: false, winner: null }
}

// ───────────────────────────────────────────────────────────────────────────
// ACTION RESOLUTION
// ───────────────────────────────────────────────────────────────────────────

export function resolveWeaponAttack(attacker, action, allCombatants, log) {
  const target = action.target
  const weapon = action.weapon || attacker.weapon
  if (!target || !weapon) return

  // Range check: melee weapons max 5ft (or reach), ranged/thrown up to listed range
  const dist = mech.distanceBetween(attacker, target)
  const weaponRange = weapon.range || (weapon.type === 'ranged' ? 80 : 5)
  if (dist > weaponRange) {
    log.push(`  ${attacker.name} can't reach ${target.name} with ${weapon.name} (distance ${dist}ft, range ${weaponRange}ft).`)
    return
  }

  const isParalyzed = mech.hasCondition(target, 'paralyzed')
  const within5ft   = mech.distanceBetween(attacker, target) <= 5
  const hasAdv      = mech.hasCondition(attacker, 'invisible') || (isParalyzed && within5ft)
  const forceCrit   = isParalyzed && within5ft

  const atkResult = mech.makeAttackRoll(weapon.attackBonus || 0, target.ac, hasAdv, false)
  const isCrit    = forceCrit || atkResult.isCrit
  const hits      = isCrit || atkResult.hits

  attacker.attacksMade = (attacker.attacksMade || 0) + 1

  if (hits) {
    attacker.attacksHit = (attacker.attacksHit || 0) + 1
    const dmg = mech.rollDamage(weapon.damageDice, weapon.damageBonus || 0, isCrit)
    target.currentHP = Math.max(0, target.currentHP - dmg.total)
    attacker.totalDamageDealt = (attacker.totalDamageDealt || 0) + dmg.total
    target.totalDamageTaken   = (target.totalDamageTaken   || 0) + dmg.total
    const critStr = isCrit ? 'CRITICAL ' : ''
    log.push(`  ${attacker.name} attacks ${target.name} with ${weapon.name}: [d20:${atkResult.natural}+${weapon.attackBonus}=${atkResult.total} vs AC ${target.ac}] ${critStr}HIT! ${dmg.total} damage. ${target.name} HP: ${target.currentHP}/${target.maxHP}`)
    if (target.concentrating) {
      const conSave = mech.concentrationSave(target, dmg.total)
      if (!conSave.success) {
        log.push(`    → ${target.name} loses concentration on ${target.concentrating}! [CON save ${conSave.total} vs DC ${conSave.dc}]`)
        mech.breakConcentration(target, allCombatants)
      }
    }
  } else {
    log.push(`  ${attacker.name} attacks ${target.name} with ${weapon.name}: [d20:${atkResult.natural}+${weapon.attackBonus}=${atkResult.total} vs AC ${target.ac}] MISS.`)
  }
}

export function resolveMultiattack(attacker, action, allCombatants, log) {
  const target = action.target
  if (!target || !mech.isAlive(target)) return

  const count  = attacker.multiattack || 1
  const weapon = attacker.weapon
  if (!weapon) return

  for (let i = 0; i < count; i++) {
    if (!mech.isAlive(target)) break
    resolveWeaponAttack(attacker, { target, weapon }, allCombatants, log)
  }
}

export function resolveBreathWeapon(attacker, action, allCombatants, log) {
  const bw = attacker.breathWeapon
  if (!bw || bw.uses <= 0) return

  bw.uses--

  // Engine-resolved targeting: if action has aoeCenter and breath has targeting geometry,
  // resolve targets through the geometry engine instead of trusting the AI's target list.
  let targets
  if (action.aoeCenter && bw.targeting) {
    targets = resolveAoETargets(attacker, { targeting: bw.targeting }, action.aoeCenter, allCombatants)
  } else {
    targets = action.targets || []
  }

  log.push(`  ${attacker.name} uses BREATH WEAPON (DC ${bw.dc} ${bw.save} save, ${bw.damage})!`)

  for (const target of targets) {
    if (!mech.isAlive(target)) continue
    const saveMod = target.saves ? target.saves[bw.save] : 0
    const roll    = dice.d20() + (saveMod || 0)
    const dmg     = mech.rollDamage(bw.damage, 0, false)
    if (roll >= bw.dc) {
      const half = Math.floor(dmg.total / 2)
      target.currentHP = Math.max(0, target.currentHP - half)
      attacker.totalDamageDealt = (attacker.totalDamageDealt || 0) + half
      target.totalDamageTaken   = (target.totalDamageTaken   || 0) + half
      log.push(`    → ${target.name} DEX save [${roll} vs DC ${bw.dc}] SUCCESS — ${half} half damage. HP: ${target.currentHP}/${target.maxHP}`)
    } else {
      target.currentHP = Math.max(0, target.currentHP - dmg.total)
      attacker.totalDamageDealt = (attacker.totalDamageDealt || 0) + dmg.total
      target.totalDamageTaken   = (target.totalDamageTaken   || 0) + dmg.total
      log.push(`    → ${target.name} DEX save [${roll} vs DC ${bw.dc}] FAIL — ${dmg.total} full damage. HP: ${target.currentHP}/${target.maxHP}`)
    }
  }
}

export function resolveShakeAwake(actor, action, log) {
  const target = action.target
  if (!target) return
  mech.removeAllConditions(target, 'charmed_hp', 'incapacitated')
  log.push(`  ${actor.name} shakes awake ${target.name}.`)
}

export function resolveDragonFear(actor, action, allCombatants, log) {
  const df = actor.dragonFear
  if (!df) return
  if (df.uses <= 0) {
    log.push(`  ${actor.name} Dragon Fear has no uses remaining.`)
    return
  }
  df.uses--

  // Engine-resolved targeting: if action has aoeCenter and dragonFear has targeting geometry,
  // resolve targets through the geometry engine.
  let targets
  if (action.aoeCenter && df.targeting) {
    targets = resolveAoETargets(actor, { targeting: df.targeting }, action.aoeCenter, allCombatants)
  } else {
    targets = action.targets || []
  }
  for (const target of targets) {
    if (!mech.isAlive(target)) continue
    if (mech.hasCondition(target, 'frightened')) {
      log.push(`  ${target.name} Already frightened.`)
      continue
    }
    if (target.immunities && target.immunities.conditions && target.immunities.conditions.includes('frightened')) {
      log.push(`  ${target.name} Immune to frightened.`)
      continue
    }
    const mod  = target.saves ? target.saves.wis : mech.abilityModifier(target.wis || 10)
    const roll = dice.d20() + mod
    if (roll >= df.dc) {
      log.push(`  ${target.name} WIS save vs Dragon Fear [${roll} vs DC ${df.dc}] SUCCESS.`)
    } else {
      mech.addCondition(target, 'frightened')
      log.push(`  ${target.name} WIS save vs Dragon Fear [${roll} vs DC ${df.dc}] FAIL — FRIGHTENED!`)
    }
  }
}

function resolveGemFlight(actor, log) {
  if (!actor.gemFlight || actor.gemFlight.uses <= 0) return
  actor.gemFlight.uses--
  actor.gemFlight.active = true
  actor.gemFlight.roundsRemaining = actor.gemFlight.maxRounds || 10
  actor.flying = true
  log.push(`  ${actor.name} activates Gem Flight! (${actor.gemFlight.uses} uses remaining)`)
}

// ───────────────────────────────────────────────────────────────────────────
// ANALYTICS
// ───────────────────────────────────────────────────────────────────────────

export function buildAnalytics(combatants) {
  return combatants.map(c => {
    const made = c.attacksMade || 0
    const hit  = c.attacksHit  || 0
    return {
      id:          c.id,
      name:        c.name,
      side:        c.side,
      survived:    mech.isAlive(c),
      finalHP:     c.currentHP,
      maxHP:       c.maxHP,
      damageDealt: c.totalDamageDealt || 0,
      damageTaken: c.totalDamageTaken || 0,
      attacksMade: made,
      attacksHit:  hit,
      hitRate:     made > 0 ? Math.round((hit / made) * 100) : 0,
      spellsCast:  c.spellsCast || 0,
    }
  })
}

// ───────────────────────────────────────────────────────────────────────────
// ACTION DISPATCHER
// ───────────────────────────────────────────────────────────────────────────

function resolveAction(actor, action, allCombatants, log) {
  if (!action) return

  const actionType = action.type

  // Determine if this is a spell (has .spell field but no .type, or type === 'cast_spell')
  const isSpell = action.spell && (actionType === 'cast_spell' || !actionType)

  if (actionType === 'dodge') {
    mech.addCondition(actor, 'dodging')
    log.push(`  ${actor.name} takes the Dodge action.`)
    return
  }

  if (actionType === 'attack') {
    resolveWeaponAttack(actor, action, allCombatants, log)
    return
  }

  if (actionType === 'multiattack') {
    resolveMultiattack(actor, action, allCombatants, log)
    return
  }

  if (actionType === 'breath_weapon') {
    resolveBreathWeapon(actor, action, allCombatants, log)
    return
  }

  if (actionType === 'shake_awake') {
    resolveShakeAwake(actor, action, log)
    return
  }

  if (actionType === 'dragon_fear') {
    resolveDragonFear(actor, action, allCombatants, log)
    return
  }

  if (isSpell) {
    resolveSpell(actor, action, allCombatants, log)
    return
  }
}

function resolveBonusAction(actor, bonusAction, allCombatants, log) {
  if (!bonusAction) return

  const spell = bonusAction.spell

  if (bonusAction.type === 'gem_flight') {
    resolveGemFlight(actor, log)
    return
  }

  if (bonusAction.type === 'cast_healing_word' || spell === 'Healing Word') {
    resolveSpell(actor, { spell: 'Healing Word', level: bonusAction.level || 1, target: actor }, allCombatants, log)
    return
  }

  if (spell === 'Spiritual Weapon') {
    actor.spiritualWeapon = { active: true, level: bonusAction.level || 2 }
    const slots = bonusAction.level || 2
    if (actor.spellSlots && actor.spellSlots[slots] > 0) {
      actor.spellSlots[slots]--
    }
    log.push(`  ${actor.name} casts Spiritual Weapon as bonus action.`)
    return
  }

  if (spell === 'Misty Step') {
    if (actor.spellSlots && actor.spellSlots[2] > 0) {
      actor.spellSlots[2]--
      log.push(`  ${actor.name} casts Misty Step as bonus action.`)
    }
    return
  }

  if (spell) {
    resolveSpell(actor, bonusAction, allCombatants, log)
    return
  }
}

// ───────────────────────────────────────────────────────────────────────────
// ENCOUNTER RUNNER
// ───────────────────────────────────────────────────────────────────────────

export function runEncounter(options) {
  const {
    combatants,
    getDecision,
    maxRounds   = DEFAULT_MAX_ROUNDS,
    verbose     = false,
  } = options

  const log         = []
  const snapshots   = []
  let   winner      = null
  let   round       = 0

  const snap = (phase) => ({
    round,
    phase,
    combatants: combatants.map(c => ({
      id:         c.id,
      name:       c.name,
      side:       c.side,
      currentHP:  c.currentHP,
      maxHP:      c.maxHP,
      conditions: [...(c.conditions || [])],
      position:   c.position ? { ...c.position } : { x: 0, y: 0 },
      flying:     !!c.flying,
    })),
  })

  // Initial snapshot (round 0)
  snapshots.push(snap('start'))

  const initiative = rollInitiative(combatants)

  while (round < maxRounds && !winner) {
    round++
    log.push(`\n=== ROUND ${round} ===`)

    for (const entry of initiative) {
      const actor = combatants.find(c => c.id === entry.id)
      if (!actor || !mech.isAlive(actor)) continue

      resetTurnState(actor)
      processStartOfTurn(actor, combatants, log)

      if (!mech.isAlive(actor)) continue

      // Incapacitated creatures skip their action but STILL get end-of-turn saves
      // (D&D 5e: Hold Person allows a WIS save at the end of each of the target's turns)
      if (mech.isIncapacitated(actor)) {
        log.push(`  ${actor.name} is incapacitated — skipping turn.`)
        processEndOfTurnSaves(actor, combatants, log)
        continue
      }

      log.push(`\n  --- ${actor.name}'s turn ---`)

      // Get decision
      let decision = null
      try {
        decision = getDecision(actor, combatants, round, log)
      } catch (err) {
        log.push(`  ERROR in getDecision for ${actor.name}: ${err.message}`)
      }

      if (decision) {
        // Resolve movement
        if (decision.movement && decision.movement.type === 'move_toward' && decision.movement.target) {
          const mvTarget = decision.movement.target
          const ax = actor.position?.x || 0
          const ay = actor.position?.y || 0
          const tx = mvTarget.position?.x || 0
          const ty = mvTarget.position?.y || 0
          // Move up to creature speed (in grid squares = speed / 5)
          const maxSquares = Math.max(1, Math.floor((actor.speed || 30) / 5))
          const dx = tx - ax
          const dy = ty - ay
          const dist = Math.max(Math.abs(dx), Math.abs(dy))
          const steps = Math.min(maxSquares, dist)
          if (steps > 0 && actor.position) {
            const sx = Math.sign(dx)
            const sy = Math.sign(dy)
            actor.position = { x: ax + sx * steps, y: ay + sy * steps }
          }
        }

        // Resolve main action
        if (decision.action) {
          resolveAction(actor, decision.action, combatants, log)
          actor.usedAction = true
        }

        // Resolve bonus action
        if (decision.bonusAction && !actor.usedBonusAction) {
          resolveBonusAction(actor, decision.bonusAction, combatants, log)
          actor.usedBonusAction = true
        }
      } else {
        log.push(`  ${actor.name} takes no action.`)
      }

      processEndOfTurnSaves(actor, combatants, log)

      // Check victory after each turn
      const vc = checkVictory(combatants, round)
      if (vc.over) {
        winner = vc.winner
        break
      }
    }

    // End-of-round snapshot
    snapshots.push(snap('end'))

    if (!winner) {
      const vc = checkVictory(combatants, round)
      if (vc.over) winner = vc.winner
    }
  }

  if (!winner) winner = 'draw'

  log.push(`\n=== ENCOUNTER ENDED — Winner: ${winner.toUpperCase()} after ${round} rounds ===`)

  return {
    winner,
    rounds:           round,
    log,
    analytics:        buildAnalytics(combatants),
    positionSnapshots: snapshots,
    combatants,
  }
}

// ───────────────────────────────────────────────────────────────────────────
// LEGACY ALIASES (backward compatibility)
// ───────────────────────────────────────────────────────────────────────────

export const rollInitiativeOrder = rollInitiative
export const resolveAttack       = resolveWeaponAttack
export function buildCombatants(party, enemies) {
  return [...(party || []), ...(enemies || [])]
}
