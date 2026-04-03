import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  TOWNS,
  getTown,
  hasTown,
  getAllTownKeys,
} from '../src/towns/index.js'

describe('TOWNS data integrity', () => {
  const keys = getAllTownKeys()

  it('has at least 1 town', () => {
    assert.ok(keys.length >= 1)
  })

  for (const key of keys) {
    it(`${key} has required fields`, () => {
    const t = TOWNS[key]
    assert.strictEqual(t.id, key)
    assert.strictEqual(typeof t.name, 'string')
    assert.strictEqual(typeof t.type, 'string')
    assert.strictEqual(typeof t.population, 'number')
    assert.ok(t.population > 0)
    assert.strictEqual(typeof t.description, 'string')
    });
  }

  for (const key of keys) {
    it(`${key} has location with region and terrain`, () => {
    const loc = TOWNS[key].location
    assert.strictEqual(typeof loc.region, 'string')
    assert.strictEqual(typeof loc.terrain, 'string')
    });
  }

  for (const key of keys) {
    it(`${key} has notableLocations array`, () => {
    const t = TOWNS[key]
    assert.strictEqual(Array.isArray(t.notableLocations), true)
    assert.ok(t.notableLocations.length > 0)
    for (const loc of t.notableLocations) {
      assert.strictEqual(typeof loc.name, 'string')
      assert.strictEqual(typeof loc.type, 'string')
    }
    });
  }

  for (const key of keys) {
    it(`${key} has npcRoster array`, () => {
    const t = TOWNS[key]
    assert.strictEqual(Array.isArray(t.npcRoster), true)
    for (const entry of t.npcRoster) {
      assert.strictEqual(typeof entry.templateKey, 'string')
      assert.strictEqual(typeof entry.name, 'string')
      assert.strictEqual(typeof entry.role, 'string')
    }
    });
  }
})

describe('Millhaven spot checks', () => {
  it('is a market town with 1200 population', () => {
    const m = getTown('millhaven')
    assert.strictEqual(m.name, 'Millhaven')
    assert.strictEqual(m.type, 'market_town')
    assert.strictEqual(m.population, 1200)
  })

  it('has Bottoms Up as a notable location', () => {
    const m = getTown('millhaven')
    const tavern = m.notableLocations.find(l => l.name === 'Bottoms Up')
    assert.notStrictEqual(tavern, undefined)
    assert.strictEqual(tavern.type, 'inn_and_tavern')
  })

  it('has bree_millhaven in npcRoster', () => {
    const m = getTown('millhaven')
    const bree = m.npcRoster.find(n => n.templateKey === 'bree_millhaven')
    assert.notStrictEqual(bree, undefined)
    assert.strictEqual(bree.name, 'Bree')
  })

  it('has factions', () => {
    const m = getTown('millhaven')
    assert.strictEqual(Array.isArray(m.factions), true)
    assert.ok(m.factions.length > 0)
  })
})

describe('towns registry API', () => {
  it('getTown returns town by id', () => {
    assert.strictEqual(getTown('millhaven').name, 'Millhaven')
  })

  it('getTown returns undefined for unknown', () => {
    assert.strictEqual(getTown('atlantis'), undefined)
  })

  it('hasTown returns true for existing', () => {
    assert.strictEqual(hasTown('millhaven'), true)
  })

  it('hasTown returns false for missing', () => {
    assert.strictEqual(hasTown('atlantis'), false)
  })

  it('getAllTownKeys returns array', () => {
    const keys = getAllTownKeys()
    assert.strictEqual(Array.isArray(keys), true)
    assert.ok(keys.includes('millhaven'))
  })
})
