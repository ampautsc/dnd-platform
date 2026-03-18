import { describe, it, expect } from 'vitest'
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
    expect(keys.length).toBeGreaterThanOrEqual(1)
  })

  it.each(keys)('%s has required fields', (key) => {
    const loc = LOCATIONS[key]
    expect(loc.id).toBe(key)
    expect(typeof loc.name).toBe('string')
    expect(typeof loc.type).toBe('string')
    expect(typeof loc.description).toBe('string')
  })

  it.each(keys)('%s has atmosphere object', (key) => {
    const atm = LOCATIONS[key].atmosphere
    expect(typeof atm).toBe('object')
    expect(typeof atm.defaultTone).toBe('string')
    expect(Array.isArray(atm.tags)).toBe(true)
    expect(Array.isArray(atm.sounds)).toBe(true)
    expect(Array.isArray(atm.smells)).toBe(true)
  })

  it.each(keys)('%s has layout array', (key) => {
    const loc = LOCATIONS[key]
    expect(Array.isArray(loc.layout)).toBe(true)
    expect(loc.layout.length).toBeGreaterThan(0)
    for (const area of loc.layout) {
      expect(typeof area.name).toBe('string')
      expect(typeof area.description).toBe('string')
    }
  })

  it.each(keys)('%s has regulars array of strings', (key) => {
    const loc = LOCATIONS[key]
    expect(Array.isArray(loc.regulars)).toBe(true)
    for (const r of loc.regulars) {
      expect(typeof r).toBe('string')
    }
  })
})

describe('getLocation / hasLocation helpers', () => {
  it('returns a location by id', () => {
    const keys = getAllLocationKeys()
    const first = getLocation(keys[0])
    expect(first).toBeDefined()
    expect(first.id).toBe(keys[0])
  })

  it('returns undefined for unknown key', () => {
    expect(getLocation('nonexistent_place')).toBeUndefined()
  })

  it('hasLocation returns true for known key', () => {
    const keys = getAllLocationKeys()
    expect(hasLocation(keys[0])).toBe(true)
  })

  it('hasLocation returns false for unknown key', () => {
    expect(hasLocation('nonexistent_place')).toBe(false)
  })
})

describe('getLocationsByType', () => {
  it('returns array of locations matching type', () => {
    const taverns = getLocationsByType('tavern')
    expect(Array.isArray(taverns)).toBe(true)
    expect(taverns.length).toBeGreaterThanOrEqual(1)
    for (const loc of taverns) {
      expect(loc.type).toBe('tavern')
    }
  })

  it('returns empty array for unknown type', () => {
    expect(getLocationsByType('spaceship')).toEqual([])
  })
})

describe('Bottoms Up spot checks', () => {
  it('exists as a tavern', () => {
    const bu = getLocation('bottoms_up')
    expect(bu).toBeDefined()
    expect(bu.name).toBe('Bottoms Up')
    expect(bu.type).toBe('tavern')
  })

  it('has an owner', () => {
    const bu = getLocation('bottoms_up')
    expect(typeof bu.owner).toBe('string')
    expect(bu.owner.length).toBeGreaterThan(0)
  })

  it('has hooks array', () => {
    const bu = getLocation('bottoms_up')
    expect(Array.isArray(bu.hooks)).toBe(true)
    expect(bu.hooks.length).toBeGreaterThan(0)
  })

  it('has worldContext', () => {
    const bu = getLocation('bottoms_up')
    expect(typeof bu.worldContext).toBe('object')
    expect(typeof bu.worldContext.location).toBe('string')
    expect(typeof bu.worldContext.defaultTone).toBe('string')
  })
})
