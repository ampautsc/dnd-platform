/**
 * Dice Engine — unit tests
 * Tests both average-mode (deterministic) and edge-case behavior.
 */

import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import * as dice from '../src/engine/dice.js'

// ═══════════════════════════════════════════════════════════════════════════
// SETUP — ensure average mode for deterministic tests
// ═══════════════════════════════════════════════════════════════════════════

before(() => dice.setDiceMode('average'))
after(() => dice.setDiceMode('random'))

// ═══════════════════════════════════════════════════════════════════════════
// setDiceMode / getDiceMode
// ═══════════════════════════════════════════════════════════════════════════

describe('setDiceMode', () => {
  it('should accept "random"', () => {
    dice.setDiceMode('random')
    assert.strictEqual(dice.getDiceMode(), 'random')
    dice.setDiceMode('average') // restore
  })

  it('should accept "average"', () => {
    dice.setDiceMode('average')
    assert.strictEqual(dice.getDiceMode(), 'average')
  })

  it('should reject invalid modes', () => {
    assert.throws(() => dice.setDiceMode('fixed'), /Invalid dice mode/)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Average-mode die functions — expected value is (sides/2) + 0.5
// ═══════════════════════════════════════════════════════════════════════════

describe('average-mode die functions', () => {
  it('d20 returns 10.5', () => assert.strictEqual(dice.d20(), 10.5))
  it('d12 returns 6.5',  () => assert.strictEqual(dice.d12(), 6.5))
  it('d10 returns 5.5',  () => assert.strictEqual(dice.d10(), 5.5))
  it('d8 returns 4.5',   () => assert.strictEqual(dice.d8(), 4.5))
  it('d6 returns 3.5',   () => assert.strictEqual(dice.d6(), 3.5))
  it('d4 returns 2.5',   () => assert.strictEqual(dice.d4(), 2.5))
})

// ═══════════════════════════════════════════════════════════════════════════
// dieFns map
// ═══════════════════════════════════════════════════════════════════════════

describe('dieFns', () => {
  it('maps all standard die sizes', () => {
    assert.strictEqual(typeof dice.dieFns[4], 'function')
    assert.strictEqual(typeof dice.dieFns[6], 'function')
    assert.strictEqual(typeof dice.dieFns[8], 'function')
    assert.strictEqual(typeof dice.dieFns[10], 'function')
    assert.strictEqual(typeof dice.dieFns[12], 'function')
    assert.strictEqual(typeof dice.dieFns[20], 'function')
  })

  it('dieFns[8]() returns same as d8()', () => {
    assert.strictEqual(dice.dieFns[8](), dice.d8())
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// rollDice — multiple dice
// ═══════════════════════════════════════════════════════════════════════════

describe('rollDice', () => {
  it('returns correct count of rolls', () => {
    const rolls = dice.rollDice(4, dice.d6)
    assert.strictEqual(rolls.length, 4)
  })

  it('all rolls are d6 average in average mode', () => {
    const rolls = dice.rollDice(3, dice.d6)
    assert.deepStrictEqual(rolls, [3.5, 3.5, 3.5])
  })

  it('handles count of 1', () => {
    const rolls = dice.rollDice(1, dice.d20)
    assert.deepStrictEqual(rolls, [10.5])
  })

  it('handles count of 0', () => {
    const rolls = dice.rollDice(0, dice.d8)
    assert.deepStrictEqual(rolls, [])
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// parseDiceAndRoll — string-based dice rolling
// ═══════════════════════════════════════════════════════════════════════════

describe('parseDiceAndRoll', () => {
  it('parses "2d8" correctly', () => {
    const result = dice.parseDiceAndRoll('2d8')
    assert.strictEqual(result.count, 2)
    assert.strictEqual(result.sides, 8)
    assert.deepStrictEqual(result.rolls, [4.5, 4.5])
    assert.strictEqual(result.total, 9)
  })

  it('parses "1d20" correctly', () => {
    const result = dice.parseDiceAndRoll('1d20')
    assert.strictEqual(result.count, 1)
    assert.strictEqual(result.sides, 20)
    assert.strictEqual(result.total, 10.5)
  })

  it('parses "3d10" correctly', () => {
    const result = dice.parseDiceAndRoll('3d10')
    assert.strictEqual(result.count, 3)
    assert.strictEqual(result.sides, 10)
    assert.strictEqual(result.total, 16.5)
  })

  it('rejects invalid dice string', () => {
    assert.throws(() => dice.parseDiceAndRoll('2d'), /Invalid dice string/)
  })

  it('rejects unsupported die size', () => {
    assert.throws(() => dice.parseDiceAndRoll('1d7'), /Unsupported die size/)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// rollWithAdvantage / rollWithDisadvantage
// ═══════════════════════════════════════════════════════════════════════════

describe('rollWithAdvantage', () => {
  it('returns max of two d20 rolls', () => {
    const result = dice.rollWithAdvantage()
    assert.strictEqual(result.roll1, 10.5)
    assert.strictEqual(result.roll2, 10.5)
    assert.strictEqual(result.result, 10.5) // max of equal values
    assert.strictEqual(result.type, 'advantage')
  })
})

describe('rollWithDisadvantage', () => {
  it('returns min of two d20 rolls', () => {
    const result = dice.rollWithDisadvantage()
    assert.strictEqual(result.roll1, 10.5)
    assert.strictEqual(result.roll2, 10.5)
    assert.strictEqual(result.result, 10.5) // min of equal values
    assert.strictEqual(result.type, 'disadvantage')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Random mode — values in valid range
// ═══════════════════════════════════════════════════════════════════════════

describe('random mode produces valid ranges', () => {
  before(() => dice.setDiceMode('random'))
  after(() => dice.setDiceMode('average'))

  it('d20 returns integer between 1 and 20', () => {
    for (let i = 0; i < 20; i++) {
      const val = dice.d20()
      assert.strictEqual(Number.isInteger(val), true)
      assert.ok(val >= 1)
      assert.ok(val <= 20)
    }
  })

  it('d6 returns integer between 1 and 6', () => {
    for (let i = 0; i < 20; i++) {
      const val = dice.d6()
      assert.strictEqual(Number.isInteger(val), true)
      assert.ok(val >= 1)
      assert.ok(val <= 6)
    }
  })

  it('rollWithAdvantage.result >= each individual roll', () => {
    for (let i = 0; i < 20; i++) {
      const r = dice.rollWithAdvantage()
      assert.ok(r.result >= r.roll1)
      assert.ok(r.result >= r.roll2)
    }
  })

  it('rollWithDisadvantage.result <= each individual roll', () => {
    for (let i = 0; i < 20; i++) {
      const r = dice.rollWithDisadvantage()
      assert.ok(r.result <= r.roll1)
      assert.ok(r.result <= r.roll2)
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
    assert.strictEqual(dice.getDiceMode(), 'fixed')
    assert.strictEqual(dice.d20(), 15)
    assert.strictEqual(dice.d20(), 3)
    assert.strictEqual(dice.d20(), 20)
  })

  it('reverts to previous mode when queue exhausted', () => {
    dice.setDiceMode('average')
    dice.setFixedRolls([10])
    assert.strictEqual(dice.d20(), 10)
    assert.strictEqual(dice.getDiceMode(), 'average')
  })

  it('getRemainingFixedRolls returns unconsumed values', () => {
    dice.setFixedRolls([5, 10, 15])
    dice.d20() // consume 5
    assert.deepStrictEqual(dice.getRemainingFixedRolls(), [10, 15])
  })

  it('clearFixedRolls clears queue and restores mode', () => {
    dice.setDiceMode('random')
    dice.setFixedRolls([1, 2, 3])
    dice.clearFixedRolls()
    assert.strictEqual(dice.getDiceMode(), 'random')
    assert.deepStrictEqual(dice.getRemainingFixedRolls(), [])
  })

  it('clamps fixed values to valid d20 range', () => {
    dice.setFixedRolls([0, 25, -3])
    assert.strictEqual(dice.d20(), 1)  // clamped from 0
    assert.strictEqual(dice.d20(), 20) // clamped from 25
    assert.strictEqual(dice.d20(), 1)  // clamped from -3
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Commit-Reveal Protocol
// ═══════════════════════════════════════════════════════════════════════════

describe('generateCommitment', () => {
  it('returns serverSecret and commitment as hex strings', () => {
    const { serverSecret, commitment } = dice.generateCommitment()
    assert.strictEqual(typeof serverSecret, 'string')
    assert.strictEqual(typeof commitment, 'string')
    assert.strictEqual(serverSecret.length, 64) // 32 bytes → 64 hex chars
    assert.strictEqual(commitment.length, 64)   // SHA-256 → 64 hex chars
  })

  it('generates unique secrets each call', () => {
    const a = dice.generateCommitment()
    const b = dice.generateCommitment()
    assert.notStrictEqual(a.serverSecret, b.serverSecret)
    assert.notStrictEqual(a.commitment, b.commitment)
  })
})

describe('verifyCommitment', () => {
  it('returns true for matching secret/commitment pair', () => {
    const { serverSecret, commitment } = dice.generateCommitment()
    assert.strictEqual(dice.verifyCommitment(serverSecret, commitment), true)
  })

  it('returns false when secret does not match commitment', () => {
    const a = dice.generateCommitment()
    const b = dice.generateCommitment()
    assert.strictEqual(dice.verifyCommitment(a.serverSecret, b.commitment), false)
  })

  it('returns false for tampered commitment', () => {
    const { serverSecret } = dice.generateCommitment()
    const tampered = 'a'.repeat(64)
    assert.strictEqual(dice.verifyCommitment(serverSecret, tampered), false)
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
    assert.strictEqual(dice.getDiceMode(), 'seeded')
  })

  it('clearSeed reverts to previous mode', () => {
    dice.setDiceMode('random')
    const { serverSecret } = dice.generateCommitment()
    dice.applySeed(serverSecret, 'client-seed-1')
    assert.strictEqual(dice.getDiceMode(), 'seeded')
    dice.clearSeed()
    assert.strictEqual(dice.getDiceMode(), 'random')
  })

  it('produces deterministic results: same seeds → same sequence', () => {
    const { serverSecret } = dice.generateCommitment()
    dice.applySeed(serverSecret, 'my-client-seed')
    const seq1 = [dice.d20(), dice.d6(), dice.d8(), dice.d4(), dice.d12(), dice.d10()]
    dice.clearSeed()

    dice.applySeed(serverSecret, 'my-client-seed')
    const seq2 = [dice.d20(), dice.d6(), dice.d8(), dice.d4(), dice.d12(), dice.d10()]
    dice.clearSeed()

    assert.deepStrictEqual(seq1, seq2)
  })

  it('different client seeds produce different sequences', () => {
    const { serverSecret } = dice.generateCommitment()
    dice.applySeed(serverSecret, 'seed-alpha')
    const seq1 = [dice.d20(), dice.d6(), dice.d8()]
    dice.clearSeed()

    dice.applySeed(serverSecret, 'seed-beta')
    const seq2 = [dice.d20(), dice.d6(), dice.d8()]
    dice.clearSeed()

    assert.notDeepStrictEqual(seq1, seq2)
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

    assert.notDeepStrictEqual(seq1, seq2)
  })

  it('seeded d20 produces values in [1, 20]', () => {
    const { serverSecret } = dice.generateCommitment()
    dice.applySeed(serverSecret, 'range-test')
    for (let i = 0; i < 100; i++) {
      const val = dice.d20()
      assert.strictEqual(Number.isInteger(val), true)
      assert.ok(val >= 1)
      assert.ok(val <= 20)
    }
  })

  it('seeded d6 produces values in [1, 6]', () => {
    const { serverSecret } = dice.generateCommitment()
    dice.applySeed(serverSecret, 'range-d6')
    for (let i = 0; i < 100; i++) {
      const val = dice.d6()
      assert.strictEqual(Number.isInteger(val), true)
      assert.ok(val >= 1)
      assert.ok(val <= 6)
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
        assert.ok(val >= min)
        assert.ok(val <= max)
        assert.strictEqual(Number.isInteger(val), true)
      }
    }
  })

  it('parseDiceAndRoll works in seeded mode', () => {
    const { serverSecret } = dice.generateCommitment()
    dice.applySeed(serverSecret, 'parse-test')
    const result = dice.parseDiceAndRoll('3d6')
    assert.strictEqual(result.count, 3)
    assert.strictEqual(result.sides, 6)
    assert.strictEqual(result.rolls.length, 3)
    assert.strictEqual(result.total, result.rolls.reduce((a, b) => a + b, 0))
    for (const r of result.rolls) {
      assert.ok(r >= 1)
      assert.ok(r <= 6)
    }
  })

  it('rollWithAdvantage works in seeded mode', () => {
    const { serverSecret } = dice.generateCommitment()
    dice.applySeed(serverSecret, 'adv-test')
    const r = dice.rollWithAdvantage()
    assert.ok(r.result >= r.roll1)
    assert.ok(r.result >= r.roll2)
    assert.ok(r.roll1 >= 1)
    assert.ok(r.roll1 <= 20)
    assert.ok(r.roll2 >= 1)
    assert.ok(r.roll2 <= 20)
  })

  it('seeded mode does not activate spontaneously', () => {
    dice.clearSeed()
    dice.setDiceMode('random')
    assert.notStrictEqual(dice.getDiceMode(), 'seeded')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// rollFromSeed — per-die seeded roll (pure function)
// ═══════════════════════════════════════════════════════════════════════════

describe('rollFromSeed', () => {
  it('returns deterministic result for same seed and sides', () => {
    const a = dice.rollFromSeed(12345, 20)
    const b = dice.rollFromSeed(12345, 20)
    assert.strictEqual(a, b)
  })

  it('returns different results for different seeds', () => {
    const a = dice.rollFromSeed(100, 20)
    const b = dice.rollFromSeed(200, 20)
    // Might rarely collide but extremely unlikely for d20
    assert.strictEqual(a === b && dice.rollFromSeed(300, 20) === a, false)
  })

  it('returns valid d20 range', () => {
    for (let seed = 0; seed < 100; seed++) {
      const val = dice.rollFromSeed(seed, 20)
      assert.ok(val >= 1)
      assert.ok(val <= 20)
      assert.strictEqual(Number.isInteger(val), true)
    }
  })

  it('returns valid d6 range', () => {
    for (let seed = 0; seed < 100; seed++) {
      const val = dice.rollFromSeed(seed, 6)
      assert.ok(val >= 1)
      assert.ok(val <= 6)
    }
  })

  it('accepts string seeds', () => {
    const a = dice.rollFromSeed('hello', 20)
    const b = dice.rollFromSeed('hello', 20)
    assert.strictEqual(a, b)
    assert.ok(a >= 1)
    assert.ok(a <= 20)
  })
})
