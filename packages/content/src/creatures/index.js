/**
 * Creature Factory — combat-ready creature registry and factory.
 *
 * Migrated from dnd-builder/server/combat/data/creatures.js → ESM
 *
 * Usage:
 *   import { createCreature, getTemplateKeys } from '@dnd-platform/content/creatures'
 *   const bard = createCreature('gem_dragonborn_lore_bard_8')
 *   const cult_fanatic = createCreature('cult_fanatic', { id: 'cf1', position: { x: 2, y: 0 } })
 */

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/** Standard D&D 5e ability modifier. */
export function computeModifier(score) {
  return Math.floor((score - 10) / 2)
}

/** Deep-clone a plain object/array (no circular refs). */
function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj))
}

/** Base runtime state shared by every combat creature. */
function baseRuntime(id, name, side, position) {
  return {
    id:               id || `creature_${Math.random().toString(36).slice(2)}`,
    name:             name,
    side:             side,
    position:         position || { x: 0, y: 0 },
    // Status
    conditions:       [],
    concentrating:    null,
    concentrationRoundsRemaining: 0,
    flying:           false,
    // Turn economy
    usedAction:       false,
    usedBonusAction:  false,
    movementRemaining: 0,
    reactedThisRound: false,
    // Statistics
    totalDamageDealt: 0,
    totalDamageTaken: 0,
    attacksMade:      0,
    attacksHit:       0,
    spellsCast:       0,
    conditionsInflicted: 0,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// TEMPLATE REGISTRY
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Templates are plain objects stored in the registry.
 * createCreature() converts them into full combat instances.
 *
 * Required template shape (minimum):
 *   { id, name, side, type, cr, abilities, profBonus, hp, ac, speed, saves,
 *     features, multiattack, weapons, tags }
 */
export const CREATURE_TEMPLATES = {}

/** Register a new creature template. Throws if key already exists. */
export function registerTemplate(key, template) {
  if (key in CREATURE_TEMPLATES) {
    throw new Error(`Template already exists: ${key}`)
  }
  CREATURE_TEMPLATES[key] = template
}

/** Return the raw template object. Throws for unknown keys. */
export function getTemplate(key) {
  if (!(key in CREATURE_TEMPLATES)) {
    throw new Error(`Unknown creature template: ${key}`)
  }
  return CREATURE_TEMPLATES[key]
}

/** List all registered template keys. */
export function getTemplateKeys() {
  return Object.keys(CREATURE_TEMPLATES)
}

// ─────────────────────────────────────────────────────────────────────────────
// FACTORY
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a fully initialised combat creature from a template.
 * @param {string} key       - Template key (e.g. 'gem_dragonborn_lore_bard_8')
 * @param {object} overrides - Optional { id, name, position, ... }
 * @returns {object} Combat creature instance
 */
export function createCreature(key, overrides = {}) {
  const t = getTemplate(key)
  const abilities = t.abilities

  // Compute modifiers from ability scores
  const strMod = computeModifier(abilities.str)
  const dexMod = computeModifier(abilities.dex)
  const conMod = computeModifier(abilities.con)
  const intMod = computeModifier(abilities.int)
  const wisMod = computeModifier(abilities.wis)
  const chaMod = computeModifier(abilities.cha)

  const id       = overrides.id       || t.id
  const name     = overrides.name     || t.name
  const position = overrides.position || deepClone(t.position || { x: 0, y: 0 })

  const creature = {
    ...baseRuntime(id, name, t.side, position),
    // Identity
    type:     t.type,
    cr:       t.cr,
    ...(t.characterLevel != null ? { characterLevel: t.characterLevel } : {}),
    // Abilities
    str: abilities.str, dex: abilities.dex, con: abilities.con,
    int: abilities.int, wis: abilities.wis, cha: abilities.cha,
    strMod, dexMod, conMod, intMod, wisMod, chaMod,
    profBonus: t.profBonus,
    // Combat stats
    maxHP:     t.hp.max,
    currentHP: t.hp.max,
    ac:        typeof t.ac === 'object' ? t.ac.base : t.ac,
    speed:     t.speed,
    saves:     deepClone(t.saves),
    // Weapons
    weapons:   deepClone(t.weapons || []),
    weapon:    deepClone(t.weapons && t.weapons[0] ? t.weapons[0] : null),
    multiattack: t.multiattack || 0,
  }
  creature.movementRemaining = t.speed

  // Spell casters
  if (t.features.spellcasting) {
    const sc = t.features.spellcasting
    creature.spellSaveDC       = sc.saveDC
    creature.spellAttackBonus  = sc.attackBonus
    creature.spellSlots        = deepClone(sc.slots || {})
    creature.maxSlots          = deepClone(sc.slots || {})
    creature.spellsKnown       = deepClone(sc.spellsKnown || [])
    creature.cantrips          = deepClone(sc.cantrips || [])
  }

  // Special features
  if (t.features.bardicInspiration) {
    creature.bardicInspiration    = deepClone(t.features.bardicInspiration)
    creature.bardicInspirationUses = t.features.bardicInspiration.uses
  }
  if (t.features.breathWeapon) {
    creature.breathWeapon = deepClone(t.features.breathWeapon)
  }
  if (t.features.gemFlight) {
    creature.gemFlight = deepClone(t.features.gemFlight)
  }
  if (t.features.dragonFear) {
    creature.dragonFear = deepClone(t.features.dragonFear)
  }
  if (t.features.darkDevotion) {
    creature.darkDevotion = true
  }
  if (t.features.hasWarCaster) {
    creature.hasWarCaster = true
  }
  if (t.features.hasResilientCon) {
    creature.hasResilientCon = true
  }
  if (t.features.magicResistance) {
    creature.magicResistance = true
  }
  if (t.features.legendaryResistance) {
    creature.legendaryResistance = deepClone(t.features.legendaryResistance)
  }
  if (t.features.legendaryActions) {
    creature.legendaryActions = deepClone(t.features.legendaryActions)
  }
  if (t.features.immuneCharmed) {
    creature.immuneCharmed = true
  }
  if (t.features.spiritualWeapon !== undefined) {
    creature.spiritualWeapon = deepClone(t.features.spiritualWeapon)
  }

  // Naturally flying creatures (tagged 'flying') start airborne
  if (t.tags && t.tags.includes('flying')) {
    creature.flying = true
  }

  // Apply any extra overrides from caller
  const { id: _id, name: _name, position: _pos, ...rest } = overrides
  Object.assign(creature, rest)

  return creature
}

// ─────────────────────────────────────────────────────────────────────────────
// TEMPLATE DEFINITIONS
// ─────────────────────────────────────────────────────────────────────────────

// ── PLAYER CHARACTER ────────────────────────────────────────────────────────

CREATURE_TEMPLATES['gem_dragonborn_lore_bard_8'] = {
  id:       'gem_dragonborn_lore_bard_8',
  name:     'Gem Dragonborn Lore Bard (Iron Concentration)',
  side:     'party',
  type:     'humanoid',
  cr:       4,
  characterLevel: 8,
  abilities: { str: 8, dex: 14, con: 16, int: 8, wis: 12, cha: 18 },
  profBonus: 3,
  hp:       { max: 67, formula: '8d8+24' },
  ac:       { base: 14, formula: 'leather+dex+cloak' },
  speed:    30,
  saves: {
    str: -1, dex: 5, con: 8, int: -1, wis: 1, cha: 9,
  },
  position: { x: 0, y: 0 },
  multiattack: 0,
  weapons: [
    { name: 'Light Crossbow', attackBonus: 5, damageDice: '1d8', damageBonus: 2, range: 80, type: 'ranged' },
  ],
  tags: ['party', 'bard', 'caster'],
  features: {
    hasWarCaster: true,
    hasResilientCon: true,
    spellcasting: {
      saveDC:      15,
      attackBonus:  5,
      slots:  { 1: 4, 2: 3, 3: 3, 4: 2 },
      spellsKnown: [
        'Hypnotic Pattern', 'Hold Person', 'Counterspell',
        'Healing Word', 'Faerie Fire', 'Dissonant Whispers',
        'Shatter', 'Invisibility', 'Silence',
        'Greater Invisibility', 'Polymorph', 'Dimension Door',
        'Misty Step', 'Comprehend Languages',
      ],
      cantrips: ['Vicious Mockery', 'Minor Illusion'],
    },
    bardicInspiration: {
      die:         'd8',
      uses:         4,
      max:          4,
      cuttingWords: true,
    },
    breathWeapon: {
      damage:     '2d10',
      damageType: 'radiant',
      save:       'dex',
      dc:          14,
      range:       15,
      uses:         3,
      max:          3,
      targeting:   { type: 'area', shape: 'cone', length: 15 },
    },
    gemFlight: {
      uses:            3,
      max:             3,
      active:          false,
      roundsRemaining: 0,
      maxRounds:       10,
    },
    dragonFear: {
      dc:   15,
      uses:  1,
      max:   1,
      save:  'wis',
      range: 30,
      targeting: { type: 'area', shape: 'cone', length: 30 },
    },
  },
}

// ── CULT FANATIC ───────────────────────────────────────────────────────────

CREATURE_TEMPLATES['cult_fanatic'] = {
  id:       'cult_fanatic',
  name:     'Cult Fanatic',
  side:     'enemy',
  type:     'humanoid',
  cr:       2,
  abilities: { str: 11, dex: 14, con: 12, int: 10, wis: 13, cha: 14 },
  profBonus: 2,
  hp:       { max: 33, formula: '6d8+6' },
  ac:       { base: 13, formula: 'leather_armor' },
  speed:    30,
  saves: {
    str: 0, dex: 2, con: 1, int: 0, wis: 3, cha: 2,
  },
  position: { x: 4, y: 0 },
  multiattack: 2,
  weapons: [
    { name: 'Dagger', attackBonus: 4, damageDice: '1d4', damageBonus: 2, range: 5, type: 'melee' },
  ],
  tags: ['enemy', 'humanoid', 'caster'],
  features: {
    darkDevotion: true,
    spiritualWeapon: null,
    spellcasting: {
      saveDC:       11,
      attackBonus:   3,
      slots:  { 1: 4, 2: 3 },
      spellsKnown: [
        'Hold Person', 'Inflict Wounds', 'Shield of Faith',
        'Spiritual Weapon', 'Command', 'Healing Word',
      ],
      cantrips: ['Sacred Flame', 'Thaumaturgy'],
    },
  },
}

// ── ZOMBIE ─────────────────────────────────────────────────────────────────

CREATURE_TEMPLATES['zombie'] = {
  id:       'zombie',
  name:     'Zombie',
  side:     'enemy',
  type:     'undead',
  cr:       0.25,
  abilities: { str: 13, dex: 6, con: 16, int: 3, wis: 6, cha: 5 },
  profBonus: 2,
  hp:       { max: 22, formula: '3d8+9' },
  ac:       { base: 8, formula: 'natural' },
  speed:    20,
  saves: {
    str: 1, dex: -2, con: 3, int: -4, wis: 0, cha: -3,
  },
  position: { x: 6, y: 0 },
  multiattack: 0,
  weapons: [
    { name: 'Slam', attackBonus: 3, damageDice: '1d6', damageBonus: 1, range: 5, type: 'melee' },
  ],
  tags: ['enemy', 'undead', 'melee'],
  features: {},
}

// ── SKELETON ───────────────────────────────────────────────────────────────

CREATURE_TEMPLATES['skeleton'] = {
  id:       'skeleton',
  name:     'Skeleton',
  side:     'enemy',
  type:     'undead',
  cr:       0.25,
  abilities: { str: 10, dex: 14, con: 15, int: 6, wis: 8, cha: 5 },
  profBonus: 2,
  hp:       { max: 13, formula: '2d8+4' },
  ac:       { base: 13, formula: 'armor_scraps' },
  speed:    30,
  saves: {
    str: 0, dex: 2, con: 2, int: -2, wis: -1, cha: -3,
  },
  position: { x: 6, y: 0 },
  multiattack: 0,
  weapons: [
    { name: 'Shortbow', attackBonus: 4, damageDice: '1d6', damageBonus: 2, range: 80, type: 'ranged' },
    { name: 'Shortsword', attackBonus: 4, damageDice: '1d6', damageBonus: 2, range: 5, type: 'melee' },
  ],
  tags: ['enemy', 'undead', 'ranged'],
  features: {},
}

// ── GHOUL ──────────────────────────────────────────────────────────────────

CREATURE_TEMPLATES['ghoul'] = {
  id:       'ghoul',
  name:     'Ghoul',
  side:     'enemy',
  type:     'undead',
  cr:       1,
  abilities: { str: 13, dex: 15, con: 10, int: 7, wis: 10, cha: 6 },
  profBonus: 2,
  hp:       { max: 22, formula: '5d8' },
  ac:       { base: 12, formula: 'natural' },
  speed:    30,
  saves: {
    str: 1, dex: 2, con: 0, int: -2, wis: 0, cha: -2,
  },
  position: { x: 6, y: 0 },
  multiattack: 2,
  weapons: [
    { name: 'Claws', attackBonus: 2, damageDice: '2d4', damageBonus: 0, range: 5, type: 'melee', special: 'paralysis', paralyzeDC: 10 },
    { name: 'Bite', attackBonus: 2, damageDice: '2d6', damageBonus: 0, range: 5, type: 'melee' },
  ],
  tags: ['enemy', 'undead', 'melee'],
  features: {
    immuneCharmed: true,
  },
}

// ── GHAST ──────────────────────────────────────────────────────────────────

CREATURE_TEMPLATES['ghast'] = {
  id:       'ghast',
  name:     'Ghast',
  side:     'enemy',
  type:     'undead',
  cr:       2,
  abilities: { str: 16, dex: 17, con: 10, int: 11, wis: 10, cha: 8 },
  profBonus: 2,
  hp:       { max: 36, formula: '8d8' },
  ac:       { base: 13, formula: 'natural' },
  speed:    30,
  saves: {
    str: 3, dex: 3, con: 0, int: 0, wis: 2, cha: -1,
  },
  position: { x: 6, y: 0 },
  multiattack: 2,
  weapons: [
    { name: 'Claws', attackBonus: 5, damageDice: '2d6', damageBonus: 3, range: 5, type: 'melee', special: 'paralysis', paralyzeDC: 10 },
    { name: 'Bite', attackBonus: 3, damageDice: '3d6', damageBonus: 0, range: 5, type: 'melee' },
  ],
  tags: ['enemy', 'undead', 'melee'],
  features: {
    immuneCharmed: true,
  },
}

// ── WEREWOLF ───────────────────────────────────────────────────────────────

CREATURE_TEMPLATES['werewolf'] = {
  id:       'werewolf',
  name:     'Werewolf',
  side:     'enemy',
  type:     'humanoid',
  cr:       3,
  abilities: { str: 15, dex: 13, con: 14, int: 10, wis: 11, cha: 10 },
  profBonus: 2,
  hp:       { max: 58, formula: '9d8+18' },
  ac:       { base: 11, formula: 'natural' },
  speed:    30,
  saves: {
    str: 2, dex: 1, con: 2, int: 0, wis: 0, cha: 0,
  },
  position: { x: 6, y: 0 },
  multiattack: 2,
  weapons: [
    { name: 'Bite', attackBonus: 4, damageDice: '2d6', damageBonus: 2, range: 5, type: 'melee', special: 'lycanthropy_dc' },
    { name: 'Claws', attackBonus: 4, damageDice: '2d4', damageBonus: 2, range: 5, type: 'melee' },
  ],
  tags: ['enemy', 'humanoid', 'melee'],
  features: {},
}

// ── YOUNG RED DRAGON ───────────────────────────────────────────────────────

CREATURE_TEMPLATES['young_red_dragon'] = {
  id:       'young_red_dragon',
  name:     'Young Red Dragon',
  side:     'enemy',
  type:     'dragon',
  cr:       10,
  abilities: { str: 23, dex: 10, con: 21, int: 16, wis: 13, cha: 19 },
  profBonus: 4,
  hp:       { max: 178, formula: '17d10+85' },
  ac:       { base: 18, formula: 'natural' },
  speed:    40,
  saves: {
    str: 6, dex: 4, con: 9, int: 3, wis: 4, cha: 8,
  },
  position: { x: 8, y: 0 },
  multiattack: 3,
  weapons: [
    { name: 'Bite', attackBonus: 10, damageDice: '2d10', damageBonus: 6, range: 10, type: 'melee' },
    { name: 'Claw', attackBonus: 10, damageDice: '2d6', damageBonus: 6, range: 5, type: 'melee' },
  ],
  tags: ['enemy', 'dragon', 'melee', 'flying'],
  features: {
    breathWeapon: {
      damage:     '16d6',
      damageType: 'fire',
      save:       'dex',
      dc:          17,
      range:       30,
      uses:         1,
      max:          1,
      recharge:     '5-6',
      targeting:   { type: 'area', shape: 'cone', length: 30 },
    },
  },
}

// ── HILL GIANT ─────────────────────────────────────────────────────────────

CREATURE_TEMPLATES['hill_giant'] = {
  id:       'hill_giant',
  name:     'Hill Giant',
  side:     'enemy',
  type:     'giant',
  cr:       5,
  abilities: { str: 21, dex: 8, con: 19, int: 5, wis: 9, cha: 6 },
  profBonus: 3,
  hp:       { max: 105, formula: '10d12+40' },
  ac:       { base: 13, formula: 'natural' },
  speed:    40,
  saves: {
    str: 5, dex: -1, con: 4, int: -3, wis: -1, cha: -2,
  },
  position: { x: 8, y: 0 },
  multiattack: 2,
  weapons: [
    { name: 'Greatclub', attackBonus: 8, damageDice: '3d8', damageBonus: 5, range: 10, type: 'melee' },
    { name: 'Rock', attackBonus: 8, damageDice: '3d10', damageBonus: 5, range: 60, type: 'ranged' },
  ],
  tags: ['enemy', 'giant', 'melee'],
  features: {},
}

// ── FROST GIANT ────────────────────────────────────────────────────────────

CREATURE_TEMPLATES['frost_giant'] = {
  id:       'frost_giant',
  name:     'Frost Giant',
  side:     'enemy',
  type:     'giant',
  cr:       8,
  abilities: { str: 23, dex: 9, con: 21, int: 9, wis: 10, cha: 12 },
  profBonus: 3,
  hp:       { max: 138, formula: '12d12+60' },
  ac:       { base: 15, formula: 'patchwork_armor' },
  speed:    40,
  saves: {
    str: 9, dex: -1, con: 8, int: -1, wis: 3, cha: 4,
  },
  position: { x: 8, y: 0 },
  multiattack: 2,
  weapons: [
    { name: 'Greataxe', attackBonus: 9, damageDice: '3d12', damageBonus: 6, range: 10, type: 'melee' },
    { name: 'Rock', attackBonus: 9, damageDice: '4d10', damageBonus: 6, range: 60, type: 'ranged' },
  ],
  tags: ['enemy', 'giant', 'melee'],
  features: {},
}

// ── OGRE ───────────────────────────────────────────────────────────────────

CREATURE_TEMPLATES['ogre'] = {
  id:       'ogre',
  name:     'Ogre',
  side:     'enemy',
  type:     'giant',
  cr:       2,
  abilities: { str: 19, dex: 8, con: 16, int: 5, wis: 7, cha: 7 },
  profBonus: 2,
  hp:       { max: 59, formula: '7d10+21' },
  ac:       { base: 11, formula: 'hide_armor' },
  speed:    40,
  saves: {
    str: 4, dex: -1, con: 3, int: -3, wis: -2, cha: -2,
  },
  position: { x: 6, y: 0 },
  multiattack: 0,
  weapons: [
    { name: 'Greatclub', attackBonus: 6, damageDice: '2d8', damageBonus: 4, range: 5, type: 'melee' },
    { name: 'Javelin', attackBonus: 6, damageDice: '2d6', damageBonus: 4, range: 30, type: 'ranged' },
  ],
  tags: ['enemy', 'giant', 'melee'],
  features: {},
}

// ── BANDIT ─────────────────────────────────────────────────────────────────

CREATURE_TEMPLATES['bandit'] = {
  id:       'bandit',
  name:     'Bandit',
  side:     'enemy',
  type:     'humanoid',
  cr:       0.125,
  abilities: { str: 11, dex: 12, con: 12, int: 10, wis: 10, cha: 10 },
  profBonus: 2,
  hp:       { max: 11, formula: '2d8+2' },
  ac:       { base: 12, formula: 'leather_armor' },
  speed:    30,
  saves: {
    str: 0, dex: 1, con: 1, int: 0, wis: 0, cha: 0,
  },
  position: { x: 6, y: 0 },
  multiattack: 0,
  weapons: [
    { name: 'Scimitar', attackBonus: 3, damageDice: '1d6', damageBonus: 1, range: 5, type: 'melee' },
    { name: 'Light Crossbow', attackBonus: 3, damageDice: '1d8', damageBonus: 1, range: 80, type: 'ranged' },
  ],
  tags: ['enemy', 'humanoid', 'melee'],
  features: {},
}

// ── BANDIT CAPTAIN ─────────────────────────────────────────────────────────

CREATURE_TEMPLATES['bandit_captain'] = {
  id:       'bandit_captain',
  name:     'Bandit Captain',
  side:     'enemy',
  type:     'humanoid',
  cr:       2,
  abilities: { str: 15, dex: 16, con: 14, int: 14, wis: 11, cha: 14 },
  profBonus: 2,
  hp:       { max: 65, formula: '10d8+20' },
  ac:       { base: 15, formula: 'studded_leather' },
  speed:    30,
  saves: {
    str: 4, dex: 5, con: 4, int: 2, wis: 2, cha: 2,
  },
  position: { x: 6, y: 0 },
  multiattack: 3,
  weapons: [
    { name: 'Scimitar', attackBonus: 5, damageDice: '1d6', damageBonus: 3, range: 5, type: 'melee' },
    { name: 'Dagger', attackBonus: 5, damageDice: '1d4', damageBonus: 3, range: 5, type: 'melee' },
  ],
  tags: ['enemy', 'humanoid', 'melee'],
  features: {},
}

// ── MAGE ───────────────────────────────────────────────────────────────────

CREATURE_TEMPLATES['mage'] = {
  id:       'mage',
  name:     'Mage',
  side:     'enemy',
  type:     'humanoid',
  cr:       6,
  abilities: { str: 9, dex: 14, con: 11, int: 17, wis: 12, cha: 11 },
  profBonus: 3,
  hp:       { max: 40, formula: '9d8' },
  ac:       { base: 15, formula: 'mage_armor' },
  speed:    30,
  saves: {
    str: -1, dex: 2, con: 3, int: 6, wis: 4, cha: 0,
  },
  position: { x: 8, y: 0 },
  multiattack: 0,
  weapons: [
    { name: 'Dagger', attackBonus: 5, damageDice: '1d4', damageBonus: 2, range: 5, type: 'melee' },
  ],
  tags: ['enemy', 'humanoid', 'caster'],
  features: {
    spellcasting: {
      saveDC:       14,
      attackBonus:   6,
      slots:  { 1: 4, 2: 3, 3: 3, 4: 3, 5: 1 },
      spellsKnown: [
        'Counterspell', 'Fireball', 'Fire Bolt',
        'Shield', 'Misty Step', 'Cone of Cold',
        'Fly', 'Greater Invisibility',
      ],
      cantrips: ['Fire Bolt', 'Light', 'Mage Hand'],
    },
  },
}

// ── ARCHMAGE ───────────────────────────────────────────────────────────────

CREATURE_TEMPLATES['archmage'] = {
  id:       'archmage',
  name:     'Archmage',
  side:     'enemy',
  type:     'humanoid',
  cr:       12,
  abilities: { str: 10, dex: 14, con: 12, int: 20, wis: 15, cha: 16 },
  profBonus: 4,
  hp:       { max: 99, formula: '18d8+18' },
  ac:       { base: 15, formula: 'mage_armor' },
  speed:    30,
  saves: {
    str: 0, dex: 2, con: 5, int: 9, wis: 6, cha: 3,
  },
  position: { x: 8, y: 0 },
  multiattack: 0,
  weapons: [
    { name: 'Dagger', attackBonus: 6, damageDice: '1d4', damageBonus: 2, range: 5, type: 'melee' },
  ],
  tags: ['enemy', 'humanoid', 'caster'],
  features: {
    magicResistance: true,
    spellcasting: {
      saveDC:       17,
      attackBonus:   9,
      slots:  { 1: 4, 2: 3, 3: 3, 4: 3, 5: 3, 6: 1, 7: 1, 8: 1, 9: 1 },
      spellsKnown: [
        'Counterspell', 'Fireball', 'Cone of Cold',
        'Fire Bolt', 'Shield', 'Misty Step',
        'Fly', 'Power Word Stun', 'Finger of Death',
        'Time Stop', 'Wish',
      ],
      cantrips: ['Fire Bolt', 'Light', 'Prestidigitation'],
    },
  },
}

// ── LICH ───────────────────────────────────────────────────────────────────

CREATURE_TEMPLATES['lich'] = {
  id:       'lich',
  name:     'Lich',
  side:     'enemy',
  type:     'undead',
  cr:       21,
  abilities: { str: 11, dex: 16, con: 16, int: 20, wis: 14, cha: 16 },
  profBonus: 7,
  hp:       { max: 135, formula: '18d8+54' },
  ac:       { base: 17, formula: 'natural' },
  speed:    30,
  saves: {
    str: 0, dex: 3, con: 10, int: 12, wis: 9, cha: 3,
  },
  position: { x: 8, y: 0 },
  multiattack: 0,
  weapons: [
    {
      name:         'Paralyzing Touch',
      attackBonus:   12,
      damageDice:   '3d6',
      damageBonus:   0,
      range:          5,
      type:          'melee',
      special:       'paralysis',
      paralyzeDC:    18,
    },
  ],
  tags: ['enemy', 'undead', 'caster'],
  features: {
    magicResistance: true,
    immuneCharmed: true,
    legendaryResistance: { uses: 3, max: 3 },
    legendaryActions:    { uses: 3, max: 3 },
    spellcasting: {
      saveDC:       20,
      attackBonus:  12,
      slots:  { 1: 4, 2: 3, 3: 3, 4: 3, 5: 3, 6: 1, 7: 1, 8: 1, 9: 1 },
      spellsKnown: [
        'Counterspell', 'Fireball', 'Cloudkill',
        'Power Word Stun', 'Finger of Death',
        'Disintegrate', 'Power Word Kill',
        'Cone of Cold', 'Blight',
      ],
      cantrips: ['Chill Touch', 'Mage Hand', 'Prestidigitation'],
    },
  },
}

// ─────────────────────────────────────────────────────────────────────────────
// LEGACY COMPAT — keep old CREATURES + getCreature for encounterRunner.js
// ─────────────────────────────────────────────────────────────────────────────

export const CREATURES = {
  goblin: {
    id: 'goblin', name: 'Goblin', type: 'humanoid', subtype: 'goblinoid',
    size: 'small', alignment: 'neutral evil', challengeRating: 0.25,
    experiencePoints: 50, armorClass: 15, armorType: 'leather armor, shield',
    hitDice: '2d6', hitPointsAverage: 7, speed: { walk: 30 },
    abilityScores: { strength: 8, dexterity: 14, constitution: 10, intelligence: 10, wisdom: 8, charisma: 8 },
    savingThrows: {}, skills: { stealth: 6 },
    damageImmunities: [], damageResistances: [], conditionImmunities: [],
    senses: { darkvision: 60, passivePerception: 9 }, languages: ['Common', 'Goblin'],
    traits: [{ name: 'Nimble Escape', description: 'The goblin can take the Disengage or Hide action as a bonus action.' }],
    actions: [
      { name: 'Scimitar', type: 'meleeWeaponAttack', attackBonus: 4, reach: 5, target: 'one target', damage: [{ dice: '1d6', modifier: 2, type: 'slashing' }] },
      { name: 'Shortbow', type: 'rangedWeaponAttack', attackBonus: 4, range: { normal: 80, long: 320 }, target: 'one target', damage: [{ dice: '1d6', modifier: 2, type: 'piercing' }] },
    ],
    lootTable: [{ itemId: 'scimitar', chance: 0.4, quantity: 1 }, { currency: 'gold', chance: 1.0, amount: '1d4' }],
  },
}

export function getCreature(id) { return CREATURES[id] ?? null }
export function listCreatures() { return Object.keys(CREATURES) }
export function getCreaturesByCR(min = 0, max = 30) {
  return Object.values(CREATURES).filter(c => c.challengeRating >= min && c.challengeRating <= max)
}
