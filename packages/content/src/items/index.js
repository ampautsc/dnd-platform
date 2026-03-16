/**
 * Items Registry — D&D item definitions.
 * Pure data + lookup helpers. No game logic.
 */

export const ITEMS = [
  {
    id: 'longsword',
    name: 'Longsword',
    type: 'weapon',
    subtype: 'martial-melee',
    rarity: 'common',
    requiresAttunement: false,
    weight: 3.0,
    cost: { amount: 15, currency: 'gold' },
    description: 'A versatile martial melee weapon.',
    weaponProperties: {
      damageDie: '1d8',
      damageType: 'slashing',
      versatile: '1d10',
      properties: ['versatile'],
    },
    magic: false,
  },
  {
    id: 'scimitar',
    name: 'Scimitar',
    type: 'weapon',
    subtype: 'martial-melee',
    rarity: 'common',
    requiresAttunement: false,
    weight: 3.0,
    cost: { amount: 25, currency: 'gold' },
    description: 'A light, finesse curved blade.',
    weaponProperties: {
      damageDie: '1d6',
      damageType: 'slashing',
      properties: ['finesse', 'light'],
    },
    magic: false,
  },
  {
    id: 'greataxe',
    name: 'Greataxe',
    type: 'weapon',
    subtype: 'martial-melee',
    rarity: 'common',
    requiresAttunement: false,
    weight: 7.0,
    cost: { amount: 30, currency: 'gold' },
    description: 'A heavy two-handed axe.',
    weaponProperties: {
      damageDie: '1d12',
      damageType: 'slashing',
      properties: ['heavy', 'two-handed'],
    },
    magic: false,
  },
  {
    id: 'morningstar',
    name: 'Morningstar',
    type: 'weapon',
    subtype: 'martial-melee',
    rarity: 'common',
    requiresAttunement: false,
    weight: 4.0,
    cost: { amount: 15, currency: 'gold' },
    description: 'A spiked bludgeoning weapon.',
    weaponProperties: {
      damageDie: '1d8',
      damageType: 'piercing',
      properties: [],
    },
    magic: false,
  },
  {
    id: 'chain_mail',
    name: 'Chain Mail',
    type: 'armor',
    subtype: 'heavy',
    rarity: 'common',
    requiresAttunement: false,
    weight: 55.0,
    cost: { amount: 75, currency: 'gold' },
    description: 'Heavy armor made of interlocking metal rings. AC 16. Disadvantage on Stealth checks.',
    armorProperties: { ac: 16, stealthDisadvantage: true, strengthRequirement: 13 },
    magic: false,
  },
  {
    id: 'leather_armor',
    name: 'Leather Armor',
    type: 'armor',
    subtype: 'light',
    rarity: 'common',
    requiresAttunement: false,
    weight: 10.0,
    cost: { amount: 10, currency: 'gold' },
    description: 'Light armor. AC 11 + DEX modifier.',
    armorProperties: { ac: 11, dexBonus: true, maxDexBonus: null, stealthDisadvantage: false },
    magic: false,
  },
  {
    id: 'potion_healing',
    name: 'Potion of Healing',
    type: 'potion',
    subtype: 'healing',
    rarity: 'common',
    requiresAttunement: false,
    weight: 0.5,
    cost: { amount: 50, currency: 'gold' },
    description: 'Regain 2d4+2 hit points when you drink this potion.',
    effects: [
      { trigger: 'onDrink', effectType: 'heal', value: '2d4+2', condition: null },
    ],
    magic: true,
  },
  {
    id: 'potion_healing_greater',
    name: 'Potion of Greater Healing',
    type: 'potion',
    subtype: 'healing',
    rarity: 'uncommon',
    requiresAttunement: false,
    weight: 0.5,
    cost: { amount: 150, currency: 'gold' },
    description: 'Regain 4d4+4 hit points when you drink this potion.',
    effects: [
      { trigger: 'onDrink', effectType: 'heal', value: '4d4+4', condition: null },
    ],
    magic: true,
  },
  {
    id: 'torch',
    name: 'Torch',
    type: 'misc',
    subtype: 'tool',
    rarity: 'common',
    requiresAttunement: false,
    weight: 1.0,
    cost: { amount: 1, currency: 'copper' },
    description: 'A torch burns for 1 hour, providing bright light in a 20-foot radius and dim light for an additional 20 feet.',
    magic: false,
  },
  {
    id: 'rope_hempen',
    name: 'Rope, Hempen (50 feet)',
    type: 'misc',
    subtype: 'tool',
    rarity: 'common',
    requiresAttunement: false,
    weight: 10.0,
    cost: { amount: 1, currency: 'gold' },
    description: '50 feet of hempen rope. Has 2 hit points and can be burst with a DC 17 Strength check.',
    magic: false,
  },
];

// Build lookup map for O(1) access
const ITEMS_BY_ID = Object.fromEntries(ITEMS.map(i => [i.id, i]));

export function getItem(id) {
  return ITEMS_BY_ID[id] || null;
}

export function hasItem(id) {
  return id in ITEMS_BY_ID;
}

export function getAllItems() {
  return ITEMS;
}

export function getItemsByType(type) {
  return ITEMS.filter(i => i.type === type);
}
