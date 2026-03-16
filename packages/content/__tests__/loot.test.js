/**
 * Loot Tables — tests
 * Written BEFORE implementation (TDD Rule #4).
 */

import { describe, it, expect } from 'vitest';
import { getLootTable, hasLootTable, getAllLootTableKeys, LOOT_TABLES } from '../src/loot/index.js';

describe('loot table data integrity', () => {
  it('every loot table is a non-empty array', () => {
    for (const [key, table] of Object.entries(LOOT_TABLES)) {
      expect(Array.isArray(table), `${key} is not an array`).toBe(true);
      expect(table.length, `${key} is empty`).toBeGreaterThan(0);
    }
  });

  it('every loot entry has type, chance', () => {
    for (const [key, table] of Object.entries(LOOT_TABLES)) {
      for (const entry of table) {
        expect(entry, `${key} entry missing type`).toHaveProperty('type');
        expect(entry, `${key} entry missing chance`).toHaveProperty('chance');
        expect(['item', 'currency'], `${key} has invalid type '${entry.type}'`).toContain(entry.type);
        expect(entry.chance).toBeGreaterThanOrEqual(0);
        expect(entry.chance).toBeLessThanOrEqual(1);
      }
    }
  });

  it('item entries have itemId and quantity', () => {
    for (const [key, table] of Object.entries(LOOT_TABLES)) {
      for (const entry of table) {
        if (entry.type === 'item') {
          expect(entry, `${key} item missing itemId`).toHaveProperty('itemId');
          expect(entry, `${key} item missing quantity`).toHaveProperty('quantity');
        }
      }
    }
  });

  it('currency entries have currency and amount', () => {
    for (const [key, table] of Object.entries(LOOT_TABLES)) {
      for (const entry of table) {
        if (entry.type === 'currency') {
          expect(entry, `${key} currency missing currency`).toHaveProperty('currency');
          expect(entry, `${key} currency missing amount`).toHaveProperty('amount');
        }
      }
    }
  });
});

describe('getLootTable', () => {
  it('returns loot table for zombie', () => {
    const table = getLootTable('zombie');
    expect(table.length).toBeGreaterThan(0);
  });

  it('returns empty array for unknown creature', () => {
    expect(getLootTable('ancient_gold_dragon')).toEqual([]);
  });
});

describe('hasLootTable', () => {
  it('returns true for zombie', () => {
    expect(hasLootTable('zombie')).toBe(true);
  });

  it('returns false for unknown', () => {
    expect(hasLootTable('ancient_gold_dragon')).toBe(false);
  });
});

describe('getAllLootTableKeys', () => {
  it('returns all creature keys that have loot', () => {
    const keys = getAllLootTableKeys();
    expect(keys.length).toBeGreaterThanOrEqual(10);
    expect(keys).toContain('zombie');
    expect(keys).toContain('bandit');
  });
});
