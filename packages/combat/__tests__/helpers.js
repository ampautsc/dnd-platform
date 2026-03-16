/**
 * Shared test helpers for combat package tests.
 *
 * Provides factory functions to create combat-ready creature objects
 * matching the shape used by the v1 engine and the v2 GameState.
 */

/**
 * Create a minimal combatant object with sensible defaults.
 */
export function makeCombatant(overrides = {}) {
  const base = {
    id: 'test1',
    name: 'Test Creature',
    side: 'party',
    position: { x: 0, y: 0 },
    type: 'humanoid',
    cr: 0,

    currentHP: 30,
    maxHP: 30,
    ac: 14,
    speed: 30,

    str: 10, dex: 14, con: 14, int: 10, wis: 12, cha: 16,
    strMod: 0, dexMod: 2, conMod: 2, intMod: 0, wisMod: 1, chaMod: 3,
    profBonus: 3,

    saves: { str: 0, dex: 5, con: 2, int: 0, wis: 1, cha: 6 },

    conditions: [],
    concentrating: null,
    concentrationRoundsRemaining: 0,
    flying: false,

    usedAction: false,
    usedBonusAction: false,
    movementRemaining: 30,
    reactedThisRound: false,
    bonusActionSpellCastThisTurn: false,

    weapons: [
      { name: 'Rapier', attackBonus: 5, damageDice: '1d8', damageBonus: 2, type: 'melee', range: 5 },
    ],
    weapon: { name: 'Rapier', attackBonus: 5, damageDice: '1d8', damageBonus: 2, type: 'melee', range: 5 },
    multiattack: 0,

    spellSaveDC: 0,
    spellAttackBonus: 0,
    spellSlots: {},
    maxSlots: {},
    spellsKnown: [],
    cantrips: [],

    bardicInspiration: null,
    magicResistance: false,
    hasWarCaster: false,

    damageImmunities: [],
    damageResistances: [],

    totalDamageDealt: 0,
    totalDamageTaken: 0,
    attacksMade: 0,
    attacksHit: 0,
    spellsCast: 0,
    conditionsInflicted: 0,
  }

  const result = { ...base, ...overrides }

  if (overrides.saves) result.saves = { ...base.saves, ...overrides.saves }
  if (overrides.conditions) result.conditions = [...overrides.conditions]
  else result.conditions = []
  if (overrides.weapons) result.weapons = overrides.weapons.map(w => ({ ...w }))
  if (overrides.position) result.position = { ...overrides.position }
  if (overrides.spellSlots) result.spellSlots = { ...overrides.spellSlots }
  if (overrides.maxSlots) result.maxSlots = { ...overrides.maxSlots }
  if (overrides.spellsKnown) result.spellsKnown = [...overrides.spellsKnown]
  if (overrides.cantrips) result.cantrips = [...overrides.cantrips]

  return result
}

/**
 * Create a Lore Bard — the standard party member for tests.
 */
export function makeBard(overrides = {}) {
  return makeCombatant({
    id: 'bard1',
    name: 'Lore Bard',
    side: 'party',
    position: { x: 0, y: 0 },
    currentHP: 45,
    maxHP: 45,
    ac: 15,
    speed: 30,
    dex: 14, cha: 16,
    dexMod: 2, chaMod: 3,
    profBonus: 3,
    saves: { str: 0, dex: 5, con: 2, int: 0, wis: 1, cha: 6 },
    weapons: [
      { name: 'Rapier', attackBonus: 5, damageDice: '1d8', damageBonus: 2, type: 'melee', range: 5 },
      { name: 'Hand Crossbow', attackBonus: 5, damageDice: '1d6', damageBonus: 2, type: 'ranged', range: 30 },
    ],
    weapon: { name: 'Rapier', attackBonus: 5, damageDice: '1d8', damageBonus: 2, type: 'melee', range: 5 },
    spellSaveDC: 14,
    spellAttackBonus: 6,
    spellSlots: { 1: 4, 2: 3, 3: 3, 4: 2 },
    maxSlots: { 1: 4, 2: 3, 3: 3, 4: 2 },
    spellsKnown: [
      'Hypnotic Pattern', 'Hold Person', 'Counterspell',
      'Healing Word', 'Faerie Fire', 'Dissonant Whispers',
      'Shatter', 'Invisibility', 'Silence',
      'Greater Invisibility', 'Dimension Door',
    ],
    cantrips: ['Vicious Mockery', 'Minor Illusion'],
    bardicInspiration: { uses: 3, maxUses: 3, die: 'd8' },
    ...overrides,
  })
}

/**
 * Create a Cult Fanatic enemy (melee caster).
 */
export function makeEnemy(overrides = {}) {
  return makeCombatant({
    id: 'enemy1',
    name: 'Cult Fanatic',
    side: 'enemy',
    position: { x: 6, y: 0 },
    currentHP: 33,
    maxHP: 33,
    ac: 13,
    speed: 30,
    weapons: [
      { name: 'Dagger', attackBonus: 4, damageDice: '1d4', damageBonus: 2, type: 'melee', range: 5 },
    ],
    weapon: { name: 'Dagger', attackBonus: 4, damageDice: '1d4', damageBonus: 2, type: 'melee', range: 5 },
    spellSaveDC: 11,
    spellAttackBonus: 3,
    spellSlots: { 1: 4, 2: 3 },
    maxSlots: { 1: 4, 2: 3 },
    spellsKnown: ['Command', 'Inflict Wounds', 'Hold Person', 'Sacred Flame'],
    cantrips: ['Sacred Flame'],
    ...overrides,
  })
}

/**
 * Create a simple melee-only brute (no spells).
 */
export function makeBrute(overrides = {}) {
  return makeCombatant({
    id: 'brute1',
    name: 'Brute',
    side: 'enemy',
    position: { x: 8, y: 0 },
    currentHP: 50,
    maxHP: 50,
    ac: 12,
    speed: 30,
    str: 18, strMod: 4,
    weapons: [
      { name: 'Greataxe', attackBonus: 6, damageDice: '1d12', damageBonus: 4, type: 'melee', range: 5 },
    ],
    weapon: { name: 'Greataxe', attackBonus: 6, damageDice: '1d12', damageBonus: 4, type: 'melee', range: 5 },
    multiattack: 2,
    ...overrides,
  })
}
