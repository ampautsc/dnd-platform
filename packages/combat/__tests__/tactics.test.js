/**
 * Tactics AI test suite — ported to vitest ESM.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
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
    assert.strictEqual(ctx.activeEnemies.length, 1)
    assert.strictEqual(ctx.allies.length, 0)
  })

  it('identifies charmed allies', () => {
    const f1 = makeFanatic({ position: { x: 0, y: 0 } })
    const f2 = makeFanatic({ name: 'Charmed', position: { x: 1, y: 0 } })
    f2.conditions.push('charmed_hp')
    const bard = makeBard()
    const ctx = makeContext(f1, [bard, f2])
    assert.strictEqual(ctx.charmedAllies.length, 1)
  })

  it('identifies enemies in melee', () => {
    const bard = makeBard()
    const f1 = makeFanatic({ position: { x: 1, y: 0 } }) // 5ft
    const f2 = makeFanatic({ position: { x: 10, y: 0 } }) // 50ft
    const ctx = makeContext(bard, [f1, f2])
    assert.strictEqual(ctx.enemiesInMelee.length, 1)
  })

  it('computes HP percentage', () => {
    const bard = makeBard()
    bard.currentHP = Math.floor(bard.maxHP / 2)
    const ctx = makeContext(bard)
    assert.ok(Math.abs(ctx.hpPct - 0.5) < Math.pow(10, -1))
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
    assert.strictEqual(result.id, f1.id)
  })

  it('returns null for empty array', () => {
    assert.strictEqual(tactics.selectHighestThreat([]), null)
  })
})

describe('selectWeakest', () => {
  it('picks the lowest HP', () => {
    const f1 = makeFanatic()
    f1.currentHP = 5
    const f2 = makeFanatic()
    f2.currentHP = 20
    assert.strictEqual(tactics.selectWeakest([f1, f2]).id, f1.id)
  })
})

describe('selectClosestCharmedAlly', () => {
  it('picks the nearest charmed ally', () => {
    const me = makeFanatic({ position: { x: 0, y: 0 } })
    const near = makeFanatic({ name: 'Near', position: { x: 1, y: 0 } })
    near.conditions.push('charmed_hp')
    const far = makeFanatic({ name: 'Far', position: { x: 10, y: 0 } })
    far.conditions.push('charmed_hp')
    assert.strictEqual(tactics.selectClosestCharmedAlly(me, [far, near]).name, 'Near')
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
    assert.ok(result)
    assert.strictEqual(result.action.spell, 'Greater Invisibility')
  })

  it('does NOT trigger at 50% HP', () => {
    const bard = makeBard()
    bard.currentHP = Math.floor(bard.maxHP / 2)
    const ctx = makeContext(bard, [makeFanatic()])
    assert.strictEqual(tactics.evalSurvivalInvisibility(ctx), null)
  })

  it('does NOT trigger if already invisible', () => {
    const bard = makeBard()
    bard.currentHP = 5
    bard.conditions.push('invisible')
    const ctx = makeContext(bard, [makeFanatic()])
    assert.strictEqual(tactics.evalSurvivalInvisibility(ctx), null)
  })

  it('includes Gem Flight as bonus action when available', () => {
    const bard = makeBard()
    bard.currentHP = 10
    const ctx = makeContext(bard, [makeFanatic()])
    const result = tactics.evalSurvivalInvisibility(ctx)
    assert.ok(result.bonusAction)
    assert.strictEqual(result.bonusAction.type, 'gem_flight')
  })
})

describe('evalOpeningAoEDisable', () => {
  it('triggers round 1, no concentration, 3rd level slot, HP known', () => {
    const bard = makeBard()
    const ctx = makeContext(bard, [makeFanatic(), makeFanatic()], 1)
    const result = tactics.evalOpeningAoEDisable(ctx)
    assert.ok(result)
    assert.strictEqual(result.action.spell, 'Hypnotic Pattern')
    assert.ok(result.reasoning.includes('ROUND 1'))
  })

  it('does NOT trigger after round 1', () => {
    const bard = makeBard()
    const ctx = makeContext(bard, [makeFanatic()], 2)
    assert.strictEqual(tactics.evalOpeningAoEDisable(ctx), null)
  })

  it('does NOT trigger if already concentrating', () => {
    const bard = makeBard()
    bard.concentrating = 'Hypnotic Pattern'
    const ctx = makeContext(bard, [makeFanatic()], 1)
    assert.strictEqual(tactics.evalOpeningAoEDisable(ctx), null)
  })

  it('does NOT trigger without 3rd level slot', () => {
    const bard = makeBard()
    bard.spellSlots[3] = 0
    const ctx = makeContext(bard, [makeFanatic()], 1)
    assert.strictEqual(tactics.evalOpeningAoEDisable(ctx), null)
  })

  it('includes Gem Flight bonus action when available', () => {
    const bard = makeBard()
    const ctx = makeContext(bard, [makeFanatic()], 1)
    const result = tactics.evalOpeningAoEDisable(ctx)
    assert.ok(result.bonusAction)
    assert.strictEqual(result.bonusAction.type, 'gem_flight')
  })

  it('returns aoeCenter instead of targets (engine resolves targets)', () => {
    const bard = makeBard()
    const f1 = makeFanatic({ position: { x: 10, y: 0 } })
    const ctx = makeContext(bard, [f1], 1)
    const result = tactics.evalOpeningAoEDisable(ctx)
    assert.ok(result)
    assert.ok(result.action.aoeCenter)
    assert.strictEqual(typeof result.action.aoeCenter.x, 'number')
    assert.strictEqual(typeof result.action.aoeCenter.y, 'number')
    assert.strictEqual(result.action.targets, undefined)
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
    assert.ok(result)
    assert.strictEqual(result.action.spell, 'Dissonant Whispers')
    assert.strictEqual(result.action.target.id, f2.id) // targets the weakest
    assert.ok(result.reasoning.includes('DW'))
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
    assert.ok(result)
    assert.strictEqual(result.action.spell, 'Vicious Mockery')
    assert.ok(result.reasoning.includes('VM'))
  })

  it('does NOT trigger when active enemies remain', () => {
    const bard = makeBard()
    bard.concentrating = 'Hypnotic Pattern'
    const ctx = makeContext(bard, [makeFanatic()])
    assert.strictEqual(tactics.evalConcentrationAllDisabled(ctx), null)
  })

  it('does NOT trigger when not concentrating', () => {
    const bard = makeBard()
    const f1 = makeFanatic()
    f1.conditions.push('incapacitated', 'charmed_hp')
    const ctx = makeContext(bard, [f1])
    assert.strictEqual(tactics.evalConcentrationAllDisabled(ctx), null)
  })

  it('returns null when no helpless enemies (all dead)', () => {
    const bard = makeBard()
    bard.concentrating = 'Hypnotic Pattern'
    // No enemies at all
    const ctx = makeContext(bard, [])
    assert.strictEqual(tactics.evalConcentrationAllDisabled(ctx), null)
  })
})

describe('evalConcentrationMeleeViciousMockery', () => {
  it('triggers when concentrating with enemy in melee', () => {
    const bard = makeBard()
    bard.concentrating = 'Hypnotic Pattern'
    const f1 = makeFanatic({ position: { x: 1, y: 0 } }) // 5ft
    const ctx = makeContext(bard, [f1])

    const result = tactics.evalConcentrationMeleeViciousMockery(ctx)
    assert.ok(result)
    assert.strictEqual(result.action.spell, 'Vicious Mockery')
    assert.ok(result.reasoning.includes('melee'))
  })

  it('does NOT trigger without concentration', () => {
    const bard = makeBard()
    const f1 = makeFanatic({ position: { x: 1, y: 0 } })
    const ctx = makeContext(bard, [f1])
    assert.strictEqual(tactics.evalConcentrationMeleeViciousMockery(ctx), null)
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
    assert.ok(result)
    assert.strictEqual(result.action.type, 'attack')
    assert.ok(result.action.weapon.name.includes('Crossbow'))
  })

  it('does NOT trigger with 2+ active enemies', () => {
    const bard = makeBard()
    bard.concentrating = 'Something'
    const f1 = makeFanatic()
    f1.currentHP = 5
    const f2 = makeFanatic()
    const ctx = makeContext(bard, [f1, f2])
    assert.strictEqual(tactics.evalConcentrationFinishWithCrossbow(ctx), null)
  })

  it('does NOT trigger if target HP > 10', () => {
    const bard = makeBard()
    bard.concentrating = 'Something'
    const f1 = makeFanatic()
    f1.currentHP = 20
    const ctx = makeContext(bard, [f1])
    assert.strictEqual(tactics.evalConcentrationFinishWithCrossbow(ctx), null)
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
    assert.ok(result)
    assert.strictEqual(result.action.type, 'breath_weapon')
    assert.ok(result.action.aoeCenter)
  })

  it('does NOT trigger with 0 breath uses', () => {
    const bard = makeBard()
    bard.concentrating = 'HP'
    bard.breathWeapon.uses = 0
    const f1 = makeFanatic({ position: { x: 2, y: 0 } })
    const f2 = makeFanatic({ position: { x: 3, y: 0 } })
    const ctx = makeContext(bard, [f1, f2])
    assert.strictEqual(tactics.evalConcentrationBreathWeapon(ctx), null)
  })
})

describe('evalConcentrationRangedViciousMockery', () => {
  it('triggers when concentrating with active enemies at range', () => {
    const bard = makeBard()
    bard.concentrating = 'HP'
    const f1 = makeFanatic({ position: { x: 8, y: 0 } }) // 40ft
    const ctx = makeContext(bard, [f1])

    const result = tactics.evalConcentrationRangedViciousMockery(ctx)
    assert.ok(result)
    assert.strictEqual(result.action.spell, 'Vicious Mockery')
  })
})

describe('evalConcentrationSelfHeal', () => {
  it('returns bonus-action-only when concentrating and HP < 50%', () => {
    const bard = makeBard()
    bard.concentrating = 'HP'
    bard.currentHP = 30 // ~45%
    const ctx = makeContext(bard)

    const result = tactics.evalConcentrationSelfHeal(ctx)
    assert.ok(result)
    assert.ok(result._bonusActionOnly)
    assert.strictEqual(result.bonusAction.type, 'cast_healing_word')
  })

  it('does NOT trigger when HP >= 50%', () => {
    const bard = makeBard()
    bard.concentrating = 'HP'
    bard.currentHP = 50
    const ctx = makeContext(bard)
    assert.strictEqual(tactics.evalConcentrationSelfHeal(ctx), null)
  })

  it('does NOT trigger without concentration', () => {
    const bard = makeBard()
    bard.currentHP = 10
    const ctx = makeContext(bard)
    assert.strictEqual(tactics.evalConcentrationSelfHeal(ctx), null)
  })
})

describe('evalRecastHypnoticPattern', () => {
  it('triggers when not concentrating and 2+ active enemies with 3rd slot', () => {
    const bard = makeBard()
    const ctx = makeContext(bard, [makeFanatic(), makeFanatic()])
    const result = tactics.evalRecastHypnoticPattern(ctx)
    assert.ok(result)
    assert.strictEqual(result.action.spell, 'Hypnotic Pattern')
  })

  it('does NOT trigger with concentration active', () => {
    const bard = makeBard()
    bard.concentrating = 'Hypnotic Pattern'
    const ctx = makeContext(bard, [makeFanatic(), makeFanatic()])
    assert.strictEqual(tactics.evalRecastHypnoticPattern(ctx), null)
  })

  it('does NOT trigger with only 1 active enemy', () => {
    const bard = makeBard()
    const ctx = makeContext(bard, [makeFanatic()])
    assert.strictEqual(tactics.evalRecastHypnoticPattern(ctx), null)
  })
})

describe('evalCastHoldPerson', () => {
  it('triggers when not concentrating with 2nd level slot and active enemies', () => {
    const bard = makeBard()
    const f1 = makeFanatic()
    const ctx = makeContext(bard, [f1])
    const result = tactics.evalCastHoldPerson(ctx)
    assert.ok(result)
    assert.strictEqual(result.action.spell, 'Hold Person')
  })

  it('does NOT trigger with concentration active', () => {
    const bard = makeBard()
    bard.concentrating = 'Hex'
    const ctx = makeContext(bard, [makeFanatic()])
    assert.strictEqual(tactics.evalCastHoldPerson(ctx), null)
  })

  it('does NOT trigger against non-humanoid enemies', () => {
    const bard = makeBard()
    const zombie = createCreature('zombie', {
      id: `zombie-${++testId}`,
      position: { x: 2, y: 0 },
    })
    const ctx = makeContext(bard, [zombie])
    assert.strictEqual(tactics.evalCastHoldPerson(ctx), null)
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
    assert.ok(result)
    assert.strictEqual(result.action.spell, 'Hold Person')
    assert.strictEqual(result.action.target.id, fanatic.id)
  })
})

describe('evalFallbackCantrip', () => {
  it('picks Vicious Mockery when known', () => {
    const bard = makeBard()
    const f1 = makeFanatic()
    const ctx = makeContext(bard, [f1])
    const result = tactics.evalFallbackCantrip(ctx)
    assert.ok(result)
    assert.strictEqual(result.action.spell, 'Vicious Mockery')
  })

  it('picks Sacred Flame when VM not known', () => {
    const bard = makeBard()
    bard.spellsKnown = bard.spellsKnown.filter(s => s !== 'Vicious Mockery')
    bard.cantrips = ['Sacred Flame']
    bard.spellsKnown.push('Sacred Flame')
    const f1 = makeFanatic()
    const ctx = makeContext(bard, [f1])
    const result = tactics.evalFallbackCantrip(ctx)
    assert.ok(result)
    assert.strictEqual(result.action.spell, 'Sacred Flame')
  })

  it('returns null with no active enemies', () => {
    const bard = makeBard()
    const ctx = makeContext(bard)
    assert.strictEqual(tactics.evalFallbackCantrip(ctx), null)
  })
})

describe('evalDodge', () => {
  it('always returns dodge', () => {
    const result = tactics.evalDodge({})
    assert.ok(result)
    assert.strictEqual(result.action.type, 'dodge')
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
    assert.ok(result)
    assert.ok(result.reasoning.includes('invisible'))
  })

  it('does NOT trigger when enemy is visible', () => {
    const f1 = makeFanatic()
    const bard = makeBard()
    const ctx = makeContext(f1, [bard])
    assert.strictEqual(tactics.evalEnemyInvisibleFallback(ctx), null)
  })

  it('casts Shield of Faith on self when has slot and not concentrating', () => {
    const f1 = makeFanatic({ position: { x: 0, y: 0 } })
    const bard = makeBard()
    bard.conditions.push('invisible')
    const ctx = makeContext(f1, [bard])

    const result = tactics.evalEnemyInvisibleFallback(ctx)
    assert.ok(result)
    assert.strictEqual(result.action.spell, 'Shield of Faith')
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
    assert.ok(result)
    assert.strictEqual(result.action.type, 'shake_awake')
  })
})

describe('evalFlyingTargetRanged', () => {
  it('uses Hold Person against flying target', () => {
    const f1 = makeFanatic({ position: { x: 0, y: 0 } })
    const bard = makeBard()
    bard.flying = true
    const ctx = makeContext(f1, [bard], 1)

    const result = tactics.evalFlyingTargetRanged(ctx)
    assert.ok(result)
    assert.strictEqual(result.action.spell, 'Hold Person')
    assert.ok(result.reasoning.includes('flying'))
  })

  it('falls back to Sacred Flame vs flying when no Hold Person slot', () => {
    const f1 = makeFanatic({ position: { x: 0, y: 0 } })
    f1.spellSlots[2] = 0
    const bard = makeBard()
    bard.flying = true
    const ctx = makeContext(f1, [bard], 1)

    const result = tactics.evalFlyingTargetRanged(ctx)
    assert.ok(result)
    assert.strictEqual(result.action.spell, 'Sacred Flame')
  })

  it('does NOT trigger against grounded targets', () => {
    const f1 = makeFanatic({ position: { x: 0, y: 0 } })
    const bard = makeBard()
    const ctx = makeContext(f1, [bard])
    assert.strictEqual(tactics.evalFlyingTargetRanged(ctx), null)
  })

  it('does NOT trigger when ally already has Hold Person on target', () => {
    const f1 = makeFanatic({ position: { x: 0, y: 0 } })
    const f2 = makeFanatic({ name: 'AllyHolder', position: { x: 1, y: 0 } })
    f2.concentrating = 'Hold Person'
    const bard = makeBard()
    bard.flying = true
    const ctx = makeContext(f1, [bard, f2], 1)

    const result = tactics.evalFlyingTargetRanged(ctx)
    assert.ok(result)
    // Should fall back to Sacred Flame, not Hold Person
    assert.strictEqual(result.action.spell, 'Sacred Flame')
  })
})

describe('evalOpeningSpiritualWeapon', () => {
  it('triggers on round 1 with SW slot and target in melee', () => {
    const f1 = makeFanatic({ position: { x: 0, y: 0 } })
    const bard = makeBard({ position: { x: 1, y: 0 } })
    const ctx = makeContext(f1, [bard], 1)

    const result = tactics.evalOpeningSpiritualWeapon(ctx)
    assert.ok(result)
    assert.strictEqual(result.bonusAction.spell, 'Spiritual Weapon')
    assert.strictEqual(result.action.type, 'multiattack')
  })

  it('does NOT trigger after round 1', () => {
    const f1 = makeFanatic()
    const bard = makeBard({ position: { x: 1, y: 0 } })
    const ctx = makeContext(f1, [bard], 2)
    assert.strictEqual(tactics.evalOpeningSpiritualWeapon(ctx), null)
  })

  it('does NOT trigger if SW already active', () => {
    const f1 = makeFanatic()
    f1.spiritualWeapon = { active: true }
    const bard = makeBard({ position: { x: 1, y: 0 } })
    const ctx = makeContext(f1, [bard], 1)
    assert.strictEqual(tactics.evalOpeningSpiritualWeapon(ctx), null)
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
    assert.ok(result)
    assert.strictEqual(result.action.type, 'shake_awake')
    assert.strictEqual(result.action.target.name, 'Charmed')
  })

  it('does NOT trigger when no charmed allies', () => {
    const f1 = makeFanatic()
    const bard = makeBard()
    const ctx = makeContext(f1, [bard])
    assert.strictEqual(tactics.evalShakeAwakeAllies(ctx), null)
  })
})

describe('evalMeleeAttack', () => {
  it('uses multiattack when in melee with multiattack feature', () => {
    const f1 = makeFanatic({ position: { x: 0, y: 0 } })
    const bard = makeBard({ position: { x: 1, y: 0 } })
    const ctx = makeContext(f1, [bard])

    const result = tactics.evalMeleeAttack(ctx)
    assert.ok(result)
    assert.strictEqual(result.action.type, 'multiattack')
  })

  it('does NOT trigger when target out of melee range', () => {
    const f1 = makeFanatic({ position: { x: 0, y: 0 } })
    const bard = makeBard({ position: { x: 10, y: 0 } }) // 50ft
    const ctx = makeContext(f1, [bard])
    assert.strictEqual(tactics.evalMeleeAttack(ctx), null)
  })

  it('does NOT trigger when target is flying and unreachable', () => {
    const f1 = makeFanatic({ position: { x: 0, y: 0 } })
    const bard = makeBard({ position: { x: 0, y: 0 } })
    bard.flying = true
    const ctx = makeContext(f1, [bard])
    // distanceBetween returns 25ft when target is flying
    assert.strictEqual(tactics.evalMeleeAttack(ctx), null)
  })
})

describe('evalInflictWounds', () => {
  it('triggers in melee with 1st level slot', () => {
    const f1 = makeFanatic({ position: { x: 0, y: 0 } })
    const bard = makeBard({ position: { x: 1, y: 0 } })
    const ctx = makeContext(f1, [bard])

    const result = tactics.evalInflictWounds(ctx)
    assert.ok(result)
    assert.strictEqual(result.action.spell, 'Inflict Wounds')
  })

  it('does NOT trigger when out of melee', () => {
    const f1 = makeFanatic({ position: { x: 0, y: 0 } })
    const bard = makeBard({ position: { x: 10, y: 0 } })
    const ctx = makeContext(f1, [bard])
    assert.strictEqual(tactics.evalInflictWounds(ctx), null)
  })

  it('does NOT trigger without spell slots', () => {
    const f1 = makeFanatic({ position: { x: 0, y: 0 } })
    f1.spellSlots[1] = 0
    const bard = makeBard({ position: { x: 1, y: 0 } })
    const ctx = makeContext(f1, [bard])
    assert.strictEqual(tactics.evalInflictWounds(ctx), null)
  })
})

describe('evalRangedCantripWithApproach', () => {
  it('uses Sacred Flame + move toward', () => {
    const f1 = makeFanatic({ position: { x: 0, y: 0 } })
    const bard = makeBard({ position: { x: 10, y: 0 } })
    const ctx = makeContext(f1, [bard])

    const result = tactics.evalRangedCantripWithApproach(ctx)
    assert.ok(result)
    assert.strictEqual(result.action.spell, 'Sacred Flame')
    assert.ok(result.movement)
    assert.strictEqual(result.movement.type, 'move_toward')
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
    assert.ok(result)
    assert.strictEqual(result.type, 'cutting_words')
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
    assert.strictEqual(result, null)
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
    assert.strictEqual(result, null)
  })

  it('does NOT trigger if already reacted', () => {
    const bard = makeBard()
    bard.reactedThisRound = true
    bard.bardicInspirationUses = 3
    assert.strictEqual(tactics.evalCuttingWords(bard, {
      type: 'enemy_attack_roll',
      roll: 15, targetAC: 14, attacker: makeFanatic(),
    }), null)
  })

  it('does NOT trigger without inspiration uses', () => {
    const bard = makeBard()
    bard.bardicInspirationUses = 0
    assert.strictEqual(tactics.evalCuttingWords(bard, {
      type: 'enemy_attack_roll',
      roll: 15, targetAC: 14, attacker: makeFanatic(),
    }), null)
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
    assert.ok(result)
    assert.strictEqual(result.type, 'counterspell')
    assert.strictEqual(result.slotLevel, 3)
  })

  it('counters Inflict Wounds', () => {
    const bard = makeBard()
    const result = tactics.evalCounterspell(bard, {
      type: 'enemy_casting_spell',
      spell: 'Inflict Wounds',
      caster: makeFanatic(),
    })
    assert.ok(result)
    assert.strictEqual(result.type, 'counterspell')
  })

  it('does NOT counter non-dangerous spells', () => {
    const bard = makeBard()
    assert.strictEqual(tactics.evalCounterspell(bard, {
      type: 'enemy_casting_spell',
      spell: 'Light',
      caster: makeFanatic(),
    }), null)
  })

  it('does NOT trigger without 3rd level slot', () => {
    const bard = makeBard()
    bard.spellSlots[3] = 0
    assert.strictEqual(tactics.evalCounterspell(bard, {
      type: 'enemy_casting_spell',
      spell: 'Hold Person',
      caster: makeFanatic(),
    }), null)
  })

  it('does NOT trigger if already reacted', () => {
    const bard = makeBard()
    bard.reactedThisRound = true
    assert.strictEqual(tactics.evalCounterspell(bard, {
      type: 'enemy_casting_spell',
      spell: 'Hold Person',
      caster: makeFanatic(),
    }), null)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// PROFILES
// ═══════════════════════════════════════════════════════════════════════════

describe('Profile registry', () => {
  it('has lore_bard profile', () => {
    assert.ok(tactics.getProfile('lore_bard'))
    assert.ok(tactics.getProfile('lore_bard').length > 0)
  })

  it('has cult_fanatic profile', () => {
    assert.ok(tactics.getProfile('cult_fanatic'))
  })

  it('has generic profiles', () => {
    assert.ok(tactics.getProfile('generic_melee'))
    assert.ok(tactics.getProfile('generic_ranged'))
  })

  it('returns null for unknown profile', () => {
    assert.strictEqual(tactics.getProfile('nonexistent'), null)
  })

  it('lists all profile names', () => {
    const names = tactics.getProfileNames()
    assert.ok(names.includes('lore_bard'))
    assert.ok(names.includes('cult_fanatic'))
    assert.ok(names.includes('generic_melee'))
    assert.ok(names.includes('generic_ranged'))
  })

  it('allows runtime profile registration', () => {
    tactics.registerProfile('test_profile', [tactics.evalDodge])
    assert.ok(tactics.getProfile('test_profile'))
    assert.strictEqual(tactics.getProfile('test_profile').length, 1)
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

    assert.ok(decision)
    assert.strictEqual(decision.action.spell, 'Hypnotic Pattern')
    assert.ok(decision.reasoning.includes('ROUND 1'))
  })

  it('runs lore_bard — survival GI overrides round 1', () => {
    const bard = makeBard()
    bard.currentHP = 10
    const f1 = makeFanatic()
    const decision = tactics.makeDecision('lore_bard', bard, [bard, f1], 1)

    assert.ok(decision)
    assert.strictEqual(decision.action.spell, 'Greater Invisibility')
  })

  it('runs lore_bard — concentrating with all disabled → DW weakest', () => {
    const bard = makeBard()
    bard.concentrating = 'Hypnotic Pattern'
    const f1 = makeFanatic()
    f1.conditions.push('incapacitated', 'charmed_hp')
    const decision = tactics.makeDecision('lore_bard', bard, [bard, f1], 3)

    assert.strictEqual(decision.action.spell, 'Dissonant Whispers')
    assert.strictEqual(decision.action.target.id, f1.id)
  })

  it('runs lore_bard — merges self-heal bonus action', () => {
    const bard = makeBard()
    bard.concentrating = 'Hypnotic Pattern'
    bard.currentHP = 30 // ~45%, triggers self-heal
    const f1 = makeFanatic({ position: { x: 1, y: 0 } }) // in melee
    const decision = tactics.makeDecision('lore_bard', bard, [bard, f1], 3)

    // Should get Vicious Mockery action (melee eval) + Healing Word bonus
    assert.strictEqual(decision.action.spell, 'Vicious Mockery')
    assert.ok(decision.bonusAction)
    assert.strictEqual(decision.bonusAction.type, 'cast_healing_word')
  })

  it('runs cult_fanatic — round 1 opens with SW + multiattack', () => {
    const f1 = makeFanatic({ position: { x: 0, y: 0 } })
    const bard = makeBard({ position: { x: 1, y: 0 } })
    const decision = tactics.makeDecision('cult_fanatic', f1, [f1, bard], 1)

    assert.ok(decision)
    assert.strictEqual(decision.action.type, 'multiattack')
    assert.ok(decision.bonusAction)
    assert.strictEqual(decision.bonusAction.spell, 'Spiritual Weapon')
  })

  it('runs cult_fanatic — invisible target → Shield of Faith', () => {
    const f1 = makeFanatic({ position: { x: 0, y: 0 } })
    const bard = makeBard()
    bard.conditions.push('invisible')
    const decision = tactics.makeDecision('cult_fanatic', f1, [f1, bard], 2)

    assert.strictEqual(decision.action.spell, 'Shield of Faith')
  })

  it('runs cult_fanatic — flying target → Hold Person', () => {
    const f1 = makeFanatic({ position: { x: 0, y: 0 } })
    const bard = makeBard()
    bard.flying = true
    const decision = tactics.makeDecision('cult_fanatic', f1, [f1, bard], 2)

    assert.strictEqual(decision.action.spell, 'Hold Person')
  })

  it('runs cult_fanatic — shakes charmed ally', () => {
    const f1 = makeFanatic({ position: { x: 0, y: 0 } })
    const f2 = makeFanatic({ name: 'Charmed', position: { x: 1, y: 0 } })
    f2.conditions.push('charmed_hp')
    const bard = makeBard({ position: { x: 5, y: 0 } })
    const decision = tactics.makeDecision('cult_fanatic', f1, [f1, bard, f2], 3)

    assert.strictEqual(decision.action.type, 'shake_awake')
  })

  it('throws for unknown profile', () => {
    assert.throws(
      () => tactics.makeDecision('nonexistent', makeBard(), [], 1),
      /Unknown AI profile/,
    )
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
    assert.ok(reaction)
    assert.strictEqual(reaction.type, 'cutting_words')
  })

  it('lore_bard Counterspell on Hold Person', () => {
    const bard = makeBard()
    const reaction = tactics.makeReaction('lore_bard', bard, {
      type: 'enemy_casting_spell',
      spell: 'Hold Person',
      caster: makeFanatic(),
    })
    assert.ok(reaction)
    assert.strictEqual(reaction.type, 'counterspell')
  })

  it('cult_fanatic has no reactions', () => {
    const f1 = makeFanatic()
    const reaction = tactics.makeReaction('cult_fanatic', f1, {
      type: 'enemy_attack_roll',
      roll: 20, targetAC: 13, attacker: makeBard(),
    })
    assert.strictEqual(reaction, null)
  })

  it('unknown profile returns null', () => {
    const reaction = tactics.makeReaction('ghost', makeBard(), {
      type: 'enemy_attack_roll', roll: 20, targetAC: 14, attacker: makeFanatic(),
    })
    assert.strictEqual(reaction, null)
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
    assert.ok(bardDecision)
    assert.strictEqual(bardDecision.action.spell, 'Hypnotic Pattern')

    const fanaticDecision = getDecision(f1, [bard, f1], 1, [])
    assert.ok(fanaticDecision)
    // Fanatic round 1 depends on position — should get some valid action
    assert.ok(fanaticDecision.action)
  })

  it('creates a getDecision function from resolver function', () => {
    const resolver = (c) => c.side === 'party' ? 'lore_bard' : 'cult_fanatic'
    const getDecision = tactics.makeTacticalAI(resolver)

    const bard = makeBard()
    const f1 = makeFanatic()
    const decision = getDecision(bard, [bard, f1], 1, [])
    assert.ok(decision)
    assert.strictEqual(decision.action.spell, 'Hypnotic Pattern')
  })

  it('falls back to generic_melee for unknown combatants', () => {
    const getDecision = tactics.makeTacticalAI({})
    const creature = makeFanatic()
    const enemy = makeBard({ position: { x: 1, y: 0 } })
    
    // generic_melee with enemy in melee should try to attack
    const decision = getDecision(creature, [creature, enemy], 2, [])
    assert.ok(decision)
    // Should get melee attack or dodge
    assert.ok(['multiattack', 'attack', 'dodge'].includes(decision.action.type))
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
    assert.ok(reaction)
    assert.strictEqual(reaction.type, 'cutting_words')
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
    assert.ok(result.winner)
    assert.ok(result.rounds > 0)
    assert.strictEqual(result.analytics.length, 3)
    assert.ok(result.log.length > 0)
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
    assert.ok(result)
    assert.strictEqual(result.action.type, 'breath_weapon')
    assert.ok(result.action.aoeCenter)
  })

  it('skips breath weapon when no uses remain', () => {
    const dragon = makeDragon()
    dragon.breathWeapon.uses = 0
    const bard = makeBard({ position: { x: 6, y: 0 } })
    const ctx = makeContext(dragon, [bard], 1)
    const result = tactics.evalDragonBreathWeapon(ctx)
    assert.strictEqual(result, null)
  })

  it('skips breath weapon after round 1 with only 1 target', () => {
    const dragon = makeDragon()
    const bard = makeBard({ position: { x: 6, y: 0 } })
    const ctx = makeContext(dragon, [bard], 3)
    const result = tactics.evalDragonBreathWeapon(ctx)
    assert.strictEqual(result, null)
  })
})

describe('Dragon profile — evalDragonMultiattack', () => {
  it('uses multiattack when available', () => {
    const dragon = makeDragon()
    const bard = makeBard({ position: { x: 6, y: 0 } })
    const ctx = makeContext(dragon, [bard], 2)
    const result = tactics.evalDragonMultiattack(ctx)
    assert.ok(result)
    assert.strictEqual(result.action.type, 'multiattack')
  })
})

describe('evalDragonFear', () => {
  it('triggers when 2+ enemies are within dragon fear cone range', () => {
    const bard = makeBard({ position: { x: 0, y: 0 } })
    const f1 = makeFanatic({ position: { x: 3, y: 0 } }) // 15ft — within 30ft cone
    const f2 = makeFanatic({ position: { x: 4, y: 0 } }) // 20ft — within 30ft cone
    const ctx = makeContext(bard, [f1, f2])

    const result = tactics.evalDragonFear(ctx)
    assert.ok(result)
    assert.strictEqual(result.action.type, 'dragon_fear')
    assert.ok(result.action.aoeCenter)
  })

  it('does not trigger with 0 dragonFear uses (shared breath pool exhausted)', () => {
    const bard = makeBard({ position: { x: 0, y: 0 } })
    bard.dragonFear.uses = 0
    bard.breathWeapon.uses = 0  // shared PB pool
    const f1 = makeFanatic({ position: { x: 3, y: 0 } })
    const f2 = makeFanatic({ position: { x: 4, y: 0 } })
    const ctx = makeContext(bard, [f1, f2])

    assert.strictEqual(tactics.evalDragonFear(ctx), null)
  })

  it('does not trigger when creature has no dragonFear', () => {
    const bard = makeBard({ position: { x: 0, y: 0 } })
    delete bard.dragonFear
    const f1 = makeFanatic({ position: { x: 3, y: 0 } })
    const ctx = makeContext(bard, [f1])

    assert.strictEqual(tactics.evalDragonFear(ctx), null)
  })

  it('does not trigger with only 1 enemy in range', () => {
    const bard = makeBard({ position: { x: 0, y: 0 } })
    const f1 = makeFanatic({ position: { x: 3, y: 0 } }) // within range
    const f2 = makeFanatic({ position: { x: 20, y: 0 } }) // way outside
    const ctx = makeContext(bard, [f1, f2])

    assert.strictEqual(tactics.evalDragonFear(ctx), null)
  })
})

describe('Dragon profile — makeDecision', () => {
  it('prioritizes breath weapon over multiattack on round 1', () => {
    const dragon = makeDragon()
    const bard = makeBard({ position: { x: 6, y: 0 } })
    const decision = tactics.makeDecision('dragon', dragon, [dragon, bard], 1)
    assert.strictEqual(decision.action.type, 'breath_weapon')
  })

  it('falls back to multiattack when breath weapon exhausted', () => {
    const dragon = makeDragon()
    dragon.breathWeapon.uses = 0
    const bard = makeBard({ position: { x: 6, y: 0 } })
    const decision = tactics.makeDecision('dragon', dragon, [dragon, bard], 2)
    assert.strictEqual(decision.action.type, 'multiattack')
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
    assert.ok(result)
    assert.strictEqual(result.action.type, 'attack')
    assert.strictEqual(result.action.weapon.type, 'ranged')
  })

  it('does not throw rock when in melee range and target grounded', () => {
    const giant = makeHillGiant({ position: { x: 0, y: 0 } })
    const bard = makeBard({ position: { x: 1, y: 0 } })
    const ctx = makeContext(giant, [bard], 2)
    const result = tactics.evalGiantRockThrow(ctx)
    assert.strictEqual(result, null)
  })
})

describe('Giant Bruiser profile — evalGiantMelee', () => {
  it('uses multiattack when available', () => {
    const giant = makeHillGiant({ position: { x: 0, y: 0 } })
    const bard = makeBard({ position: { x: 1, y: 0 } })
    const ctx = makeContext(giant, [bard], 2)
    const result = tactics.evalGiantMelee(ctx)
    assert.ok(result)
    assert.strictEqual(result.action.type, 'multiattack')
  })

  it('includes movement when target is distant', () => {
    const giant = makeHillGiant({ position: { x: 0, y: 0 } })
    const bard = makeBard({ position: { x: 10, y: 0 } })
    const ctx = makeContext(giant, [bard], 2)
    const result = tactics.evalGiantMelee(ctx)
    assert.ok(result)
    assert.ok(result.movement)
    assert.strictEqual(result.movement.type, 'move_toward')
  })
})

describe('Giant Bruiser profile — makeDecision', () => {
  it('throws rocks at flying targets', () => {
    const giant = makeHillGiant()
    const bard = makeBard({ position: { x: 6, y: 0 } })
    bard.flying = true
    const decision = tactics.makeDecision('giant_bruiser', giant, [giant, bard], 2)
    assert.strictEqual(decision.action.type, 'attack')
  })

  it('uses melee when in range', () => {
    const giant = makeHillGiant({ position: { x: 0, y: 0 } })
    const bard = makeBard({ position: { x: 1, y: 0 } })
    const decision = tactics.makeDecision('giant_bruiser', giant, [giant, bard], 2)
    assert.strictEqual(decision.action.type, 'multiattack')
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
    assert.ok(result)
    assert.strictEqual(result.action.spell, 'Fireball')
    assert.ok(result.action.aoeCenter)
    assert.strictEqual(result.action.targets, undefined)
  })

  it('skips Fireball when no 3rd level slots', () => {
    const mage = makeMage()
    mage.spellSlots[3] = 0
    const bard = makeBard({ position: { x: 6, y: 0 } })
    const ctx = makeContext(mage, [bard], 1)
    const result = tactics.evalMageFireball(ctx)
    assert.strictEqual(result, null)
  })
})

describe('Mage profile — evalMageFireBolt', () => {
  it('casts Fire Bolt at enemies', () => {
    const mage = makeMage()
    const bard = makeBard({ position: { x: 6, y: 0 } })
    const ctx = makeContext(mage, [bard], 3)
    const result = tactics.evalMageFireBolt(ctx)
    assert.ok(result)
    assert.strictEqual(result.action.spell, 'Fire Bolt')
  })
})

describe('Mage profile — evalMageMistyStep', () => {
  it('uses Misty Step when enemy in melee', () => {
    const mage = makeMage({ position: { x: 0, y: 0 } })
    const bard = makeBard({ position: { x: 1, y: 0 } })
    const ctx = makeContext(mage, [bard], 2)
    const result = tactics.evalMageMistyStep(ctx)
    assert.ok(result)
    assert.ok(result._bonusActionOnly)
    assert.strictEqual(result.bonusAction.spell, 'Misty Step')
  })

  it('skips Misty Step when no enemies in melee', () => {
    const mage = makeMage()
    const bard = makeBard({ position: { x: 10, y: 0 } })
    const ctx = makeContext(mage, [bard], 2)
    const result = tactics.evalMageMistyStep(ctx)
    assert.strictEqual(result, null)
  })
})

describe('Mage profile — makeDecision', () => {
  it('opens with Fireball', () => {
    const mage = makeMage()
    const bard = makeBard({ position: { x: 6, y: 0 } })
    const decision = tactics.makeDecision('mage_caster', mage, [mage, bard], 1)
    assert.strictEqual(decision.action.spell, 'Fireball')
  })

  it('falls back to Fire Bolt when out of slots', () => {
    const mage = makeMage()
    mage.spellSlots = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
    const bard = makeBard({ position: { x: 6, y: 0 } })
    const decision = tactics.makeDecision('mage_caster', mage, [mage, bard], 3)
    assert.strictEqual(decision.action.spell, 'Fire Bolt')
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
    assert.ok(result)
    assert.strictEqual(result.action.spell, 'Cone of Cold')
  })

  it('skips Cone of Cold after round 2', () => {
    const arch = makeArchmage()
    const bard = makeBard({ position: { x: 6, y: 0 } })
    const ctx = makeContext(arch, [bard], 3)
    const result = tactics.evalArchmageConeOfCold(ctx)
    assert.strictEqual(result, null)
  })
})

describe('Archmage profile — makeDecision', () => {
  it('uses Cone of Cold before Fireball', () => {
    const arch = makeArchmage()
    const bard = makeBard({ position: { x: 6, y: 0 } })
    const decision = tactics.makeDecision('archmage_caster', arch, [arch, bard], 1)
    assert.strictEqual(decision.action.spell, 'Cone of Cold')
  })

  it('falls back to Fireball after Cone of Cold used', () => {
    const arch = makeArchmage()
    arch.spellSlots[5] = 0
    const bard = makeBard({ position: { x: 6, y: 0 } })
    const decision = tactics.makeDecision('archmage_caster', arch, [arch, bard], 3)
    assert.strictEqual(decision.action.spell, 'Fireball')
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
    assert.ok(result)
    assert.strictEqual(result.action.spell, 'Power Word Stun')
  })

  it('skips PW:Stun when no 8th level slots', () => {
    const lich = makeLich()
    lich.spellSlots[8] = 0
    const bard = makeBard({ position: { x: 6, y: 0 } })
    const ctx = makeContext(lich, [bard], 1)
    const result = tactics.evalLichPowerWordStun(ctx)
    assert.strictEqual(result, null)
  })
})

describe('Lich profile — evalLichFingerOfDeath', () => {
  it('uses Finger of Death for heavy damage', () => {
    const lich = makeLich()
    const bard = makeBard({ position: { x: 6, y: 0 } })
    const ctx = makeContext(lich, [bard], 2)
    const result = tactics.evalLichFingerOfDeath(ctx)
    assert.ok(result)
    assert.strictEqual(result.action.spell, 'Finger of Death')
  })

  it('skips when no 7th level slots', () => {
    const lich = makeLich()
    lich.spellSlots[7] = 0
    const bard = makeBard({ position: { x: 6, y: 0 } })
    const ctx = makeContext(lich, [bard], 2)
    const result = tactics.evalLichFingerOfDeath(ctx)
    assert.strictEqual(result, null)
  })
})

describe('Lich profile — evalLichCloudkill', () => {
  it('uses Cloudkill when 2+ enemies and not concentrating', () => {
    const lich = makeLich()
    const bard1 = makeBard({ id: 'bard-a', position: { x: 6, y: 0 } })
    const bard2 = makeBard({ id: 'bard-b', position: { x: 6, y: 1 } })
    const ctx = makeContext(lich, [bard1, bard2], 2)
    const result = tactics.evalLichCloudkill(ctx)
    assert.ok(result)
    assert.strictEqual(result.action.spell, 'Cloudkill')
  })

  it('skips Cloudkill when already concentrating', () => {
    const lich = makeLich()
    lich.concentrating = 'Something'
    const bard1 = makeBard({ id: 'bard-a', position: { x: 6, y: 0 } })
    const bard2 = makeBard({ id: 'bard-b', position: { x: 6, y: 1 } })
    const ctx = makeContext(lich, [bard1, bard2], 2)
    const result = tactics.evalLichCloudkill(ctx)
    assert.strictEqual(result, null)
  })
})

describe('Lich profile — evalLegendaryResistance (reaction)', () => {
  it('auto-succeeds a failed save', () => {
    const lich = makeLich()
    const result = tactics.evalLegendaryResistance(lich, {
      type: 'failed_save',
      spell: 'Hypnotic Pattern',
    })
    assert.ok(result)
    assert.strictEqual(result.type, 'legendary_resistance')
  })

  it('skips when no uses remain', () => {
    const lich = makeLich()
    lich.legendaryResistance.uses = 0
    const result = tactics.evalLegendaryResistance(lich, {
      type: 'failed_save',
      spell: 'Hypnotic Pattern',
    })
    assert.strictEqual(result, null)
  })
})

describe('Lich profile — makeDecision', () => {
  it('prioritizes PW:Stun over Finger of Death', () => {
    const lich = makeLich()
    const bard = makeBard({ position: { x: 6, y: 0 } })
    bard.currentHP = 67
    const decision = tactics.makeDecision('lich_caster', lich, [lich, bard], 1)
    assert.strictEqual(decision.action.spell, 'Power Word Stun')
  })

  it('falls to Finger of Death when PW:Stun slot spent', () => {
    const lich = makeLich()
    lich.spellSlots[8] = 0
    const bard = makeBard({ position: { x: 6, y: 0 } })
    const decision = tactics.makeDecision('lich_caster', lich, [lich, bard], 2)
    assert.strictEqual(decision.action.spell, 'Finger of Death')
  })

  it('falls to Fireball when high slots spent', () => {
    const lich = makeLich()
    lich.spellSlots[8] = 0
    lich.spellSlots[7] = 0
    lich.spellSlots[5] = 0
    const bard = makeBard({ position: { x: 6, y: 0 } })
    const decision = tactics.makeDecision('lich_caster', lich, [lich, bard], 3)
    assert.strictEqual(decision.action.spell, 'Fireball')
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
    assert.strictEqual(decision.action.type === 'attack' || decision.action.type === 'multiattack', true)
  })

  it('approaches when too far for melee', () => {
    const zombie = createCreature('zombie', { id: 'zombie-1', position: { x: 0, y: 0 } })
    const bard = makeBard({ position: { x: 20, y: 0 } })
    const decision = tactics.makeDecision('undead_melee', zombie, [zombie, bard], 2)
    assert.ok(decision.movement)
    assert.strictEqual(decision.movement.type, 'move_toward')
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
      assert.ok(p)
      assert.ok(p.length > 0)
    })

    it(`profile '${profile}' has a matching reaction profile`, () => {
      assert.strictEqual(profile in tactics.REACTION_PROFILES, true)
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
    assert.strictEqual(ctx.activeEnemies.length, 1)
    assert.strictEqual(ctx.helplessEnemies.length, 1)
    assert.strictEqual(ctx.helplessEnemies[0].name, 'Paralyzed')
  })

  it('helplessEnemies is empty when no enemies are incapacitated', () => {
    const bard = makeBard()
    const f1 = makeFanatic({ name: 'Active1' })
    const f2 = makeFanatic({ name: 'Active2' })

    const ctx = makeContext(bard, [f1, f2])
    assert.strictEqual(ctx.helplessEnemies.length, 0)
    assert.strictEqual(ctx.activeEnemies.length, 2)
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
    assert.strictEqual(ctx.activeEnemies.length, 0)
    assert.strictEqual(ctx.helplessEnemies.length, 1)

    // Make a decision — cult_fanatic profile should pick evalAttackHelpless
    const decision = tactics.makeDecision('cult_fanatic', fanatic, [fanatic, bard], 2)
    assert.ok(decision)
    assert.ok(
      decision.reasoning.includes('helpless') || decision.action.type === 'attack' || decision.action.type === 'multiattack'
    )
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
    assert.strictEqual(ctx.activeEnemies.length, 1)
    assert.strictEqual(ctx.helplessEnemies.length, 1)

    // Decision should target the active bard, not the helpless one
    const decision = tactics.makeDecision('cult_fanatic', fanatic, [fanatic, bard1, bard2], 2)
    assert.ok(decision)
    // The cult_fanatic should use melee/ranged evaluators targeting the active bard
    assert.strictEqual(decision.reasoning.includes('helpless'), false)
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
    assert.ok(result)
    assert.strictEqual(result.action.spell, 'Dissonant Whispers')
  })

  it('triggers when there are multiple active enemies', () => {
    const bard = makeBard()
    bard.concentrating = null
    const f1 = makeFanatic({ position: { x: 6, y: 0 } })
    const f2 = makeFanatic({ position: { x: 7, y: 0 } })
    const ctx = makeContext(bard, [f1, f2])
    const result = tactics.evalOffensiveDissonantWhispers(ctx)
    assert.ok(result)
    assert.strictEqual(result.action.spell, 'Dissonant Whispers')
  })

  it('does NOT trigger when concentrating', () => {
    const bard = makeBard()
    bard.concentrating = 'Hypnotic Pattern'
    const f1 = makeFanatic({ position: { x: 6, y: 0 } })
    const ctx = makeContext(bard, [f1])
    const result = tactics.evalOffensiveDissonantWhispers(ctx)
    assert.strictEqual(result, null)
  })

  it('does NOT trigger with zero enemies', () => {
    const bard = makeBard()
    bard.concentrating = null
    const ctx = makeContext(bard, [])
    const result = tactics.evalOffensiveDissonantWhispers(ctx)
    assert.strictEqual(result, null)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// SPELL UPCASTING — findLowestAvailableSlot + evaluator slot selection
// ═══════════════════════════════════════════════════════════════════════════

describe('findLowestAvailableSlot', () => {
  it('returns minLevel when that slot is available', () => {
    assert.strictEqual(tactics.findLowestAvailableSlot({ 1: 2, 2: 1, 3: 1 }, 1), 1)
  })

  it('returns next available slot when minLevel is exhausted', () => {
    assert.strictEqual(tactics.findLowestAvailableSlot({ 1: 0, 2: 0, 3: 1 }, 1), 3)
  })

  it('returns null when all slots are exhausted', () => {
    assert.strictEqual(tactics.findLowestAvailableSlot({ 1: 0, 2: 0, 3: 0 }, 1), null)
  })

  it('returns null when spellSlots is null', () => {
    assert.strictEqual(tactics.findLowestAvailableSlot(null, 1), null)
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
    assert.ok(result)
    assert.strictEqual(result.action.level, 2)
  })

  it('uses level 1 when available (lowest slot first)', () => {
    const bard = makeBard()
    bard.concentrating = null
    bard.spellSlots = { 1: 1, 2: 1, 3: 1, 4: 1 }
    const f1 = makeFanatic({ position: { x: 6, y: 0 } })
    const ctx = makeContext(bard, [f1])
    const result = tactics.evalOffensiveDissonantWhispers(ctx)
    assert.ok(result)
    assert.strictEqual(result.action.level, 1)
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
    assert.ok(result)
    assert.strictEqual(result.action.level, 3)
  })
})
