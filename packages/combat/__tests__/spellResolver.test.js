/**
 * Spell Resolver — unit tests
 * Tests the generic spell resolution pipeline against spell registry data.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import * as dice from '../src/engine/dice.js'
import { createCreature } from '@dnd-platform/content/creatures'
import * as resolver from '../src/engine/spellResolver.js'

before(() => dice.setDiceMode('average'))
after(() => dice.setDiceMode('random'))

// ═══════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════

function makeBard() {
  return createCreature('gem_dragonborn_lore_bard_8')
}

function makeFanatic(index = 1) {
  return createCreature('cult_fanatic', {
    name: `Cult Fanatic ${index}`,
    id: `cult_fanatic_${index}`,
    position: { x: index, y: 0 },
  })
}

// ═══════════════════════════════════════════════════════════════════════════
// Slot Management
// ═══════════════════════════════════════════════════════════════════════════

describe('spendSlot', () => {
  it('decrements slot count', () => {
    const bard = makeBard()
    assert.strictEqual(bard.spellSlots[1], 4)
    assert.strictEqual(resolver.spendSlot(bard, 1), true)
    assert.strictEqual(bard.spellSlots[1], 3)
  })

  it('returns false when no slots remain', () => {
    const bard = makeBard()
    bard.spellSlots[4] = 0
    assert.strictEqual(resolver.spendSlot(bard, 4), false)
    assert.strictEqual(bard.spellSlots[4], 0)
  })

  it('increments spellsCast counter', () => {
    const bard = makeBard()
    resolver.spendSlot(bard, 1)
    assert.strictEqual(bard.spellsCast, 1)
  })
})

describe('hasSlot', () => {
  it('true when slots available', () => {
    assert.strictEqual(resolver.hasSlot(makeBard(), 3), true)
  })

  it('false when slots exhausted', () => {
    const bard = makeBard()
    bard.spellSlots[4] = 0
    assert.strictEqual(resolver.hasSlot(bard, 4), false)
  })

  it('always true for cantrips (level 0)', () => {
    assert.strictEqual(resolver.hasSlot(makeBard(), 0), true)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// getSaveDC
// ═══════════════════════════════════════════════════════════════════════════

describe('getSaveDC', () => {
  it('cult fanatic uses spellSaveDC directly', () => {
    assert.strictEqual(resolver.getSaveDC(makeFanatic(), {}), 11)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// resolveSpell — Hypnotic Pattern (AoE save)
// ═══════════════════════════════════════════════════════════════════════════

describe('resolveSpell — Hypnotic Pattern', () => {
  it('charms targets that fail WIS save', () => {
    const bard = makeBard()
    const f1 = makeFanatic(1)
    const f2 = makeFanatic(2)
    const all = [bard, f1, f2]
    const log = []

    const result = resolver.resolveSpell(bard, {
      spell: 'Hypnotic Pattern', level: 3, targets: [f1, f2],
    }, all, log)

    assert.strictEqual(result.success, true)
    assert.strictEqual(result.details.affectedCount, 2)
    assert.ok(f1.conditions.includes('charmed_hp'))
    assert.ok(f1.conditions.includes('incapacitated'))
    assert.ok(f2.conditions.includes('charmed_hp'))
    assert.strictEqual(bard.concentrating, 'Hypnotic Pattern')
    assert.strictEqual(bard.spellSlots[3], 2)
  })

  it('skips dead targets', () => {
    const bard = makeBard()
    const f1 = makeFanatic(1)
    f1.currentHP = 0
    const f2 = makeFanatic(2)
    const log = []

    const result = resolver.resolveSpell(bard, {
      spell: 'Hypnotic Pattern', level: 3, targets: [f1, f2],
    }, [bard, f1, f2], log)

    assert.strictEqual(result.details.affectedCount, 1)
    assert.deepStrictEqual(f1.conditions, [])
  })

  it('resolves targets from aoeCenter when provided (engine-resolved)', () => {
    const bard = makeBard()
    const f1 = makeFanatic(1)
    f1.position = { x: 10, y: 0 }
    const f2 = makeFanatic(2)
    f2.position = { x: 11, y: 0 }
    const f3 = makeFanatic(3)
    f3.position = { x: 30, y: 0 }
    const log = []

    const result = resolver.resolveSpell(bard, {
      spell: 'Hypnotic Pattern', level: 3, aoeCenter: { x: 10, y: 0 },
    }, [bard, f1, f2, f3], log)

    assert.strictEqual(result.success, true)
    assert.strictEqual(result.details.affectedCount, 2)
    assert.ok(f1.conditions.includes('charmed_hp'))
    assert.ok(f2.conditions.includes('charmed_hp'))
    assert.deepStrictEqual(f3.conditions, [])
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// resolveSpell — Hold Person (single-target save)
// ═══════════════════════════════════════════════════════════════════════════

describe('resolveSpell — Hold Person', () => {
  it('paralyzes target on failed WIS save', () => {
    const bard = makeBard()
    const f2 = makeFanatic(2)
    const log = []

    const result = resolver.resolveSpell(bard, {
      spell: 'Hold Person', level: 2, target: f2,
    }, [bard, f2], log)

    assert.strictEqual(result.success, true)
    assert.strictEqual(result.details.saved, false)
    assert.ok(f2.conditions.includes('paralyzed'))
    assert.strictEqual(bard.concentrating, 'Hold Person')
    assert.strictEqual(bard.spellSlots[2], 2)
  })

  it('target resists on successful save', () => {
    const f1 = makeFanatic(1)
    const bard = makeBard()
    const log = []

    // fanatic DC = 11, bard WIS +1, average = 11.5 >= 11 → SUCCESS
    const result = resolver.resolveSpell(f1, {
      spell: 'Hold Person', level: 2, target: bard,
    }, [f1, bard], log)

    assert.strictEqual(result.details.saved, true)
    assert.deepStrictEqual(bard.conditions, [])
    assert.strictEqual(f1.concentrating, null)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// resolveSpell — Greater Invisibility (self-buff)
// ═══════════════════════════════════════════════════════════════════════════

describe('resolveSpell — Greater Invisibility', () => {
  it('makes caster invisible with concentration', () => {
    const bard = makeBard()
    const log = []

    const result = resolver.resolveSpell(bard, {
      spell: 'Greater Invisibility', level: 4,
    }, [bard], log)

    assert.strictEqual(result.success, true)
    assert.ok(bard.conditions.includes('invisible'))
    assert.strictEqual(bard.concentrating, 'Greater Invisibility')
    assert.strictEqual(bard.spellSlots[4], 1)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// resolveSpell — Inflict Wounds (melee spell attack)
// ═══════════════════════════════════════════════════════════════════════════

describe('resolveSpell — Inflict Wounds', () => {
  it('deals 3d10 necrotic on hit', () => {
    const f1 = makeFanatic(1)
    const f2 = makeFanatic(2)
    f2.ac = 10
    const log = []

    const result = resolver.resolveSpell(f1, {
      spell: 'Inflict Wounds', level: 1, target: f2,
    }, [f1, f2], log)

    assert.strictEqual(result.success, true)
    assert.strictEqual(result.details.hit, true)
    assert.strictEqual(f2.currentHP, 33 - 16.5)
    assert.strictEqual(f1.totalDamageDealt, 16.5)
  })

  it('misses when attack doesn\'t meet AC', () => {
    const f1 = makeFanatic(1)
    const bard = makeBard()
    const log = []

    const result = resolver.resolveSpell(f1, {
      spell: 'Inflict Wounds', level: 1, target: bard,
    }, [f1, bard], log)

    assert.strictEqual(result.details.hit, false)
    assert.strictEqual(bard.currentHP, 67)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// resolveCantrip — Vicious Mockery
// ═══════════════════════════════════════════════════════════════════════════

describe('resolveCantrip — Vicious Mockery', () => {
  it('deals psychic damage and applies disadvantage on failed save', () => {
    const bard = makeBard()
    const f1 = makeFanatic(1)
    const log = []

    const result = resolver.resolveCantrip(bard, {
      spell: 'Vicious Mockery', target: f1,
    }, [bard, f1], log)

    assert.strictEqual(result.success, true)
    assert.strictEqual(result.details.saved, false)
    assert.strictEqual(f1.currentHP, 33 - 5)
    assert.ok(f1.conditions.includes('vm_disadvantage'))
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// resolveCantrip — Sacred Flame
// ═══════════════════════════════════════════════════════════════════════════

describe('resolveCantrip — Sacred Flame', () => {
  it('deals radiant damage on auto-fail DEX save (paralyzed)', () => {
    const f1 = makeFanatic(1)
    const f2 = makeFanatic(2)
    f2.conditions.push('paralyzed')
    const log = []

    const result = resolver.resolveCantrip(f1, {
      spell: 'Sacred Flame', target: f2,
    }, [f1, f2], log)

    assert.strictEqual(result.details.saved, false)
    assert.strictEqual(f2.currentHP, 33 - 4.5)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// resolveSpell — Shield of Faith
// ═══════════════════════════════════════════════════════════════════════════

describe('resolveSpell — Shield of Faith', () => {
  it('grants +2 AC and sets concentration', () => {
    const f1 = makeFanatic(1)
    const beforeAC = f1.ac
    const log = []

    const result = resolver.resolveSpell(f1, {
      spell: 'Shield of Faith', level: 1, target: f1,
    }, [f1], log)

    assert.strictEqual(result.success, true)
    assert.strictEqual(f1.ac, beforeAC + 2)
    assert.strictEqual(f1.concentrating, 'Shield of Faith')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Counterspell reaction
// ═══════════════════════════════════════════════════════════════════════════

describe('resolveSpell — Counterspell reaction', () => {
  it('spell is countered when onReaction returns countered', () => {
    const f1 = makeFanatic(1)
    const bard = makeBard()
    const log = []

    const result = resolver.resolveSpell(f1, {
      spell: 'Hold Person', level: 2, target: bard,
    }, [f1, bard], log, {
      onReaction: () => ({ countered: true, counteredBy: bard.name }),
    })

    assert.strictEqual(result.success, false)
    assert.strictEqual(result.countered, true)
    assert.deepStrictEqual(bard.conditions, [])
  })

  it('spell resolves normally when onReaction returns null', () => {
    const bard = makeBard()
    const f1 = makeFanatic(1)
    const log = []

    const result = resolver.resolveSpell(bard, {
      spell: 'Hold Person', level: 2, target: f1,
    }, [bard, f1], log, {
      onReaction: () => null,
    })

    assert.strictEqual(result.success, true)
    assert.strictEqual(result.countered, false)
    assert.ok(f1.conditions.includes('paralyzed'))
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Concentration switch
// ═══════════════════════════════════════════════════════════════════════════

describe('concentration switch', () => {
  it('casting Hold Person drops existing Hypnotic Pattern', () => {
    const bard = makeBard()
    const f1 = makeFanatic(1)
    const f2 = makeFanatic(2)
    f1.conditions.push('charmed_hp', 'incapacitated')
    bard.concentrating = 'Hypnotic Pattern'
    bard.concentrationRoundsRemaining = 8
    const log = []

    resolver.resolveSpell(bard, {
      spell: 'Hold Person', level: 2, target: f2,
    }, [bard, f1, f2], log)

    assert.deepStrictEqual(f1.conditions, [])
    assert.strictEqual(bard.concentrating, 'Hold Person')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Error handling
// ═══════════════════════════════════════════════════════════════════════════

describe('error handling', () => {
  it('returns failure for unknown spell', () => {
    const bard = makeBard()
    const log = []
    const result = resolver.resolveSpell(bard, { spell: 'Meteor Swarm', level: 9 }, [bard], log)
    assert.strictEqual(result.success, false)
    assert.strictEqual(result.details.error, 'unknown_spell')
  })

  it('returns failure when no slots remain', () => {
    const bard = makeBard()
    bard.spellSlots[3] = 0
    const f1 = makeFanatic(1)
    const log = []
    const result = resolver.resolveSpell(bard, {
      spell: 'Hypnotic Pattern', level: 3, targets: [f1],
    }, [bard, f1], log)
    assert.strictEqual(result.success, false)
    assert.strictEqual(result.details.error, 'no_slots')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Dark Devotion
// ═══════════════════════════════════════════════════════════════════════════

describe('Dark Devotion — advantage on charmed saves', () => {
  it('fanatics get advantage on Hypnotic Pattern saves', () => {
    const bard = makeBard()
    const f1 = makeFanatic(1)
    const log = []

    resolver.resolveSpell(bard, {
      spell: 'Hypnotic Pattern', level: 3, targets: [f1],
    }, [bard, f1], log)

    const advLog = log.find(l => l.includes('ADV'))
    assert.ok(advLog)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Concentration damage check
// ═══════════════════════════════════════════════════════════════════════════

describe('concentration check from spell damage', () => {
  it('Inflict Wounds triggers concentration check on hit', () => {
    const f1 = makeFanatic(1)
    const bard = makeBard()
    bard.concentrating = 'Hypnotic Pattern'
    bard.ac = 10
    const log = []

    resolver.resolveSpell(f1, {
      spell: 'Inflict Wounds', level: 1, target: bard,
    }, [f1, bard], log)

    const conLog = log.find(l => l.includes('Concentration save'))
    assert.ok(conLog)
    assert.ok(conLog.includes('MAINTAINED'))
  })
})
