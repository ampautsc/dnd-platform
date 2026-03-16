/**
 * Spell Resolver — unit tests
 * Tests the generic spell resolution pipeline against spell registry data.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import * as dice from '../src/engine/dice.js'
import { createCreature } from '@dnd-platform/content/creatures'
import * as resolver from '../src/engine/spellResolver.js'

beforeAll(() => dice.setDiceMode('average'))
afterAll(() => dice.setDiceMode('random'))

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
    expect(bard.spellSlots[1]).toBe(4)
    expect(resolver.spendSlot(bard, 1)).toBe(true)
    expect(bard.spellSlots[1]).toBe(3)
  })

  it('returns false when no slots remain', () => {
    const bard = makeBard()
    bard.spellSlots[4] = 0
    expect(resolver.spendSlot(bard, 4)).toBe(false)
    expect(bard.spellSlots[4]).toBe(0)
  })

  it('increments spellsCast counter', () => {
    const bard = makeBard()
    resolver.spendSlot(bard, 1)
    expect(bard.spellsCast).toBe(1)
  })
})

describe('hasSlot', () => {
  it('true when slots available', () => {
    expect(resolver.hasSlot(makeBard(), 3)).toBe(true)
  })

  it('false when slots exhausted', () => {
    const bard = makeBard()
    bard.spellSlots[4] = 0
    expect(resolver.hasSlot(bard, 4)).toBe(false)
  })

  it('always true for cantrips (level 0)', () => {
    expect(resolver.hasSlot(makeBard(), 0)).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// getSaveDC
// ═══════════════════════════════════════════════════════════════════════════

describe('getSaveDC', () => {
  it('cult fanatic uses spellSaveDC directly', () => {
    expect(resolver.getSaveDC(makeFanatic(), {})).toBe(11)
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

    expect(result.success).toBe(true)
    expect(result.details.affectedCount).toBe(2)
    expect(f1.conditions).toContain('charmed_hp')
    expect(f1.conditions).toContain('incapacitated')
    expect(f2.conditions).toContain('charmed_hp')
    expect(bard.concentrating).toBe('Hypnotic Pattern')
    expect(bard.spellSlots[3]).toBe(2)
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

    expect(result.details.affectedCount).toBe(1)
    expect(f1.conditions).toEqual([])
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

    expect(result.success).toBe(true)
    expect(result.details.affectedCount).toBe(2)
    expect(f1.conditions).toContain('charmed_hp')
    expect(f2.conditions).toContain('charmed_hp')
    expect(f3.conditions).toEqual([])
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

    expect(result.success).toBe(true)
    expect(result.details.saved).toBe(false)
    expect(f2.conditions).toContain('paralyzed')
    expect(bard.concentrating).toBe('Hold Person')
    expect(bard.spellSlots[2]).toBe(2)
  })

  it('target resists on successful save', () => {
    const f1 = makeFanatic(1)
    const bard = makeBard()
    const log = []

    // fanatic DC = 11, bard WIS +1, average = 11.5 >= 11 → SUCCESS
    const result = resolver.resolveSpell(f1, {
      spell: 'Hold Person', level: 2, target: bard,
    }, [f1, bard], log)

    expect(result.details.saved).toBe(true)
    expect(bard.conditions).toEqual([])
    expect(f1.concentrating).toBeNull()
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

    expect(result.success).toBe(true)
    expect(bard.conditions).toContain('invisible')
    expect(bard.concentrating).toBe('Greater Invisibility')
    expect(bard.spellSlots[4]).toBe(1)
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

    expect(result.success).toBe(true)
    expect(result.details.hit).toBe(true)
    expect(f2.currentHP).toBe(33 - 16.5)
    expect(f1.totalDamageDealt).toBe(16.5)
  })

  it('misses when attack doesn\'t meet AC', () => {
    const f1 = makeFanatic(1)
    const bard = makeBard()
    const log = []

    const result = resolver.resolveSpell(f1, {
      spell: 'Inflict Wounds', level: 1, target: bard,
    }, [f1, bard], log)

    expect(result.details.hit).toBe(false)
    expect(bard.currentHP).toBe(67)
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

    expect(result.success).toBe(true)
    expect(result.details.saved).toBe(false)
    expect(f1.currentHP).toBe(33 - 5)
    expect(f1.conditions).toContain('vm_disadvantage')
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

    expect(result.details.saved).toBe(false)
    expect(f2.currentHP).toBe(33 - 4.5)
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

    expect(result.success).toBe(true)
    expect(f1.ac).toBe(beforeAC + 2)
    expect(f1.concentrating).toBe('Shield of Faith')
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

    expect(result.success).toBe(false)
    expect(result.countered).toBe(true)
    expect(bard.conditions).toEqual([])
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

    expect(result.success).toBe(true)
    expect(result.countered).toBe(false)
    expect(f1.conditions).toContain('paralyzed')
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

    expect(f1.conditions).toEqual([])
    expect(bard.concentrating).toBe('Hold Person')
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
    expect(result.success).toBe(false)
    expect(result.details.error).toBe('unknown_spell')
  })

  it('returns failure when no slots remain', () => {
    const bard = makeBard()
    bard.spellSlots[3] = 0
    const f1 = makeFanatic(1)
    const log = []
    const result = resolver.resolveSpell(bard, {
      spell: 'Hypnotic Pattern', level: 3, targets: [f1],
    }, [bard, f1], log)
    expect(result.success).toBe(false)
    expect(result.details.error).toBe('no_slots')
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
    expect(advLog).toBeTruthy()
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
    expect(conLog).toBeTruthy()
    expect(conLog).toContain('MAINTAINED')
  })
})
