import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spells, creatures, items, loot, npcs, towns, species } from '../src/index.js'

describe('barrel export', () => {
  it('exports spells namespace', () => {
    assert.strictEqual(typeof spells.getSpell, 'function')
    assert.strictEqual(typeof spells.SPELLS, 'object')
  })

  it('exports creatures namespace', () => {
    assert.strictEqual(typeof creatures.createCreature, 'function')
    assert.strictEqual(typeof creatures.CREATURE_TEMPLATES, 'object')
  })

  it('exports items namespace', () => {
    assert.strictEqual(typeof items.getItem, 'function')
    assert.strictEqual(Array.isArray(items.ITEMS), true)
  })

  it('exports loot namespace', () => {
    assert.strictEqual(typeof loot.getLootTable, 'function')
    assert.strictEqual(typeof loot.LOOT_TABLES, 'object')
  })

  it('exports npcs namespace', () => {
    assert.strictEqual(typeof npcs.getNpc, 'function')
    assert.strictEqual(typeof npcs.NPC_PERSONALITIES, 'object')
  })

  it('exports towns namespace', () => {
    assert.strictEqual(typeof towns.getTown, 'function')
    assert.strictEqual(typeof towns.TOWNS, 'object')
  })

  it('exports species namespace', () => {
    assert.strictEqual(typeof species.getSpecies, 'function')
    assert.strictEqual(typeof species.SPECIES, 'object')
  })
})
