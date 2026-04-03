/**
 * Combat Mechanics — unit tests
 * Tests saving throws, attack rolls, damage, concentration, conditions, breakConcentration.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import * as dice from '../src/engine/dice.js'
import * as mech from '../src/engine/mechanics.js'

before(() => dice.setDiceMode('average'))
after(() => dice.setDiceMode('random'))

// ═══════════════════════════════════════════════════════════════════════════
// Helper — minimal creature for testing
// ═══════════════════════════════════════════════════════════════════════════

function makeCreature(overrides = {}) {
  return {
    name: overrides.name || 'TestCreature',
    currentHP: overrides.currentHP ?? 30,
    maxHP: overrides.maxHP ?? 30,
    ac: overrides.ac ?? 14,
    saves: { con: 2, dex: 1, wis: 0, str: 0, int: 0, cha: 0, ...overrides.saves },
    conditions: overrides.conditions ? [...overrides.conditions] : [],
    concentrating: overrides.concentrating || null,
    concentrationRoundsRemaining: overrides.concentrationRoundsRemaining || 0,
    hasWarCaster: overrides.hasWarCaster || false,
    flying: overrides.flying || false,
    position: overrides.position || { x: 0, y: 0 },
    ...overrides,
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// makeAbilityCheck
// ═══════════════════════════════════════════════════════════════════════════

describe('makeAbilityCheck', () => {
  it('succeeds when total >= DC', () => {
    const result = mech.makeAbilityCheck(3, 13)
    assert.strictEqual(result.roll, 10.5)
    assert.strictEqual(result.total, 13.5)
    assert.strictEqual(result.dc, 13)
    assert.strictEqual(result.success, true)
  })

  it('fails when total < DC', () => {
    assert.strictEqual(mech.makeAbilityCheck(0, 15).success, false)
  })

  it('succeeds when total exactly equals DC', () => {
    assert.strictEqual(mech.makeAbilityCheck(5, 15).success, true)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// makeSavingThrow
// ═══════════════════════════════════════════════════════════════════════════

describe('makeSavingThrow', () => {
  it('normal save — no advantage or disadvantage', () => {
    const result = mech.makeSavingThrow(5, 14)
    assert.strictEqual(result.result, 10.5)
    assert.strictEqual(result.saveBonus, 5)
    assert.strictEqual(result.total, 15.5)
    assert.strictEqual(result.success, true)
    assert.strictEqual(result.type, 'normal')
  })

  it('save fails when total < DC', () => {
    const result = mech.makeSavingThrow(0, 14)
    assert.strictEqual(result.total, 10.5)
    assert.strictEqual(result.saveBonus, 0)
    assert.strictEqual(result.success, false)
  })

  it('returns saveBonus in result', () => {
    const result = mech.makeSavingThrow(-1, 10)
    assert.strictEqual(result.saveBonus, -1)
    assert.strictEqual(typeof result.saveBonus, 'number')
    assert.strictEqual(result.total, 10.5 + (-1))
  })

  it('advantage save returns type "advantage"', () => {
    const result = mech.makeSavingThrow(3, 10, true, false)
    assert.strictEqual(result.type, 'advantage')
    assert.strictEqual(result.success, true)
  })

  it('disadvantage save returns type "disadvantage"', () => {
    assert.strictEqual(mech.makeSavingThrow(3, 10, false, true).type, 'disadvantage')
  })

  it('both advantage and disadvantage cancel to normal', () => {
    assert.strictEqual(mech.makeSavingThrow(3, 10, true, true).type, 'normal')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// makeAttackRoll
// ═══════════════════════════════════════════════════════════════════════════

describe('makeAttackRoll', () => {
  it('hits when total >= target AC', () => {
    const result = mech.makeAttackRoll(5, 15)
    assert.strictEqual(result.natural, 10.5)
    assert.strictEqual(result.total, 15.5)
    assert.strictEqual(result.hits, true)
    assert.strictEqual(result.isCrit, false)
    assert.strictEqual(result.isMiss, false)
  })

  it('misses when total < target AC', () => {
    assert.strictEqual(mech.makeAttackRoll(2, 15).hits, false)
  })

  it('advantage sets type correctly', () => {
    assert.strictEqual(mech.makeAttackRoll(5, 15, true, false).type, 'advantage')
  })

  it('disadvantage sets type correctly', () => {
    assert.strictEqual(mech.makeAttackRoll(5, 15, false, true).type, 'disadvantage')
  })

  it('both cancel to normal', () => {
    assert.strictEqual(mech.makeAttackRoll(5, 15, true, true).type, 'normal')
  })
})

describe('makeAttackRoll — natural 20 and natural 1 (random mode)', () => {
  before(() => dice.setDiceMode('random'))
  after(() => dice.setDiceMode('average'))

  it('natural 20 always hits regardless of AC', () => {
    const orig = Math.random
    Math.random = () => (20 - 1) / 20
    try {
      const result = mech.makeAttackRoll(0, 30)
      assert.strictEqual(result.natural, 20)
      assert.strictEqual(result.isCrit, true)
      assert.strictEqual(result.hits, true)
    } finally {
      Math.random = orig
    }
  })

  it('natural 1 always misses regardless of bonus', () => {
    const orig = Math.random
    Math.random = () => 0
    try {
      const result = mech.makeAttackRoll(30, 10)
      assert.strictEqual(result.natural, 1)
      assert.strictEqual(result.isMiss, true)
      assert.strictEqual(result.hits, false)
    } finally {
      Math.random = orig
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// rollDamage
// ═══════════════════════════════════════════════════════════════════════════

describe('rollDamage', () => {
  it('1d8+3 in average mode = 4.5 + 3 = 7.5', () => {
    const result = mech.rollDamage('1d8', 3)
    assert.deepStrictEqual(result.rolls, [4.5])
    assert.strictEqual(result.bonus, 3)
    assert.strictEqual(result.total, 7.5)
    assert.strictEqual(result.crit, false)
  })

  it('2d6+2 in average mode = 7 + 2 = 9', () => {
    const result = mech.rollDamage('2d6', 2)
    assert.deepStrictEqual(result.rolls, [3.5, 3.5])
    assert.strictEqual(result.total, 9)
  })

  it('crit doubles dice count: 1d8 crit → 2d8', () => {
    const result = mech.rollDamage('1d8', 3, true)
    assert.strictEqual(result.rolls.length, 2)
    assert.deepStrictEqual(result.rolls, [4.5, 4.5])
    assert.strictEqual(result.total, 12) // 4.5+4.5+3
    assert.strictEqual(result.crit, true)
  })

  it('3d10 crit → 6d10', () => {
    const result = mech.rollDamage('3d10', 0, true)
    assert.strictEqual(result.rolls.length, 6)
    assert.strictEqual(result.total, 33) // 6*5.5
  })

  it('rejects invalid dice string', () => {
    assert.throws(() => mech.rollDamage('banana', 0), /Invalid dice string/)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// concentrationSave
// ═══════════════════════════════════════════════════════════════════════════

describe('concentrationSave', () => {
  it('DC is 10 for low damage', () => {
    const creature = makeCreature({ saves: { con: 5 } })
    const result = mech.concentrationSave(creature, 8)
    assert.strictEqual(result.dc, 10)
    assert.strictEqual(result.total, 15.5)
    assert.strictEqual(result.success, true)
  })

  it('DC scales with high damage', () => {
    const creature = makeCreature({ saves: { con: 2 } })
    const result = mech.concentrationSave(creature, 30)
    assert.strictEqual(result.dc, 15)
    assert.strictEqual(result.total, 12.5)
    assert.strictEqual(result.success, false)
  })

  it('War Caster grants advantage', () => {
    const creature = makeCreature({ saves: { con: 3 }, hasWarCaster: true })
    assert.strictEqual(mech.concentrationSave(creature, 10).type, 'advantage')
  })

  it('no War Caster = normal roll', () => {
    const creature = makeCreature({ saves: { con: 3 } })
    assert.strictEqual(mech.concentrationSave(creature, 10).type, 'normal')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Condition helpers
// ═══════════════════════════════════════════════════════════════════════════

describe('isIncapacitated', () => {
  it('returns false with no conditions', () => {
    assert.strictEqual(mech.isIncapacitated(makeCreature()), false)
  })

  for (const cond of ['paralyzed', 'stunned', 'unconscious', 'charmed_hp', 'incapacitated']) {
    it(`returns true for "${cond}"`, () => {
      assert.strictEqual(mech.isIncapacitated(makeCreature({ conditions: [cond] })), true)
    })
  }

  it('returns false for non-incapacitating conditions', () => {
    assert.strictEqual(mech.isIncapacitated(makeCreature({ conditions: ['invisible', 'frightened'] })), false)
  })
})

describe('isAlive', () => {
  it('returns true when HP > 0', () => {
    assert.strictEqual(mech.isAlive(makeCreature({ currentHP: 1 })), true)
  })

  it('returns false when HP = 0', () => {
    assert.strictEqual(mech.isAlive(makeCreature({ currentHP: 0 })), false)
  })
})

describe('hasCondition', () => {
  it('returns true when creature has the condition', () => {
    assert.strictEqual(mech.hasCondition(makeCreature({ conditions: ['paralyzed'] }), 'paralyzed'), true)
  })

  it('returns false when creature lacks the condition', () => {
    assert.strictEqual(mech.hasCondition(makeCreature(), 'paralyzed'), false)
  })
})

describe('addCondition', () => {
  it('adds a new condition', () => {
    const c = makeCreature()
    mech.addCondition(c, 'invisible')
    assert.ok(c.conditions.includes('invisible'))
  })

  it('does not duplicate an existing condition', () => {
    const c = makeCreature({ conditions: ['invisible'] })
    mech.addCondition(c, 'invisible')
    assert.strictEqual(c.conditions.filter(x => x === 'invisible').length, 1)
  })
})

describe('removeCondition', () => {
  it('removes an existing condition and returns true', () => {
    const c = makeCreature({ conditions: ['paralyzed', 'invisible'] })
    assert.strictEqual(mech.removeCondition(c, 'paralyzed'), true)
    assert.ok(!c.conditions.includes('paralyzed'))
  })

  it('returns false for non-existent condition', () => {
    assert.strictEqual(mech.removeCondition(makeCreature(), 'paralyzed'), false)
  })
})

describe('removeAllConditions', () => {
  it('removes all instances of named conditions', () => {
    const c = makeCreature({ conditions: ['charmed_hp', 'incapacitated', 'invisible'] })
    mech.removeAllConditions(c, 'charmed_hp', 'incapacitated')
    assert.deepStrictEqual(c.conditions, ['invisible'])
  })

  it('leaves creature unchanged if no matching conditions', () => {
    const c = makeCreature({ conditions: ['invisible'] })
    mech.removeAllConditions(c, 'paralyzed')
    assert.deepStrictEqual(c.conditions, ['invisible'])
  })
})

describe('getActiveEnemies', () => {
  it('excludes dead and incapacitated', () => {
    const enemies = [
      makeCreature({ name: 'alive', currentHP: 10 }),
      makeCreature({ name: 'dead', currentHP: 0 }),
      makeCreature({ name: 'incap', currentHP: 10, conditions: ['paralyzed'] }),
    ]
    const active = mech.getActiveEnemies(enemies)
    assert.strictEqual(active.length, 1)
    assert.strictEqual(active[0].name, 'alive')
  })
})

describe('getAllAliveEnemies', () => {
  it('includes incapacitated but alive creatures', () => {
    const enemies = [
      makeCreature({ name: 'alive', currentHP: 10 }),
      makeCreature({ name: 'dead', currentHP: 0 }),
      makeCreature({ name: 'incap', currentHP: 10, conditions: ['paralyzed'] }),
    ]
    assert.strictEqual(mech.getAllAliveEnemies(enemies).length, 2)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// breakConcentration
// ═══════════════════════════════════════════════════════════════════════════

describe('breakConcentration', () => {
  it('Hypnotic Pattern — removes charmed_hp AND incapacitated from all', () => {
    const caster = makeCreature({ concentrating: 'Hypnotic Pattern' })
    const t1 = makeCreature({ conditions: ['charmed_hp', 'incapacitated'] })
    const t2 = makeCreature({ conditions: ['charmed_hp', 'incapacitated'] })
    mech.breakConcentration(caster, [caster, t1, t2])
    assert.strictEqual(caster.concentrating, null)
    assert.deepStrictEqual(t1.conditions, [])
    assert.deepStrictEqual(t2.conditions, [])
  })

  it('Hypnotic Pattern — preserves unrelated conditions', () => {
    const caster = makeCreature({ concentrating: 'Hypnotic Pattern' })
    const t = makeCreature({ conditions: ['charmed_hp', 'incapacitated', 'invisible'] })
    mech.breakConcentration(caster, [caster, t])
    assert.deepStrictEqual(t.conditions, ['invisible'])
  })

  it('Hold Person — removes paralyzed', () => {
    const caster = makeCreature({ concentrating: 'Hold Person' })
    const t = makeCreature({ conditions: ['paralyzed'] })
    mech.breakConcentration(caster, [caster, t])
    assert.deepStrictEqual(t.conditions, [])
  })

  it('Greater Invisibility — removes invisible from caster', () => {
    const caster = makeCreature({ concentrating: 'Greater Invisibility', conditions: ['invisible'] })
    mech.breakConcentration(caster, [caster])
    assert.deepStrictEqual(caster.conditions, [])
  })

  it('Shield of Faith — reduces AC by 2', () => {
    const caster = makeCreature({ ac: 16, concentrating: 'Shield of Faith' })
    mech.breakConcentration(caster, [caster])
    assert.strictEqual(caster.ac, 14)
  })

  it('resets concentration state', () => {
    const caster = makeCreature({ concentrating: 'Hold Person', concentrationRoundsRemaining: 5 })
    mech.breakConcentration(caster, [caster])
    assert.strictEqual(caster.concentrating, null)
    assert.strictEqual(caster.concentrationRoundsRemaining, 0)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// distanceBetween
// ═══════════════════════════════════════════════════════════════════════════

describe('distanceBetween', () => {
  it('ground-to-ground uses Chebyshev distance * 5', () => {
    const a = makeCreature({ position: { x: 0, y: 0 } })
    const b = makeCreature({ position: { x: 3, y: 2 } })
    assert.strictEqual(mech.distanceBetween(a, b), 15)
  })

  it('flying to ground uses 3D distance (30ft altitude)', () => {
    const a = makeCreature({ flying: true, position: { x: 0, y: 0 } })
    const b = makeCreature({ flying: false, position: { x: 0, y: 0 } })
    assert.strictEqual(mech.distanceBetween(a, b), 30)
  })

  it('ground to flying uses 3D distance', () => {
    const a = makeCreature({ flying: false })
    const b = makeCreature({ flying: true })
    assert.strictEqual(mech.distanceBetween(a, b), 30)
  })

  it('flying vs ground with horizontal offset uses Euclidean 3D', () => {
    const a = makeCreature({ flying: true, position: { x: 4, y: 0 } })
    const b = makeCreature({ flying: false, position: { x: 0, y: 0 } })
    assert.strictEqual(mech.distanceBetween(a, b), 35) // sqrt(400+900) ≈ 36.06 → round to 35
  })

  it('same position = 0ft', () => {
    const a = makeCreature({ position: { x: 2, y: 3 } })
    const b = makeCreature({ position: { x: 2, y: 3 } })
    assert.strictEqual(mech.distanceBetween(a, b), 0)
  })
})
