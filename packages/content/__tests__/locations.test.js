import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  LOCATIONS,
  getLocation,
  hasLocation,
  getAllLocationKeys,
  getLocationsByType,
} from '../src/locations/index.js'

describe('LOCATIONS data integrity', () => {
  const keys = getAllLocationKeys()

  it('has at least 1 location', () => {
    assert.ok(keys.length >= 1)
  })

  for (const key of keys) {
    it(`${key} has required fields`, () => {
    const loc = LOCATIONS[key]
    assert.strictEqual(loc.id, key)
    assert.strictEqual(typeof loc.name, 'string')
    assert.strictEqual(typeof loc.type, 'string')
    assert.strictEqual(typeof loc.description, 'string')
    });
  }

  for (const key of keys) {
    it(`${key} has atmosphere object`, () => {
    const atm = LOCATIONS[key].atmosphere
    assert.strictEqual(typeof atm, 'object')
    assert.strictEqual(typeof atm.defaultTone, 'string')
    assert.strictEqual(Array.isArray(atm.tags), true)
    assert.strictEqual(Array.isArray(atm.sounds), true)
    assert.strictEqual(Array.isArray(atm.smells), true)
    });
  }

  for (const key of keys) {
    it(`${key} has layout array`, () => {
    const loc = LOCATIONS[key]
    assert.strictEqual(Array.isArray(loc.layout), true)
    assert.ok(loc.layout.length > 0)
    for (const area of loc.layout) {
      assert.strictEqual(typeof area.name, 'string')
      assert.strictEqual(typeof area.description, 'string')
    }
    });
  }

  for (const key of keys) {
    it(`${key} has regulars array of strings`, () => {
    const loc = LOCATIONS[key]
    assert.strictEqual(Array.isArray(loc.regulars), true)
    for (const r of loc.regulars) {
      assert.strictEqual(typeof r, 'string')
    }
    });
  }
})

describe('getLocation / hasLocation helpers', () => {
  it('returns a location by id', () => {
    const keys = getAllLocationKeys()
    const first = getLocation(keys[0])
    assert.notStrictEqual(first, undefined)
    assert.strictEqual(first.id, keys[0])
  })

  it('returns undefined for unknown key', () => {
    assert.strictEqual(getLocation('nonexistent_place'), undefined)
  })

  it('hasLocation returns true for known key', () => {
    const keys = getAllLocationKeys()
    assert.strictEqual(hasLocation(keys[0]), true)
  })

  it('hasLocation returns false for unknown key', () => {
    assert.strictEqual(hasLocation('nonexistent_place'), false)
  })
})

describe('getLocationsByType', () => {
  it('returns array of locations matching type', () => {
    const taverns = getLocationsByType('tavern')
    assert.strictEqual(Array.isArray(taverns), true)
    assert.ok(taverns.length >= 1)
    for (const loc of taverns) {
      assert.strictEqual(loc.type, 'tavern')
    }
  })

  it('returns empty array for unknown type', () => {
    assert.deepStrictEqual(getLocationsByType('spaceship'), [])
  })
})

describe('Bottoms Up spot checks', () => {
  it('exists as a tavern', () => {
    const bu = getLocation('bottoms_up')
    assert.notStrictEqual(bu, undefined)
    assert.strictEqual(bu.name, 'Bottoms Up')
    assert.strictEqual(bu.type, 'tavern')
  })

  it('has an owner', () => {
    const bu = getLocation('bottoms_up')
    assert.strictEqual(typeof bu.owner, 'string')
    assert.ok(bu.owner.length > 0)
  })

  it('has hooks array', () => {
    const bu = getLocation('bottoms_up')
    assert.strictEqual(Array.isArray(bu.hooks), true)
    assert.ok(bu.hooks.length > 0)
  })

  it('has worldContext', () => {
    const bu = getLocation('bottoms_up')
    assert.strictEqual(typeof bu.worldContext, 'object')
    assert.strictEqual(typeof bu.worldContext.location, 'string')
    assert.strictEqual(typeof bu.worldContext.defaultTone, 'string')
  })
})
