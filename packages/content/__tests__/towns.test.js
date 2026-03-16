import { describe, it, expect } from 'vitest'
import {
  TOWNS,
  getTown,
  hasTown,
  getAllTownKeys,
} from '../src/towns/index.js'

describe('TOWNS data integrity', () => {
  const keys = getAllTownKeys()

  it('has at least 1 town', () => {
    expect(keys.length).toBeGreaterThanOrEqual(1)
  })

  it.each(keys)('%s has required fields', (key) => {
    const t = TOWNS[key]
    expect(t.id).toBe(key)
    expect(typeof t.name).toBe('string')
    expect(typeof t.type).toBe('string')
    expect(typeof t.population).toBe('number')
    expect(t.population).toBeGreaterThan(0)
    expect(typeof t.description).toBe('string')
  })

  it.each(keys)('%s has location with region and terrain', (key) => {
    const loc = TOWNS[key].location
    expect(typeof loc.region).toBe('string')
    expect(typeof loc.terrain).toBe('string')
  })

  it.each(keys)('%s has notableLocations array', (key) => {
    const t = TOWNS[key]
    expect(Array.isArray(t.notableLocations)).toBe(true)
    expect(t.notableLocations.length).toBeGreaterThan(0)
    for (const loc of t.notableLocations) {
      expect(typeof loc.name).toBe('string')
      expect(typeof loc.type).toBe('string')
    }
  })

  it.each(keys)('%s has npcRoster array', (key) => {
    const t = TOWNS[key]
    expect(Array.isArray(t.npcRoster)).toBe(true)
    for (const entry of t.npcRoster) {
      expect(typeof entry.templateKey).toBe('string')
      expect(typeof entry.name).toBe('string')
      expect(typeof entry.role).toBe('string')
    }
  })
})

describe('Millhaven spot checks', () => {
  it('is a market town with 1200 population', () => {
    const m = getTown('millhaven')
    expect(m.name).toBe('Millhaven')
    expect(m.type).toBe('market_town')
    expect(m.population).toBe(1200)
  })

  it('has The Tipsy Gnome as a notable location', () => {
    const m = getTown('millhaven')
    const gnome = m.notableLocations.find(l => l.name === 'The Tipsy Gnome')
    expect(gnome).toBeDefined()
    expect(gnome.type).toBe('inn_and_tavern')
  })

  it('has bree_millhaven in npcRoster', () => {
    const m = getTown('millhaven')
    const bree = m.npcRoster.find(n => n.templateKey === 'bree_millhaven')
    expect(bree).toBeDefined()
    expect(bree.name).toBe('Bree')
  })

  it('has factions', () => {
    const m = getTown('millhaven')
    expect(Array.isArray(m.factions)).toBe(true)
    expect(m.factions.length).toBeGreaterThan(0)
  })
})

describe('towns registry API', () => {
  it('getTown returns town by id', () => {
    expect(getTown('millhaven').name).toBe('Millhaven')
  })

  it('getTown returns undefined for unknown', () => {
    expect(getTown('atlantis')).toBeUndefined()
  })

  it('hasTown returns true for existing', () => {
    expect(hasTown('millhaven')).toBe(true)
  })

  it('hasTown returns false for missing', () => {
    expect(hasTown('atlantis')).toBe(false)
  })

  it('getAllTownKeys returns array', () => {
    const keys = getAllTownKeys()
    expect(Array.isArray(keys)).toBe(true)
    expect(keys).toContain('millhaven')
  })
})
