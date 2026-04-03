/**
 * Loot Tables — tests
 * Written BEFORE implementation (TDD Rule #4).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { getLootTable, hasLootTable, getAllLootTableKeys, LOOT_TABLES } from '../src/loot/index.js';

describe('loot table data integrity', () => {
  it('every loot table is a non-empty array', () => {
    for (const [key, table] of Object.entries(LOOT_TABLES)) {
      assert.strictEqual(Array.isArray(table), true, `${key} is not an array`);
      assert.ok(table.length > 0, `${key} is empty`);
    }
  });

  it('every loot entry has type, chance', () => {
    for (const [key, table] of Object.entries(LOOT_TABLES)) {
      for (const entry of table) {
        assert.notStrictEqual(entry['type'], undefined, `${key} entry missing type`);
        assert.notStrictEqual(entry['chance'], undefined, `${key} entry missing chance`);
        assert.ok(['item', 'currency'].includes(entry.type), `${key} has invalid type '${entry.type}'`);
        assert.ok(entry.chance >= 0);
        assert.ok(entry.chance <= 1);
      }
    }
  });

  it('item entries have itemId and quantity', () => {
    for (const [key, table] of Object.entries(LOOT_TABLES)) {
      for (const entry of table) {
        if (entry.type === 'item') {
          assert.notStrictEqual(entry['itemId'], undefined, `${key} item missing itemId`);
          assert.notStrictEqual(entry['quantity'], undefined, `${key} item missing quantity`);
        }
      }
    }
  });

  it('currency entries have currency and amount', () => {
    for (const [key, table] of Object.entries(LOOT_TABLES)) {
      for (const entry of table) {
        if (entry.type === 'currency') {
          assert.notStrictEqual(entry['currency'], undefined, `${key} currency missing currency`);
          assert.notStrictEqual(entry['amount'], undefined, `${key} currency missing amount`);
        }
      }
    }
  });
});

describe('getLootTable', () => {
  it('returns loot table for zombie', () => {
    const table = getLootTable('zombie');
    assert.ok(table.length > 0);
  });

  it('returns empty array for unknown creature', () => {
    assert.deepStrictEqual(getLootTable('ancient_gold_dragon'), []);
  });
});

describe('hasLootTable', () => {
  it('returns true for zombie', () => {
    assert.strictEqual(hasLootTable('zombie'), true);
  });

  it('returns false for unknown', () => {
    assert.strictEqual(hasLootTable('ancient_gold_dragon'), false);
  });
});

describe('getAllLootTableKeys', () => {
  it('returns all creature keys that have loot', () => {
    const keys = getAllLootTableKeys();
    assert.ok(keys.length >= 10);
    assert.ok(keys.includes('zombie'));
    assert.ok(keys.includes('bandit'));
  });
});
