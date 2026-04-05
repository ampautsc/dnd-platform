/**
 * CharacterService Tests
 * 
 * Requirements:
 * - create(userId, data) → creates a character, returns it with generated id
 * - getById(id) → returns character or null
 * - getAllByUser(userId) → returns array of user's characters
 * - update(id, data) → updates character fields, returns updated character
 * - remove(id) → deletes character, returns true/false
 * - Characters have: id, userId, name, level, className, speciesId, baseStats, 
 *   speciesAsi, levelChoices, inventory, currency, maxHp, currentHp
 * - JSON fields (baseStats, speciesAsi, levelChoices, inventory, currency) are 
 *   stored as JSON strings in SQLite but returned as parsed objects
 * - Service is pure logic on top of a database — receives db as dependency
 */
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createCharacterService } from '../../src/services/CharacterService.js';
import { initDatabase, closeDatabase } from '../../src/models/database.js';

describe('CharacterService', () => {
  let db;
  let characters;

  beforeEach(() => {
    db = initDatabase(':memory:');
    characters = createCharacterService(db);

    // Create a test user
    db.prepare('INSERT INTO users (id, email) VALUES (?, ?)').run('user-1', 'player@test.com');
    db.prepare('INSERT INTO users (id, email) VALUES (?, ?)').run('user-2', 'dm@test.com');
  });

  afterEach(() => {
    closeDatabase();
  });

  describe('create', () => {
    it('should create a character and return it with an id', () => {
      const char = characters.create('user-1', {
        name: 'Thorin Ironforge',
        level: 5,
        className: 'Fighter',
      });

      assert.notStrictEqual(char['id'], undefined);
      assert.ok(char.id);
      assert.strictEqual(char.name, 'Thorin Ironforge');
      assert.strictEqual(char.level, 5);
      assert.strictEqual(char.className, 'Fighter');
      assert.strictEqual(char.userId, 'user-1');
    });

    it('should set default values for optional fields', () => {
      const char = characters.create('user-1', { name: 'Minimalist' });

      assert.strictEqual(char.level, 1);
      assert.strictEqual(char.className, 'Fighter');
      assert.deepStrictEqual(char.baseStats, { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 });
      assert.deepStrictEqual(char.inventory, []);
      assert.deepStrictEqual(char.currency, { cp: 0, sp: 0, gp: 0, pp: 0 });
      assert.strictEqual(char.maxHp, 10);
      assert.strictEqual(char.currentHp, 10);
    });

    it('should store and return JSON fields as parsed objects', () => {
      const char = characters.create('user-1', {
        name: 'Custom Stats',
        baseStats: { str: 16, dex: 14, con: 14, int: 8, wis: 12, cha: 10 },
        inventory: [{ itemId: 'longsword', quantity: 1 }],
        currency: { cp: 0, sp: 50, gp: 100, pp: 0 },
      });

      assert.strictEqual(char.baseStats.str, 16);
      assert.strictEqual(char.inventory.length, 1);
      assert.strictEqual(char.inventory[0].itemId, 'longsword');
      assert.strictEqual(char.currency.gp, 100);
    });

    it('should throw if name is missing', () => {
      assert.throws(() => characters.create('user-1', {}), /name/i);
      assert.throws(() => characters.create('user-1', { name: '' }), /name/i);
    });
  });

  describe('getById', () => {
    it('should return a character by id', () => {
      const created = characters.create('user-1', { name: 'Findable' });
      const found = characters.getById(created.id);

      assert.notStrictEqual(found, null);
      assert.strictEqual(found.name, 'Findable');
      assert.strictEqual(found.id, created.id);
    });

    it('should return null for non-existent id', () => {
      assert.strictEqual(characters.getById('nope'), null);
    });

    it('should return parsed JSON fields', () => {
      const created = characters.create('user-1', {
        name: 'JSON Test',
        baseStats: { str: 18, dex: 10, con: 14, int: 10, wis: 10, cha: 10 },
      });
      const found = characters.getById(created.id);

      assert.strictEqual(found.baseStats.str, 18);
      assert.strictEqual(typeof found.baseStats, 'object');
    });
  });

  describe('getAllByUser', () => {
    it('should return all characters for a user', () => {
      characters.create('user-1', { name: 'Char A' });
      characters.create('user-1', { name: 'Char B' });
      characters.create('user-2', { name: 'Other User Char' });

      const user1Chars = characters.getAllByUser('user-1');
      assert.strictEqual(user1Chars.length, 2);
      assert.deepStrictEqual(user1Chars.map(c => c.name).sort(), ['Char A', 'Char B']);
    });

    it('should return empty array for user with no characters', () => {
      assert.deepStrictEqual(characters.getAllByUser('user-1'), []);
    });
  });

  describe('update', () => {
    it('should update specified fields and return the updated character', () => {
      const created = characters.create('user-1', { name: 'Original', level: 1 });
      const updated = characters.update(created.id, { name: 'Renamed', level: 5 });

      assert.strictEqual(updated.name, 'Renamed');
      assert.strictEqual(updated.level, 5);
      assert.strictEqual(updated.id, created.id);
    });

    it('should update JSON fields', () => {
      const created = characters.create('user-1', { name: 'Gear Up' });
      const updated = characters.update(created.id, {
        inventory: [{ itemId: 'shield', quantity: 1 }],
        currency: { cp: 0, sp: 0, gp: 250, pp: 5 },
      });

      assert.strictEqual(updated.inventory.length, 1);
      assert.strictEqual(updated.inventory[0].itemId, 'shield');
      assert.strictEqual(updated.currency.gp, 250);
    });

    it('should not modify unspecified fields', () => {
      const created = characters.create('user-1', { name: 'Partial Update', level: 3 });
      const updated = characters.update(created.id, { level: 4 });

      assert.strictEqual(updated.name, 'Partial Update');
      assert.strictEqual(updated.level, 4);
    });

    it('should return null for non-existent id', () => {
      assert.strictEqual(characters.update('nope', { name: 'Ghost' }), null);
    });
  });

  describe('remove', () => {
    it('should delete an existing character and return true', () => {
      const created = characters.create('user-1', { name: 'Doomed' });
      assert.strictEqual(characters.remove(created.id), true);
      assert.strictEqual(characters.getById(created.id), null);
    });

    it('should return false for non-existent id', () => {
      assert.strictEqual(characters.remove('nope'), false);
    });
  });
});
