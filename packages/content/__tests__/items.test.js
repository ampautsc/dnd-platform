/**
 * Items Registry — tests
 * Written BEFORE implementation (TDD Rule #4).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { getItem, hasItem, getAllItems, getItemsByType, ITEMS } from '../src/items/index.js';

describe('item data integrity', () => {
  const REQUIRED_FIELDS = ['id', 'name', 'type', 'rarity', 'description'];

  it('every item has all required fields', () => {
    for (const item of ITEMS) {
      for (const field of REQUIRED_FIELDS) {
        assert.notStrictEqual(item[field], undefined, `item missing '${field}'`);
      }
    }
  });

  it('every item id is unique', () => {
    const ids = ITEMS.map(i => i.id);
    assert.strictEqual(new Set(ids).size, ids.length);
  });

  it('every item has a valid type', () => {
    const VALID_TYPES = ['weapon', 'armor', 'potion', 'misc'];
    for (const item of ITEMS) {
      assert.ok(VALID_TYPES.includes(item.type), `${item.id} has invalid type '${item.type}'`);
    }
  });

  it('weapons have weaponProperties', () => {
    for (const item of ITEMS) {
      if (item.type === 'weapon') {
        assert.notStrictEqual(item['weaponProperties'], undefined, `weapon ${item.id} missing weaponProperties`);
        assert.notStrictEqual(item.weaponProperties['damageDie'], undefined);
        assert.notStrictEqual(item.weaponProperties['damageType'], undefined);
      }
    }
  });

  it('armor has armorProperties', () => {
    for (const item of ITEMS) {
      if (item.type === 'armor') {
        assert.notStrictEqual(item['armorProperties'], undefined, `armor ${item.id} missing armorProperties`);
        assert.notStrictEqual(item.armorProperties['ac'], undefined);
      }
    }
  });
});

describe('getItem', () => {
  it('returns item by id', () => {
    const sword = getItem('longsword');
    assert.strictEqual(sword.name, 'Longsword');
    assert.strictEqual(sword.type, 'weapon');
  });

  it('returns null for unknown id', () => {
    assert.strictEqual(getItem('vorpal_blade'), null);
  });
});

describe('hasItem', () => {
  it('returns true for known item', () => {
    assert.strictEqual(hasItem('scimitar'), true);
  });

  it('returns false for unknown item', () => {
    assert.strictEqual(hasItem('vorpal_blade'), false);
  });
});

describe('getAllItems', () => {
  it('returns all items', () => {
    assert.ok(getAllItems().length >= 10);
  });
});

describe('getItemsByType', () => {
  it('returns weapons only', () => {
    const weapons = getItemsByType('weapon');
    assert.ok(weapons.length >= 4);
    assert.strictEqual(weapons.every(i => i.type === 'weapon'), true);
  });

  it('returns potions only', () => {
    const potions = getItemsByType('potion');
    assert.ok(potions.length >= 2);
    assert.strictEqual(potions.every(i => i.type === 'potion'), true);
  });
});
