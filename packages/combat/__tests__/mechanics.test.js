/**
 * Combat Mechanics — unit tests
 * Tests saving throws, attack rolls, damage, concentration, conditions, breakConcentration.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import * as dice from '../src/engine/dice.js'
import * as mech from '../src/engine/mechanics.js'

beforeAll(() => dice.setDiceMode('average'))
afterAll(() => dice.setDiceMode('random'))

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
    expect(result.roll).toBe(10.5)
    expect(result.total).toBe(13.5)
    expect(result.dc).toBe(13)
    expect(result.success).toBe(true)
  })

  it('fails when total < DC', () => {
    expect(mech.makeAbilityCheck(0, 15).success).toBe(false)
  })

  it('succeeds when total exactly equals DC', () => {
    expect(mech.makeAbilityCheck(5, 15).success).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// makeSavingThrow
// ═══════════════════════════════════════════════════════════════════════════

describe('makeSavingThrow', () => {
  it('normal save — no advantage or disadvantage', () => {
    const result = mech.makeSavingThrow(5, 14)
    expect(result.result).toBe(10.5)
    expect(result.saveBonus).toBe(5)
    expect(result.total).toBe(15.5)
    expect(result.success).toBe(true)
    expect(result.type).toBe('normal')
  })

  it('save fails when total < DC', () => {
    const result = mech.makeSavingThrow(0, 14)
    expect(result.total).toBe(10.5)
    expect(result.saveBonus).toBe(0)
    expect(result.success).toBe(false)
  })

  it('returns saveBonus in result', () => {
    const result = mech.makeSavingThrow(-1, 10)
    expect(result.saveBonus).toBe(-1)
    expect(typeof result.saveBonus).toBe('number')
    expect(result.total).toBe(10.5 + (-1))
  })

  it('advantage save returns type "advantage"', () => {
    const result = mech.makeSavingThrow(3, 10, true, false)
    expect(result.type).toBe('advantage')
    expect(result.success).toBe(true)
  })

  it('disadvantage save returns type "disadvantage"', () => {
    expect(mech.makeSavingThrow(3, 10, false, true).type).toBe('disadvantage')
  })

  it('both advantage and disadvantage cancel to normal', () => {
    expect(mech.makeSavingThrow(3, 10, true, true).type).toBe('normal')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// makeAttackRoll
// ═══════════════════════════════════════════════════════════════════════════

describe('makeAttackRoll', () => {
  it('hits when total >= target AC', () => {
    const result = mech.makeAttackRoll(5, 15)
    expect(result.natural).toBe(10.5)
    expect(result.total).toBe(15.5)
    expect(result.hits).toBe(true)
    expect(result.isCrit).toBe(false)
    expect(result.isMiss).toBe(false)
  })

  it('misses when total < target AC', () => {
    expect(mech.makeAttackRoll(2, 15).hits).toBe(false)
  })

  it('advantage sets type correctly', () => {
    expect(mech.makeAttackRoll(5, 15, true, false).type).toBe('advantage')
  })

  it('disadvantage sets type correctly', () => {
    expect(mech.makeAttackRoll(5, 15, false, true).type).toBe('disadvantage')
  })

  it('both cancel to normal', () => {
    expect(mech.makeAttackRoll(5, 15, true, true).type).toBe('normal')
  })
})

describe('makeAttackRoll — natural 20 and natural 1 (random mode)', () => {
  beforeAll(() => dice.setDiceMode('random'))
  afterAll(() => dice.setDiceMode('average'))

  it('natural 20 always hits regardless of AC', () => {
    const orig = Math.random
    Math.random = () => (20 - 1) / 20
    try {
      const result = mech.makeAttackRoll(0, 30)
      expect(result.natural).toBe(20)
      expect(result.isCrit).toBe(true)
      expect(result.hits).toBe(true)
    } finally {
      Math.random = orig
    }
  })

  it('natural 1 always misses regardless of bonus', () => {
    const orig = Math.random
    Math.random = () => 0
    try {
      const result = mech.makeAttackRoll(30, 10)
      expect(result.natural).toBe(1)
      expect(result.isMiss).toBe(true)
      expect(result.hits).toBe(false)
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
    expect(result.rolls).toEqual([4.5])
    expect(result.bonus).toBe(3)
    expect(result.total).toBe(7.5)
    expect(result.crit).toBe(false)
  })

  it('2d6+2 in average mode = 7 + 2 = 9', () => {
    const result = mech.rollDamage('2d6', 2)
    expect(result.rolls).toEqual([3.5, 3.5])
    expect(result.total).toBe(9)
  })

  it('crit doubles dice count: 1d8 crit → 2d8', () => {
    const result = mech.rollDamage('1d8', 3, true)
    expect(result.rolls.length).toBe(2)
    expect(result.rolls).toEqual([4.5, 4.5])
    expect(result.total).toBe(12) // 4.5+4.5+3
    expect(result.crit).toBe(true)
  })

  it('3d10 crit → 6d10', () => {
    const result = mech.rollDamage('3d10', 0, true)
    expect(result.rolls.length).toBe(6)
    expect(result.total).toBe(33) // 6*5.5
  })

  it('rejects invalid dice string', () => {
    expect(() => mech.rollDamage('banana', 0)).toThrow(/Invalid dice string/)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// concentrationSave
// ═══════════════════════════════════════════════════════════════════════════

describe('concentrationSave', () => {
  it('DC is 10 for low damage', () => {
    const creature = makeCreature({ saves: { con: 5 } })
    const result = mech.concentrationSave(creature, 8)
    expect(result.dc).toBe(10)
    expect(result.total).toBe(15.5)
    expect(result.success).toBe(true)
  })

  it('DC scales with high damage', () => {
    const creature = makeCreature({ saves: { con: 2 } })
    const result = mech.concentrationSave(creature, 30)
    expect(result.dc).toBe(15)
    expect(result.total).toBe(12.5)
    expect(result.success).toBe(false)
  })

  it('War Caster grants advantage', () => {
    const creature = makeCreature({ saves: { con: 3 }, hasWarCaster: true })
    expect(mech.concentrationSave(creature, 10).type).toBe('advantage')
  })

  it('no War Caster = normal roll', () => {
    const creature = makeCreature({ saves: { con: 3 } })
    expect(mech.concentrationSave(creature, 10).type).toBe('normal')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Condition helpers
// ═══════════════════════════════════════════════════════════════════════════

describe('isIncapacitated', () => {
  it('returns false with no conditions', () => {
    expect(mech.isIncapacitated(makeCreature())).toBe(false)
  })

  for (const cond of ['paralyzed', 'stunned', 'unconscious', 'charmed_hp', 'incapacitated']) {
    it(`returns true for "${cond}"`, () => {
      expect(mech.isIncapacitated(makeCreature({ conditions: [cond] }))).toBe(true)
    })
  }

  it('returns false for non-incapacitating conditions', () => {
    expect(mech.isIncapacitated(makeCreature({ conditions: ['invisible', 'frightened'] }))).toBe(false)
  })
})

describe('isAlive', () => {
  it('returns true when HP > 0', () => {
    expect(mech.isAlive(makeCreature({ currentHP: 1 }))).toBe(true)
  })

  it('returns false when HP = 0', () => {
    expect(mech.isAlive(makeCreature({ currentHP: 0 }))).toBe(false)
  })
})

describe('hasCondition', () => {
  it('returns true when creature has the condition', () => {
    expect(mech.hasCondition(makeCreature({ conditions: ['paralyzed'] }), 'paralyzed')).toBe(true)
  })

  it('returns false when creature lacks the condition', () => {
    expect(mech.hasCondition(makeCreature(), 'paralyzed')).toBe(false)
  })
})

describe('addCondition', () => {
  it('adds a new condition', () => {
    const c = makeCreature()
    mech.addCondition(c, 'invisible')
    expect(c.conditions).toContain('invisible')
  })

  it('does not duplicate an existing condition', () => {
    const c = makeCreature({ conditions: ['invisible'] })
    mech.addCondition(c, 'invisible')
    expect(c.conditions.filter(x => x === 'invisible').length).toBe(1)
  })
})

describe('removeCondition', () => {
  it('removes an existing condition and returns true', () => {
    const c = makeCreature({ conditions: ['paralyzed', 'invisible'] })
    expect(mech.removeCondition(c, 'paralyzed')).toBe(true)
    expect(c.conditions).not.toContain('paralyzed')
  })

  it('returns false for non-existent condition', () => {
    expect(mech.removeCondition(makeCreature(), 'paralyzed')).toBe(false)
  })
})

describe('removeAllConditions', () => {
  it('removes all instances of named conditions', () => {
    const c = makeCreature({ conditions: ['charmed_hp', 'incapacitated', 'invisible'] })
    mech.removeAllConditions(c, 'charmed_hp', 'incapacitated')
    expect(c.conditions).toEqual(['invisible'])
  })

  it('leaves creature unchanged if no matching conditions', () => {
    const c = makeCreature({ conditions: ['invisible'] })
    mech.removeAllConditions(c, 'paralyzed')
    expect(c.conditions).toEqual(['invisible'])
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
    expect(active.length).toBe(1)
    expect(active[0].name).toBe('alive')
  })
})

describe('getAllAliveEnemies', () => {
  it('includes incapacitated but alive creatures', () => {
    const enemies = [
      makeCreature({ name: 'alive', currentHP: 10 }),
      makeCreature({ name: 'dead', currentHP: 0 }),
      makeCreature({ name: 'incap', currentHP: 10, conditions: ['paralyzed'] }),
    ]
    expect(mech.getAllAliveEnemies(enemies).length).toBe(2)
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
    expect(caster.concentrating).toBeNull()
    expect(t1.conditions).toEqual([])
    expect(t2.conditions).toEqual([])
  })

  it('Hypnotic Pattern — preserves unrelated conditions', () => {
    const caster = makeCreature({ concentrating: 'Hypnotic Pattern' })
    const t = makeCreature({ conditions: ['charmed_hp', 'incapacitated', 'invisible'] })
    mech.breakConcentration(caster, [caster, t])
    expect(t.conditions).toEqual(['invisible'])
  })

  it('Hold Person — removes paralyzed', () => {
    const caster = makeCreature({ concentrating: 'Hold Person' })
    const t = makeCreature({ conditions: ['paralyzed'] })
    mech.breakConcentration(caster, [caster, t])
    expect(t.conditions).toEqual([])
  })

  it('Greater Invisibility — removes invisible from caster', () => {
    const caster = makeCreature({ concentrating: 'Greater Invisibility', conditions: ['invisible'] })
    mech.breakConcentration(caster, [caster])
    expect(caster.conditions).toEqual([])
  })

  it('Shield of Faith — reduces AC by 2', () => {
    const caster = makeCreature({ ac: 16, concentrating: 'Shield of Faith' })
    mech.breakConcentration(caster, [caster])
    expect(caster.ac).toBe(14)
  })

  it('resets concentration state', () => {
    const caster = makeCreature({ concentrating: 'Hold Person', concentrationRoundsRemaining: 5 })
    mech.breakConcentration(caster, [caster])
    expect(caster.concentrating).toBeNull()
    expect(caster.concentrationRoundsRemaining).toBe(0)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// distanceBetween
// ═══════════════════════════════════════════════════════════════════════════

describe('distanceBetween', () => {
  it('ground-to-ground uses Chebyshev distance * 5', () => {
    const a = makeCreature({ position: { x: 0, y: 0 } })
    const b = makeCreature({ position: { x: 3, y: 2 } })
    expect(mech.distanceBetween(a, b)).toBe(15)
  })

  it('flying to ground uses 3D distance (30ft altitude)', () => {
    const a = makeCreature({ flying: true, position: { x: 0, y: 0 } })
    const b = makeCreature({ flying: false, position: { x: 0, y: 0 } })
    expect(mech.distanceBetween(a, b)).toBe(30)
  })

  it('ground to flying uses 3D distance', () => {
    const a = makeCreature({ flying: false })
    const b = makeCreature({ flying: true })
    expect(mech.distanceBetween(a, b)).toBe(30)
  })

  it('flying vs ground with horizontal offset uses Euclidean 3D', () => {
    const a = makeCreature({ flying: true, position: { x: 4, y: 0 } })
    const b = makeCreature({ flying: false, position: { x: 0, y: 0 } })
    expect(mech.distanceBetween(a, b)).toBe(35) // sqrt(400+900) ≈ 36.06 → round to 35
  })

  it('same position = 0ft', () => {
    const a = makeCreature({ position: { x: 2, y: 3 } })
    const b = makeCreature({ position: { x: 2, y: 3 } })
    expect(mech.distanceBetween(a, b)).toBe(0)
  })
})
