import { describe, it, expect } from 'vitest'
import {
  SPECIES,
  getSpecies,
  hasSpecies,
  getAllSpeciesSlugs,
  getSpeciesBySource,
  getSpeciesWithFlight,
} from '../src/species/index.js'

const REQUIRED_FIELDS = ['name', 'slug', 'source', 'description', 'size', 'speed']

describe('SPECIES data integrity', () => {
  const slugs = getAllSpeciesSlugs()

  it('has at least 71 species', () => {
    expect(slugs.length).toBeGreaterThanOrEqual(71)
  })

  it.each(slugs)('%s has required fields', (slug) => {
    const s = getSpecies(slug)
    for (const field of REQUIRED_FIELDS) {
      expect(s[field], `missing ${field}`).toBeDefined()
    }
  })

  it.each(slugs)('%s slug matches key', (slug) => {
    expect(getSpecies(slug).slug).toBe(slug)
  })

  it.each(slugs)('%s has non-empty name', (slug) => {
    expect(typeof getSpecies(slug).name).toBe('string')
    expect(getSpecies(slug).name.length).toBeGreaterThan(0)
  })

  it.each(slugs)('%s size is an array', (slug) => {
    expect(Array.isArray(getSpecies(slug).size)).toBe(true)
    expect(getSpecies(slug).size.length).toBeGreaterThan(0)
  })

  it.each(slugs)('%s speed has walk', (slug) => {
    const speed = getSpecies(slug).speed
    expect(typeof speed).toBe('object')
    expect(typeof speed.walk).toBe('number')
    expect(speed.walk).toBeGreaterThan(0)
  })
})

describe('species spot checks', () => {
  it('dragonborn is PHB Medium with 30 walk', () => {
    const d = getSpecies('dragonborn')
    expect(d.name).toBe('Dragonborn')
    expect(d.source).toBe('PHB')
    expect(d.size).toContain('Medium')
    expect(d.speed.walk).toBe(30)
  })

  it('elf has darkvision', () => {
    const e = getSpecies('elf')
    expect(e.darkvision).toBeGreaterThan(0)
  })

  it('halfling is Small', () => {
    const h = getSpecies('halfling')
    const sizes = h.size.map(s => s.toLowerCase())
    expect(sizes).toContain('small')
  })
})

describe('species registry API', () => {
  it('getSpecies returns species by slug', () => {
    expect(getSpecies('dwarf').name).toBe('Dwarf')
  })

  it('getSpecies returns undefined for unknown', () => {
    expect(getSpecies('android')).toBeUndefined()
  })

  it('hasSpecies returns true for existing', () => {
    expect(hasSpecies('elf')).toBe(true)
  })

  it('hasSpecies returns false for missing', () => {
    expect(hasSpecies('android')).toBe(false)
  })

  it('getSpeciesBySource filters by source book', () => {
    const phb = getSpeciesBySource('PHB')
    expect(phb.length).toBeGreaterThan(0)
    expect(phb.every(s => s.source === 'PHB')).toBe(true)
  })

  it('getSpeciesWithFlight returns flying species', () => {
    const flyers = getSpeciesWithFlight()
    expect(flyers.every(s => s.hasFlight === true)).toBe(true)
  })
})
