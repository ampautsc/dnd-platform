/**
 * AI Tactics Module — Priority-based tactical decision engine for D&D 5e combat.
 *
 * Each creature profile is an ordered array of evaluator functions.
 * makeDecision() runs them in sequence and returns the first non-null result,
 * with bonus-action-only results merged into the main decision.
 */

import * as mech from '../engine/mechanics.js'
import { computeOptimalCenter, computeOptimalConeDirection, getEffectiveRadius, isInAoE, canAoEReachFlying } from '../engine/aoeGeometry.js'

/**
 * Find the lowest available spell slot at or above minLevel.
 * Returns the slot level integer, or null if none available.
 */
export function findLowestAvailableSlot(spellSlots, minLevel) {
  if (!spellSlots) return null
  for (let lvl = minLevel; lvl <= 9; lvl++) {
    if (spellSlots[lvl] > 0) return lvl
  }
  return null
}

// ─────────────────────────────────────────────────────────────────────────────
// BATTLEFIELD ASSESSMENT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a context snapshot used by all evaluators.
 * @param {object} creature
 * @param {object[]} allCombatants
 * @param {number} round
 * @returns {object} ctx
 */
export function assessBattlefield(creature, allCombatants, round) {
  const alive = allCombatants.filter(c => mech.isAlive(c))
  const enemies = alive.filter(c => c.side !== creature.side && c.id !== creature.id)
  const allies  = alive.filter(c => c.side === creature.side  && c.id !== creature.id)

  const activeEnemies = enemies.filter(e => !mech.isIncapacitated(e))
  const helplessEnemies = enemies.filter(e => mech.isIncapacitated(e))
  const enemiesInMelee = activeEnemies.filter(e => mech.distanceBetween(creature, e) <= 5)
  const charmedAllies  = allies.filter(a => mech.hasCondition(a, 'charmed_hp'))

  const hpPct      = creature.currentHP / creature.maxHP
  const isFlying   = !!creature.flying
  const isInvisible = (creature.conditions || []).includes('invisible')
  const canFly     = !!(creature.gemFlight && creature.gemFlight.uses > 0 && !isFlying)

  return {
    me: creature,
    round,
    allCombatants,
    enemies,
    allies,
    activeEnemies,
    helplessEnemies,
    enemiesInMelee,
    charmedAllies,
    hpPct,
    isFlying,
    isInvisible,
    canFly,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// TARGETING HELPERS
// ─────────────────────────────────────────────────────────────────────────────

export function selectHighestThreat(enemies) {
  if (!enemies || enemies.length === 0) return null
  const casters = enemies.filter(e => e.spellsKnown && e.spellsKnown.length > 0)
  if (casters.length > 0) return casters[0]
  return enemies[0]
}

export function selectWeakest(enemies) {
  if (!enemies || enemies.length === 0) return null
  return enemies.reduce((a, b) => a.currentHP <= b.currentHP ? a : b)
}

export function selectClosestCharmedAlly(me, charmedAllies) {
  if (!charmedAllies || charmedAllies.length === 0) return null
  return charmedAllies.reduce((closest, ally) => {
    return mech.distanceBetween(me, ally) < mech.distanceBetween(me, closest) ? ally : closest
  })
}

/**
 * Plan optimal AoE placement and estimate how many enemies it will hit.
 * The AI uses this to decide IF an AoE is worth casting and WHERE to center it.
 * The game engine (targetResolver) will independently determine the actual targets.
 *
 * @param {object} caster - the creature casting the spell
 * @param {object[]} enemies - array of potential targets
 * @param {number} castRange - how far the caster can place the AoE center (in feet)
 * @param {object} targeting - structured targeting geometry from spell data
 * @returns {{ center: { x: number, y: number }, estimatedCount: number }|null}
 */
export function planAoEPlacement(caster, enemies, castRange, targeting) {
  if (!enemies || enemies.length === 0) return null

  // ── Self-origin cones: use directional cone optimization ──────────────
  if (targeting?.shape === 'cone' && castRange === 0) {
    const coneLength = targeting.length || 0
    // Filter out flying enemies the cone can't reach
    const reachesFlying = canAoEReachFlying(targeting)
    const reachableEnemies = reachesFlying
      ? enemies
      : enemies.filter(e => !e.flying)
    if (reachableEnemies.length === 0) return null
    return computeOptimalConeDirection(caster, reachableEnemies, coneLength)
  }
  
  const aoeRadius = getEffectiveRadius(targeting)

  // Filter out flying enemies the AoE can't reach — don't let them influence placement
  const reachesFlying = canAoEReachFlying(targeting)
  const reachableEnemies = reachesFlying
    ? enemies
    : enemies.filter(e => !e.flying)
  if (reachableEnemies.length === 0) return null

  const center = computeOptimalCenter(caster, reachableEnemies, castRange, aoeRadius)
  if (!center) return null
  
  // Estimate how many enemies fall within the AoE from this center
  const estimatedCount = reachableEnemies.filter(e => {
    const pos = e.position || { x: 0, y: 0 }
    return isInAoE(pos, center, targeting, { flying: !!e.flying, casterPosition: caster?.position })
  }).length
  
  return { center, estimatedCount }
}

// ─────────────────────────────────────────────────────────────────────────────
// BARD / PARTY EVALUATORS
// ─────────────────────────────────────────────────────────────────────────────

export function evalSurvivalInvisibility(ctx) {
  const { me, hpPct, isInvisible } = ctx
  if (hpPct >= 0.25) return null
  if (isInvisible) return null
  if (!me.spellSlots || !(me.spellSlots[4] > 0)) return null
  return {
    action: { spell: 'Greater Invisibility', level: 4 },
    reasoning: 'CRITICAL HP — casting Greater Invisibility for survival',
    bonusAction: me.gemFlight && me.gemFlight.uses > 0 ? { type: 'gem_flight' } : null,
  }
}

export function evalOpeningAoEDisable(ctx) {
  const { me, round, activeEnemies } = ctx
  if (round !== 1) return null
  if (me.concentrating) return null
  if (!me.spellSlots || !(me.spellSlots[3] > 0)) return null
  // Hypnotic Pattern: 120ft range, 30ft cube
  const targeting = { shape: 'cube', size: 30 }
  const plan = planAoEPlacement(me, activeEnemies, 120, targeting)
  if (!plan || plan.estimatedCount === 0) return null
  return {
    action: { spell: 'Hypnotic Pattern', level: 3, aoeCenter: plan.center },
    reasoning: 'ROUND 1 opening — casting Hypnotic Pattern to disable enemies',
    bonusAction: me.gemFlight && me.gemFlight.uses > 0 ? { type: 'gem_flight' } : null,
  }
}

export function evalConcentrationAllDisabled(ctx) {
  const { me, activeEnemies, helplessEnemies } = ctx
  if (!me.concentrating) return null
  if (activeEnemies.length > 0) return null
  if (helplessEnemies.length === 0) return null

  // All enemies disabled — focus fire on weakest to kill them while charmed.
  // Damage breaks charm on THAT creature only — others stay incapacitated.
  // Prefer Dissonant Whispers (3d6) over Vicious Mockery (2d4) for more damage.
  // Do NOT use Shatter — AoE would break charm on multiple targets at once.
  const target = selectWeakest(helplessEnemies)
  const known = me.spellsKnown || []

  if (known.includes('Dissonant Whispers')) {
    const slotLevel = findLowestAvailableSlot(me.spellSlots, 1)
    if (slotLevel) {
      return {
        action: { spell: 'Dissonant Whispers', level: slotLevel, target },
        reasoning: 'All enemies disabled — attacking weakest with DW for max damage while concentrating',
      }
    }
  }

  return {
    action: { spell: 'Vicious Mockery', target },
    reasoning: 'All enemies disabled — attacking weakest with VM while maintaining concentration',
  }
}

export function evalConcentrationMeleeViciousMockery(ctx) {
  const { me, enemiesInMelee } = ctx
  if (!me.concentrating) return null
  if (enemiesInMelee.length === 0) return null
  return {
    action: { spell: 'Vicious Mockery', target: enemiesInMelee[0] },
    reasoning: 'Concentrating — enemy in melee, casting Vicious Mockery to impose disadvantage',
  }
}

export function evalConcentrationFinishWithCrossbow(ctx) {
  const { me, activeEnemies } = ctx
  if (!me.concentrating) return null
  if (activeEnemies.length !== 1) return null
  if (activeEnemies[0].currentHP > 10) return null
  return {
    action: { type: 'attack', weapon: me.weapon, target: activeEnemies[0] },
    reasoning: 'Concentrating — one weak enemy remaining, finishing with crossbow',
  }
}

export function evalConcentrationBreathWeapon(ctx) {
  const { me, activeEnemies } = ctx
  if (!me.concentrating) return null
  if (!me.breathWeapon || !(me.breathWeapon.uses > 0)) return null
  // Breath weapon: self-origin cone
  const targeting = me.breathWeapon.targeting || { shape: 'cone', length: me.breathWeapon.range || 15 }
  const plan = planAoEPlacement(me, activeEnemies, 0, targeting)
  if (!plan || plan.estimatedCount < 2) return null
  return {
    action: { type: 'breath_weapon', aoeCenter: plan.center },
    reasoning: 'Concentrating — multiple enemies in breath range, using breath weapon',
  }
}

export function evalConcentrationRangedViciousMockery(ctx) {
  const { me, activeEnemies } = ctx
  if (!me.concentrating) return null
  if (activeEnemies.length === 0) return null
  return {
    action: { spell: 'Vicious Mockery', target: selectHighestThreat(activeEnemies) },
    reasoning: 'Concentrating — casting Vicious Mockery at highest threat',
  }
}

/**
 * While concentrating, cast Shatter (AoE 3d8 damage) on clustered active enemies.
 * Shatter is NOT concentration, so it doesn't break our existing CC spell.
 * Only used if we can hit 2+ active enemies and have a 2nd-level slot.
 */
export function evalConcentrationShatter(ctx) {
  const { me, activeEnemies } = ctx
  if (!me.concentrating) return null
  if (activeEnemies.length < 2) return null
  const known = me.spellsKnown || []
  if (!known.includes('Shatter')) return null
  const slotLevel = findLowestAvailableSlot(me.spellSlots, 2)
  if (!slotLevel) return null

  // Shatter: 60ft range, 10ft radius sphere
  const targeting = { shape: 'sphere', radius: 10 }
  const plan = planAoEPlacement(me, activeEnemies, 60, targeting)
  if (!plan || plan.estimatedCount < 2) return null

  return {
    action: { spell: 'Shatter', level: slotLevel, aoeCenter: plan.center },
    reasoning: `Concentrating — casting Shatter to damage ${plan.estimatedCount} active enemies`,
  }
}

/**
 * While concentrating, cast Dissonant Whispers (3d6 single target) to deal damage
 * without breaking concentration. Prioritized over Vicious Mockery (2d4) as it does
 * roughly double the damage. Uses 1st-level slots.
 */
export function evalConcentrationDissonantWhispers(ctx) {
  const { me, activeEnemies } = ctx
  if (!me.concentrating) return null
  if (activeEnemies.length === 0) return null
  const known = me.spellsKnown || []
  if (!known.includes('Dissonant Whispers')) return null
  const slotLevel = findLowestAvailableSlot(me.spellSlots, 1)
  if (!slotLevel) return null

  return {
    action: { spell: 'Dissonant Whispers', level: slotLevel, target: selectHighestThreat(activeEnemies) },
    reasoning: 'Concentrating — casting Dissonant Whispers for damage without breaking CC',
  }
}

/**
 * Not concentrating, cast Shatter on 2+ active enemies for direct AoE damage.
 */
export function evalOffensiveShatter(ctx) {
  const { me, activeEnemies } = ctx
  if (me.concentrating) return null
  if (activeEnemies.length < 2) return null
  const known = me.spellsKnown || []
  if (!known.includes('Shatter')) return null
  const slotLevel = findLowestAvailableSlot(me.spellSlots, 2)
  if (!slotLevel) return null

  const targeting = { shape: 'sphere', radius: 10 }
  const plan = planAoEPlacement(me, activeEnemies, 60, targeting)
  if (!plan || plan.estimatedCount < 2) return null

  return {
    action: { spell: 'Shatter', level: slotLevel, aoeCenter: plan.center },
    reasoning: `Not concentrating — casting Shatter to damage ${plan.estimatedCount} enemies`,
  }
}

/**
 * Not concentrating with active enemies, cast Dissonant Whispers for damage.
 */
export function evalOffensiveDissonantWhispers(ctx) {
  const { me, activeEnemies } = ctx
  if (me.concentrating) return null
  if (activeEnemies.length === 0) return null
  const known = me.spellsKnown || []
  if (!known.includes('Dissonant Whispers')) return null
  const slotLevel = findLowestAvailableSlot(me.spellSlots, 1)
  if (!slotLevel) return null

  return {
    action: { spell: 'Dissonant Whispers', level: slotLevel, target: activeEnemies[0] },
    reasoning: 'Not concentrating, single enemy — casting Dissonant Whispers for damage',
  }
}

export function evalConcentrationSelfHeal(ctx) {
  const { me, hpPct } = ctx
  if (!me.concentrating) return null
  if (hpPct >= 0.5) return null
  return {
    action: null,
    bonusAction: { type: 'cast_healing_word', spell: 'Healing Word' },
    _bonusActionOnly: true,
    reasoning: 'Concentrating but HP low — using bonus action Healing Word',
  }
}

/**
 * Proactive Healing Word on any turn when HP is below 70%.
 * Fires regardless of concentration state. Merges with any main action
 * that doesn't already have a bonus action (via _bonusActionOnly).
 */
export function evalProactiveHealingWord(ctx) {
  const { me, hpPct } = ctx
  if (hpPct >= 0.7) return null
  if (me.polymorphedAs) return null  // Can't cast spells in beast form
  if (!(me.spellsKnown || []).includes('Healing Word')) return null
  if (!me.spellSlots || !(me.spellSlots[1] > 0)) return null
  return {
    action: null,
    bonusAction: { type: 'cast_healing_word', spell: 'Healing Word' },
    _bonusActionOnly: true,
    reasoning: 'HP below 70% — using bonus action Healing Word for sustain',
  }
}

export function evalRecastHypnoticPattern(ctx) {
  const { me, activeEnemies } = ctx
  if (me.concentrating) return null
  if (activeEnemies.length < 2) return null
  if (!me.spellSlots || !(me.spellSlots[3] > 0)) return null
  // Hypnotic Pattern: 120ft range, 30ft cube
  const targeting = { shape: 'cube', size: 30 }
  const plan = planAoEPlacement(me, activeEnemies, 120, targeting)
  if (!plan || plan.estimatedCount < 2) return null
  return {
    action: { spell: 'Hypnotic Pattern', level: 3, aoeCenter: plan.center },
    reasoning: 'Recasting Hypnotic Pattern to disable multiple enemies',
  }
}

export function evalCastHoldPerson(ctx) {
  const { me, activeEnemies } = ctx
  if (me.concentrating) return null
  if (!me.spellSlots || !(me.spellSlots[2] > 0)) return null
  // Hold Person only works on humanoids (D&D 5e PHB p.251)
  const humanoidEnemies = activeEnemies.filter(e => !e.type || e.type === 'humanoid')
  if (humanoidEnemies.length === 0) return null
  return {
    action: { spell: 'Hold Person', level: 2, target: selectHighestThreat(humanoidEnemies) },
    reasoning: 'Casting Hold Person on highest-threat humanoid',
  }
}

export function evalFallbackCrossbow(ctx) {
  const { me, activeEnemies } = ctx
  if (activeEnemies.length === 0) return null

  // Prefer crossbow over VM when not concentrating (raw damage > minor debuff)
  if (me.concentrating) return null

  const crossbow = (me.weapons || []).find(w => w.type === 'ranged')
  if (!crossbow) return null

  const target = selectHighestThreat(activeEnemies)
  const dist = mech.distanceBetween(me, target)
  if (dist > (crossbow.range || 30)) return null

  return {
    action: { type: 'attack', target, weapon: crossbow },
    reasoning: 'Fallback — crossbow attack (no concentration to protect)',
  }
}

export function evalFallbackCantrip(ctx) {
  const { me, activeEnemies } = ctx
  if (activeEnemies.length === 0) return null
  const target   = selectHighestThreat(activeEnemies)
  const known    = me.spellsKnown || []
  const cantrips = me.cantrips || []
  const allKnown = [...known, ...cantrips]
  if (allKnown.includes('Vicious Mockery')) {
    return {
      action: { spell: 'Vicious Mockery', target },
      reasoning: 'Fallback — casting Vicious Mockery',
    }
  }
  if (allKnown.includes('Sacred Flame')) {
    return {
      action: { spell: 'Sacred Flame', target },
      reasoning: 'Fallback — casting Sacred Flame',
    }
  }
  return null
}

export function evalDodge(_ctx) {
  return {
    action: { type: 'dodge' },
    reasoning: 'No better option — taking dodge action',
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPLESS TARGET — Attack incapacitated enemies instead of doing nothing
// ─────────────────────────────────────────────────────────────────────────────

/**
 * When all active enemies are gone but helpless (incapacitated) enemies remain,
 * attack them. In D&D 5e, even paralyzed creatures can be attacked — auto-crit
 * if within 5 ft. This prevents infinite stalemates where enemies dodge helplessly.
 */
export function evalAttackHelpless(ctx) {
  const { me, activeEnemies, helplessEnemies } = ctx
  if (activeEnemies.length > 0) return null       // prefer active targets
  if (helplessEnemies.length === 0) return null

  const target = helplessEnemies[0]
  const dist   = mech.distanceBetween(me, target)

  // Move toward and melee attack
  const result = me.multiattack > 0
    ? { action: { type: 'multiattack', target }, reasoning: 'Attacking helpless enemy' }
    : { action: { type: 'attack', weapon: me.weapon, target }, reasoning: 'Attacking helpless enemy' }

  if (dist > 5) {
    result.movement = { type: 'move_toward', target }
  }
  return result
}

// ─────────────────────────────────────────────────────────────────────────────
// ENEMY (CULT FANATIC) EVALUATORS
// ─────────────────────────────────────────────────────────────────────────────

export function evalEnemyInvisibleFallback(ctx) {
  const { me, activeEnemies, charmedAllies, allies } = ctx
  const allInvisible = activeEnemies.length > 0 && activeEnemies.every(e => mech.hasCondition(e, 'invisible'))
  if (!allInvisible) return null

  if (me.spellSlots && me.spellSlots[1] > 0 && !me.concentrating) {
    return {
      action: { spell: 'Shield of Faith', level: 1, target: me },
      reasoning: 'Enemies are invisible — casting Shield of Faith on self',
    }
  }
  if (charmedAllies.length > 0) {
    const target = selectClosestCharmedAlly(me, charmedAllies)
    return {
      action: { type: 'shake_awake', target },
      reasoning: 'Enemies are invisible — shaking awake charmed ally',
    }
  }
  return {
    action: { type: 'dodge' },
    reasoning: 'Enemies are invisible — taking dodge',
  }
}

export function evalFlyingTargetRanged(ctx) {
  const { me, activeEnemies, allies } = ctx
  const flyingTargets = activeEnemies.filter(e => e.flying)
  if (flyingTargets.length === 0) return null
  const target = flyingTargets[0]

  const allyAlreadyHolding = allies.some(a => a.concentrating === 'Hold Person')
  if (me.spellSlots && me.spellSlots[2] > 0 && !allyAlreadyHolding) {
    return {
      action: { spell: 'Hold Person', level: 2, target },
      reasoning: 'Enemy is flying — casting Hold Person to ground them',
    }
  }
  return {
    action: { spell: 'Sacred Flame', target },
    reasoning: 'Enemy is flying — using Sacred Flame at range',
  }
}

export function evalOpeningSpiritualWeapon(ctx) {
  const { me, round, enemiesInMelee } = ctx
  if (round !== 1) return null
  if (me.spiritualWeapon && me.spiritualWeapon.active) return null
  if (!me.spellSlots || !(me.spellSlots[2] > 0)) return null
  if (enemiesInMelee.length === 0) return null
  return {
    action: { type: 'multiattack', target: enemiesInMelee[0] },
    bonusAction: { spell: 'Spiritual Weapon', level: 2 },
    reasoning: 'Round 1 — attacking and summoning Spiritual Weapon as bonus action',
  }
}

export function evalShakeAwakeAllies(ctx) {
  const { me, charmedAllies } = ctx
  if (charmedAllies.length === 0) return null
  return {
    action: { type: 'shake_awake', target: selectClosestCharmedAlly(me, charmedAllies) },
    reasoning: 'Shaking awake charmed ally',
  }
}

export function evalMeleeAttack(ctx) {
  const { me, enemiesInMelee } = ctx
  if (enemiesInMelee.length === 0) return null
  const target = enemiesInMelee[0]
  if (me.multiattack > 0) {
    return {
      action: { type: 'multiattack', target },
      reasoning: 'Enemy in melee — using multiattack',
    }
  }
  return {
    action: { type: 'attack', weapon: me.weapon, target },
    reasoning: 'Enemy in melee — attacking',
  }
}

export function evalInflictWounds(ctx) {
  const { me, enemiesInMelee } = ctx
  if (enemiesInMelee.length === 0) return null
  if (!me.spellSlots || !(me.spellSlots[1] > 0)) return null
  return {
    action: { spell: 'Inflict Wounds', level: 1, target: enemiesInMelee[0] },
    reasoning: 'Enemy in melee — casting Inflict Wounds for high damage',
  }
}

export function evalRangedCantripWithApproach(ctx) {
  const { me, activeEnemies } = ctx
  if (activeEnemies.length === 0) return null

  const target = selectHighestThreat(activeEnemies)
  const nearestEnemy = activeEnemies.reduce((nearest, e) => {
    return mech.distanceBetween(me, e) < mech.distanceBetween(me, nearest) ? e : nearest
  })

  const movement = { type: 'move_toward', target: nearestEnemy }
  const cantrips = me.cantrips || []
  const known    = me.spellsKnown || []

  if (cantrips.includes('Sacred Flame') || known.includes('Sacred Flame')) {
    return {
      action: { spell: 'Sacred Flame', target },
      movement,
      reasoning: 'Approaching and casting Sacred Flame',
    }
  }
  if (cantrips.length > 0 || known.length > 0) {
    const cantrip = cantrips[0] || known[0]
    return {
      action: { spell: cantrip, target },
      movement,
      reasoning: `Approaching and casting ${cantrip}`,
    }
  }
  if (me.weapon) {
    return {
      action: { type: 'attack', weapon: me.weapon, target },
      movement,
      reasoning: 'Approaching to attack',
    }
  }
  return null
}

// ─────────────────────────────────────────────────────────────────────────────
// NEW SPELL EVALUATORS — Sleep, Faerie Fire, Polymorph, Greater Invisibility
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Sleep upcast at 3rd level: roll 7d8 = avg 31.5 HP worth of creatures.
 * Best in round 1 against groups of low-HP enemies (cult fanatics: 33 HP max).
 * Non-concentration, so it can stack with Hypnotic Pattern on subsequent rounds.
 * Not used if enemies are undead or have too many HP.
 */
export function evalOpeningSleep(ctx) {
  const { me, round, activeEnemies } = ctx
  if (round > 2) return null         // diminishing returns as enemies take damage
  if (me.concentrating) return null  // prefer to not waste a round when concentrating
  // Need a slot (1st level at minimum, but 3rd level is much better)
  const slotLevel = me.spellSlots?.[3] > 0 ? 3
    : me.spellSlots?.[2] > 0 ? 2
    : me.spellSlots?.[1] > 0 ? 1
    : 0
  if (!slotLevel) return null
  if (!(me.spellsKnown || []).includes('Sleep')) return null

  // Average HP pool: 5d8 + 2d8 per level above 1st
  const diceCount = 5 + 2 * (slotLevel - 1)
  const avgPool = diceCount * 4.5  // avg d8

  // Count enemies with HP below pool — sleep hits lowest-HP creatures first
  const sortedEnemies = [...activeEnemies]
    .filter(e => e.type !== 'undead' && !e.immuneSleep)
    .sort((a, b) => a.currentHP - b.currentHP)

  let hpUsed = 0
  let sleptCount = 0
  for (const e of sortedEnemies) {
    if (hpUsed + e.currentHP <= avgPool) {
      hpUsed += e.currentHP
      sleptCount++
    } else break
  }

  if (sleptCount === 0) return null

  // Place AoE to maximize targets caught
  const targeting = { shape: 'sphere', radius: 20 }
  const plan = planAoEPlacement(me, activeEnemies, 90, targeting)
  if (!plan || plan.estimatedCount === 0) return null

  return {
    action: { spell: 'Sleep', level: slotLevel, aoeCenter: plan.center },
    reasoning: `Casting Sleep (${slotLevel}${['st','nd','rd'][slotLevel-1]||'th'} level) — expected to incapacitate ~${sleptCount} enemies`,
  }
}

/**
 * Faerie Fire: DEX save or advantage on all attacks against affected.
 * Used when not concentrating and ≥2 enemies can be caught in 20ft cube.
 * Concentration spell; lower priority than Hypnotic Pattern but uses 1st level slot.
 */
export function evalOffensiveFaerieFire(ctx) {
  const { me, activeEnemies } = ctx
  if (me.concentrating) return null
  if (!me.spellSlots || !(me.spellSlots[1] > 0)) return null
  if (!(me.spellsKnown || []).includes('Faerie Fire')) return null
  if (activeEnemies.length < 2) return null

  const targeting = { shape: 'cube', size: 20 }
  const plan = planAoEPlacement(me, activeEnemies, 60, targeting)
  if (!plan || plan.estimatedCount < 2) return null

  return {
    action: { spell: 'Faerie Fire', level: 1, aoeCenter: plan.center },
    reasoning: `Casting Faerie Fire — expected to illuminate ${plan.estimatedCount} enemies (advantage on attacks)`,
  }
}

/**
 * Polymorph enemy into a sheep: WIS save or become a harmless 1 HP creature.
 * Used against tough non-humanoid enemies (can't Hold Person them).
 * Costs a 4th-level slot + concentration. High priority against dangerous bosses.
 */
export function evalEnemyPolymorph(ctx) {
  const { me, activeEnemies } = ctx
  if (me.concentrating) return null
  if (!me.spellSlots || !(me.spellSlots[4] > 0)) return null
  if (!(me.spellsKnown || []).includes('Polymorph')) return null

  // Enemy polymorph is best when there are MULTIPLE enemies — neutralize one, fight the others.
  // Against a single tough enemy, self-polymorph (Giant Ape) is usually better.
  if (activeEnemies.length < 2) return null

  // Look for a high-threat enemy that's not humanoid (for humanoids, Hold Person is better)
  // or any enemy with lots of HP remaining
  const highThreat = activeEnemies
    .filter(e => e.currentHP > 30 && (!e.type || e.type !== 'humanoid' || activeEnemies.length === 1))
    .sort((a, b) => b.currentHP - a.currentHP)
  if (highThreat.length === 0) return null

  const target = highThreat[0]
  return {
    action: { spell: 'Polymorph', level: 4, target, polymorphMode: 'enemy' },
    reasoning: `Casting Polymorph on ${target.name} — turning into a harmless sheep`,
  }
}

/**
 * Self-Polymorph into T-Rex when there are enemies in melee range
 * and the bard is low on spell slots or needs a big HP buffer.
 * T-Rex: 136 HP, 4d12+7 bite / 3d8+7 tail multiattack.
 * Costs concentration + 4th level slot.
 */
export function evalSelfPolymorph(ctx) {
  const { me, hpPct, activeEnemies, enemiesInMelee } = ctx
  if (me.concentrating) return null
  if (!me.spellSlots || !(me.spellSlots[4] > 0)) return null
  if (!(me.spellsKnown || []).includes('Polymorph')) return null
  if (activeEnemies.length === 0) return null

  // Self-polymorph into Giant Ape/T-Rex: huge HP buffer + good melee damage.
  // Trigger conditions (any of these):
  //   1. Facing a single tough enemy (HP > 50) — Giant Ape is better than cantrip damage
  //   2. HP below 60% at any time
  //   3. In melee with 2+ enemies
  //   4. Facing ≥4 enemies — Giant Ape absorbs attacks + kills mobs via multiattack
  //   5. Facing ≥3 enemies with combined HP > 200 — too tough for spell-based attrition
  const facingToughSoloEnemy = activeEnemies.length <= 2 && activeEnemies.some(e => e.currentHP > 50)
  const facingManyEnemies = activeEnemies.length >= 4
  const combinedEnemyHP = activeEnemies.reduce((sum, e) => sum + e.currentHP, 0)
  const facingToughGroup = activeEnemies.length >= 3 && combinedEnemyHP > 200
  const shouldPolymorph = facingToughSoloEnemy || facingManyEnemies || facingToughGroup || hpPct < 0.6 || enemiesInMelee.length >= 2
  if (!shouldPolymorph) return null

  return {
    action: { spell: 'Polymorph', level: 4, target: me, polymorphMode: 'self' },
    reasoning: 'Casting Polymorph on self — transforming into beast form for massive HP buffer and melee damage',
  }
}

/**
 * Beast form melee attack — when polymorphed, attack with beast weapons.
 * Includes movement toward target if not already in melee range.
 * Giant Ape: multiattack 2 × Fist (3d10+6 = 22.5 avg × 2 = 45 DPR).
 * T-Rex: multiattack 2 × Bite (4d12+7 = 33 avg) + Tail (3d8+7 = 20.5 avg) = 53.5 DPR.
 */
export function evalBeastFormMelee(ctx) {
  const { me, activeEnemies, enemiesInMelee } = ctx
  if (!me.polymorphedAs) return null
  if (activeEnemies.length === 0) return null

  // In melee: use multiattack or single attack
  // When facing many enemies, kill weakest first to reduce action economy pressure
  if (enemiesInMelee.length > 0) {
    const target = activeEnemies.length >= 3 ? selectWeakest(enemiesInMelee) : selectHighestThreat(enemiesInMelee)
    if (me.multiattack > 0) {
      return {
        action: { type: 'multiattack', target },
        reasoning: `${me.polymorphedAs} multiattack in melee`,
      }
    }
    return {
      action: { type: 'attack', weapon: me.weapon || me.weapons?.[0], target },
      reasoning: `${me.polymorphedAs} attacks in melee`,
    }
  }

  // Not in melee: move toward nearest enemy and attack
  // When facing many enemies, prioritize weakest to reduce action economy
  const target = activeEnemies.length >= 3 ? selectWeakest(activeEnemies) : selectHighestThreat(activeEnemies)
  const action = me.multiattack > 0
    ? { type: 'multiattack', target }
    : { type: 'attack', weapon: me.weapon || me.weapons?.[0], target }
  return {
    action,
    movement: { type: 'move_toward', target },
    reasoning: `${me.polymorphedAs} charges toward ${target.name}`,
  }
}

/**
 * Greater Invisibility used proactively (not just survival at <25% HP).
 * Used when no concentration is active and facing ranged enemies or multiple threats.
 * Advantage on attacks, enemies have disadvantage on attacks against bard.
 */
export function evalProactiveGreaterInvisibility(ctx) {
  const { me, hpPct, activeEnemies, isInvisible } = ctx
  if (isInvisible) return null
  if (me.concentrating) return null
  if (!me.spellSlots || !(me.spellSlots[4] > 0)) return null
  if (activeEnemies.length < 2) return null   // not worth the slot against 1 enemy

  // Use proactively when moderate HP (25%-60%) or facing ≥3 enemies
  if (hpPct >= 0.60 && activeEnemies.length < 3) return null
  if (hpPct >= 0.25 && hpPct < 0.60) {
    // Moderate HP — worth using for defense
  } else if (activeEnemies.length >= 3) {
    // Lots of enemies — advantage on attacks + disadvantage on theirs is huge
  } else {
    return null  // covered by evalSurvivalInvisibility at <25%
  }

  return {
    action: { spell: 'Greater Invisibility', level: 4 },
    reasoning: 'Casting Greater Invisibility proactively — advantage on attacks, disadvantage on enemy attacks',
    bonusAction: me.gemFlight && me.gemFlight.uses > 0 ? { type: 'gem_flight' } : null,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// REACTION EVALUATORS
// ─────────────────────────────────────────────────────────────────────────────

export function evalCuttingWords(creature, event) {
  if (event.type !== 'enemy_attack_roll') return null
  const { roll, targetAC } = event
  if (roll < targetAC) return null           // already misses
  if ((roll - 8) >= targetAC) return null    // d8 max can't save it
  if (!(creature.bardicInspirationUses > 0)) return null
  if (creature.reactedThisRound) return null
  return { type: 'cutting_words', dieUsed: 'd8' }
}

export const DANGEROUS_SPELLS = [
  'Hold Person', 'Inflict Wounds', 'Command',
  'Hypnotic Pattern', 'Fireball', 'Power Word Stun', 'Finger of Death',
]

export function evalCounterspell(creature, event) {
  if (event.type !== 'enemy_casting_spell') return null
  if (!DANGEROUS_SPELLS.includes(event.spell)) return null
  if (!creature.spellSlots || !(creature.spellSlots[3] > 0)) return null
  if (creature.reactedThisRound) return null
  return { type: 'counterspell', slotLevel: 3 }
}

/**
 * Silvery Barbs reaction evaluator.
 * Costs a 1st-level slot. Forces the attacker to reroll a successful hit.
 * Like Cutting Words but slot-based, no BI required, stronger (full reroll).
 * Lower priority than Cutting Words (uses up spell slots).
 */
export function evalSilveryBarbs(creature, event) {
  if (event.type !== 'enemy_attack_roll') return null
  const { roll, targetAC } = event
  if (roll < targetAC) return null                    // already misses
  if (!creature.spellSlots || !(creature.spellSlots[1] > 0)) return null
  if (creature.reactedThisRound) return null
  return { type: 'silvery_barbs', slotLevel: 1 }
}

// ─────────────────────────────────────────────────────────────────────────────
// MONSTER-SPECIFIC EVALUATORS
// ─────────────────────────────────────────────────────────────────────────────

export function evalDragonBreathWeapon(ctx) {
  const { me, round, activeEnemies } = ctx
  if (!me.breathWeapon || !(me.breathWeapon.uses > 0)) return null
  // Breath weapon: self-origin cone
  const targeting = me.breathWeapon.targeting || { shape: 'cone', length: me.breathWeapon.range || 30 }
  const plan = planAoEPlacement(me, activeEnemies, 0, targeting)
  if (!plan || plan.estimatedCount === 0) return null
  if (round !== 1 && plan.estimatedCount < 2) return null
  return {
    action: { type: 'breath_weapon', aoeCenter: plan.center },
    reasoning: 'Using breath weapon on clustered enemies',
  }
}

export function evalDragonMultiattack(ctx) {
  const { me, activeEnemies } = ctx
  if (activeEnemies.length === 0) return null
  const target = selectHighestThreat(activeEnemies)
  const dist   = mech.distanceBetween(me, target)
  const result = {
    action: { type: 'multiattack', target },
    reasoning: 'Dragon multiattack',
  }
  if (dist > 10) {
    result.movement = { type: 'move_toward', target }
  }
  return result
}

export function evalDragonFear(ctx) {
  const { me, activeEnemies } = ctx
  // Dragon Fear shares the PB pool with Breath Weapon
  if (!me.dragonFear) return null
  if (!me.breathWeapon || !(me.breathWeapon.uses > 0)) return null
  // Dragon Fear: self-origin cone (30ft default)
  const targeting = me.dragonFear.targeting || { shape: 'cone', length: me.dragonFear.range || 30 }
  const plan = planAoEPlacement(me, activeEnemies, 0, targeting)
  if (!plan || plan.estimatedCount < 2) return null
  return {
    action: { type: 'dragon_fear', aoeCenter: plan.center },
    reasoning: 'Using Dragon Fear to frighten clustered enemies',
  }
}

export function evalGiantRockThrow(ctx) {
  const { me, activeEnemies } = ctx
  const flyingTargets = activeEnemies.filter(e => e.flying)
  if (flyingTargets.length === 0) return null
  const target      = flyingTargets[0]
  const rangedWeapon = me.weapons && me.weapons.find(w => w.type === 'ranged')
  if (!rangedWeapon) return null
  return {
    action: { type: 'attack', weapon: rangedWeapon, target },
    reasoning: 'Throwing rock at flying target',
  }
}

export function evalGiantMelee(ctx) {
  const { me, activeEnemies } = ctx
  if (activeEnemies.length === 0) return null
  const target = selectWeakest(activeEnemies)
  const dist   = mech.distanceBetween(me, target)
  const REACH  = 10

  const result = me.multiattack > 0
    ? { action: { type: 'multiattack', target }, reasoning: 'Giant multiattack' }
    : { action: { type: 'attack', weapon: me.weapon, target }, reasoning: 'Giant attack' }

  if (dist > REACH) {
    result.movement = { type: 'move_toward', target }
  }
  return result
}

export function evalMageFireball(ctx) {
  const { me, activeEnemies } = ctx
  if (!me.spellSlots || !(me.spellSlots[3] > 0)) return null
  if (activeEnemies.length === 0) return null
  // Fireball: 150ft range, 20ft sphere
  const targeting = { shape: 'sphere', radius: 20 }
  const plan = planAoEPlacement(me, activeEnemies, 150, targeting)
  if (!plan || plan.estimatedCount === 0) return null
  return {
    action: { spell: 'Fireball', level: 3, aoeCenter: plan.center },
    reasoning: 'Casting Fireball for AoE damage',
  }
}

export function evalMageFireBolt(ctx) {
  const { me, activeEnemies } = ctx
  if (activeEnemies.length === 0) return null
  return {
    action: { spell: 'Fire Bolt', target: selectHighestThreat(activeEnemies) },
    reasoning: 'Casting Fire Bolt cantrip',
  }
}

export function evalMageMistyStep(ctx) {
  const { me, enemiesInMelee } = ctx
  if (enemiesInMelee.length === 0) return null
  if (!me.spellSlots || !(me.spellSlots[2] > 0)) return null
  return {
    action: null,
    bonusAction: { spell: 'Misty Step', level: 2 },
    _bonusActionOnly: true,
    reasoning: 'Enemy in melee — using Misty Step bonus action to escape',
  }
}

export function evalArchmageConeOfCold(ctx) {
  const { me, round, activeEnemies } = ctx
  if (round > 2) return null
  if (!me.spellSlots || !(me.spellSlots[5] > 0)) return null
  if (activeEnemies.length === 0) return null
  // Cone of Cold: self-origin, 60ft cone
  const targeting = { shape: 'cone', length: 60 }
  const plan = planAoEPlacement(me, activeEnemies, 0, targeting)
  if (!plan || plan.estimatedCount === 0) return null
  return {
    action: { spell: 'Cone of Cold', level: 5, aoeCenter: plan.center },
    reasoning: 'Opening with Cone of Cold for massive damage',
  }
}

export function evalLichPowerWordStun(ctx) {
  const { me, activeEnemies } = ctx
  if (!me.spellSlots || !(me.spellSlots[8] > 0)) return null
  const target = activeEnemies.find(e => e.currentHP <= 150)
  if (!target) return null
  return {
    action: { spell: 'Power Word Stun', level: 8, target },
    reasoning: 'Using Power Word Stun on weakened target',
  }
}

export function evalLichFingerOfDeath(ctx) {
  const { me, activeEnemies } = ctx
  if (!me.spellSlots || !(me.spellSlots[7] > 0)) return null
  if (activeEnemies.length === 0) return null
  return {
    action: { spell: 'Finger of Death', level: 7, target: selectHighestThreat(activeEnemies) },
    reasoning: 'Casting Finger of Death for devastating damage',
  }
}

export function evalLichCloudkill(ctx) {
  const { me, activeEnemies } = ctx
  if (me.concentrating) return null
  if (!me.spellSlots || !(me.spellSlots[5] > 0)) return null
  if (activeEnemies.length < 2) return null
  // Cloudkill: 120ft range, 20ft sphere
  const targeting = { shape: 'sphere', radius: 20 }
  const plan = planAoEPlacement(me, activeEnemies, 120, targeting)
  if (!plan || plan.estimatedCount < 2) return null
  return {
    action: { spell: 'Cloudkill', level: 5, aoeCenter: plan.center },
    reasoning: 'Casting Cloudkill on multiple enemies',
  }
}

export function evalLegendaryResistance(creature, event) {
  if (event.type !== 'failed_save') return null
  if (!creature.legendaryResistance || !(creature.legendaryResistance.uses > 0)) return null
  creature.legendaryResistance.uses--
  return { type: 'legendary_resistance' }
}

// ─────────────────────────────────────────────────────────────────────────────
// PROFILE REGISTRY
// ─────────────────────────────────────────────────────────────────────────────

export const PROFILES = {
  lore_bard: [
    evalBeastFormMelee,                  // Beast form: attack with multiattack (highest priority in beast form)
    evalSurvivalInvisibility,            // <25% HP: emergency Greater Invisibility
    evalOpeningAoEDisable,               // Round 1: Hypnotic Pattern
    evalOpeningSleep,                    // Round 1-2: Sleep upcast (non-concentration)
    evalDragonFear,                      // PB-gated Dragon Fear (shared pool)
    evalConcentrationAllDisabled,
    evalConcentrationMeleeViciousMockery,
    evalConcentrationFinishWithCrossbow,
    evalConcentrationBreathWeapon,
    evalConcentrationShatter,              // AoE damage while concentrating (non-concentration spell)
    evalConcentrationDissonantWhispers,    // single-target damage while concentrating
    evalConcentrationRangedViciousMockery, // fallback when out of spell slots
    evalConcentrationSelfHeal,
    evalProactiveHealingWord,              // Bonus HW at <70% HP regardless of concentration
    evalSelfPolymorph,                   // Self-polymorph into beast form (now triggers for 4+ enemies, tough groups)
    evalEnemyPolymorph,                  // Polymorph tough enemy into sheep when multiple foes (concentration)
    evalProactiveGreaterInvisibility,    // Greater Invisibility proactively (25-60% HP or ≥3 foes)
    evalRecastHypnoticPattern,
    evalCastHoldPerson,
    evalOffensiveFaerieFire,             // Faerie Fire when no concentration (1st-level slot)
    evalOffensiveShatter,                  // AoE damage when not concentrating
    evalOffensiveDissonantWhispers,        // single-target damage when not concentrating
    evalFallbackCrossbow,                  // crossbow when not concentrating (better than VM)
    evalFallbackCantrip,
    evalDodge,
  ],
  cult_fanatic: [
    evalEnemyInvisibleFallback,
    evalFlyingTargetRanged,
    evalOpeningSpiritualWeapon,
    evalShakeAwakeAllies,
    evalMeleeAttack,
    evalInflictWounds,
    evalRangedCantripWithApproach,
    evalAttackHelpless,
    evalDodge,
  ],
  generic_melee:    [evalMeleeAttack, evalAttackHelpless, evalRangedCantripWithApproach, evalDodge],
  generic_ranged:   [evalRangedCantripWithApproach, evalAttackHelpless, evalMeleeAttack, evalDodge],
  dragon:           [evalDragonBreathWeapon, evalDragonMultiattack, evalAttackHelpless, evalDodge],
  giant_bruiser:    [evalGiantRockThrow, evalGiantMelee, evalAttackHelpless, evalDodge],
  mage_caster:      [evalMageMistyStep, evalMageFireball, evalMageFireBolt, evalAttackHelpless, evalDodge],
  archmage_caster:  [evalMageMistyStep, evalArchmageConeOfCold, evalMageFireball, evalMageFireBolt, evalAttackHelpless, evalDodge],
  lich_caster:      [evalLichPowerWordStun, evalLichFingerOfDeath, evalLichCloudkill, evalMageFireball, evalMageFireBolt, evalAttackHelpless, evalDodge],
  undead_melee:     [evalMeleeAttack, evalAttackHelpless, evalRangedCantripWithApproach, evalDodge],
}

/**
 * Opportunity Attack reaction: fire when an enemy voluntarily leaves melee reach.
 * Any creature with a weapon will take the attack if it has not yet reacted.
 */
export function evalOpportunityAttack(creature, event) {
  if (event.type !== 'enemy_leaving_melee') return null
  if (!creature.weapons?.length) return null
  return { type: 'opportunity_attack' }
}

export const REACTION_PROFILES = {
  lore_bard:       [evalCuttingWords, evalCounterspell, evalSilveryBarbs],
  cult_fanatic:    [evalOpportunityAttack],
  generic_melee:   [evalOpportunityAttack],
  generic_ranged:  [],
  dragon:          [evalOpportunityAttack],
  giant_bruiser:   [evalOpportunityAttack],
  mage_caster:     [],
  archmage_caster: [],
  lich_caster:     [evalLegendaryResistance],
  undead_melee:    [evalOpportunityAttack],
}

export function getProfile(key) {
  return PROFILES[key] || null
}

export function getProfileNames() {
  return Object.keys(PROFILES)
}

export function registerProfile(key, evaluators) {
  PROFILES[key] = evaluators
  REACTION_PROFILES[key] = REACTION_PROFILES[key] || []
}

// ─────────────────────────────────────────────────────────────────────────────
// DECISION ENGINE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run all evaluators in a profile, return the first main decision,
 * merging any _bonusActionOnly result as a bonus action.
 */
export function makeDecision(profileKey, creature, allCombatants, round) {
  const profile = PROFILES[profileKey]
  if (!profile) throw new Error(`Unknown AI profile: ${profileKey}`)

  const ctx = assessBattlefield(creature, allCombatants, round)

  let mainDecision    = null
  let bonusOnlyResult = null

  for (const evaluator of profile) {
    const result = evaluator(ctx)
    if (!result) continue

    if (result._bonusActionOnly) {
      if (!bonusOnlyResult) bonusOnlyResult = result
      // Continue — don't treat this as the main decision
      continue
    }

    if (!mainDecision) {
      mainDecision = result
      // Keep running to find any _bonusActionOnly results
    }
  }

  if (mainDecision && bonusOnlyResult && !mainDecision.bonusAction) {
    mainDecision.bonusAction = bonusOnlyResult.bonusAction
  }

  return mainDecision
}

/**
 * Run reaction evaluators for a profile.
 */
export function makeReaction(profileKey, creature, event) {
  const profile = REACTION_PROFILES[profileKey]
  if (!profile) return null

  for (const evaluator of profile) {
    const result = evaluator(creature, event)
    if (result) return result
  }
  return null
}

// ─────────────────────────────────────────────────────────────────────────────
// AI FACTORY FUNCTIONS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a getDecision function for an encounter runner.
 * @param {object|Function} profileMap - { [creatureId]: profileKey } or (creature) => profileKey
 */
export function makeTacticalAI(profileMap) {
  const resolve = typeof profileMap === 'function'
    ? profileMap
    : (creature) => profileMap[creature.id] || 'generic_melee'

  return function getDecision(creature, allCombatants, round, _log) {
    const profileKey = resolve(creature) || 'generic_melee'
    try {
      return makeDecision(profileKey, creature, allCombatants, round)
    } catch (err) {
      console.error(`[Tactics] Error in profile '${profileKey}' for ${creature.name}:`, err)
      return makeDecision('generic_melee', creature, allCombatants, round)
    }
  }
}

/**
 * Create a getReaction function for an encounter runner.
 */
export function makeReactionAI(profileMap) {
  const resolve = typeof profileMap === 'function'
    ? profileMap
    : (creature) => profileMap[creature.id] || 'generic_melee'

  return function getReaction(creature, event) {
    const profileKey = resolve(creature) || 'generic_melee'
    return makeReaction(profileKey, creature, event)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// LEGACY API (backward compatibility)
// ─────────────────────────────────────────────────────────────────────────────

/** Axial (hex grid) distance between two positions. Legacy support. */
export function hexDistance(a, b) {
  return Math.max(
    Math.abs((a.q ?? 0) - (b.q ?? 0)),
    Math.abs((a.r ?? 0) - (b.r ?? 0)),
    Math.abs((-(a.q ?? 0) - (a.r ?? 0)) - (-(b.q ?? 0) - (b.r ?? 0))),
  )
}

export const CREATURE_PROFILES = {}
export const TACTIC_PROFILES   = {}

export function setCreatureProfile(creatureId, profile) {
  CREATURE_PROFILES[creatureId] = profile
}

export function chooseTactic(creature, combatants, _options) {
  const profileKey = CREATURE_PROFILES[creature.id]
    || (creature.side === 'party' ? 'lore_bard' : 'cult_fanatic')
  try {
    return makeDecision(profileKey, creature, combatants, 1)
  } catch (_) {
    return { action: { type: 'dodge' }, reasoning: 'fallback' }
  }
}
