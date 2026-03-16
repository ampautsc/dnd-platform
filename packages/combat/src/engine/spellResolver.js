/**
 * Spell Resolver — generic spell execution engine
 *
 * Reads spell data from the spell registry and applies mechanics
 * through the combat engine. No spell-specific if/else chains.
 *
 * Each spell follows a standard resolution pipeline:
 *   1. Spend slot
 *   2. Drop existing concentration if needed
 *   3. Resolve targeting (single / self / area)
 *   4. Make attack roll OR force save
 *   5. Apply damage
 *   6. Apply effects/conditions
 *   7. Set up concentration tracking
 *   8. Trigger reactions (Counterspell)
 */

import * as spellRegistry from '@dnd-platform/content/spells'
import * as dice from './dice.js'
import * as mech from './mechanics.js'
import { resolveAoETargets } from './targetResolver.js'

// ═══════════════════════════════════════════════════════════════════════════
// SLOT MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

export function spendSlot(caster, level) {
  if (level > 0 && caster.spellSlots[level] !== undefined) {
    if (caster.spellSlots[level] <= 0) {
      return false
    }
    caster.spellSlots[level]--
  }
  caster.spellsCast = (caster.spellsCast || 0) + 1
  return true
}

export function hasSlot(caster, level) {
  if (level === 0) return true
  return (caster.spellSlots[level] || 0) > 0
}

// ═══════════════════════════════════════════════════════════════════════════
// CONCENTRATION MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

export function handleConcentrationSwitch(caster, spellDef, allCombatants, log) {
  if (spellDef.concentration && caster.concentrating) {
    log.push(`    → Dropping concentration on ${caster.concentrating}`)
    mech.breakConcentration(caster, allCombatants)
  }
}

export function setupConcentration(caster, spellDef) {
  if (spellDef.concentration) {
    caster.concentrating = spellDef.name
    caster.concentrationRoundsRemaining = spellDef.duration
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SAVE RESOLUTION
// ═══════════════════════════════════════════════════════════════════════════

export function getSaveDC(caster, spellDef) {
  if (caster.spellSaveDC) return caster.spellSaveDC
  const castingMod = caster[spellDef.castingAbility || 'chaMod'] || caster.chaMod || 0
  return 8 + (caster.profBonus || 0) + castingMod
}

export function resolveSpellSave(target, saveDef, dc, spellDef) {
  const ability = saveDef.ability
  const saveBonus = (target.saves && target.saves[ability]) || 0

  const autoFailAbilities = ['str', 'dex']
  const autoFailConditions = ['paralyzed', 'stunned', 'unconscious']
  const autoFail = autoFailAbilities.includes(ability) &&
    target.conditions.some(c => autoFailConditions.includes(c))

  if (autoFail) {
    return {
      result: 0, saveBonus, total: 0, dc,
      success: false, type: 'auto-fail',
      autoFail: true,
    }
  }

  let hasAdv = false
  let hasDisadv = false

  if (target.darkDevotion && spellDef.effects.some(e =>
    e.includes('charmed') || e.includes('frightened'))) {
    hasAdv = true
  }

  if (target.magicResistance) {
    hasAdv = true
  }

  return mech.makeSavingThrow(saveBonus, dc, hasAdv, hasDisadv)
}

// ═══════════════════════════════════════════════════════════════════════════
// DAMAGE APPLICATION
// ═══════════════════════════════════════════════════════════════════════════

export function applyDamage(target, amount, caster) {
  target.currentHP -= amount
  target.totalDamageTaken = (target.totalDamageTaken || 0) + amount
  if (caster) caster.totalDamageDealt = (caster.totalDamageDealt || 0) + amount

  if (amount > 0 && mech.hasCondition(target, 'charmed_hp')) {
    mech.removeAllConditions(target, 'charmed_hp', 'incapacitated')
    target._hpBrokenByDamage = true
  }
}

export function checkConcentrationFromDamage(target, damage, allCombatants, log) {
  if (!target.concentrating) return

  const conSave = mech.concentrationSave(target, damage)
  if (conSave.success) {
    target.concentrationSavesMade = (target.concentrationSavesMade || 0) + 1
    log.push(`    → Concentration save: [d20${conSave.type === 'advantage' ? '(ADV)' : ''}:${conSave.result}+${conSave.saveBonus}=${conSave.total} vs DC ${conSave.dc}] MAINTAINED!`)
  } else {
    target.concentrationSavesFailed = (target.concentrationSavesFailed || 0) + 1
    log.push(`    → Concentration save: BROKEN! ${target.concentrating} ends!`)
    mech.breakConcentration(target, allCombatants)
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// EFFECT APPLICATION
// ═══════════════════════════════════════════════════════════════════════════

export function applyEffects(target, effects, caster) {
  for (const effect of effects) {
    if (effect === 'ac_bonus_2') {
      target.ac += 2
    } else if (effect === 'vm_disadvantage') {
      mech.addCondition(target, 'vm_disadvantage')
    } else {
      mech.addCondition(target, effect)
    }
  }
  if (caster && effects.length > 0) {
    caster.conditionsInflicted = (caster.conditionsInflicted || 0) + effects.length
  }
}

export function applySelfEffects(caster, effects) {
  for (const effect of effects) {
    if (effect === 'invisible') {
      mech.addCondition(caster, 'invisible')
    } else if (effect === 'ac_bonus_2') {
      caster.ac += 2
    } else if (effect === 'teleport') {
      caster._teleportPending = true
    } else {
      mech.addCondition(caster, effect)
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN SPELL RESOLVER
// ═══════════════════════════════════════════════════════════════════════════

export function resolveSpell(caster, action, allCombatants, log, options = {}) {
  const spellName = action.spell
  const level = action.level ?? 0

  if (!spellRegistry.hasSpell(spellName)) {
    log.push(`  ERROR: Unknown spell "${spellName}"`)
    return { success: false, countered: false, details: { error: 'unknown_spell' } }
  }

  const spellDef = spellRegistry.getSpell(spellName)
  const dc = spellDef.save ? getSaveDC(caster, spellDef) : 0

  // 1. Spend slot
  if (level > 0) {
    if (!spendSlot(caster, level)) {
      log.push(`  ERROR: No level ${level} slots remaining for ${spellName}`)
      return { success: false, countered: false, details: { error: 'no_slots' } }
    }
  } else {
    caster.spellsCast = (caster.spellsCast || 0) + 1
  }

  // 2. Handle concentration switch
  handleConcentrationSwitch(caster, spellDef, allCombatants, log)

  // 3. Check for Counterspell reaction
  if (spellDef.counterSpellable && options.onReaction) {
    const counterResult = options.onReaction({
      type: 'enemy_casting_spell',
      spell: spellName,
      level,
      caster,
    })
    if (counterResult && counterResult.countered) {
      log.push(`    → ${counterResult.counteredBy} uses REACTION: Counterspell! ${spellName} is countered!`)
      return { success: false, countered: true, details: { counteredBy: counterResult.counteredBy } }
    }
  }

  // 4. Resolve by targeting type
  const result = { success: true, countered: false, details: {} }

  if (spellDef.targeting.type === 'self') {
    log.push(`  ACTION: Cast ${spellName} (Level ${level}${level > 0 ? ` slot, ${caster.spellSlots[level]} remaining` : ''}).`)
    applySelfEffects(caster, spellDef.selfEffects)
    setupConcentration(caster, spellDef)
    log.push(`    → ${caster.name} is affected by ${spellName}.`)

  } else if (spellDef.attack) {
    const target = action.target
    log.push(`  ACTION: Cast ${spellName} (Level ${level} slot). ${spellDef.attack.type} attack vs ${target.name}.`)

    const atkResult = mech.makeAttackRoll(
      caster.spellAttackBonus || 0,
      target.ac,
    )
    caster.attacksMade = (caster.attacksMade || 0) + 1

    if (atkResult.hits) {
      caster.attacksHit = (caster.attacksHit || 0) + 1

      if (spellDef.damage) {
        const dmg = mech.rollDamage(spellDef.damage.dice, spellDef.damage.bonus || 0, atkResult.isCrit)
        applyDamage(target, dmg.total, caster)
        log.push(`    → ${spellDef.attack.type} attack: [d20:${atkResult.natural}+${atkResult.attackBonus}=${atkResult.total} vs AC ${target.ac}] ${atkResult.isCrit ? 'CRITICAL ' : ''}HIT! ${dmg.total} ${spellDef.damage.type} damage. ${target.name} HP: ${target.currentHP}/${target.maxHP}`)

        checkConcentrationFromDamage(target, dmg.total, allCombatants, log)
      }

      applyEffects(target, spellDef.effects, caster)
    } else {
      log.push(`    → ${spellDef.attack.type} attack: [d20:${atkResult.natural}+${atkResult.attackBonus}=${atkResult.total} vs AC ${target.ac}] MISS.`)
    }

    result.details.hit = atkResult.hits

  } else if (spellDef.save && spellDef.targeting.type === 'single') {
    const target = action.target
    log.push(`  ACTION: Cast ${spellName} (Level ${level}${level > 0 ? ` slot, ${caster.spellSlots[level]} remaining` : ''}). DC ${dc} ${spellDef.save.ability.toUpperCase()} save on ${target.name}.`)

    const save = resolveSpellSave(target, spellDef.save, dc, spellDef)

    if (!save.success) {
      if (spellDef.damage) {
        const parsed = dice.parseDiceAndRoll(spellDef.damage.dice)
        target._hpBrokenByDamage = false
        applyDamage(target, parsed.total, caster)
        log.push(`    → ${target.name}: ${spellDef.save.ability.toUpperCase()} save [${save.autoFail ? 'AUTO-FAIL' : `d20:${save.result}+${save.saveBonus}=${save.total}`} vs DC ${dc}] FAIL! ${parsed.total} ${spellDef.damage.type} damage. HP: ${target.currentHP}/${target.maxHP}`)
        if (target._hpBrokenByDamage) {
          log.push(`    → ⚠ ${target.name}: Charm broken by damage! No longer incapacitated.`)
          target._hpBrokenByDamage = false
        }
        checkConcentrationFromDamage(target, parsed.total, allCombatants, log)
      } else {
        log.push(`    → ${target.name}: ${spellDef.save.ability.toUpperCase()} save [${save.autoFail ? 'AUTO-FAIL' : `d20:${save.result}+${save.saveBonus}=${save.total}`} vs DC ${dc}] FAIL!`)
      }

      applyEffects(target, spellDef.effects, caster)
      setupConcentration(caster, spellDef)
      result.details.saved = false
    } else {
      if (!spellDef.save.negatesAll && spellDef.damage) {
        const parsed = dice.parseDiceAndRoll(spellDef.damage.dice)
        const halfDmg = Math.floor(parsed.total / 2)
        target._hpBrokenByDamage = false
        applyDamage(target, halfDmg, caster)
        log.push(`    → ${target.name}: ${spellDef.save.ability.toUpperCase()} save [d20:${save.result}+${save.saveBonus}=${save.total} vs DC ${dc}] SUCCESS. ${halfDmg} ${spellDef.damage.type} damage (half).`)
        if (target._hpBrokenByDamage) {
          log.push(`    → ⚠ ${target.name}: Charm broken by damage! No longer incapacitated.`)
          target._hpBrokenByDamage = false
        }
        checkConcentrationFromDamage(target, halfDmg, allCombatants, log)
      } else {
        log.push(`    → ${target.name}: ${spellDef.save.ability.toUpperCase()} save [d20:${save.result}+${save.saveBonus}=${save.total} vs DC ${dc}] SUCCESS. No effect.`)
      }
      result.details.saved = true
    }

  } else if (spellDef.save && spellDef.targeting.type === 'area') {
    const targets = action.aoeCenter
      ? resolveAoETargets(caster, spellDef, action.aoeCenter, allCombatants)
      : (action.targets || [])
    let affectedCount = 0

    const shapeDesc = spellDef.targeting.shape
      ? `${spellDef.targeting.size || spellDef.targeting.radius || spellDef.targeting.length || ''}ft ${spellDef.targeting.shape}`
      : 'area'
    log.push(`  ACTION: Cast ${spellName} (Level ${level} slot, ${caster.spellSlots[level]} remaining). DC ${dc} ${spellDef.save.ability.toUpperCase()} save. ${shapeDesc}.`)

    for (const target of targets) {
      if (!mech.isAlive(target) || mech.isIncapacitated(target)) continue

      const hasCharmEffect = spellDef.effects.some(e => e.includes('charmed'))
      if (hasCharmEffect && target.immuneCharmed) {
        log.push(`    → ${target.name}: IMMUNE to charmed! No effect.`)
        continue
      }

      const save = resolveSpellSave(target, spellDef.save, dc, spellDef)

      if (!save.success) {
        applyEffects(target, spellDef.effects, caster)
        affectedCount++

        if (spellDef.damage) {
          const parsed = dice.parseDiceAndRoll(spellDef.damage.dice)
          applyDamage(target, parsed.total, caster)
          log.push(`    → ${target.name}: FAIL! ${parsed.total} ${spellDef.damage.type} damage + ${spellDef.effects.join(', ')}.`)
          checkConcentrationFromDamage(target, parsed.total, allCombatants, log)
        } else {
          const advNote = save.type === 'advantage' ? ' (had advantage)' : ''
          log.push(`    → ${target.name}: ${spellDef.save.ability.toUpperCase()} save [d20${save.type === 'advantage' ? '(ADV)' : ''}:${save.result}+${save.saveBonus}=${save.total} vs DC ${dc}] FAIL!${advNote}`)
        }
      } else {
        const advNote = save.type === 'advantage' ? ' (had advantage)' : ''
        if (!spellDef.save.negatesAll && spellDef.damage) {
          const parsed = dice.parseDiceAndRoll(spellDef.damage.dice)
          const halfDmg = Math.floor(parsed.total / 2)
          applyDamage(target, halfDmg, caster)
          log.push(`    → ${target.name}: SUCCESS.${advNote} ${halfDmg} damage (half).`)
        } else {
          log.push(`    → ${target.name}: ${spellDef.save.ability.toUpperCase()} save [d20${save.type === 'advantage' ? '(ADV)' : ''}:${save.result}+${save.saveBonus}=${save.total} vs DC ${dc}] SUCCESS. Resists.${advNote}`)
        }
      }
    }

    if (affectedCount > 0) {
      setupConcentration(caster, spellDef)
      log.push(`    → ${affectedCount}/${targets.length} targets affected.`)
    } else {
      log.push(`    → No targets affected. Spell wasted.`)
    }

    result.details.affectedCount = affectedCount
    result.details.totalTargets = targets.length

  } else if (spellDef.healing) {
    const target = action.target || caster
    log.push(`  ACTION: Cast ${spellName} (Level ${level} slot) on ${target.name}.`)

    const parsed = dice.parseDiceAndRoll(spellDef.healing.dice)
    const healBonus = spellDef.healing.bonus === 'casting_mod'
      ? (caster.chaMod || caster.wisMod || 0)
      : (spellDef.healing.bonus || 0)
    const healAmount = parsed.total + healBonus

    const before = target.currentHP
    target.currentHP = Math.min(target.maxHP, target.currentHP + healAmount)
    const healed = target.currentHP - before
    caster.totalHealing = (caster.totalHealing || 0) + healed

    log.push(`    → ${target.name} healed for ${healed} HP. HP: ${target.currentHP}/${target.maxHP}`)
    result.details.healed = healed
  }

  // Self-buff effects on save/attack spells (Shield of Faith)
  if (spellDef.selfEffects.length > 0 && spellDef.targeting.type === 'single') {
    const target = action.target || caster
    applySelfEffects(target, spellDef.selfEffects)
    setupConcentration(caster, spellDef)
  }

  return result
}

// ═══════════════════════════════════════════════════════════════════════════
// CANTRIP SHORTHAND
// ═══════════════════════════════════════════════════════════════════════════

export function resolveCantrip(caster, action, allCombatants, log, options = {}) {
  return resolveSpell(caster, { ...action, level: 0 }, allCombatants, log, options)
}
