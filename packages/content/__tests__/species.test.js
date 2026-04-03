import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
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
    assert.ok(slugs.length >= 71)
  })

  for (const slug of slugs) {
    it(`${slug} has required fields`, () => {
    const s = getSpecies(slug)
    for (const field of REQUIRED_FIELDS) {
      assert.notStrictEqual(s[field], undefined, `missing ${field}`)
    }
    });
  }

  for (const slug of slugs) {
    it(`${slug} slug matches key`, () => {
    assert.strictEqual(getSpecies(slug).slug, slug)
    });
  }

  for (const slug of slugs) {
    it(`${slug} has non-empty name`, () => {
    assert.strictEqual(typeof getSpecies(slug).name, 'string')
    assert.ok(getSpecies(slug).name.length > 0)
    });
  }

  for (const slug of slugs) {
    it(`${slug} size is an array`, () => {
    assert.strictEqual(Array.isArray(getSpecies(slug).size), true)
    assert.ok(getSpecies(slug).size.length > 0)
    });
  }

  for (const slug of slugs) {
    it(`${slug} speed has walk`, () => {
    const speed = getSpecies(slug).speed
    assert.strictEqual(typeof speed, 'object')
    assert.strictEqual(typeof speed.walk, 'number')
    assert.ok(speed.walk > 0)
    });
  }
})

describe('species spot checks', () => {
  it('dragonborn is PHB Medium with 30 walk', () => {
    const d = getSpecies('dragonborn')
    assert.strictEqual(d.name, 'Dragonborn')
    assert.strictEqual(d.source, 'PHB')
    assert.ok(d.size.includes('Medium'))
    assert.strictEqual(d.speed.walk, 30)
  })

  it('elf has darkvision', () => {
    const e = getSpecies('elf')
    assert.ok(e.darkvision > 0)
  })

  it('halfling is Small', () => {
    const h = getSpecies('halfling')
    const sizes = h.size.map(s => s.toLowerCase())
    assert.ok(sizes.includes('small'))
  })
})

describe('species registry API', () => {
  it('getSpecies returns species by slug', () => {
    assert.strictEqual(getSpecies('dwarf').name, 'Dwarf')
  })

  it('getSpecies returns undefined for unknown', () => {
    assert.strictEqual(getSpecies('android'), undefined)
  })

  it('hasSpecies returns true for existing', () => {
    assert.strictEqual(hasSpecies('elf'), true)
  })

  it('hasSpecies returns false for missing', () => {
    assert.strictEqual(hasSpecies('android'), false)
  })

  it('getSpeciesBySource filters by source book', () => {
    const phb = getSpeciesBySource('PHB')
    assert.ok(phb.length > 0)
    assert.strictEqual(phb.every(s => s.source === 'PHB'), true)
  })

  it('getSpeciesWithFlight returns flying species', () => {
    const flyers = getSpeciesWithFlight()
    assert.strictEqual(flyers.every(s => s.hasFlight === true), true)
  })
})
