import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
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
    assert.strictEqual(computeModifier(10), 0)
    assert.strictEqual(computeModifier(11), 0)
    assert.strictEqual(computeModifier(1), -5)
    assert.strictEqual(computeModifier(20), 5)
    assert.strictEqual(computeModifier(8), -1)
    assert.strictEqual(computeModifier(14), 2)
    assert.strictEqual(computeModifier(15), 2)
    assert.strictEqual(computeModifier(16), 3)
    assert.strictEqual(computeModifier(30), 10)
  })
})

describe('CREATURE_TEMPLATES data integrity', () => {
  const keys = Object.keys(CREATURE_TEMPLATES)

  it('has at least 16 templates', () => {
    assert.ok(keys.length >= 16)
  })

  for (const key of keys) {
    it(`${key} has required identity fields`, () => {
    const t = CREATURE_TEMPLATES[key]
    assert.strictEqual(t.id, key)
    assert.strictEqual(typeof t.name, 'string')
    assert.ok(t.name.length > 0)
    assert.ok(VALID_SIDES.includes(t.side))
    assert.ok(VALID_TYPES.includes(t.type))
    assert.strictEqual(typeof t.cr, 'number')
    assert.ok(t.cr >= 0)
    });
  }

  for (const key of keys) {
    it(`${key} has valid abilities`, () => {
    const t = CREATURE_TEMPLATES[key]
    assert.notStrictEqual(t.abilities, undefined)
    for (const ab of ABILITY_KEYS) {
      assert.strictEqual(typeof t.abilities[ab], 'number')
      assert.ok(t.abilities[ab] >= 1)
      assert.ok(t.abilities[ab] <= 30)
    }
    });
  }

  for (const key of keys) {
    it(`${key} has profBonus hp ac speed`, () => {
    const t = CREATURE_TEMPLATES[key]
    assert.strictEqual(typeof t.profBonus, 'number')
    assert.ok(t.profBonus >= 2)
    assert.strictEqual(typeof t.hp, 'object')
    assert.strictEqual(typeof t.hp.max, 'number')
    assert.ok(t.hp.max > 0)
    assert.strictEqual(typeof t.hp.formula, 'string')
    const acBase = typeof t.ac === 'object' ? t.ac.base : t.ac
    assert.strictEqual(typeof acBase, 'number')
    assert.ok(acBase >= 1)
    assert.strictEqual(typeof t.speed, 'number')
    assert.ok(t.speed > 0)
    });
  }

  for (const key of keys) {
    it(`${key} has saves for all six abilities`, () => {
    const t = CREATURE_TEMPLATES[key]
    assert.notStrictEqual(t.saves, undefined)
    for (const s of ABILITY_KEYS) {
      assert.strictEqual(typeof t.saves[s], 'number')
    }
    });
  }

  for (const key of keys) {
    it(`${key} has valid weapons`, () => {
    const t = CREATURE_TEMPLATES[key]
    assert.strictEqual(Array.isArray(t.weapons), true)
    for (const w of t.weapons) {
      assert.strictEqual(typeof w.name, 'string')
      assert.strictEqual(typeof w.attackBonus, 'number')
      assert.strictEqual(typeof w.damageDice, 'string')
      assert.strictEqual(typeof w.damageBonus, 'number')
      assert.strictEqual(typeof w.range, 'number')
      assert.ok(WEAPON_TYPES.includes(w.type))
    }
    });
  }

  for (const key of keys) {
    it(`${key} has tags and features`, () => {
    const t = CREATURE_TEMPLATES[key]
    assert.strictEqual(Array.isArray(t.tags), true)
    assert.strictEqual(typeof t.features, 'object')
    });
  }

  for (const key of keys) {
    it(`${key} multiattack is non-negative integer`, () => {
    const t = CREATURE_TEMPLATES[key]
    assert.strictEqual(typeof t.multiattack, 'number')
    assert.ok(t.multiattack >= 0)
    assert.strictEqual(Number.isInteger(t.multiattack), true)
    });
  }
})

describe('specific template spot checks', () => {
  it('bard is party caster with all features', () => {
    const bard = CREATURE_TEMPLATES['gem_dragonborn_lore_bard_8']
    assert.strictEqual(bard.side, 'party')
    assert.strictEqual(bard.characterLevel, 8)
    assert.notStrictEqual(bard.features.spellcasting, undefined)
    assert.ok(bard.features.spellcasting.spellsKnown.length > 5)
    assert.notStrictEqual(bard.features.bardicInspiration, undefined)
    assert.notStrictEqual(bard.features.breathWeapon, undefined)
    assert.notStrictEqual(bard.features.gemFlight, undefined)
    assert.notStrictEqual(bard.features.dragonFear, undefined)
    assert.strictEqual(bard.features.hasWarCaster, true)
    assert.strictEqual(bard.features.hasResilientCon, true)
  })

  it('lich has legendary features and magic resistance', () => {
    const lich = CREATURE_TEMPLATES['lich']
    assert.strictEqual(lich.cr, 21)
    assert.strictEqual(lich.type, 'undead')
    assert.notStrictEqual(lich.features.legendaryResistance, undefined)
    assert.strictEqual(lich.features.legendaryResistance.uses, 3)
    assert.notStrictEqual(lich.features.legendaryActions, undefined)
    assert.strictEqual(lich.features.magicResistance, true)
    assert.strictEqual(lich.features.immuneCharmed, true)
  })

  it('dragon has breath weapon and flying tag', () => {
    const dragon = CREATURE_TEMPLATES['young_red_dragon']
    assert.ok(dragon.tags.includes('flying'))
    assert.notStrictEqual(dragon.features.breathWeapon, undefined)
    assert.strictEqual(dragon.features.breathWeapon.damageType, 'fire')
    assert.strictEqual(dragon.features.breathWeapon.recharge, '5-6')
  })

  it('cult fanatic has darkDevotion and spiritualWeapon', () => {
    const cf = CREATURE_TEMPLATES['cult_fanatic']
    assert.strictEqual(cf.features.darkDevotion, true)
    assert.strictEqual(cf.features.spiritualWeapon, null)
  })
})

describe('template registry', () => {
  it('getTemplateKeys returns all keys', () => {
    const keys = getTemplateKeys()
    assert.strictEqual(Array.isArray(keys), true)
    assert.ok(keys.length >= 16)
    assert.ok(keys.includes('zombie'))
    assert.ok(keys.includes('lich'))
    assert.ok(keys.includes('gem_dragonborn_lore_bard_8'))
  })

  it('getTemplate returns raw template', () => {
    const t = getTemplate('zombie')
    assert.strictEqual(t.name, 'Zombie')
    assert.strictEqual(t.cr, 0.25)
  })

  it('getTemplate throws for unknown key', () => {
    assert.throws(() => getTemplate('unicorn'), 'Unknown creature template')
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
    assert.strictEqual(getTemplate(key).name, 'Test')
    delete CREATURE_TEMPLATES[key]
  })

  it('registerTemplate throws for duplicate', () => {
    assert.throws(() => registerTemplate('zombie', {}), 'Template already exists')
  })
})

describe('createCreature', () => {
  it('sets currentHP and maxHP from template', () => {
    const z = createCreature('zombie')
    assert.strictEqual(z.currentHP, 22)
    assert.strictEqual(z.maxHP, 22)
  })

  it('computes ability modifiers', () => {
    const z = createCreature('zombie')
    assert.strictEqual(z.strMod, 1)
    assert.strictEqual(z.dexMod, -2)
    assert.strictEqual(z.conMod, 3)
  })

  it('resolves AC from object or number', () => {
    const bard = createCreature('gem_dragonborn_lore_bard_8')
    assert.strictEqual(bard.ac, 14)
    const zombie = createCreature('zombie')
    assert.strictEqual(zombie.ac, 8)
  })

  it('includes runtime state fields', () => {
    const z = createCreature('zombie')
    assert.deepStrictEqual(z.conditions, [])
    assert.strictEqual(z.concentrating, null)
    assert.strictEqual(z.flying, false)
    assert.strictEqual(z.usedAction, false)
    assert.strictEqual(z.usedBonusAction, false)
    assert.strictEqual(z.totalDamageDealt, 0)
    assert.strictEqual(z.totalDamageTaken, 0)
  })

  it('deep clones weapons', () => {
    const z1 = createCreature('zombie')
    const z2 = createCreature('zombie')
    z1.weapons[0].name = 'MODIFIED'
    assert.strictEqual(z2.weapons[0].name, 'Slam')
  })

  it('sets movementRemaining from speed', () => {
    const z = createCreature('zombie')
    assert.strictEqual(z.movementRemaining, 20)
    const giant = createCreature('hill_giant')
    assert.strictEqual(giant.movementRemaining, 40)
  })

  it('populates spellcasting for casters', () => {
    const mage = createCreature('mage')
    assert.strictEqual(mage.spellSaveDC, 14)
    assert.strictEqual(mage.spellAttackBonus, 6)
    assert.notStrictEqual(mage.spellSlots, undefined)
    assert.notStrictEqual(mage.maxSlots, undefined)
    assert.ok(mage.spellsKnown.length > 0)
    assert.ok(mage.cantrips.length > 0)
  })

  it('non-casters lack spell fields', () => {
    const z = createCreature('zombie')
    assert.strictEqual(z.spellSaveDC, undefined)
    assert.strictEqual(z.spellSlots, undefined)
  })

  it('applies bardicInspiration', () => {
    const bard = createCreature('gem_dragonborn_lore_bard_8')
    assert.notStrictEqual(bard.bardicInspiration, undefined)
    assert.strictEqual(bard.bardicInspirationUses, 4)
  })

  it('applies breathWeapon', () => {
    const dragon = createCreature('young_red_dragon')
    assert.notStrictEqual(dragon.breathWeapon, undefined)
    assert.strictEqual(dragon.breathWeapon.damageType, 'fire')
  })

  it('applies legendary features', () => {
    const lich = createCreature('lich')
    assert.deepStrictEqual(lich.legendaryResistance, { uses: 3, max: 3 })
    assert.deepStrictEqual(lich.legendaryActions, { uses: 3, max: 3 })
    assert.strictEqual(lich.magicResistance, true)
    assert.strictEqual(lich.immuneCharmed, true)
  })

  it('flying tag starts airborne', () => {
    const dragon = createCreature('young_red_dragon')
    assert.strictEqual(dragon.flying, true)
    const zombie = createCreature('zombie')
    assert.strictEqual(zombie.flying, false)
  })

  it('accepts id name position overrides', () => {
    const z = createCreature('zombie', {
      id: 'z99', name: 'Rotten One', position: { x: 5, y: 3 },
    })
    assert.strictEqual(z.id, 'z99')
    assert.strictEqual(z.name, 'Rotten One')
    assert.deepStrictEqual(z.position, { x: 5, y: 3 })
  })

  it('accepts arbitrary overrides', () => {
    const z = createCreature('zombie', { currentHP: 1 })
    assert.strictEqual(z.currentHP, 1)
  })

  it('deep clones spell slots', () => {
    const m1 = createCreature('mage')
    const m2 = createCreature('mage')
    m1.spellSlots[1] = 0
    assert.strictEqual(m2.spellSlots[1], 4)
  })
})

describe('legacy API', () => {
  it('contains goblin', () => {
    const goblin = legacyCreatures.goblin
    assert.notStrictEqual(goblin, undefined)
    assert.strictEqual(goblin.name, 'Goblin')
    assert.strictEqual(goblin.challengeRating, 0.25)
  })

  it('getCreature returns goblin', () => {
    const g = getCreature('goblin')
    assert.strictEqual(g.name, 'Goblin')
  })

  it('getCreature returns null for unknown', () => {
    assert.strictEqual(getCreature('ancient_dragon'), null)
  })

  it('listCreatures returns keys', () => {
    const list = listCreatures()
    assert.ok(list.includes('goblin'))
  })

  it('getCreaturesByCR filters correctly', () => {
    const lowCR = getCreaturesByCR(0, 1)
    assert.strictEqual(lowCR.every(c => c.challengeRating <= 1), true)
    assert.strictEqual(lowCR.some(c => c.name === 'Goblin'), true)
  })
})
