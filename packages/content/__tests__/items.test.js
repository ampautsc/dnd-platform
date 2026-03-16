/**
 * Items Registry — tests
 * Written BEFORE implementation (TDD Rule #4).
 */

import { describe, it, expect } from 'vitest';
import { getItem, hasItem, getAllItems, getItemsByType, ITEMS } from '../src/items/index.js';

describe('item data integrity', () => {
  const REQUIRED_FIELDS = ['id', 'name', 'type', 'rarity', 'description'];

  it('every item has all required fields', () => {
    for (const item of ITEMS) {
      for (const field of REQUIRED_FIELDS) {
        expect(item, `item missing '${field}'`).toHaveProperty(field);
      }
    }
  });

  it('every item id is unique', () => {
    const ids = ITEMS.map(i => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every item has a valid type', () => {
    const VALID_TYPES = ['weapon', 'armor', 'potion', 'misc'];
    for (const item of ITEMS) {
      expect(VALID_TYPES, `${item.id} has invalid type '${item.type}'`).toContain(item.type);
    }
  });

  it('weapons have weaponProperties', () => {
    for (const item of ITEMS) {
      if (item.type === 'weapon') {
        expect(item, `weapon ${item.id} missing weaponProperties`).toHaveProperty('weaponProperties');
        expect(item.weaponProperties).toHaveProperty('damageDie');
        expect(item.weaponProperties).toHaveProperty('damageType');
      }
    }
  });

  it('armor has armorProperties', () => {
    for (const item of ITEMS) {
      if (item.type === 'armor') {
        expect(item, `armor ${item.id} missing armorProperties`).toHaveProperty('armorProperties');
        expect(item.armorProperties).toHaveProperty('ac');
      }
    }
  });
});

describe('getItem', () => {
  it('returns item by id', () => {
    const sword = getItem('longsword');
    expect(sword.name).toBe('Longsword');
    expect(sword.type).toBe('weapon');
  });

  it('returns null for unknown id', () => {
    expect(getItem('vorpal_blade')).toBeNull();
  });
});

describe('hasItem', () => {
  it('returns true for known item', () => {
    expect(hasItem('scimitar')).toBe(true);
  });

  it('returns false for unknown item', () => {
    expect(hasItem('vorpal_blade')).toBe(false);
  });
});

describe('getAllItems', () => {
  it('returns all items', () => {
    expect(getAllItems().length).toBeGreaterThanOrEqual(10);
  });
});

describe('getItemsByType', () => {
  it('returns weapons only', () => {
    const weapons = getItemsByType('weapon');
    expect(weapons.length).toBeGreaterThanOrEqual(4);
    expect(weapons.every(i => i.type === 'weapon')).toBe(true);
  });

  it('returns potions only', () => {
    const potions = getItemsByType('potion');
    expect(potions.length).toBeGreaterThanOrEqual(2);
    expect(potions.every(i => i.type === 'potion')).toBe(true);
  });
});
