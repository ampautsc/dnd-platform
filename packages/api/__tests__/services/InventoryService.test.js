/**
 * InventoryService Tests
 * 
 * Requirements:
 * - addItem(inventory, itemId, quantity) → adds item or increments quantity
 * - removeItem(inventory, itemId, quantity) → decrements or removes item
 * - hasItem(inventory, itemId, minQuantity?) → boolean check
 * - getItemCount(inventory, itemId) → number
 * - addCurrency(currency, type, amount) → returns new currency object with added amount
 * - removeCurrency(currency, type, amount) → returns new currency or throws if insufficient
 * - hasCurrency(currency, type, amount) → boolean check
 * - applyLootDrop(inventory, currency, lootEntries, rollFn) → applies rolled loot to inventory/currency
 * 
 * All functions are PURE — they take data and return new data, never mutate inputs.
 * Inventory shape: [{ itemId: string, quantity: number }]
 * Currency shape: { cp: number, sp: number, gp: number, pp: number }
 */
import { describe, it, expect } from 'vitest';
import {
  addItem,
  removeItem,
  hasItem,
  getItemCount,
  addCurrency,
  removeCurrency,
  hasCurrency,
  applyLootDrop,
} from '../../src/services/InventoryService.js';

describe('InventoryService', () => {
  describe('addItem', () => {
    it('should add a new item to an empty inventory', () => {
      const result = addItem([], 'longsword', 1);
      expect(result).toEqual([{ itemId: 'longsword', quantity: 1 }]);
    });

    it('should increment quantity for an existing item', () => {
      const inv = [{ itemId: 'arrow', quantity: 10 }];
      const result = addItem(inv, 'arrow', 5);
      expect(result).toEqual([{ itemId: 'arrow', quantity: 15 }]);
    });

    it('should not mutate the original inventory', () => {
      const inv = [{ itemId: 'potion', quantity: 2 }];
      const result = addItem(inv, 'potion', 1);
      expect(inv[0].quantity).toBe(2);
      expect(result[0].quantity).toBe(3);
    });

    it('should default quantity to 1', () => {
      const result = addItem([], 'shield');
      expect(result).toEqual([{ itemId: 'shield', quantity: 1 }]);
    });
  });

  describe('removeItem', () => {
    it('should decrement quantity', () => {
      const inv = [{ itemId: 'arrow', quantity: 10 }];
      const result = removeItem(inv, 'arrow', 3);
      expect(result).toEqual([{ itemId: 'arrow', quantity: 7 }]);
    });

    it('should remove the entry entirely when quantity reaches 0', () => {
      const inv = [{ itemId: 'potion', quantity: 1 }];
      const result = removeItem(inv, 'potion', 1);
      expect(result).toEqual([]);
    });

    it('should throw when removing more than available', () => {
      const inv = [{ itemId: 'potion', quantity: 1 }];
      expect(() => removeItem(inv, 'potion', 5)).toThrow(/insufficient/i);
    });

    it('should throw when item not in inventory', () => {
      expect(() => removeItem([], 'ghost-item', 1)).toThrow(/not found/i);
    });

    it('should not mutate the original inventory', () => {
      const inv = [{ itemId: 'arrow', quantity: 10 }];
      removeItem(inv, 'arrow', 3);
      expect(inv[0].quantity).toBe(10);
    });
  });

  describe('hasItem', () => {
    it('should return true if item exists with sufficient quantity', () => {
      const inv = [{ itemId: 'potion', quantity: 3 }];
      expect(hasItem(inv, 'potion')).toBe(true);
      expect(hasItem(inv, 'potion', 3)).toBe(true);
    });

    it('should return false if item is missing', () => {
      expect(hasItem([], 'potion')).toBe(false);
    });

    it('should return false if quantity is insufficient', () => {
      const inv = [{ itemId: 'potion', quantity: 1 }];
      expect(hasItem(inv, 'potion', 5)).toBe(false);
    });
  });

  describe('getItemCount', () => {
    it('should return the quantity of an item', () => {
      const inv = [{ itemId: 'arrow', quantity: 20 }];
      expect(getItemCount(inv, 'arrow')).toBe(20);
    });

    it('should return 0 for missing items', () => {
      expect(getItemCount([], 'arrow')).toBe(0);
    });
  });

  describe('addCurrency', () => {
    it('should add to the specified currency type', () => {
      const cur = { cp: 0, sp: 0, gp: 50, pp: 0 };
      const result = addCurrency(cur, 'gp', 25);
      expect(result.gp).toBe(75);
    });

    it('should not mutate the original', () => {
      const cur = { cp: 0, sp: 0, gp: 50, pp: 0 };
      addCurrency(cur, 'gp', 25);
      expect(cur.gp).toBe(50);
    });

    it('should throw for invalid currency type', () => {
      const cur = { cp: 0, sp: 0, gp: 0, pp: 0 };
      expect(() => addCurrency(cur, 'electrum', 10)).toThrow(/invalid currency/i);
    });
  });

  describe('removeCurrency', () => {
    it('should subtract from the specified currency type', () => {
      const cur = { cp: 0, sp: 0, gp: 100, pp: 0 };
      const result = removeCurrency(cur, 'gp', 30);
      expect(result.gp).toBe(70);
    });

    it('should throw if insufficient funds', () => {
      const cur = { cp: 0, sp: 0, gp: 10, pp: 0 };
      expect(() => removeCurrency(cur, 'gp', 50)).toThrow(/insufficient/i);
    });

    it('should not mutate the original', () => {
      const cur = { cp: 0, sp: 0, gp: 100, pp: 0 };
      removeCurrency(cur, 'gp', 30);
      expect(cur.gp).toBe(100);
    });
  });

  describe('hasCurrency', () => {
    it('should return true when sufficient', () => {
      const cur = { cp: 0, sp: 0, gp: 100, pp: 0 };
      expect(hasCurrency(cur, 'gp', 100)).toBe(true);
      expect(hasCurrency(cur, 'gp', 50)).toBe(true);
    });

    it('should return false when insufficient', () => {
      const cur = { cp: 0, sp: 0, gp: 10, pp: 0 };
      expect(hasCurrency(cur, 'gp', 50)).toBe(false);
    });
  });

  describe('applyLootDrop', () => {
    it('should add items and currency from loot entries based on roll results', () => {
      const inv = [];
      const cur = { cp: 0, sp: 0, gp: 0, pp: 0 };
      const loot = [
        { type: 'item', itemId: 'longsword', chance: 1.0, quantity: 1 },
        { type: 'currency', currency: 'gold', chance: 1.0, amount: '2d6' },
      ];
      // rollFn always returns a fixed value for determinism
      const rollFn = () => 7;

      const result = applyLootDrop(inv, cur, loot, rollFn);
      expect(result.inventory).toEqual([{ itemId: 'longsword', quantity: 1 }]);
      expect(result.currency.gp).toBe(7);
    });

    it('should skip items when chance roll fails', () => {
      const inv = [];
      const cur = { cp: 0, sp: 0, gp: 0, pp: 0 };
      const loot = [
        { type: 'item', itemId: 'rare-gem', chance: 0.0, quantity: 1 },
      ];
      const rollFn = () => 1;

      const result = applyLootDrop(inv, cur, loot, rollFn);
      expect(result.inventory).toEqual([]);
    });

    it('should not mutate inputs', () => {
      const inv = [{ itemId: 'arrow', quantity: 5 }];
      const cur = { cp: 0, sp: 10, gp: 0, pp: 0 };
      const loot = [
        { type: 'item', itemId: 'arrow', chance: 1.0, quantity: 3 },
        { type: 'currency', currency: 'silver', chance: 1.0, amount: '1d6' },
      ];
      const rollFn = () => 4;

      applyLootDrop(inv, cur, loot, rollFn);
      expect(inv[0].quantity).toBe(5);
      expect(cur.sp).toBe(10);
    });
  });
});
