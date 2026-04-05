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
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
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
      assert.deepStrictEqual(result, [{ itemId: 'longsword', quantity: 1 }]);
    });

    it('should increment quantity for an existing item', () => {
      const inv = [{ itemId: 'arrow', quantity: 10 }];
      const result = addItem(inv, 'arrow', 5);
      assert.deepStrictEqual(result, [{ itemId: 'arrow', quantity: 15 }]);
    });

    it('should not mutate the original inventory', () => {
      const inv = [{ itemId: 'potion', quantity: 2 }];
      const result = addItem(inv, 'potion', 1);
      assert.strictEqual(inv[0].quantity, 2);
      assert.strictEqual(result[0].quantity, 3);
    });

    it('should default quantity to 1', () => {
      const result = addItem([], 'shield');
      assert.deepStrictEqual(result, [{ itemId: 'shield', quantity: 1 }]);
    });
  });

  describe('removeItem', () => {
    it('should decrement quantity', () => {
      const inv = [{ itemId: 'arrow', quantity: 10 }];
      const result = removeItem(inv, 'arrow', 3);
      assert.deepStrictEqual(result, [{ itemId: 'arrow', quantity: 7 }]);
    });

    it('should remove the entry entirely when quantity reaches 0', () => {
      const inv = [{ itemId: 'potion', quantity: 1 }];
      const result = removeItem(inv, 'potion', 1);
      assert.deepStrictEqual(result, []);
    });

    it('should throw when removing more than available', () => {
      const inv = [{ itemId: 'potion', quantity: 1 }];
      assert.throws(() => removeItem(inv, 'potion', 5), /insufficient/i);
    });

    it('should throw when item not in inventory', () => {
      assert.throws(() => removeItem([], 'ghost-item', 1), /not found/i);
    });

    it('should not mutate the original inventory', () => {
      const inv = [{ itemId: 'arrow', quantity: 10 }];
      removeItem(inv, 'arrow', 3);
      assert.strictEqual(inv[0].quantity, 10);
    });
  });

  describe('hasItem', () => {
    it('should return true if item exists with sufficient quantity', () => {
      const inv = [{ itemId: 'potion', quantity: 3 }];
      assert.strictEqual(hasItem(inv, 'potion'), true);
      assert.strictEqual(hasItem(inv, 'potion', 3), true);
    });

    it('should return false if item is missing', () => {
      assert.strictEqual(hasItem([], 'potion'), false);
    });

    it('should return false if quantity is insufficient', () => {
      const inv = [{ itemId: 'potion', quantity: 1 }];
      assert.strictEqual(hasItem(inv, 'potion', 5), false);
    });
  });

  describe('getItemCount', () => {
    it('should return the quantity of an item', () => {
      const inv = [{ itemId: 'arrow', quantity: 20 }];
      assert.strictEqual(getItemCount(inv, 'arrow'), 20);
    });

    it('should return 0 for missing items', () => {
      assert.strictEqual(getItemCount([], 'arrow'), 0);
    });
  });

  describe('addCurrency', () => {
    it('should add to the specified currency type', () => {
      const cur = { cp: 0, sp: 0, gp: 50, pp: 0 };
      const result = addCurrency(cur, 'gp', 25);
      assert.strictEqual(result.gp, 75);
    });

    it('should not mutate the original', () => {
      const cur = { cp: 0, sp: 0, gp: 50, pp: 0 };
      addCurrency(cur, 'gp', 25);
      assert.strictEqual(cur.gp, 50);
    });

    it('should throw for invalid currency type', () => {
      const cur = { cp: 0, sp: 0, gp: 0, pp: 0 };
      assert.throws(() => addCurrency(cur, 'electrum', 10), /invalid currency/i);
    });
  });

  describe('removeCurrency', () => {
    it('should subtract from the specified currency type', () => {
      const cur = { cp: 0, sp: 0, gp: 100, pp: 0 };
      const result = removeCurrency(cur, 'gp', 30);
      assert.strictEqual(result.gp, 70);
    });

    it('should throw if insufficient funds', () => {
      const cur = { cp: 0, sp: 0, gp: 10, pp: 0 };
      assert.throws(() => removeCurrency(cur, 'gp', 50), /insufficient/i);
    });

    it('should not mutate the original', () => {
      const cur = { cp: 0, sp: 0, gp: 100, pp: 0 };
      removeCurrency(cur, 'gp', 30);
      assert.strictEqual(cur.gp, 100);
    });
  });

  describe('hasCurrency', () => {
    it('should return true when sufficient', () => {
      const cur = { cp: 0, sp: 0, gp: 100, pp: 0 };
      assert.strictEqual(hasCurrency(cur, 'gp', 100), true);
      assert.strictEqual(hasCurrency(cur, 'gp', 50), true);
    });

    it('should return false when insufficient', () => {
      const cur = { cp: 0, sp: 0, gp: 10, pp: 0 };
      assert.strictEqual(hasCurrency(cur, 'gp', 50), false);
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
      assert.deepStrictEqual(result.inventory, [{ itemId: 'longsword', quantity: 1 }]);
      assert.strictEqual(result.currency.gp, 7);
    });

    it('should skip items when chance roll fails', () => {
      const inv = [];
      const cur = { cp: 0, sp: 0, gp: 0, pp: 0 };
      const loot = [
        { type: 'item', itemId: 'rare-gem', chance: 0.0, quantity: 1 },
      ];
      const rollFn = () => 1;

      const result = applyLootDrop(inv, cur, loot, rollFn);
      assert.deepStrictEqual(result.inventory, []);
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
      assert.strictEqual(inv[0].quantity, 5);
      assert.strictEqual(cur.sp, 10);
    });
  });
});
