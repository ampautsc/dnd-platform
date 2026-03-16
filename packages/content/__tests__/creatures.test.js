import { describe, it, expect } from 'vitest'
import {
  CREATURE_TEMPLATES,
  getTemplate,
  getTemplateKeys,
  registerTemplate,
  createCreature,
  computeModifier,
  CREATURES as legacyCreatures,
  getCreature,
  listCreatures,
  getCreaturesByCR,
} from '../src/creatures/index.js'

const VALID_SIDES = ['party', 'enemy', 'ally']
const VALID_TYPES = [
  'humanoid', 'undead', 'dragon', 'giant', 'beast',
  'monstrosity', 'fiend', 'celestial', 'aberration',
  'construct', 'elemental', 'fey', 'ooze', 'plant',
]
const ABILITY_KEYS = ['str', 'dex', 'con', 'int', 'wis', 'cha']
const WEAPON_TYPES = ['melee', 'ranged']

describe('computeModifier', () => {
  it('returns correct modifier for standard scores', () => {
    expect(computeModifier(10)).toBe(0)
    expect(computeModifier(11)).toBe(0)
    expect(computeModifier(1)).toBe(-5)
    expect(computeModifier(20)).toBe(5)
    expect(computeModifier(8)).toBe(-1)
    expect(computeModifier(14)).toBe(2)
    expect(computeModifier(15)).toBe(2)
    expect(computeModifier(16)).toBe(3)
    expect(computeModifier(30)).toBe(10)
  })
})

describe('CREATURE_TEMPLATES data integrity', () => {
  const keys = Object.keys(CREATURE_TEMPLATES)

  it('has at least 16 templates', () => {
    expect(keys.length).toBeGreaterThanOrEqual(16)
  })

  it.each(keys)('%s has required identity fields', (key) => {
    const t = CREATURE_TEMPLATES[key]
    expect(t.id).toBe(key)
    expect(typeof t.name).toBe('string')
    expect(t.name.length).toBeGreaterThan(0)
    expect(VALID_SIDES).toContain(t.side)
    expect(VALID_TYPES).toContain(t.type)
    expect(typeof t.cr).toBe('number')
    expect(t.cr).toBeGreaterThanOrEqual(0)
  })

  it.each(keys)('%s has valid abilities', (key) => {
    const t = CREATURE_TEMPLATES[key]
    expect(t.abilities).toBeDefined()
    for (const ab of ABILITY_KEYS) {
      expect(typeof t.abilities[ab]).toBe('number')
      expect(t.abilities[ab]).toBeGreaterThanOrEqual(1)
      expect(t.abilities[ab]).toBeLessThanOrEqual(30)
    }
  })

  it.each(keys)('%s has profBonus hp ac speed', (key) => {
    const t = CREATURE_TEMPLATES[key]
    expect(typeof t.profBonus).toBe('number')
    expect(t.profBonus).toBeGreaterThanOrEqual(2)
    expect(typeof t.hp).toBe('object')
    expect(typeof t.hp.max).toBe('number')
    expect(t.hp.max).toBeGreaterThan(0)
    expect(typeof t.hp.formula).toBe('string')
    const acBase = typeof t.ac === 'object' ? t.ac.base : t.ac
    expect(typeof acBase).toBe('number')
    expect(acBase).toBeGreaterThanOrEqual(1)
    expect(typeof t.speed).toBe('number')
    expect(t.speed).toBeGreaterThan(0)
  })

  it.each(keys)('%s has saves for all six abilities', (key) => {
    const t = CREATURE_TEMPLATES[key]
    expect(t.saves).toBeDefined()
    for (const s of ABILITY_KEYS) {
      expect(typeof t.saves[s]).toBe('number')
    }
  })

  it.each(keys)('%s has valid weapons', (key) => {
    const t = CREATURE_TEMPLATES[key]
    expect(Array.isArray(t.weapons)).toBe(true)
    for (const w of t.weapons) {
      expect(typeof w.name).toBe('string')
      expect(typeof w.attackBonus).toBe('number')
      expect(typeof w.damageDice).toBe('string')
      expect(typeof w.damageBonus).toBe('number')
      expect(typeof w.range).toBe('number')
      expect(WEAPON_TYPES).toContain(w.type)
    }
  })

  it.each(keys)('%s has tags and features', (key) => {
    const t = CREATURE_TEMPLATES[key]
    expect(Array.isArray(t.tags)).toBe(true)
    expect(typeof t.features).toBe('object')
  })

  it.each(keys)('%s multiattack is non-negative integer', (key) => {
    const t = CREATURE_TEMPLATES[key]
    expect(typeof t.multiattack).toBe('number')
    expect(t.multiattack).toBeGreaterThanOrEqual(0)
    expect(Number.isInteger(t.multiattack)).toBe(true)
  })
})

describe('specific template spot checks', () => {
  it('bard is party caster with all features', () => {
    const bard = CREATURE_TEMPLATES['gem_dragonborn_lore_bard_8']
    expect(bard.side).toBe('party')
    expect(bard.characterLevel).toBe(8)
    expect(bard.features.spellcasting).toBeDefined()
    expect(bard.features.spellcasting.spellsKnown.length).toBeGreaterThan(5)
    expect(bard.features.bardicInspiration).toBeDefined()
    expect(bard.features.breathWeapon).toBeDefined()
    expect(bard.features.gemFlight).toBeDefined()
    expect(bard.features.dragonFear).toBeDefined()
    expect(bard.features.hasWarCaster).toBe(true)
    expect(bard.features.hasResilientCon).toBe(true)
  })

  it('lich has legendary features and magic resistance', () => {
    const lich = CREATURE_TEMPLATES['lich']
    expect(lich.cr).toBe(21)
    expect(lich.type).toBe('undead')
    expect(lich.features.legendaryResistance).toBeDefined()
    expect(lich.features.legendaryResistance.uses).toBe(3)
    expect(lich.features.legendaryActions).toBeDefined()
    expect(lich.features.magicResistance).toBe(true)
    expect(lich.features.immuneCharmed).toBe(true)
  })

  it('dragon has breath weapon and flying tag', () => {
    const dragon = CREATURE_TEMPLATES['young_red_dragon']
    expect(dragon.tags).toContain('flying')
    expect(dragon.features.breathWeapon).toBeDefined()
    expect(dragon.features.breathWeapon.damageType).toBe('fire')
    expect(dragon.features.breathWeapon.recharge).toBe('5-6')
  })

  it('cult fanatic has darkDevotion and spiritualWeapon', () => {
    const cf = CREATURE_TEMPLATES['cult_fanatic']
    expect(cf.features.darkDevotion).toBe(true)
    expect(cf.features.spiritualWeapon).toBeNull()
  })
})

describe('template registry', () => {
  it('getTemplateKeys returns all keys', () => {
    const keys = getTemplateKeys()
    expect(Array.isArray(keys)).toBe(true)
    expect(keys.length).toBeGreaterThanOrEqual(16)
    expect(keys).toContain('zombie')
    expect(keys).toContain('lich')
    expect(keys).toContain('gem_dragonborn_lore_bard_8')
  })

  it('getTemplate returns raw template', () => {
    const t = getTemplate('zombie')
    expect(t.name).toBe('Zombie')
    expect(t.cr).toBe(0.25)
  })

  it('getTemplate throws for unknown key', () => {
    expect(() => getTemplate('unicorn')).toThrow('Unknown creature template')
  })

  it('registerTemplate adds a template', () => {
    const key = '__test_register__'
    registerTemplate(key, {
      id: key, name: 'Test', side: 'enemy', type: 'humanoid', cr: 0,
      abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
      profBonus: 2, hp: { max: 1, formula: '1d4' }, ac: 10, speed: 30,
      saves: { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 },
      multiattack: 0, weapons: [], tags: [], features: {},
    })
    expect(getTemplate(key).name).toBe('Test')
    delete CREATURE_TEMPLATES[key]
  })

  it('registerTemplate throws for duplicate', () => {
    expect(() => registerTemplate('zombie', {})).toThrow('Template already exists')
  })
})

describe('createCreature', () => {
  it('sets currentHP and maxHP from template', () => {
    const z = createCreature('zombie')
    expect(z.currentHP).toBe(22)
    expect(z.maxHP).toBe(22)
  })

  it('computes ability modifiers', () => {
    const z = createCreature('zombie')
    expect(z.strMod).toBe(1)
    expect(z.dexMod).toBe(-2)
    expect(z.conMod).toBe(3)
  })

  it('resolves AC from object or number', () => {
    const bard = createCreature('gem_dragonborn_lore_bard_8')
    expect(bard.ac).toBe(14)
    const zombie = createCreature('zombie')
    expect(zombie.ac).toBe(8)
  })

  it('includes runtime state fields', () => {
    const z = createCreature('zombie')
    expect(z.conditions).toEqual([])
    expect(z.concentrating).toBeNull()
    expect(z.flying).toBe(false)
    expect(z.usedAction).toBe(false)
    expect(z.usedBonusAction).toBe(false)
    expect(z.totalDamageDealt).toBe(0)
    expect(z.totalDamageTaken).toBe(0)
  })

  it('deep clones weapons', () => {
    const z1 = createCreature('zombie')
    const z2 = createCreature('zombie')
    z1.weapons[0].name = 'MODIFIED'
    expect(z2.weapons[0].name).toBe('Slam')
  })

  it('sets movementRemaining from speed', () => {
    const z = createCreature('zombie')
    expect(z.movementRemaining).toBe(20)
    const giant = createCreature('hill_giant')
    expect(giant.movementRemaining).toBe(40)
  })

  it('populates spellcasting for casters', () => {
    const mage = createCreature('mage')
    expect(mage.spellSaveDC).toBe(14)
    expect(mage.spellAttackBonus).toBe(6)
    expect(mage.spellSlots).toBeDefined()
    expect(mage.maxSlots).toBeDefined()
    expect(mage.spellsKnown.length).toBeGreaterThan(0)
    expect(mage.cantrips.length).toBeGreaterThan(0)
  })

  it('non-casters lack spell fields', () => {
    const z = createCreature('zombie')
    expect(z.spellSaveDC).toBeUndefined()
    expect(z.spellSlots).toBeUndefined()
  })

  it('applies bardicInspiration', () => {
    const bard = createCreature('gem_dragonborn_lore_bard_8')
    expect(bard.bardicInspiration).toBeDefined()
    expect(bard.bardicInspirationUses).toBe(4)
  })

  it('applies breathWeapon', () => {
    const dragon = createCreature('young_red_dragon')
    expect(dragon.breathWeapon).toBeDefined()
    expect(dragon.breathWeapon.damageType).toBe('fire')
  })

  it('applies legendary features', () => {
    const lich = createCreature('lich')
    expect(lich.legendaryResistance).toEqual({ uses: 3, max: 3 })
    expect(lich.legendaryActions).toEqual({ uses: 3, max: 3 })
    expect(lich.magicResistance).toBe(true)
    expect(lich.immuneCharmed).toBe(true)
  })

  it('flying tag starts airborne', () => {
    const dragon = createCreature('young_red_dragon')
    expect(dragon.flying).toBe(true)
    const zombie = createCreature('zombie')
    expect(zombie.flying).toBe(false)
  })

  it('accepts id name position overrides', () => {
    const z = createCreature('zombie', {
      id: 'z99', name: 'Rotten One', position: { x: 5, y: 3 },
    })
    expect(z.id).toBe('z99')
    expect(z.name).toBe('Rotten One')
    expect(z.position).toEqual({ x: 5, y: 3 })
  })

  it('accepts arbitrary overrides', () => {
    const z = createCreature('zombie', { currentHP: 1 })
    expect(z.currentHP).toBe(1)
  })

  it('deep clones spell slots', () => {
    const m1 = createCreature('mage')
    const m2 = createCreature('mage')
    m1.spellSlots[1] = 0
    expect(m2.spellSlots[1]).toBe(4)
  })
})

describe('legacy API', () => {
  it('contains goblin', () => {
    const goblin = legacyCreatures.goblin
    expect(goblin).toBeDefined()
    expect(goblin.name).toBe('Goblin')
    expect(goblin.challengeRating).toBe(0.25)
  })

  it('getCreature returns goblin', () => {
    const g = getCreature('goblin')
    expect(g.name).toBe('Goblin')
  })

  it('getCreature returns null for unknown', () => {
    expect(getCreature('ancient_dragon')).toBeNull()
  })

  it('listCreatures returns keys', () => {
    const list = listCreatures()
    expect(list).toContain('goblin')
  })

  it('getCreaturesByCR filters correctly', () => {
    const lowCR = getCreaturesByCR(0, 1)
    expect(lowCR.every(c => c.challengeRating <= 1)).toBe(true)
    expect(lowCR.some(c => c.name === 'Goblin')).toBe(true)
  })
})
