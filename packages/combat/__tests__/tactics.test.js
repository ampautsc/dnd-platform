/**
 * Tactics AI test suite — ported to vitest ESM.
 */
import { describe, it, expect } from 'vitest'
import { createCreature } from '@dnd-platform/content/creatures'
import * as tactics from '../src/ai/tactics.js'
import * as dice from '../src/engine/dice.js'
import * as runner from '../src/engine/encounterRunner.js'

let testId = 0

// ═══════════════════════════════════════════════════════════════════════════
// TEST HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function makeBard(overrides = {}) {
  return createCreature('gem_dragonborn_lore_bard_8', {
    id: `bard-${++testId}`,
    position: { x: 0, y: 0 },
    ...overrides,
  })
}

function makeFanatic(overrides = {}) {
  return createCreature('cult_fanatic', {
    id: `fanatic-${++testId}`,
    position: { x: 2, y: 0 },
    ...overrides,
  })
}

function makeContext(me, others = [], round = 3) {
  return tactics.assessBattlefield(me, [me, ...others], round)
}

// ═══════════════════════════════════════════════════════════════════════════
// BATTLEFIELD ASSESSMENT
// ═══════════════════════════════════════════════════════════════════════════

describe('assessBattlefield', () => {
  it('identifies active enemies and allies', () => {
    const bard = makeBard()
    const f1 = makeFanatic()
    const ctx = makeContext(bard, [f1])
    expect(ctx.activeEnemies.length).toBe(1)
    expect(ctx.allies.length).toBe(0)
  })

  it('identifies charmed allies', () => {
    const f1 = makeFanatic({ position: { x: 0, y: 0 } })
    const f2 = makeFanatic({ name: 'Charmed', position: { x: 1, y: 0 } })
    f2.conditions.push('charmed_hp')
    const bard = makeBard()
    const ctx = makeContext(f1, [bard, f2])
    expect(ctx.charmedAllies.length).toBe(1)
  })

  it('identifies enemies in melee', () => {
    const bard = makeBard()
    const f1 = makeFanatic({ position: { x: 1, y: 0 } }) // 5ft
    const f2 = makeFanatic({ position: { x: 10, y: 0 } }) // 50ft
    const ctx = makeContext(bard, [f1, f2])
    expect(ctx.enemiesInMelee.length).toBe(1)
  })

  it('computes HP percentage', () => {
    const bard = makeBard()
    bard.currentHP = Math.floor(bard.maxHP / 2)
    const ctx = makeContext(bard)
    expect(ctx.hpPct).toBeCloseTo(0.5, 1)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// TARGETING HELPERS
// ═══════════════════════════════════════════════════════════════════════════

describe('selectHighestThreat', () => {
  it('prefers casters over non-casters', () => {
    const f1 = makeFanatic() // has spells
    const simple = { id: 'simple', currentHP: 20, maxHP: 20, conditions: [], side: 'enemy' }
    const result = tactics.selectHighestThreat([simple, f1])
    expect(result.id).toBe(f1.id)
  })

  it('returns null for empty array', () => {
    expect(tactics.selectHighestThreat([])).toBe(null)
  })
})

describe('selectWeakest', () => {
  it('picks the lowest HP', () => {
    const f1 = makeFanatic()
    f1.currentHP = 5
    const f2 = makeFanatic()
    f2.currentHP = 20
    expect(tactics.selectWeakest([f1, f2]).id).toBe(f1.id)
  })
})

describe('selectClosestCharmedAlly', () => {
  it('picks the nearest charmed ally', () => {
    const me = makeFanatic({ position: { x: 0, y: 0 } })
    const near = makeFanatic({ name: 'Near', position: { x: 1, y: 0 } })
    near.conditions.push('charmed_hp')
    const far = makeFanatic({ name: 'Far', position: { x: 10, y: 0 } })
    far.conditions.push('charmed_hp')
    expect(tactics.selectClosestCharmedAlly(me, [far, near]).name).toBe('Near')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// EVALUATORS — BARD
// ═══════════════════════════════════════════════════════════════════════════

describe('evalSurvivalInvisibility', () => {
  it('triggers when HP < 25% and not invisible', () => {
    const bard = makeBard()
    bard.currentHP = 10
    const ctx = makeContext(bard, [makeFanatic()])
    const result = tactics.evalSurvivalInvisibility(ctx)
    expect(result).toBeTruthy()
    expect(result.action.spell).toBe('Greater Invisibility')
  })

  it('does NOT trigger at 50% HP', () => {
    const bard = makeBard()
    bard.currentHP = Math.floor(bard.maxHP / 2)
    const ctx = makeContext(bard, [makeFanatic()])
    expect(tactics.evalSurvivalInvisibility(ctx)).toBe(null)
  })

  it('does NOT trigger if already invisible', () => {
    const bard = makeBard()
    bard.currentHP = 5
    bard.conditions.push('invisible')
    const ctx = makeContext(bard, [makeFanatic()])
    expect(tactics.evalSurvivalInvisibility(ctx)).toBe(null)
  })

  it('includes Gem Flight as bonus action when available', () => {
    const bard = makeBard()
    bard.currentHP = 10
    const ctx = makeContext(bard, [makeFanatic()])
    const result = tactics.evalSurvivalInvisibility(ctx)
    expect(result.bonusAction).toBeTruthy()
    expect(result.bonusAction.type).toBe('gem_flight')
  })
})

describe('evalOpeningAoEDisable', () => {
  it('triggers round 1, no concentration, 3rd level slot, HP known', () => {
    const bard = makeBard()
    const ctx = makeContext(bard, [makeFanatic(), makeFanatic()], 1)
    const result = tactics.evalOpeningAoEDisable(ctx)
    expect(result).toBeTruthy()
    expect(result.action.spell).toBe('Hypnotic Pattern')
    expect(result.reasoning).toContain('ROUND 1')
  })

  it('does NOT trigger after round 1', () => {
    const bard = makeBard()
    const ctx = makeContext(bard, [makeFanatic()], 2)
    expect(tactics.evalOpeningAoEDisable(ctx)).toBe(null)
  })

  it('does NOT trigger if already concentrating', () => {
    const bard = makeBard()
    bard.concentrating = 'Hypnotic Pattern'
    const ctx = makeContext(bard, [makeFanatic()], 1)
    expect(tactics.evalOpeningAoEDisable(ctx)).toBe(null)
  })

  it('does NOT trigger without 3rd level slot', () => {
    const bard = makeBard()
    bard.spellSlots[3] = 0
    const ctx = makeContext(bard, [makeFanatic()], 1)
    expect(tactics.evalOpeningAoEDisable(ctx)).toBe(null)
  })

  it('includes Gem Flight bonus action when available', () => {
    const bard = makeBard()
    const ctx = makeContext(bard, [makeFanatic()], 1)
    const result = tactics.evalOpeningAoEDisable(ctx)
    expect(result.bonusAction).toBeTruthy()
    expect(result.bonusAction.type).toBe('gem_flight')
  })

  it('returns aoeCenter instead of targets (engine resolves targets)', () => {
    const bard = makeBard()
    const f1 = makeFanatic({ position: { x: 10, y: 0 } })
    const ctx = makeContext(bard, [f1], 1)
    const result = tactics.evalOpeningAoEDisable(ctx)
    expect(result).toBeTruthy()
    expect(result.action.aoeCenter).toBeTruthy()
    expect(typeof result.action.aoeCenter.x).toBe('number')
    expect(typeof result.action.aoeCenter.y).toBe('number')
    expect(result.action.targets).toBe(undefined)
  })
})

describe('evalConcentrationAllDisabled', () => {
  it('prefers Dissonant Whispers over VM for higher damage', () => {
    const bard = makeBard()
    bard.concentrating = 'Hypnotic Pattern'
    const f1 = makeFanatic()
    f1.conditions.push('incapacitated', 'charmed_hp')
    f1.currentHP = 30
    const f2 = makeFanatic()
    f2.conditions.push('incapacitated', 'charmed_hp')
    f2.currentHP = 10 // weakest
    const ctx = makeContext(bard, [f1, f2])

    const result = tactics.evalConcentrationAllDisabled(ctx)
    expect(result).toBeTruthy()
    expect(result.action.spell).toBe('Dissonant Whispers')
    expect(result.action.target.id).toBe(f2.id) // targets the weakest
    expect(result.reasoning).toContain('DW')
  })

  it('falls back to VM when all spell slots are exhausted', () => {
    const bard = makeBard()
    bard.concentrating = 'Hypnotic Pattern'
    bard.spellSlots = { 1: 0, 2: 0, 3: 0, 4: 0 }
    const f1 = makeFanatic()
    f1.conditions.push('incapacitated', 'charmed_hp')
    f1.currentHP = 10
    const ctx = makeContext(bard, [f1])

    const result = tactics.evalConcentrationAllDisabled(ctx)
    expect(result).toBeTruthy()
    expect(result.action.spell).toBe('Vicious Mockery')
    expect(result.reasoning).toContain('VM')
  })

  it('does NOT trigger when active enemies remain', () => {
    const bard = makeBard()
    bard.concentrating = 'Hypnotic Pattern'
    const ctx = makeContext(bard, [makeFanatic()])
    expect(tactics.evalConcentrationAllDisabled(ctx)).toBe(null)
  })

  it('does NOT trigger when not concentrating', () => {
    const bard = makeBard()
    const f1 = makeFanatic()
    f1.conditions.push('incapacitated', 'charmed_hp')
    const ctx = makeContext(bard, [f1])
    expect(tactics.evalConcentrationAllDisabled(ctx)).toBe(null)
  })

  it('returns null when no helpless enemies (all dead)', () => {
    const bard = makeBard()
    bard.concentrating = 'Hypnotic Pattern'
    // No enemies at all
    const ctx = makeContext(bard, [])
    expect(tactics.evalConcentrationAllDisabled(ctx)).toBe(null)
  })
})

describe('evalConcentrationMeleeViciousMockery', () => {
  it('triggers when concentrating with enemy in melee', () => {
    const bard = makeBard()
    bard.concentrating = 'Hypnotic Pattern'
    const f1 = makeFanatic({ position: { x: 1, y: 0 } }) // 5ft
    const ctx = makeContext(bard, [f1])

    const result = tactics.evalConcentrationMeleeViciousMockery(ctx)
    expect(result).toBeTruthy()
    expect(result.action.spell).toBe('Vicious Mockery')
    expect(result.reasoning).toContain('melee')
  })

  it('does NOT trigger without concentration', () => {
    const bard = makeBard()
    const f1 = makeFanatic({ position: { x: 1, y: 0 } })
    const ctx = makeContext(bard, [f1])
    expect(tactics.evalConcentrationMeleeViciousMockery(ctx)).toBe(null)
  })
})

describe('evalConcentrationFinishWithCrossbow', () => {
  it('triggers when concentrating, 1 enemy with <= 10 HP', () => {
    const bard = makeBard()
    bard.concentrating = 'Hypnotic Pattern'
    const f1 = makeFanatic()
    f1.currentHP = 8
    const ctx = makeContext(bard, [f1])

    const result = tactics.evalConcentrationFinishWithCrossbow(ctx)
    expect(result).toBeTruthy()
    expect(result.action.type).toBe('attack')
    expect(result.action.weapon.name).toContain('Crossbow')
  })

  it('does NOT trigger with 2+ active enemies', () => {
    const bard = makeBard()
    bard.concentrating = 'Something'
    const f1 = makeFanatic()
    f1.currentHP = 5
    const f2 = makeFanatic()
    const ctx = makeContext(bard, [f1, f2])
    expect(tactics.evalConcentrationFinishWithCrossbow(ctx)).toBe(null)
  })

  it('does NOT trigger if target HP > 10', () => {
    const bard = makeBard()
    bard.concentrating = 'Something'
    const f1 = makeFanatic()
    f1.currentHP = 20
    const ctx = makeContext(bard, [f1])
    expect(tactics.evalConcentrationFinishWithCrossbow(ctx)).toBe(null)
  })
})

describe('evalConcentrationBreathWeapon', () => {
  it('triggers with 2+ enemies in breath range while concentrating', () => {
    const bard = makeBard()
    bard.concentrating = 'HP'
    const f1 = makeFanatic({ position: { x: 2, y: 0 } }) // 10ft
    const f2 = makeFanatic({ position: { x: 3, y: 0 } }) // 15ft
    const ctx = makeContext(bard, [f1, f2])

    const result = tactics.evalConcentrationBreathWeapon(ctx)
    expect(result).toBeTruthy()
    expect(result.action.type).toBe('breath_weapon')
    expect(result.action.aoeCenter).toBeTruthy()
  })

  it('does NOT trigger with 0 breath uses', () => {
    const bard = makeBard()
    bard.concentrating = 'HP'
    bard.breathWeapon.uses = 0
    const f1 = makeFanatic({ position: { x: 2, y: 0 } })
    const f2 = makeFanatic({ position: { x: 3, y: 0 } })
    const ctx = makeContext(bard, [f1, f2])
    expect(tactics.evalConcentrationBreathWeapon(ctx)).toBe(null)
  })
})

describe('evalConcentrationRangedViciousMockery', () => {
  it('triggers when concentrating with active enemies at range', () => {
    const bard = makeBard()
    bard.concentrating = 'HP'
    const f1 = makeFanatic({ position: { x: 8, y: 0 } }) // 40ft
    const ctx = makeContext(bard, [f1])

    const result = tactics.evalConcentrationRangedViciousMockery(ctx)
    expect(result).toBeTruthy()
    expect(result.action.spell).toBe('Vicious Mockery')
  })
})

describe('evalConcentrationSelfHeal', () => {
  it('returns bonus-action-only when concentrating and HP < 50%', () => {
    const bard = makeBard()
    bard.concentrating = 'HP'
    bard.currentHP = 30 // ~45%
    const ctx = makeContext(bard)

    const result = tactics.evalConcentrationSelfHeal(ctx)
    expect(result).toBeTruthy()
    expect(result._bonusActionOnly).toBeTruthy()
    expect(result.bonusAction.type).toBe('cast_healing_word')
  })

  it('does NOT trigger when HP >= 50%', () => {
    const bard = makeBard()
    bard.concentrating = 'HP'
    bard.currentHP = 50
    const ctx = makeContext(bard)
    expect(tactics.evalConcentrationSelfHeal(ctx)).toBe(null)
  })

  it('does NOT trigger without concentration', () => {
    const bard = makeBard()
    bard.currentHP = 10
    const ctx = makeContext(bard)
    expect(tactics.evalConcentrationSelfHeal(ctx)).toBe(null)
  })
})

describe('evalRecastHypnoticPattern', () => {
  it('triggers when not concentrating and 2+ active enemies with 3rd slot', () => {
    const bard = makeBard()
    const ctx = makeContext(bard, [makeFanatic(), makeFanatic()])
    const result = tactics.evalRecastHypnoticPattern(ctx)
    expect(result).toBeTruthy()
    expect(result.action.spell).toBe('Hypnotic Pattern')
  })

  it('does NOT trigger with concentration active', () => {
    const bard = makeBard()
    bard.concentrating = 'Hypnotic Pattern'
    const ctx = makeContext(bard, [makeFanatic(), makeFanatic()])
    expect(tactics.evalRecastHypnoticPattern(ctx)).toBe(null)
  })

  it('does NOT trigger with only 1 active enemy', () => {
    const bard = makeBard()
    const ctx = makeContext(bard, [makeFanatic()])
    expect(tactics.evalRecastHypnoticPattern(ctx)).toBe(null)
  })
})

describe('evalCastHoldPerson', () => {
  it('triggers when not concentrating with 2nd level slot and active enemies', () => {
    const bard = makeBard()
    const f1 = makeFanatic()
    const ctx = makeContext(bard, [f1])
    const result = tactics.evalCastHoldPerson(ctx)
    expect(result).toBeTruthy()
    expect(result.action.spell).toBe('Hold Person')
  })

  it('does NOT trigger with concentration active', () => {
    const bard = makeBard()
    bard.concentrating = 'Hex'
    const ctx = makeContext(bard, [makeFanatic()])
    expect(tactics.evalCastHoldPerson(ctx)).toBe(null)
  })

  it('does NOT trigger against non-humanoid enemies', () => {
    const bard = makeBard()
    const zombie = createCreature('zombie', {
      id: `zombie-${++testId}`,
      position: { x: 2, y: 0 },
    })
    const ctx = makeContext(bard, [zombie])
    expect(tactics.evalCastHoldPerson(ctx)).toBe(null)
  })

  it('selects humanoid target when mixed with non-humanoids', () => {
    const bard = makeBard()
    const zombie = createCreature('zombie', {
      id: `zombie-${++testId}`,
      position: { x: 2, y: 0 },
    })
    const fanatic = makeFanatic()
    const ctx = makeContext(bard, [zombie, fanatic])
    const result = tactics.evalCastHoldPerson(ctx)
    expect(result).toBeTruthy()
    expect(result.action.spell).toBe('Hold Person')
    expect(result.action.target.id).toBe(fanatic.id)
  })
})

describe('evalFallbackCantrip', () => {
  it('picks Vicious Mockery when known', () => {
    const bard = makeBard()
    const f1 = makeFanatic()
    const ctx = makeContext(bard, [f1])
    const result = tactics.evalFallbackCantrip(ctx)
    expect(result).toBeTruthy()
    expect(result.action.spell).toBe('Vicious Mockery')
  })

  it('picks Sacred Flame when VM not known', () => {
    const bard = makeBard()
    bard.spellsKnown = bard.spellsKnown.filter(s => s !== 'Vicious Mockery')
    bard.cantrips = ['Sacred Flame']
    bard.spellsKnown.push('Sacred Flame')
    const f1 = makeFanatic()
    const ctx = makeContext(bard, [f1])
    const result = tactics.evalFallbackCantrip(ctx)
    expect(result).toBeTruthy()
    expect(result.action.spell).toBe('Sacred Flame')
  })

  it('returns null with no active enemies', () => {
    const bard = makeBard()
    const ctx = makeContext(bard)
    expect(tactics.evalFallbackCantrip(ctx)).toBe(null)
  })
})

describe('evalDodge', () => {
  it('always returns dodge', () => {
    const result = tactics.evalDodge({})
    expect(result).toBeTruthy()
    expect(result.action.type).toBe('dodge')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// EVALUATORS — CULT FANATIC / ENEMY
// ═══════════════════════════════════════════════════════════════════════════

describe('evalEnemyInvisibleFallback', () => {
  it('triggers when all enemies are invisible', () => {
    const f1 = makeFanatic({ position: { x: 0, y: 0 } })
    const bard = makeBard()
    bard.conditions.push('invisible')
    const ctx = makeContext(f1, [bard])

    const result = tactics.evalEnemyInvisibleFallback(ctx)
    expect(result).toBeTruthy()
    expect(result.reasoning).toContain('invisible')
  })

  it('does NOT trigger when enemy is visible', () => {
    const f1 = makeFanatic()
    const bard = makeBard()
    const ctx = makeContext(f1, [bard])
    expect(tactics.evalEnemyInvisibleFallback(ctx)).toBe(null)
  })

  it('casts Shield of Faith on self when has slot and not concentrating', () => {
    const f1 = makeFanatic({ position: { x: 0, y: 0 } })
    const bard = makeBard()
    bard.conditions.push('invisible')
    const ctx = makeContext(f1, [bard])

    const result = tactics.evalEnemyInvisibleFallback(ctx)
    expect(result).toBeTruthy()
    expect(result.action.spell).toBe('Shield of Faith')
  })

  it('shakes awake charmed ally when no slots', () => {
    const f1 = makeFanatic({ position: { x: 0, y: 0 } })
    f1.spellSlots = { 1: 0, 2: 0 }
    const f2 = makeFanatic({ name: 'CharmedAlly', position: { x: 1, y: 0 } })
    f2.conditions.push('charmed_hp')
    // Invisible enemy
    const bard = makeBard()
    bard.conditions.push('invisible')
    const ctx = makeContext(f1, [bard, f2])

    const result = tactics.evalEnemyInvisibleFallback(ctx)
    expect(result).toBeTruthy()
    expect(result.action.type).toBe('shake_awake')
  })
})

describe('evalFlyingTargetRanged', () => {
  it('uses Hold Person against flying target', () => {
    const f1 = makeFanatic({ position: { x: 0, y: 0 } })
    const bard = makeBard()
    bard.flying = true
    const ctx = makeContext(f1, [bard], 1)

    const result = tactics.evalFlyingTargetRanged(ctx)
    expect(result).toBeTruthy()
    expect(result.action.spell).toBe('Hold Person')
    expect(result.reasoning).toContain('flying')
  })

  it('falls back to Sacred Flame vs flying when no Hold Person slot', () => {
    const f1 = makeFanatic({ position: { x: 0, y: 0 } })
    f1.spellSlots[2] = 0
    const bard = makeBard()
    bard.flying = true
    const ctx = makeContext(f1, [bard], 1)

    const result = tactics.evalFlyingTargetRanged(ctx)
    expect(result).toBeTruthy()
    expect(result.action.spell).toBe('Sacred Flame')
  })

  it('does NOT trigger against grounded targets', () => {
    const f1 = makeFanatic({ position: { x: 0, y: 0 } })
    const bard = makeBard()
    const ctx = makeContext(f1, [bard])
    expect(tactics.evalFlyingTargetRanged(ctx)).toBe(null)
  })

  it('does NOT trigger when ally already has Hold Person on target', () => {
    const f1 = makeFanatic({ position: { x: 0, y: 0 } })
    const f2 = makeFanatic({ name: 'AllyHolder', position: { x: 1, y: 0 } })
    f2.concentrating = 'Hold Person'
    const bard = makeBard()
    bard.flying = true
    const ctx = makeContext(f1, [bard, f2], 1)

    const result = tactics.evalFlyingTargetRanged(ctx)
    expect(result).toBeTruthy()
    // Should fall back to Sacred Flame, not Hold Person
    expect(result.action.spell).toBe('Sacred Flame')
  })
})

describe('evalOpeningSpiritualWeapon', () => {
  it('triggers on round 1 with SW slot and target in melee', () => {
    const f1 = makeFanatic({ position: { x: 0, y: 0 } })
    const bard = makeBard({ position: { x: 1, y: 0 } })
    const ctx = makeContext(f1, [bard], 1)

    const result = tactics.evalOpeningSpiritualWeapon(ctx)
    expect(result).toBeTruthy()
    expect(result.bonusAction.spell).toBe('Spiritual Weapon')
    expect(result.action.type).toBe('multiattack')
  })

  it('does NOT trigger after round 1', () => {
    const f1 = makeFanatic()
    const bard = makeBard({ position: { x: 1, y: 0 } })
    const ctx = makeContext(f1, [bard], 2)
    expect(tactics.evalOpeningSpiritualWeapon(ctx)).toBe(null)
  })

  it('does NOT trigger if SW already active', () => {
    const f1 = makeFanatic()
    f1.spiritualWeapon = { active: true }
    const bard = makeBard({ position: { x: 1, y: 0 } })
    const ctx = makeContext(f1, [bard], 1)
    expect(tactics.evalOpeningSpiritualWeapon(ctx)).toBe(null)
  })
})

describe('evalShakeAwakeAllies', () => {
  it('shakes nearby charmed ally', () => {
    const f1 = makeFanatic({ position: { x: 0, y: 0 } })
    const f2 = makeFanatic({ name: 'Charmed', position: { x: 1, y: 0 } })
    f2.conditions.push('charmed_hp')
    const bard = makeBard({ position: { x: 5, y: 0 } })
    const ctx = makeContext(f1, [bard, f2])

    const result = tactics.evalShakeAwakeAllies(ctx)
    expect(result).toBeTruthy()
    expect(result.action.type).toBe('shake_awake')
    expect(result.action.target.name).toBe('Charmed')
  })

  it('does NOT trigger when no charmed allies', () => {
    const f1 = makeFanatic()
    const bard = makeBard()
    const ctx = makeContext(f1, [bard])
    expect(tactics.evalShakeAwakeAllies(ctx)).toBe(null)
  })
})

describe('evalMeleeAttack', () => {
  it('uses multiattack when in melee with multiattack feature', () => {
    const f1 = makeFanatic({ position: { x: 0, y: 0 } })
    const bard = makeBard({ position: { x: 1, y: 0 } })
    const ctx = makeContext(f1, [bard])

    const result = tactics.evalMeleeAttack(ctx)
    expect(result).toBeTruthy()
    expect(result.action.type).toBe('multiattack')
  })

  it('does NOT trigger when target out of melee range', () => {
    const f1 = makeFanatic({ position: { x: 0, y: 0 } })
    const bard = makeBard({ position: { x: 10, y: 0 } }) // 50ft
    const ctx = makeContext(f1, [bard])
    expect(tactics.evalMeleeAttack(ctx)).toBe(null)
  })

  it('does NOT trigger when target is flying and unreachable', () => {
    const f1 = makeFanatic({ position: { x: 0, y: 0 } })
    const bard = makeBard({ position: { x: 0, y: 0 } })
    bard.flying = true
    const ctx = makeContext(f1, [bard])
    // distanceBetween returns 25ft when target is flying
    expect(tactics.evalMeleeAttack(ctx)).toBe(null)
  })
})

describe('evalInflictWounds', () => {
  it('triggers in melee with 1st level slot', () => {
    const f1 = makeFanatic({ position: { x: 0, y: 0 } })
    const bard = makeBard({ position: { x: 1, y: 0 } })
    const ctx = makeContext(f1, [bard])

    const result = tactics.evalInflictWounds(ctx)
    expect(result).toBeTruthy()
    expect(result.action.spell).toBe('Inflict Wounds')
  })

  it('does NOT trigger when out of melee', () => {
    const f1 = makeFanatic({ position: { x: 0, y: 0 } })
    const bard = makeBard({ position: { x: 10, y: 0 } })
    const ctx = makeContext(f1, [bard])
    expect(tactics.evalInflictWounds(ctx)).toBe(null)
  })

  it('does NOT trigger without spell slots', () => {
    const f1 = makeFanatic({ position: { x: 0, y: 0 } })
    f1.spellSlots[1] = 0
    const bard = makeBard({ position: { x: 1, y: 0 } })
    const ctx = makeContext(f1, [bard])
    expect(tactics.evalInflictWounds(ctx)).toBe(null)
  })
})

describe('evalRangedCantripWithApproach', () => {
  it('uses Sacred Flame + move toward', () => {
    const f1 = makeFanatic({ position: { x: 0, y: 0 } })
    const bard = makeBard({ position: { x: 10, y: 0 } })
    const ctx = makeContext(f1, [bard])

    const result = tactics.evalRangedCantripWithApproach(ctx)
    expect(result).toBeTruthy()
    expect(result.action.spell).toBe('Sacred Flame')
    expect(result.movement).toBeTruthy()
    expect(result.movement.type).toBe('move_toward')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// REACTION EVALUATORS
// ═══════════════════════════════════════════════════════════════════════════

describe('evalCuttingWords', () => {
  it('triggers when attack would hit and d8 could save', () => {
    const bard = makeBard()
    bard.bardicInspirationUses = 3
    const result = tactics.evalCuttingWords(bard, {
      type: 'enemy_attack_roll',
      roll: 17,      // hits AC 14
      targetAC: 14,
      attacker: makeFanatic(),
    })
    expect(result).toBeTruthy()
    expect(result.type).toBe('cutting_words')
  })

  it('does NOT trigger if attack would miss', () => {
    const bard = makeBard()
    bard.bardicInspirationUses = 3
    const result = tactics.evalCuttingWords(bard, {
      type: 'enemy_attack_roll',
      roll: 12,
      targetAC: 14,
      attacker: makeFanatic(),
    })
    expect(result).toBe(null)
  })

  it('does NOT trigger if d8 max can\'t save', () => {
    const bard = makeBard()
    bard.bardicInspirationUses = 3
    const result = tactics.evalCuttingWords(bard, {
      type: 'enemy_attack_roll',
      roll: 25,      // so far above AC that -8 still hits
      targetAC: 14,
      attacker: makeFanatic(),
    })
    expect(result).toBe(null)
  })

  it('does NOT trigger if already reacted', () => {
    const bard = makeBard()
    bard.reactedThisRound = true
    bard.bardicInspirationUses = 3
    expect(tactics.evalCuttingWords(bard, {
      type: 'enemy_attack_roll',
      roll: 15, targetAC: 14, attacker: makeFanatic(),
    })).toBe(null)
  })

  it('does NOT trigger without inspiration uses', () => {
    const bard = makeBard()
    bard.bardicInspirationUses = 0
    expect(tactics.evalCuttingWords(bard, {
      type: 'enemy_attack_roll',
      roll: 15, targetAC: 14, attacker: makeFanatic(),
    })).toBe(null)
  })
})

describe('evalCounterspell', () => {
  it('counters Hold Person', () => {
    const bard = makeBard()
    const result = tactics.evalCounterspell(bard, {
      type: 'enemy_casting_spell',
      spell: 'Hold Person',
      caster: makeFanatic(),
    })
    expect(result).toBeTruthy()
    expect(result.type).toBe('counterspell')
    expect(result.slotLevel).toBe(3)
  })

  it('counters Inflict Wounds', () => {
    const bard = makeBard()
    const result = tactics.evalCounterspell(bard, {
      type: 'enemy_casting_spell',
      spell: 'Inflict Wounds',
      caster: makeFanatic(),
    })
    expect(result).toBeTruthy()
    expect(result.type).toBe('counterspell')
  })

  it('does NOT counter non-dangerous spells', () => {
    const bard = makeBard()
    expect(tactics.evalCounterspell(bard, {
      type: 'enemy_casting_spell',
      spell: 'Light',
      caster: makeFanatic(),
    })).toBe(null)
  })

  it('does NOT trigger without 3rd level slot', () => {
    const bard = makeBard()
    bard.spellSlots[3] = 0
    expect(tactics.evalCounterspell(bard, {
      type: 'enemy_casting_spell',
      spell: 'Hold Person',
      caster: makeFanatic(),
    })).toBe(null)
  })

  it('does NOT trigger if already reacted', () => {
    const bard = makeBard()
    bard.reactedThisRound = true
    expect(tactics.evalCounterspell(bard, {
      type: 'enemy_casting_spell',
      spell: 'Hold Person',
      caster: makeFanatic(),
    })).toBe(null)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// PROFILES
// ═══════════════════════════════════════════════════════════════════════════

describe('Profile registry', () => {
  it('has lore_bard profile', () => {
    expect(tactics.getProfile('lore_bard')).toBeTruthy()
    expect(tactics.getProfile('lore_bard').length).toBeGreaterThan(0)
  })

  it('has cult_fanatic profile', () => {
    expect(tactics.getProfile('cult_fanatic')).toBeTruthy()
  })

  it('has generic profiles', () => {
    expect(tactics.getProfile('generic_melee')).toBeTruthy()
    expect(tactics.getProfile('generic_ranged')).toBeTruthy()
  })

  it('returns null for unknown profile', () => {
    expect(tactics.getProfile('nonexistent')).toBe(null)
  })

  it('lists all profile names', () => {
    const names = tactics.getProfileNames()
    expect(names).toContain('lore_bard')
    expect(names).toContain('cult_fanatic')
    expect(names).toContain('generic_melee')
    expect(names).toContain('generic_ranged')
  })

  it('allows runtime profile registration', () => {
    tactics.registerProfile('test_profile', [tactics.evalDodge])
    expect(tactics.getProfile('test_profile')).toBeTruthy()
    expect(tactics.getProfile('test_profile').length).toBe(1)
    // Clean up
    delete tactics.PROFILES['test_profile']
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// DECISION ENGINE — makeDecision
// ═══════════════════════════════════════════════════════════════════════════

describe('makeDecision', () => {
  it('runs lore_bard profile — round 1 opens with HP', () => {
    const bard = makeBard()
    const f1 = makeFanatic()
    const f2 = makeFanatic()
    const decision = tactics.makeDecision('lore_bard', bard, [bard, f1, f2], 1)

    expect(decision).toBeTruthy()
    expect(decision.action.spell).toBe('Hypnotic Pattern')
    expect(decision.reasoning).toContain('ROUND 1')
  })

  it('runs lore_bard — survival GI overrides round 1', () => {
    const bard = makeBard()
    bard.currentHP = 10
    const f1 = makeFanatic()
    const decision = tactics.makeDecision('lore_bard', bard, [bard, f1], 1)

    expect(decision).toBeTruthy()
    expect(decision.action.spell).toBe('Greater Invisibility')
  })

  it('runs lore_bard — concentrating with all disabled → DW weakest', () => {
    const bard = makeBard()
    bard.concentrating = 'Hypnotic Pattern'
    const f1 = makeFanatic()
    f1.conditions.push('incapacitated', 'charmed_hp')
    const decision = tactics.makeDecision('lore_bard', bard, [bard, f1], 3)

    expect(decision.action.spell).toBe('Dissonant Whispers')
    expect(decision.action.target.id).toBe(f1.id)
  })

  it('runs lore_bard — merges self-heal bonus action', () => {
    const bard = makeBard()
    bard.concentrating = 'Hypnotic Pattern'
    bard.currentHP = 30 // ~45%, triggers self-heal
    const f1 = makeFanatic({ position: { x: 1, y: 0 } }) // in melee
    const decision = tactics.makeDecision('lore_bard', bard, [bard, f1], 3)

    // Should get Vicious Mockery action (melee eval) + Healing Word bonus
    expect(decision.action.spell).toBe('Vicious Mockery')
    expect(decision.bonusAction).toBeTruthy()
    expect(decision.bonusAction.type).toBe('cast_healing_word')
  })

  it('runs cult_fanatic — round 1 opens with SW + multiattack', () => {
    const f1 = makeFanatic({ position: { x: 0, y: 0 } })
    const bard = makeBard({ position: { x: 1, y: 0 } })
    const decision = tactics.makeDecision('cult_fanatic', f1, [f1, bard], 1)

    expect(decision).toBeTruthy()
    expect(decision.action.type).toBe('multiattack')
    expect(decision.bonusAction).toBeTruthy()
    expect(decision.bonusAction.spell).toBe('Spiritual Weapon')
  })

  it('runs cult_fanatic — invisible target → Shield of Faith', () => {
    const f1 = makeFanatic({ position: { x: 0, y: 0 } })
    const bard = makeBard()
    bard.conditions.push('invisible')
    const decision = tactics.makeDecision('cult_fanatic', f1, [f1, bard], 2)

    expect(decision.action.spell).toBe('Shield of Faith')
  })

  it('runs cult_fanatic — flying target → Hold Person', () => {
    const f1 = makeFanatic({ position: { x: 0, y: 0 } })
    const bard = makeBard()
    bard.flying = true
    const decision = tactics.makeDecision('cult_fanatic', f1, [f1, bard], 2)

    expect(decision.action.spell).toBe('Hold Person')
  })

  it('runs cult_fanatic — shakes charmed ally', () => {
    const f1 = makeFanatic({ position: { x: 0, y: 0 } })
    const f2 = makeFanatic({ name: 'Charmed', position: { x: 1, y: 0 } })
    f2.conditions.push('charmed_hp')
    const bard = makeBard({ position: { x: 5, y: 0 } })
    const decision = tactics.makeDecision('cult_fanatic', f1, [f1, bard, f2], 3)

    expect(decision.action.type).toBe('shake_awake')
  })

  it('throws for unknown profile', () => {
    expect(
      () => tactics.makeDecision('nonexistent', makeBard(), [], 1),
    ).toThrow(/Unknown AI profile/)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// makeReaction
// ═══════════════════════════════════════════════════════════════════════════

describe('makeReaction', () => {
  it('lore_bard Cutting Words on borderline attack', () => {
    const bard = makeBard()
    bard.bardicInspirationUses = 3
    const reaction = tactics.makeReaction('lore_bard', bard, {
      type: 'enemy_attack_roll',
      roll: 17,
      targetAC: 14,
      attacker: makeFanatic(),
    })
    expect(reaction).toBeTruthy()
    expect(reaction.type).toBe('cutting_words')
  })

  it('lore_bard Counterspell on Hold Person', () => {
    const bard = makeBard()
    const reaction = tactics.makeReaction('lore_bard', bard, {
      type: 'enemy_casting_spell',
      spell: 'Hold Person',
      caster: makeFanatic(),
    })
    expect(reaction).toBeTruthy()
    expect(reaction.type).toBe('counterspell')
  })

  it('cult_fanatic has no reactions', () => {
    const f1 = makeFanatic()
    const reaction = tactics.makeReaction('cult_fanatic', f1, {
      type: 'enemy_attack_roll',
      roll: 20, targetAC: 13, attacker: makeBard(),
    })
    expect(reaction).toBe(null)
  })

  it('unknown profile returns null', () => {
    const reaction = tactics.makeReaction('ghost', makeBard(), {
      type: 'enemy_attack_roll', roll: 20, targetAC: 14, attacker: makeFanatic(),
    })
    expect(reaction).toBe(null)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// makeTacticalAI — factory for encounter runner
// ═══════════════════════════════════════════════════════════════════════════

describe('makeTacticalAI', () => {
  it('creates a getDecision function from ID-based profile map', () => {
    const bard = makeBard()
    const f1 = makeFanatic()
    const getDecision = tactics.makeTacticalAI({
      [bard.id]: 'lore_bard',
      [f1.id]: 'cult_fanatic',
    })

    const bardDecision = getDecision(bard, [bard, f1], 1, [])
    expect(bardDecision).toBeTruthy()
    expect(bardDecision.action.spell).toBe('Hypnotic Pattern')

    const fanaticDecision = getDecision(f1, [bard, f1], 1, [])
    expect(fanaticDecision).toBeTruthy()
    // Fanatic round 1 depends on position — should get some valid action
    expect(fanaticDecision.action).toBeTruthy()
  })

  it('creates a getDecision function from resolver function', () => {
    const resolver = (c) => c.side === 'party' ? 'lore_bard' : 'cult_fanatic'
    const getDecision = tactics.makeTacticalAI(resolver)

    const bard = makeBard()
    const f1 = makeFanatic()
    const decision = getDecision(bard, [bard, f1], 1, [])
    expect(decision).toBeTruthy()
    expect(decision.action.spell).toBe('Hypnotic Pattern')
  })

  it('falls back to generic_melee for unknown combatants', () => {
    const getDecision = tactics.makeTacticalAI({})
    const creature = makeFanatic()
    const enemy = makeBard({ position: { x: 1, y: 0 } })
    
    // generic_melee with enemy in melee should try to attack
    const decision = getDecision(creature, [creature, enemy], 2, [])
    expect(decision).toBeTruthy()
    // Should get melee attack or dodge
    expect(['multiattack', 'attack', 'dodge']).toContain(decision.action.type)
  })
})

describe('makeReactionAI', () => {
  it('creates a getReaction function from profile map', () => {
    const bard = makeBard()
    bard.bardicInspirationUses = 3
    const getReaction = tactics.makeReactionAI({ [bard.id]: 'lore_bard' })
    
    const reaction = getReaction(bard, {
      type: 'enemy_attack_roll',
      roll: 16, targetAC: 14, attacker: makeFanatic(),
    })
    expect(reaction).toBeTruthy()
    expect(reaction.type).toBe('cutting_words')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// INTEGRATION — full encounter with AI module
// ═══════════════════════════════════════════════════════════════════════════

describe('Integration — AI + Encounter Runner', () => {
  it('runs a complete encounter with AI-driven decisions', () => {
    dice.setDiceMode('average')
    const bard = makeBard({ id: 'hero', position: { x: 0, y: 0 } })
    const f1 = makeFanatic({ id: 'enemy1', name: 'Fanatic 1', position: { x: 2, y: 0 } })
    const f2 = makeFanatic({ id: 'enemy2', name: 'Fanatic 2', position: { x: 2, y: 1 } })

    const getDecision = tactics.makeTacticalAI({
      'hero': 'lore_bard',
      'enemy1': 'cult_fanatic',
      'enemy2': 'cult_fanatic',
    })

    const result = runner.runEncounter({
      combatants: [bard, f1, f2],
      getDecision,
      maxRounds: 10,
      verbose: false,
    })
    expect(result.winner).toBeTruthy()
    expect(result.rounds).toBeGreaterThan(0)
    expect(result.analytics.length).toBe(3)
    expect(result.log.length).toBeGreaterThan(0)
  })
})


// ═══════════════════════════════════════════════════════════════════════════
// MONSTER AI HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function makeDragon(overrides = {}) {
  return createCreature('young_red_dragon', {
    id: `dragon-${++testId}`,
    position: { x: 5, y: 0 },
    ...overrides,
  })
}

function makeHillGiant(overrides = {}) {
  return createCreature('hill_giant', {
    id: `giant-${++testId}`,
    position: { x: 5, y: 0 },
    ...overrides,
  })
}

function makeMage(overrides = {}) {
  return createCreature('mage', {
    id: `mage-${++testId}`,
    position: { x: 5, y: 0 },
    ...overrides,
  })
}

function makeArchmage(overrides = {}) {
  return createCreature('archmage', {
    id: `archmage-${++testId}`,
    position: { x: 5, y: 0 },
    ...overrides,
  })
}

function makeLich(overrides = {}) {
  return createCreature('lich', {
    id: `lich-${++testId}`,
    position: { x: 5, y: 0 },
    ...overrides,
  })
}

function makeOgre(overrides = {}) {
  return createCreature('ogre', {
    id: `ogre-${++testId}`,
    position: { x: 3, y: 0 },
    ...overrides,
  })
}


// ═══════════════════════════════════════════════════════════════════════════
// DRAGON PROFILE TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe('Dragon profile — evalDragonBreathWeapon', () => {
  it('uses breath weapon on round 1 with enemy in range', () => {
    const dragon = makeDragon()
    const bard = makeBard({ position: { x: 6, y: 0 } })
    const ctx = makeContext(dragon, [bard], 1)
    const result = tactics.evalDragonBreathWeapon(ctx)
    expect(result).toBeTruthy()
    expect(result.action.type).toBe('breath_weapon')
    expect(result.action.aoeCenter).toBeTruthy()
  })

  it('skips breath weapon when no uses remain', () => {
    const dragon = makeDragon()
    dragon.breathWeapon.uses = 0
    const bard = makeBard({ position: { x: 6, y: 0 } })
    const ctx = makeContext(dragon, [bard], 1)
    const result = tactics.evalDragonBreathWeapon(ctx)
    expect(result).toBe(null)
  })

  it('skips breath weapon after round 1 with only 1 target', () => {
    const dragon = makeDragon()
    const bard = makeBard({ position: { x: 6, y: 0 } })
    const ctx = makeContext(dragon, [bard], 3)
    const result = tactics.evalDragonBreathWeapon(ctx)
    expect(result).toBe(null)
  })
})

describe('Dragon profile — evalDragonMultiattack', () => {
  it('uses multiattack when available', () => {
    const dragon = makeDragon()
    const bard = makeBard({ position: { x: 6, y: 0 } })
    const ctx = makeContext(dragon, [bard], 2)
    const result = tactics.evalDragonMultiattack(ctx)
    expect(result).toBeTruthy()
    expect(result.action.type).toBe('multiattack')
  })
})

describe('evalDragonFear', () => {
  it('triggers when 2+ enemies are within dragon fear cone range', () => {
    const bard = makeBard({ position: { x: 0, y: 0 } })
    const f1 = makeFanatic({ position: { x: 3, y: 0 } }) // 15ft — within 30ft cone
    const f2 = makeFanatic({ position: { x: 4, y: 0 } }) // 20ft — within 30ft cone
    const ctx = makeContext(bard, [f1, f2])

    const result = tactics.evalDragonFear(ctx)
    expect(result).toBeTruthy()
    expect(result.action.type).toBe('dragon_fear')
    expect(result.action.aoeCenter).toBeTruthy()
  })

  it('does not trigger with 0 dragonFear uses (shared breath pool exhausted)', () => {
    const bard = makeBard({ position: { x: 0, y: 0 } })
    bard.dragonFear.uses = 0
    bard.breathWeapon.uses = 0  // shared PB pool
    const f1 = makeFanatic({ position: { x: 3, y: 0 } })
    const f2 = makeFanatic({ position: { x: 4, y: 0 } })
    const ctx = makeContext(bard, [f1, f2])

    expect(tactics.evalDragonFear(ctx)).toBe(null)
  })

  it('does not trigger when creature has no dragonFear', () => {
    const bard = makeBard({ position: { x: 0, y: 0 } })
    delete bard.dragonFear
    const f1 = makeFanatic({ position: { x: 3, y: 0 } })
    const ctx = makeContext(bard, [f1])

    expect(tactics.evalDragonFear(ctx)).toBe(null)
  })

  it('does not trigger with only 1 enemy in range', () => {
    const bard = makeBard({ position: { x: 0, y: 0 } })
    const f1 = makeFanatic({ position: { x: 3, y: 0 } }) // within range
    const f2 = makeFanatic({ position: { x: 20, y: 0 } }) // way outside
    const ctx = makeContext(bard, [f1, f2])

    expect(tactics.evalDragonFear(ctx)).toBe(null)
  })
})

describe('Dragon profile — makeDecision', () => {
  it('prioritizes breath weapon over multiattack on round 1', () => {
    const dragon = makeDragon()
    const bard = makeBard({ position: { x: 6, y: 0 } })
    const decision = tactics.makeDecision('dragon', dragon, [dragon, bard], 1)
    expect(decision.action.type).toBe('breath_weapon')
  })

  it('falls back to multiattack when breath weapon exhausted', () => {
    const dragon = makeDragon()
    dragon.breathWeapon.uses = 0
    const bard = makeBard({ position: { x: 6, y: 0 } })
    const decision = tactics.makeDecision('dragon', dragon, [dragon, bard], 2)
    expect(decision.action.type).toBe('multiattack')
  })
})


// ═══════════════════════════════════════════════════════════════════════════
// GIANT BRUISER PROFILE TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe('Giant Bruiser profile — evalGiantRockThrow', () => {
  it('throws rock at flying target', () => {
    const giant = makeHillGiant()
    const bard = makeBard({ position: { x: 6, y: 0 } })
    bard.flying = true
    const ctx = makeContext(giant, [bard], 2)
    const result = tactics.evalGiantRockThrow(ctx)
    expect(result).toBeTruthy()
    expect(result.action.type).toBe('attack')
    expect(result.action.weapon.type).toBe('ranged')
  })

  it('does not throw rock when in melee range and target grounded', () => {
    const giant = makeHillGiant({ position: { x: 0, y: 0 } })
    const bard = makeBard({ position: { x: 1, y: 0 } })
    const ctx = makeContext(giant, [bard], 2)
    const result = tactics.evalGiantRockThrow(ctx)
    expect(result).toBe(null)
  })
})

describe('Giant Bruiser profile — evalGiantMelee', () => {
  it('uses multiattack when available', () => {
    const giant = makeHillGiant({ position: { x: 0, y: 0 } })
    const bard = makeBard({ position: { x: 1, y: 0 } })
    const ctx = makeContext(giant, [bard], 2)
    const result = tactics.evalGiantMelee(ctx)
    expect(result).toBeTruthy()
    expect(result.action.type).toBe('multiattack')
  })

  it('includes movement when target is distant', () => {
    const giant = makeHillGiant({ position: { x: 0, y: 0 } })
    const bard = makeBard({ position: { x: 10, y: 0 } })
    const ctx = makeContext(giant, [bard], 2)
    const result = tactics.evalGiantMelee(ctx)
    expect(result).toBeTruthy()
    expect(result.movement).toBeTruthy()
    expect(result.movement.type).toBe('move_toward')
  })
})

describe('Giant Bruiser profile — makeDecision', () => {
  it('throws rocks at flying targets', () => {
    const giant = makeHillGiant()
    const bard = makeBard({ position: { x: 6, y: 0 } })
    bard.flying = true
    const decision = tactics.makeDecision('giant_bruiser', giant, [giant, bard], 2)
    expect(decision.action.type).toBe('attack')
  })

  it('uses melee when in range', () => {
    const giant = makeHillGiant({ position: { x: 0, y: 0 } })
    const bard = makeBard({ position: { x: 1, y: 0 } })
    const decision = tactics.makeDecision('giant_bruiser', giant, [giant, bard], 2)
    expect(decision.action.type).toBe('multiattack')
  })
})


// ═══════════════════════════════════════════════════════════════════════════
// MAGE CASTER PROFILE TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe('Mage profile — evalMageFireball', () => {
  it('casts Fireball when 3rd level slots available', () => {
    const mage = makeMage()
    const bard = makeBard({ position: { x: 6, y: 0 } })
    const ctx = makeContext(mage, [bard], 1)
    const result = tactics.evalMageFireball(ctx)
    expect(result).toBeTruthy()
    expect(result.action.spell).toBe('Fireball')
    expect(result.action.aoeCenter).toBeTruthy()
    expect(result.action.targets).toBe(undefined)
  })

  it('skips Fireball when no 3rd level slots', () => {
    const mage = makeMage()
    mage.spellSlots[3] = 0
    const bard = makeBard({ position: { x: 6, y: 0 } })
    const ctx = makeContext(mage, [bard], 1)
    const result = tactics.evalMageFireball(ctx)
    expect(result).toBe(null)
  })
})

describe('Mage profile — evalMageFireBolt', () => {
  it('casts Fire Bolt at enemies', () => {
    const mage = makeMage()
    const bard = makeBard({ position: { x: 6, y: 0 } })
    const ctx = makeContext(mage, [bard], 3)
    const result = tactics.evalMageFireBolt(ctx)
    expect(result).toBeTruthy()
    expect(result.action.spell).toBe('Fire Bolt')
  })
})

describe('Mage profile — evalMageMistyStep', () => {
  it('uses Misty Step when enemy in melee', () => {
    const mage = makeMage({ position: { x: 0, y: 0 } })
    const bard = makeBard({ position: { x: 1, y: 0 } })
    const ctx = makeContext(mage, [bard], 2)
    const result = tactics.evalMageMistyStep(ctx)
    expect(result).toBeTruthy()
    expect(result._bonusActionOnly).toBeTruthy()
    expect(result.bonusAction.spell).toBe('Misty Step')
  })

  it('skips Misty Step when no enemies in melee', () => {
    const mage = makeMage()
    const bard = makeBard({ position: { x: 10, y: 0 } })
    const ctx = makeContext(mage, [bard], 2)
    const result = tactics.evalMageMistyStep(ctx)
    expect(result).toBe(null)
  })
})

describe('Mage profile — makeDecision', () => {
  it('opens with Fireball', () => {
    const mage = makeMage()
    const bard = makeBard({ position: { x: 6, y: 0 } })
    const decision = tactics.makeDecision('mage_caster', mage, [mage, bard], 1)
    expect(decision.action.spell).toBe('Fireball')
  })

  it('falls back to Fire Bolt when out of slots', () => {
    const mage = makeMage()
    mage.spellSlots = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
    const bard = makeBard({ position: { x: 6, y: 0 } })
    const decision = tactics.makeDecision('mage_caster', mage, [mage, bard], 3)
    expect(decision.action.spell).toBe('Fire Bolt')
  })
})


// ═══════════════════════════════════════════════════════════════════════════
// ARCHMAGE PROFILE TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe('Archmage profile — evalArchmageConeOfCold', () => {
  it('opens with Cone of Cold on round 1', () => {
    const arch = makeArchmage()
    const bard = makeBard({ position: { x: 6, y: 0 } })
    const ctx = makeContext(arch, [bard], 1)
    const result = tactics.evalArchmageConeOfCold(ctx)
    expect(result).toBeTruthy()
    expect(result.action.spell).toBe('Cone of Cold')
  })

  it('skips Cone of Cold after round 2', () => {
    const arch = makeArchmage()
    const bard = makeBard({ position: { x: 6, y: 0 } })
    const ctx = makeContext(arch, [bard], 3)
    const result = tactics.evalArchmageConeOfCold(ctx)
    expect(result).toBe(null)
  })
})

describe('Archmage profile — makeDecision', () => {
  it('uses Cone of Cold before Fireball', () => {
    const arch = makeArchmage()
    const bard = makeBard({ position: { x: 6, y: 0 } })
    const decision = tactics.makeDecision('archmage_caster', arch, [arch, bard], 1)
    expect(decision.action.spell).toBe('Cone of Cold')
  })

  it('falls back to Fireball after Cone of Cold used', () => {
    const arch = makeArchmage()
    arch.spellSlots[5] = 0
    const bard = makeBard({ position: { x: 6, y: 0 } })
    const decision = tactics.makeDecision('archmage_caster', arch, [arch, bard], 3)
    expect(decision.action.spell).toBe('Fireball')
  })
})


// ═══════════════════════════════════════════════════════════════════════════
// LICH PROFILE TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe('Lich profile — evalLichPowerWordStun', () => {
  it('uses PW:Stun on target with ≤150 HP', () => {
    const lich = makeLich()
    const bard = makeBard({ position: { x: 6, y: 0 } })
    bard.currentHP = 67 // Bard's max HP
    const ctx = makeContext(lich, [bard], 1)
    const result = tactics.evalLichPowerWordStun(ctx)
    expect(result).toBeTruthy()
    expect(result.action.spell).toBe('Power Word Stun')
  })

  it('skips PW:Stun when no 8th level slots', () => {
    const lich = makeLich()
    lich.spellSlots[8] = 0
    const bard = makeBard({ position: { x: 6, y: 0 } })
    const ctx = makeContext(lich, [bard], 1)
    const result = tactics.evalLichPowerWordStun(ctx)
    expect(result).toBe(null)
  })
})

describe('Lich profile — evalLichFingerOfDeath', () => {
  it('uses Finger of Death for heavy damage', () => {
    const lich = makeLich()
    const bard = makeBard({ position: { x: 6, y: 0 } })
    const ctx = makeContext(lich, [bard], 2)
    const result = tactics.evalLichFingerOfDeath(ctx)
    expect(result).toBeTruthy()
    expect(result.action.spell).toBe('Finger of Death')
  })

  it('skips when no 7th level slots', () => {
    const lich = makeLich()
    lich.spellSlots[7] = 0
    const bard = makeBard({ position: { x: 6, y: 0 } })
    const ctx = makeContext(lich, [bard], 2)
    const result = tactics.evalLichFingerOfDeath(ctx)
    expect(result).toBe(null)
  })
})

describe('Lich profile — evalLichCloudkill', () => {
  it('uses Cloudkill when 2+ enemies and not concentrating', () => {
    const lich = makeLich()
    const bard1 = makeBard({ id: 'bard-a', position: { x: 6, y: 0 } })
    const bard2 = makeBard({ id: 'bard-b', position: { x: 6, y: 1 } })
    const ctx = makeContext(lich, [bard1, bard2], 2)
    const result = tactics.evalLichCloudkill(ctx)
    expect(result).toBeTruthy()
    expect(result.action.spell).toBe('Cloudkill')
  })

  it('skips Cloudkill when already concentrating', () => {
    const lich = makeLich()
    lich.concentrating = 'Something'
    const bard1 = makeBard({ id: 'bard-a', position: { x: 6, y: 0 } })
    const bard2 = makeBard({ id: 'bard-b', position: { x: 6, y: 1 } })
    const ctx = makeContext(lich, [bard1, bard2], 2)
    const result = tactics.evalLichCloudkill(ctx)
    expect(result).toBe(null)
  })
})

describe('Lich profile — evalLegendaryResistance (reaction)', () => {
  it('auto-succeeds a failed save', () => {
    const lich = makeLich()
    const result = tactics.evalLegendaryResistance(lich, {
      type: 'failed_save',
      spell: 'Hypnotic Pattern',
    })
    expect(result).toBeTruthy()
    expect(result.type).toBe('legendary_resistance')
  })

  it('skips when no uses remain', () => {
    const lich = makeLich()
    lich.legendaryResistance.uses = 0
    const result = tactics.evalLegendaryResistance(lich, {
      type: 'failed_save',
      spell: 'Hypnotic Pattern',
    })
    expect(result).toBe(null)
  })
})

describe('Lich profile — makeDecision', () => {
  it('prioritizes PW:Stun over Finger of Death', () => {
    const lich = makeLich()
    const bard = makeBard({ position: { x: 6, y: 0 } })
    bard.currentHP = 67
    const decision = tactics.makeDecision('lich_caster', lich, [lich, bard], 1)
    expect(decision.action.spell).toBe('Power Word Stun')
  })

  it('falls to Finger of Death when PW:Stun slot spent', () => {
    const lich = makeLich()
    lich.spellSlots[8] = 0
    const bard = makeBard({ position: { x: 6, y: 0 } })
    const decision = tactics.makeDecision('lich_caster', lich, [lich, bard], 2)
    expect(decision.action.spell).toBe('Finger of Death')
  })

  it('falls to Fireball when high slots spent', () => {
    const lich = makeLich()
    lich.spellSlots[8] = 0
    lich.spellSlots[7] = 0
    lich.spellSlots[5] = 0
    const bard = makeBard({ position: { x: 6, y: 0 } })
    const decision = tactics.makeDecision('lich_caster', lich, [lich, bard], 3)
    expect(decision.action.spell).toBe('Fireball')
  })
})


// ═══════════════════════════════════════════════════════════════════════════
// UNDEAD MELEE PROFILE TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe('Undead Melee profile — approach and attack', () => {
  it('attacks when in melee range', () => {
    const zombie = createCreature('zombie', { id: 'zombie-1', position: { x: 0, y: 0 } })
    const bard = makeBard({ position: { x: 1, y: 0 } })
    const decision = tactics.makeDecision('undead_melee', zombie, [zombie, bard], 2)
    expect(decision.action.type === 'attack' || decision.action.type === 'multiattack').toBe(true)
  })

  it('approaches when too far for melee', () => {
    const zombie = createCreature('zombie', { id: 'zombie-1', position: { x: 0, y: 0 } })
    const bard = makeBard({ position: { x: 20, y: 0 } })
    const decision = tactics.makeDecision('undead_melee', zombie, [zombie, bard], 2)
    expect(decision.movement).toBeTruthy()
    expect(decision.movement.type).toBe('move_toward')
  })
})


// ═══════════════════════════════════════════════════════════════════════════
// PROFILE REGISTRATION
// ═══════════════════════════════════════════════════════════════════════════

describe('Profile registry — all scenario monsters have profiles', () => {
  const expectedProfiles = [
    'lore_bard', 'cult_fanatic', 'generic_melee', 'generic_ranged',
    'dragon', 'giant_bruiser', 'mage_caster', 'archmage_caster',
    'lich_caster', 'undead_melee',
  ]

  for (const profile of expectedProfiles) {
    it(`profile '${profile}' exists and has evaluators`, () => {
      const p = tactics.getProfile(profile)
      expect(p).toBeTruthy()
      expect(p.length).toBeGreaterThan(0)
    })

    it(`profile '${profile}' has a matching reaction profile`, () => {
      expect(profile in tactics.REACTION_PROFILES).toBe(true)
    })
  }
})

// ═══════════════════════════════════════════════════════════════════════════
// BUG FIX: assessBattlefield includes helplessEnemies
// ═══════════════════════════════════════════════════════════════════════════

describe('assessBattlefield — helplessEnemies', () => {
  it('categorizes incapacitated enemies as helpless', () => {
    const bard = makeBard()
    const f1 = makeFanatic({ name: 'Active' })
    const f2 = makeFanatic({ name: 'Paralyzed' })
    f2.conditions.push('paralyzed')

    const ctx = makeContext(bard, [f1, f2])
    expect(ctx.activeEnemies.length).toBe(1)
    expect(ctx.helplessEnemies.length).toBe(1)
    expect(ctx.helplessEnemies[0].name).toBe('Paralyzed')
  })

  it('helplessEnemies is empty when no enemies are incapacitated', () => {
    const bard = makeBard()
    const f1 = makeFanatic({ name: 'Active1' })
    const f2 = makeFanatic({ name: 'Active2' })

    const ctx = makeContext(bard, [f1, f2])
    expect(ctx.helplessEnemies.length).toBe(0)
    expect(ctx.activeEnemies.length).toBe(2)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// BUG FIX: evalAttackHelpless — enemies attack incapacitated targets
// ═══════════════════════════════════════════════════════════════════════════

describe('evalAttackHelpless', () => {
  it('attacks helpless enemy when no active enemies remain', () => {
    const fanatic = makeFanatic({ name: 'Attacker' })
    fanatic.side = 'enemy'
    const bard = makeBard()
    bard.conditions.push('paralyzed')
    bard.position = { x: 1, y: 0 }
    fanatic.position = { x: 0, y: 0 }

    const ctx = tactics.assessBattlefield(fanatic, [fanatic, bard], 2)
    expect(ctx.activeEnemies.length).toBe(0)
    expect(ctx.helplessEnemies.length).toBe(1)

    // Make a decision — cult_fanatic profile should pick evalAttackHelpless
    const decision = tactics.makeDecision('cult_fanatic', fanatic, [fanatic, bard], 2)
    expect(decision).toBeTruthy()
    expect(
      decision.reasoning.includes('helpless') || decision.action.type === 'attack' || decision.action.type === 'multiattack'
    ).toBe(true)
  })

  it('prefers active enemies over helpless ones', () => {
    const fanatic = makeFanatic({ name: 'Attacker' })
    fanatic.side = 'enemy'
    const bard1 = makeBard({ id: 'bard-active' })
    bard1.name = 'Active Bard'
    bard1.position = { x: 1, y: 0 }
    const bard2 = makeBard({ id: 'bard-helpless' })
    bard2.name = 'Helpless Bard'
    bard2.conditions.push('paralyzed')
    bard2.position = { x: 2, y: 0 }
    fanatic.position = { x: 0, y: 0 }

    const ctx = tactics.assessBattlefield(fanatic, [fanatic, bard1, bard2], 2)
    expect(ctx.activeEnemies.length).toBe(1)
    expect(ctx.helplessEnemies.length).toBe(1)

    // Decision should target the active bard, not the helpless one
    const decision = tactics.makeDecision('cult_fanatic', fanatic, [fanatic, bard1, bard2], 2)
    expect(decision).toBeTruthy()
    // The cult_fanatic should use melee/ranged evaluators targeting the active bard
    expect(decision.reasoning.includes('helpless')).toBe(false)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// BUG FIX: evalOffensiveDissonantWhispers — works with multiple enemies
// ═══════════════════════════════════════════════════════════════════════════

describe('evalOffensiveDissonantWhispers', () => {
  it('triggers when there is one active enemy', () => {
    const bard = makeBard()
    bard.concentrating = null
    const f1 = makeFanatic({ position: { x: 6, y: 0 } })
    const ctx = makeContext(bard, [f1])
    const result = tactics.evalOffensiveDissonantWhispers(ctx)
    expect(result).toBeTruthy()
    expect(result.action.spell).toBe('Dissonant Whispers')
  })

  it('triggers when there are multiple active enemies', () => {
    const bard = makeBard()
    bard.concentrating = null
    const f1 = makeFanatic({ position: { x: 6, y: 0 } })
    const f2 = makeFanatic({ position: { x: 7, y: 0 } })
    const ctx = makeContext(bard, [f1, f2])
    const result = tactics.evalOffensiveDissonantWhispers(ctx)
    expect(result).toBeTruthy()
    expect(result.action.spell).toBe('Dissonant Whispers')
  })

  it('does NOT trigger when concentrating', () => {
    const bard = makeBard()
    bard.concentrating = 'Hypnotic Pattern'
    const f1 = makeFanatic({ position: { x: 6, y: 0 } })
    const ctx = makeContext(bard, [f1])
    const result = tactics.evalOffensiveDissonantWhispers(ctx)
    expect(result).toBe(null)
  })

  it('does NOT trigger with zero enemies', () => {
    const bard = makeBard()
    bard.concentrating = null
    const ctx = makeContext(bard, [])
    const result = tactics.evalOffensiveDissonantWhispers(ctx)
    expect(result).toBe(null)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// SPELL UPCASTING — findLowestAvailableSlot + evaluator slot selection
// ═══════════════════════════════════════════════════════════════════════════

describe('findLowestAvailableSlot', () => {
  it('returns minLevel when that slot is available', () => {
    expect(tactics.findLowestAvailableSlot({ 1: 2, 2: 1, 3: 1 }, 1)).toBe(1)
  })

  it('returns next available slot when minLevel is exhausted', () => {
    expect(tactics.findLowestAvailableSlot({ 1: 0, 2: 0, 3: 1 }, 1)).toBe(3)
  })

  it('returns null when all slots are exhausted', () => {
    expect(tactics.findLowestAvailableSlot({ 1: 0, 2: 0, 3: 0 }, 1)).toBe(null)
  })

  it('returns null when spellSlots is null', () => {
    expect(tactics.findLowestAvailableSlot(null, 1)).toBe(null)
  })
})

describe('evalOffensiveDissonantWhispers upcasting', () => {
  it('upcasts DW when level 1 slots are gone but level 2 available', () => {
    const bard = makeBard()
    bard.concentrating = null
    bard.spellSlots = { 1: 0, 2: 1, 3: 1, 4: 1 }
    const f1 = makeFanatic({ position: { x: 6, y: 0 } })
    const ctx = makeContext(bard, [f1])
    const result = tactics.evalOffensiveDissonantWhispers(ctx)
    expect(result).toBeTruthy()
    expect(result.action.level).toBe(2)
  })

  it('uses level 1 when available (lowest slot first)', () => {
    const bard = makeBard()
    bard.concentrating = null
    bard.spellSlots = { 1: 1, 2: 1, 3: 1, 4: 1 }
    const f1 = makeFanatic({ position: { x: 6, y: 0 } })
    const ctx = makeContext(bard, [f1])
    const result = tactics.evalOffensiveDissonantWhispers(ctx)
    expect(result).toBeTruthy()
    expect(result.action.level).toBe(1)
  })
})

describe('evalOffensiveShatter upcasting', () => {
  it('upcasts Shatter when level 2 slots are gone but level 3 available', () => {
    const bard = makeBard()
    bard.concentrating = null
    bard.spellSlots = { 1: 0, 2: 0, 3: 1, 4: 1 }
    const f1 = makeFanatic({ position: { x: 6, y: 0 } })
    const f2 = makeFanatic({ position: { x: 7, y: 0 } })
    const ctx = makeContext(bard, [f1, f2])
    const result = tactics.evalOffensiveShatter(ctx)
    expect(result).toBeTruthy()
    expect(result.action.level).toBe(3)
  })
})
