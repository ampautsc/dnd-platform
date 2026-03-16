/**
 * Dice Engine — unit tests
 * Tests both average-mode (deterministic) and edge-case behavior.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import * as dice from '../src/engine/dice.js'

// ═══════════════════════════════════════════════════════════════════════════
// SETUP — ensure average mode for deterministic tests
// ═══════════════════════════════════════════════════════════════════════════

beforeAll(() => dice.setDiceMode('average'))
afterAll(() => dice.setDiceMode('random'))

// ═══════════════════════════════════════════════════════════════════════════
// setDiceMode / getDiceMode
// ═══════════════════════════════════════════════════════════════════════════

describe('setDiceMode', () => {
  it('should accept "random"', () => {
    dice.setDiceMode('random')
    expect(dice.getDiceMode()).toBe('random')
    dice.setDiceMode('average') // restore
  })

  it('should accept "average"', () => {
    dice.setDiceMode('average')
    expect(dice.getDiceMode()).toBe('average')
  })

  it('should reject invalid modes', () => {
    expect(() => dice.setDiceMode('fixed')).toThrow(/Invalid dice mode/)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Average-mode die functions — expected value is (sides/2) + 0.5
// ═══════════════════════════════════════════════════════════════════════════

describe('average-mode die functions', () => {
  it('d20 returns 10.5', () => expect(dice.d20()).toBe(10.5))
  it('d12 returns 6.5',  () => expect(dice.d12()).toBe(6.5))
  it('d10 returns 5.5',  () => expect(dice.d10()).toBe(5.5))
  it('d8 returns 4.5',   () => expect(dice.d8()).toBe(4.5))
  it('d6 returns 3.5',   () => expect(dice.d6()).toBe(3.5))
  it('d4 returns 2.5',   () => expect(dice.d4()).toBe(2.5))
})

// ═══════════════════════════════════════════════════════════════════════════
// dieFns map
// ═══════════════════════════════════════════════════════════════════════════

describe('dieFns', () => {
  it('maps all standard die sizes', () => {
    expect(typeof dice.dieFns[4]).toBe('function')
    expect(typeof dice.dieFns[6]).toBe('function')
    expect(typeof dice.dieFns[8]).toBe('function')
    expect(typeof dice.dieFns[10]).toBe('function')
    expect(typeof dice.dieFns[12]).toBe('function')
    expect(typeof dice.dieFns[20]).toBe('function')
  })

  it('dieFns[8]() returns same as d8()', () => {
    expect(dice.dieFns[8]()).toBe(dice.d8())
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// rollDice — multiple dice
// ═══════════════════════════════════════════════════════════════════════════

describe('rollDice', () => {
  it('returns correct count of rolls', () => {
    const rolls = dice.rollDice(4, dice.d6)
    expect(rolls.length).toBe(4)
  })

  it('all rolls are d6 average in average mode', () => {
    const rolls = dice.rollDice(3, dice.d6)
    expect(rolls).toEqual([3.5, 3.5, 3.5])
  })

  it('handles count of 1', () => {
    const rolls = dice.rollDice(1, dice.d20)
    expect(rolls).toEqual([10.5])
  })

  it('handles count of 0', () => {
    const rolls = dice.rollDice(0, dice.d8)
    expect(rolls).toEqual([])
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// parseDiceAndRoll — string-based dice rolling
// ═══════════════════════════════════════════════════════════════════════════

describe('parseDiceAndRoll', () => {
  it('parses "2d8" correctly', () => {
    const result = dice.parseDiceAndRoll('2d8')
    expect(result.count).toBe(2)
    expect(result.sides).toBe(8)
    expect(result.rolls).toEqual([4.5, 4.5])
    expect(result.total).toBe(9)
  })

  it('parses "1d20" correctly', () => {
    const result = dice.parseDiceAndRoll('1d20')
    expect(result.count).toBe(1)
    expect(result.sides).toBe(20)
    expect(result.total).toBe(10.5)
  })

  it('parses "3d10" correctly', () => {
    const result = dice.parseDiceAndRoll('3d10')
    expect(result.count).toBe(3)
    expect(result.sides).toBe(10)
    expect(result.total).toBe(16.5)
  })

  it('rejects invalid dice string', () => {
    expect(() => dice.parseDiceAndRoll('2d')).toThrow(/Invalid dice string/)
  })

  it('rejects unsupported die size', () => {
    expect(() => dice.parseDiceAndRoll('1d7')).toThrow(/Unsupported die size/)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// rollWithAdvantage / rollWithDisadvantage
// ═══════════════════════════════════════════════════════════════════════════

describe('rollWithAdvantage', () => {
  it('returns max of two d20 rolls', () => {
    const result = dice.rollWithAdvantage()
    expect(result.roll1).toBe(10.5)
    expect(result.roll2).toBe(10.5)
    expect(result.result).toBe(10.5) // max of equal values
    expect(result.type).toBe('advantage')
  })
})

describe('rollWithDisadvantage', () => {
  it('returns min of two d20 rolls', () => {
    const result = dice.rollWithDisadvantage()
    expect(result.roll1).toBe(10.5)
    expect(result.roll2).toBe(10.5)
    expect(result.result).toBe(10.5) // min of equal values
    expect(result.type).toBe('disadvantage')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Random mode — values in valid range
// ═══════════════════════════════════════════════════════════════════════════

describe('random mode produces valid ranges', () => {
  beforeAll(() => dice.setDiceMode('random'))
  afterAll(() => dice.setDiceMode('average'))

  it('d20 returns integer between 1 and 20', () => {
    for (let i = 0; i < 20; i++) {
      const val = dice.d20()
      expect(Number.isInteger(val)).toBe(true)
      expect(val).toBeGreaterThanOrEqual(1)
      expect(val).toBeLessThanOrEqual(20)
    }
  })

  it('d6 returns integer between 1 and 6', () => {
    for (let i = 0; i < 20; i++) {
      const val = dice.d6()
      expect(Number.isInteger(val)).toBe(true)
      expect(val).toBeGreaterThanOrEqual(1)
      expect(val).toBeLessThanOrEqual(6)
    }
  })

  it('rollWithAdvantage.result >= each individual roll', () => {
    for (let i = 0; i < 20; i++) {
      const r = dice.rollWithAdvantage()
      expect(r.result).toBeGreaterThanOrEqual(r.roll1)
      expect(r.result).toBeGreaterThanOrEqual(r.roll2)
    }
  })

  it('rollWithDisadvantage.result <= each individual roll', () => {
    for (let i = 0; i < 20; i++) {
      const r = dice.rollWithDisadvantage()
      expect(r.result).toBeLessThanOrEqual(r.roll1)
      expect(r.result).toBeLessThanOrEqual(r.roll2)
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Fixed rolls
// ═══════════════════════════════════════════════════════════════════════════

describe('fixed rolls', () => {
  afterEach(() => {
    dice.clearFixedRolls()
    dice.setDiceMode('average')
  })

  it('setFixedRolls queues d20 values', () => {
    dice.setFixedRolls([15, 3, 20])
    expect(dice.getDiceMode()).toBe('fixed')
    expect(dice.d20()).toBe(15)
    expect(dice.d20()).toBe(3)
    expect(dice.d20()).toBe(20)
  })

  it('reverts to previous mode when queue exhausted', () => {
    dice.setDiceMode('average')
    dice.setFixedRolls([10])
    expect(dice.d20()).toBe(10)
    expect(dice.getDiceMode()).toBe('average')
  })

  it('getRemainingFixedRolls returns unconsumed values', () => {
    dice.setFixedRolls([5, 10, 15])
    dice.d20() // consume 5
    expect(dice.getRemainingFixedRolls()).toEqual([10, 15])
  })

  it('clearFixedRolls clears queue and restores mode', () => {
    dice.setDiceMode('random')
    dice.setFixedRolls([1, 2, 3])
    dice.clearFixedRolls()
    expect(dice.getDiceMode()).toBe('random')
    expect(dice.getRemainingFixedRolls()).toEqual([])
  })

  it('clamps fixed values to valid d20 range', () => {
    dice.setFixedRolls([0, 25, -3])
    expect(dice.d20()).toBe(1)  // clamped from 0
    expect(dice.d20()).toBe(20) // clamped from 25
    expect(dice.d20()).toBe(1)  // clamped from -3
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Commit-Reveal Protocol
// ═══════════════════════════════════════════════════════════════════════════

describe('generateCommitment', () => {
  it('returns serverSecret and commitment as hex strings', () => {
    const { serverSecret, commitment } = dice.generateCommitment()
    expect(typeof serverSecret).toBe('string')
    expect(typeof commitment).toBe('string')
    expect(serverSecret.length).toBe(64) // 32 bytes → 64 hex chars
    expect(commitment.length).toBe(64)   // SHA-256 → 64 hex chars
  })

  it('generates unique secrets each call', () => {
    const a = dice.generateCommitment()
    const b = dice.generateCommitment()
    expect(a.serverSecret).not.toBe(b.serverSecret)
    expect(a.commitment).not.toBe(b.commitment)
  })
})

describe('verifyCommitment', () => {
  it('returns true for matching secret/commitment pair', () => {
    const { serverSecret, commitment } = dice.generateCommitment()
    expect(dice.verifyCommitment(serverSecret, commitment)).toBe(true)
  })

  it('returns false when secret does not match commitment', () => {
    const a = dice.generateCommitment()
    const b = dice.generateCommitment()
    expect(dice.verifyCommitment(a.serverSecret, b.commitment)).toBe(false)
  })

  it('returns false for tampered commitment', () => {
    const { serverSecret } = dice.generateCommitment()
    const tampered = 'a'.repeat(64)
    expect(dice.verifyCommitment(serverSecret, tampered)).toBe(false)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Seeded PRNG — applySeed / clearSeed
// ═══════════════════════════════════════════════════════════════════════════

describe('seeded PRNG', () => {
  afterEach(() => {
    dice.clearSeed()
    dice.setDiceMode('average') // restore for other tests
  })

  it('activates seeded mode via applySeed', () => {
    const { serverSecret } = dice.generateCommitment()
    dice.applySeed(serverSecret, 'client-seed-1')
    expect(dice.getDiceMode()).toBe('seeded')
  })

  it('clearSeed reverts to previous mode', () => {
    dice.setDiceMode('random')
    const { serverSecret } = dice.generateCommitment()
    dice.applySeed(serverSecret, 'client-seed-1')
    expect(dice.getDiceMode()).toBe('seeded')
    dice.clearSeed()
    expect(dice.getDiceMode()).toBe('random')
  })

  it('produces deterministic results: same seeds → same sequence', () => {
    const { serverSecret } = dice.generateCommitment()
    dice.applySeed(serverSecret, 'my-client-seed')
    const seq1 = [dice.d20(), dice.d6(), dice.d8(), dice.d4(), dice.d12(), dice.d10()]
    dice.clearSeed()

    dice.applySeed(serverSecret, 'my-client-seed')
    const seq2 = [dice.d20(), dice.d6(), dice.d8(), dice.d4(), dice.d12(), dice.d10()]
    dice.clearSeed()

    expect(seq1).toEqual(seq2)
  })

  it('different client seeds produce different sequences', () => {
    const { serverSecret } = dice.generateCommitment()
    dice.applySeed(serverSecret, 'seed-alpha')
    const seq1 = [dice.d20(), dice.d6(), dice.d8()]
    dice.clearSeed()

    dice.applySeed(serverSecret, 'seed-beta')
    const seq2 = [dice.d20(), dice.d6(), dice.d8()]
    dice.clearSeed()

    expect(seq1).not.toEqual(seq2)
  })

  it('different server secrets produce different sequences', () => {
    const a = dice.generateCommitment()
    const b = dice.generateCommitment()
    dice.applySeed(a.serverSecret, 'same-client-seed')
    const seq1 = [dice.d20(), dice.d6(), dice.d8()]
    dice.clearSeed()

    dice.applySeed(b.serverSecret, 'same-client-seed')
    const seq2 = [dice.d20(), dice.d6(), dice.d8()]
    dice.clearSeed()

    expect(seq1).not.toEqual(seq2)
  })

  it('seeded d20 produces values in [1, 20]', () => {
    const { serverSecret } = dice.generateCommitment()
    dice.applySeed(serverSecret, 'range-test')
    for (let i = 0; i < 100; i++) {
      const val = dice.d20()
      expect(Number.isInteger(val)).toBe(true)
      expect(val).toBeGreaterThanOrEqual(1)
      expect(val).toBeLessThanOrEqual(20)
    }
  })

  it('seeded d6 produces values in [1, 6]', () => {
    const { serverSecret } = dice.generateCommitment()
    dice.applySeed(serverSecret, 'range-d6')
    for (let i = 0; i < 100; i++) {
      const val = dice.d6()
      expect(Number.isInteger(val)).toBe(true)
      expect(val).toBeGreaterThanOrEqual(1)
      expect(val).toBeLessThanOrEqual(6)
    }
  })

  it('seeded d4/d8/d10/d12 all produce valid ranges', () => {
    const { serverSecret } = dice.generateCommitment()
    dice.applySeed(serverSecret, 'range-all')
    const checks = [
      { fn: 'd4',  min: 1, max: 4 },
      { fn: 'd8',  min: 1, max: 8 },
      { fn: 'd10', min: 1, max: 10 },
      { fn: 'd12', min: 1, max: 12 },
    ]
    for (const { fn, min, max } of checks) {
      for (let i = 0; i < 50; i++) {
        const val = dice[fn]()
        expect(val).toBeGreaterThanOrEqual(min)
        expect(val).toBeLessThanOrEqual(max)
        expect(Number.isInteger(val)).toBe(true)
      }
    }
  })

  it('parseDiceAndRoll works in seeded mode', () => {
    const { serverSecret } = dice.generateCommitment()
    dice.applySeed(serverSecret, 'parse-test')
    const result = dice.parseDiceAndRoll('3d6')
    expect(result.count).toBe(3)
    expect(result.sides).toBe(6)
    expect(result.rolls.length).toBe(3)
    expect(result.total).toBe(result.rolls.reduce((a, b) => a + b, 0))
    for (const r of result.rolls) {
      expect(r).toBeGreaterThanOrEqual(1)
      expect(r).toBeLessThanOrEqual(6)
    }
  })

  it('rollWithAdvantage works in seeded mode', () => {
    const { serverSecret } = dice.generateCommitment()
    dice.applySeed(serverSecret, 'adv-test')
    const r = dice.rollWithAdvantage()
    expect(r.result).toBeGreaterThanOrEqual(r.roll1)
    expect(r.result).toBeGreaterThanOrEqual(r.roll2)
    expect(r.roll1).toBeGreaterThanOrEqual(1)
    expect(r.roll1).toBeLessThanOrEqual(20)
    expect(r.roll2).toBeGreaterThanOrEqual(1)
    expect(r.roll2).toBeLessThanOrEqual(20)
  })

  it('seeded mode does not activate spontaneously', () => {
    dice.clearSeed()
    dice.setDiceMode('random')
    expect(dice.getDiceMode()).not.toBe('seeded')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// rollFromSeed — per-die seeded roll (pure function)
// ═══════════════════════════════════════════════════════════════════════════

describe('rollFromSeed', () => {
  it('returns deterministic result for same seed and sides', () => {
    const a = dice.rollFromSeed(12345, 20)
    const b = dice.rollFromSeed(12345, 20)
    expect(a).toBe(b)
  })

  it('returns different results for different seeds', () => {
    const a = dice.rollFromSeed(100, 20)
    const b = dice.rollFromSeed(200, 20)
    // Might rarely collide but extremely unlikely for d20
    expect(a === b && dice.rollFromSeed(300, 20) === a).toBe(false)
  })

  it('returns valid d20 range', () => {
    for (let seed = 0; seed < 100; seed++) {
      const val = dice.rollFromSeed(seed, 20)
      expect(val).toBeGreaterThanOrEqual(1)
      expect(val).toBeLessThanOrEqual(20)
      expect(Number.isInteger(val)).toBe(true)
    }
  })

  it('returns valid d6 range', () => {
    for (let seed = 0; seed < 100; seed++) {
      const val = dice.rollFromSeed(seed, 6)
      expect(val).toBeGreaterThanOrEqual(1)
      expect(val).toBeLessThanOrEqual(6)
    }
  })

  it('accepts string seeds', () => {
    const a = dice.rollFromSeed('hello', 20)
    const b = dice.rollFromSeed('hello', 20)
    expect(a).toBe(b)
    expect(a).toBeGreaterThanOrEqual(1)
    expect(a).toBeLessThanOrEqual(20)
  })
})
