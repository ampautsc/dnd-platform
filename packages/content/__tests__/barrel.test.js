import { describe, it, expect } from 'vitest'
import { spells, creatures, items, loot, npcs, towns, species } from '../src/index.js'

describe('barrel export', () => {
  it('exports spells namespace', () => {
    expect(typeof spells.getSpell).toBe('function')
    expect(typeof spells.SPELLS).toBe('object')
  })

  it('exports creatures namespace', () => {
    expect(typeof creatures.createCreature).toBe('function')
    expect(typeof creatures.CREATURE_TEMPLATES).toBe('object')
  })

  it('exports items namespace', () => {
    expect(typeof items.getItem).toBe('function')
    expect(Array.isArray(items.ITEMS)).toBe(true)
  })

  it('exports loot namespace', () => {
    expect(typeof loot.getLootTable).toBe('function')
    expect(typeof loot.LOOT_TABLES).toBe('object')
  })

  it('exports npcs namespace', () => {
    expect(typeof npcs.getNpc).toBe('function')
    expect(typeof npcs.NPC_PERSONALITIES).toBe('object')
  })

  it('exports towns namespace', () => {
    expect(typeof towns.getTown).toBe('function')
    expect(typeof towns.TOWNS).toBe('object')
  })

  it('exports species namespace', () => {
    expect(typeof species.getSpecies).toBe('function')
    expect(typeof species.SPECIES).toBe('object')
  })
})
