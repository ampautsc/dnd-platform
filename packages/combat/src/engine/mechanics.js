/**
 * Core D&D 5e mechanics module
 *
 * Exports pure functions used by the combat engine:
 *   - Legacy API: rollDie, rollDice, parseDiceNotation, rollAttack, etc.
 *   - Mode-aware API (uses dice module): makeAbilityCheck, makeSavingThrow,
 *     makeAttackRoll, rollDamage, concentrationSave
 *   - Condition helpers: isIncapacitated, isAlive, hasCondition, etc.
 *   - Spatial: distanceBetween
 */

import * as dice from './dice.js'

// ── Primitive dice ────────────────────────────────────────────────────────────

/** Roll a single die with `sides` faces. Returns 1-based integer. */
export function rollDie(sides) {
  return Math.floor(Math.random() * sides) + 1
}

/**
 * Roll `count` dice each with `sides` faces.
 * @returns {{ rolls: number[], total: number }}
 */
export function rollDice(count, sides) {
  const rolls = []
  for (let i = 0; i < count; i++) rolls.push(rollDie(sides))
  return { rolls, total: rolls.reduce((a, b) => a + b, 0) }
}

/** Parse a dice notation string like "2d6", "1d20", "3d8+4". */
export function parseDiceNotation(notation) {
  const match = String(notation).match(/^(\d+)d(\d+)([+-]\d+)?$/i)
  if (!match) throw new Error(`Invalid dice notation: "${notation}"`)
  return {
    count:    parseInt(match[1], 10),
    sides:    parseInt(match[2], 10),
    modifier: match[3] ? parseInt(match[3], 10) : 0,
  }
}

/** Roll advantage: roll d20 twice, take the higher. */
export function rollWithAdvantage() {
  const a = rollDie(20)
  const b = rollDie(20)
  return { rolls: [a, b], total: Math.max(a, b) }
}

/** Roll disadvantage: roll d20 twice, take the lower. */
export function rollWithDisadvantage() {
  const a = rollDie(20)
  const b = rollDie(20)
  return { rolls: [a, b], total: Math.min(a, b) }
}

// ── Modifiers ─────────────────────────────────────────────────────────────────

/** Compute D&D 5e ability modifier from an ability score. */
export function abilityModifier(score) {
  return Math.floor((score - 10) / 2)
}

/** Compute proficiency bonus for a given character level (5e table). */
export function proficiencyBonus(level) {
  return Math.ceil(level / 4) + 1
}

// ── Attack resolution ─────────────────────────────────────────────────────────

export function rollAttack(attackBonus, targetAC, advantage = 'normal') {
  let roll, rolls
  if (advantage === 'advantage') {
    const r = rollWithAdvantage(); roll = r.total; rolls = r.rolls
  } else if (advantage === 'disadvantage') {
    const r = rollWithDisadvantage(); roll = r.total; rolls = r.rolls
  } else {
    roll = rollDie(20); rolls = [roll]
  }

  const critical = roll === 20
  const fumble   = roll === 1
  const total    = roll + attackBonus
  const hit = critical || (!fumble && total >= targetAC)

  return { roll, rolls, total, hit, critical, fumble }
}

// ── Saving throws ─────────────────────────────────────────────────────────────

export function rollSavingThrow(abilityScore, proficient, profBonus, dc, advantage = 'normal') {
  const modifier = abilityModifier(abilityScore) + (proficient ? profBonus : 0)
  const { roll, total: rawRoll } = rollAttack(modifier, dc, advantage)
  const total = rawRoll
  return { roll, modifier, total, success: total >= dc }
}

// ── Skill checks ──────────────────────────────────────────────────────────────

export function rollSkillCheck(abilityScore, proficient, profBonus, dc, expertise = false, advantage = 'normal') {
  const abilMod  = abilityModifier(abilityScore)
  const profMod  = proficient ? (expertise ? profBonus * 2 : profBonus) : 0
  const modifier = abilMod + profMod

  let roll
  if (advantage === 'advantage') {
    roll = rollWithAdvantage().total
  } else if (advantage === 'disadvantage') {
    roll = rollWithDisadvantage().total
  } else {
    roll = rollDie(20)
  }

  const total = roll + modifier
  return { roll, modifier, total, success: total >= dc }
}

// ── HP management ─────────────────────────────────────────────────────────────

export function applyDamage(entity, rawDamage, damageType) {
  const immunities  = entity.damageImmunities  ?? []
  const resistances = entity.damageResistances ?? []

  let damage = rawDamage
  if (immunities.includes(damageType)) damage = 0
  else if (resistances.includes(damageType)) damage = Math.floor(damage / 2)

  const tempHp = entity.hp.temporary ?? 0
  const damageAfterTemp = Math.max(0, damage - tempHp)
  const newTemp = Math.max(0, tempHp - damage)

  const oldHp  = entity.hp.current
  const newHp  = Math.max(0, oldHp - damageAfterTemp)
  const overkill = Math.max(0, damageAfterTemp - oldHp)

  return {
    newHp,
    newTemp,
    actualDamage: damage,
    overkill,
    unconscious:  newHp === 0,
    dead:         newHp === 0 && overkill >= entity.hp.max,
  }
}

export function healCreature(entity, amount) {
  const oldHp  = entity.hp.current
  const newHp  = Math.min(entity.hp.max, oldHp + Math.max(0, amount))
  return { newHp, restored: newHp - oldHp }
}

// ── Initiative ────────────────────────────────────────────────────────────────

export function rollInitiative(dexterityScore) {
  const modifier = abilityModifier(dexterityScore)
  const roll     = rollDie(20)
  return { roll, modifier, total: roll + modifier }
}

// ═══════════════════════════════════════════════════════════════════════════
// NEW MODE-AWARE API  (uses dice.js for average/random modes)
// ═══════════════════════════════════════════════════════════════════════════

export function makeAbilityCheck(mod, dc) {
  const roll  = dice.d20()
  const total = roll + mod
  return { roll, total, dc, success: total >= dc }
}

function _rollD20WithAdv(hasAdv, hasDisadv) {
  if (hasAdv && hasDisadv) {
    return { result: dice.d20(), type: 'normal' }
  }
  if (hasAdv) {
    const r = dice.rollWithAdvantage()
    return { result: r.result, type: 'advantage' }
  }
  if (hasDisadv) {
    const r = dice.rollWithDisadvantage()
    return { result: r.result, type: 'disadvantage' }
  }
  return { result: dice.d20(), type: 'normal' }
}

export function makeSavingThrow(mod, dc, hasAdv = false, hasDisadv = false) {
  const { result, type } = _rollD20WithAdv(hasAdv, hasDisadv)
  const total = result + mod
  return { result, saveBonus: mod, total, success: total >= dc, type }
}

export function makeAttackRoll(attackBonus, targetAC, hasAdv = false, hasDisadv = false) {
  const { result, type } = _rollD20WithAdv(hasAdv, hasDisadv)
  const natural = result
  const total   = natural + attackBonus
  const isCrit  = natural === 20
  const isMiss  = natural === 1
  const hits    = isCrit || (!isMiss && total >= targetAC)
  return { natural, attackBonus, total, hits, isCrit, isMiss, type }
}

export function rollDamage(diceStr, bonus = 0, isCrit = false) {
  const match = diceStr.match(/^(\d+)d(\d+)$/)
  if (!match) throw new Error(`Invalid dice string: "${diceStr}"`)
  const count = parseInt(match[1], 10) * (isCrit ? 2 : 1)
  const sides = parseInt(match[2], 10)
  const dieFn = dice.dieFns[sides]
  if (!dieFn) throw new Error(`Unsupported die size: d${sides}`)
  const rolls = dice.rollDice(count, dieFn)
  const total = rolls.reduce((s, r) => s + r, 0) + bonus
  return { rolls, bonus, total, crit: isCrit }
}

export function concentrationSave(creature, damage) {
  const dc        = Math.max(10, Math.floor(damage / 2))
  const saveBonus = creature.saves ? (creature.saves.con || 0) : 0
  const hasAdv    = !!creature.hasWarCaster
  const { result, type } = _rollD20WithAdv(hasAdv, false)
  const total = result + saveBonus
  return { dc, result, saveBonus, total, success: total >= dc, type }
}

// ── Condition helpers ──────────────────────────────────────────────────────

const INCAPACITATING_CONDITIONS = new Set([
  'paralyzed', 'stunned', 'unconscious', 'charmed_hp', 'incapacitated',
])

export function isIncapacitated(creature) {
  return creature.conditions.some(c => INCAPACITATING_CONDITIONS.has(c))
}

export function isAlive(creature) {
  return creature.currentHP > 0
}

export function hasCondition(creature, condition) {
  return creature.conditions.includes(condition)
}

export function addCondition(creature, condition) {
  if (!creature.conditions.includes(condition)) {
    creature.conditions.push(condition)
  }
}

export function removeCondition(creature, condition) {
  const idx = creature.conditions.indexOf(condition)
  if (idx === -1) return false
  creature.conditions.splice(idx, 1)
  return true
}

export function removeAllConditions(creature, ...conditions) {
  creature.conditions = creature.conditions.filter(c => !conditions.includes(c))
}

export function getActiveEnemies(creatures) {
  return creatures.filter(c => isAlive(c) && !isIncapacitated(c))
}

export function getAllAliveEnemies(creatures) {
  return creatures.filter(c => isAlive(c))
}

// ── Concentration cleanup ──────────────────────────────────────────────────

export function breakConcentration(caster, allCombatants) {
  const spell = caster.concentrating
  if (!spell) return

  switch (spell) {
    case 'Hypnotic Pattern':
      for (const c of allCombatants) {
        removeAllConditions(c, 'charmed_hp', 'incapacitated')
      }
      break
    case 'Hold Person':
    case 'Hold Monster':
      for (const c of allCombatants) {
        removeCondition(c, 'paralyzed')
      }
      break
    case 'Greater Invisibility':
      removeCondition(caster, 'invisible')
      break
    case 'Shield of Faith':
      caster.ac = (caster.ac || 0) - 2
      break
    default:
      break
  }

  caster.concentrating = null
  caster.concentrationRoundsRemaining = 0
}

// ── Spatial ────────────────────────────────────────────────────────────────

const FLYING_ALTITUDE_FT = 30

export function distanceBetween(a, b) {
  const ax = a.position ? (a.position.x || 0) : 0
  const ay = a.position ? (a.position.y || 0) : 0
  const bx = b.position ? (b.position.x || 0) : 0
  const by = b.position ? (b.position.y || 0) : 0

  const chebyshev = Math.max(Math.abs(ax - bx), Math.abs(ay - by))
  const horizontal = chebyshev * 5

  const aFlying = !!a.flying
  const bFlying = !!b.flying

  if (aFlying === bFlying) {
    return horizontal
  }

  const dist3d = Math.sqrt(horizontal * horizontal + FLYING_ALTITUDE_FT * FLYING_ALTITUDE_FT)
  return Math.round(dist3d / 5) * 5
}
