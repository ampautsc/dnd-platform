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
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
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

      expect(char).toHaveProperty('id');
      expect(char.id).toBeTruthy();
      expect(char.name).toBe('Thorin Ironforge');
      expect(char.level).toBe(5);
      expect(char.className).toBe('Fighter');
      expect(char.userId).toBe('user-1');
    });

    it('should set default values for optional fields', () => {
      const char = characters.create('user-1', { name: 'Minimalist' });

      expect(char.level).toBe(1);
      expect(char.className).toBe('Fighter');
      expect(char.baseStats).toEqual({ str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 });
      expect(char.inventory).toEqual([]);
      expect(char.currency).toEqual({ cp: 0, sp: 0, gp: 0, pp: 0 });
      expect(char.maxHp).toBe(10);
      expect(char.currentHp).toBe(10);
    });

    it('should store and return JSON fields as parsed objects', () => {
      const char = characters.create('user-1', {
        name: 'Custom Stats',
        baseStats: { str: 16, dex: 14, con: 14, int: 8, wis: 12, cha: 10 },
        inventory: [{ itemId: 'longsword', quantity: 1 }],
        currency: { cp: 0, sp: 50, gp: 100, pp: 0 },
      });

      expect(char.baseStats.str).toBe(16);
      expect(char.inventory).toHaveLength(1);
      expect(char.inventory[0].itemId).toBe('longsword');
      expect(char.currency.gp).toBe(100);
    });

    it('should throw if name is missing', () => {
      expect(() => characters.create('user-1', {})).toThrow(/name/i);
      expect(() => characters.create('user-1', { name: '' })).toThrow(/name/i);
    });
  });

  describe('getById', () => {
    it('should return a character by id', () => {
      const created = characters.create('user-1', { name: 'Findable' });
      const found = characters.getById(created.id);

      expect(found).not.toBeNull();
      expect(found.name).toBe('Findable');
      expect(found.id).toBe(created.id);
    });

    it('should return null for non-existent id', () => {
      expect(characters.getById('nope')).toBeNull();
    });

    it('should return parsed JSON fields', () => {
      const created = characters.create('user-1', {
        name: 'JSON Test',
        baseStats: { str: 18, dex: 10, con: 14, int: 10, wis: 10, cha: 10 },
      });
      const found = characters.getById(created.id);

      expect(found.baseStats.str).toBe(18);
      expect(typeof found.baseStats).toBe('object');
    });
  });

  describe('getAllByUser', () => {
    it('should return all characters for a user', () => {
      characters.create('user-1', { name: 'Char A' });
      characters.create('user-1', { name: 'Char B' });
      characters.create('user-2', { name: 'Other User Char' });

      const user1Chars = characters.getAllByUser('user-1');
      expect(user1Chars).toHaveLength(2);
      expect(user1Chars.map(c => c.name).sort()).toEqual(['Char A', 'Char B']);
    });

    it('should return empty array for user with no characters', () => {
      expect(characters.getAllByUser('user-1')).toEqual([]);
    });
  });

  describe('update', () => {
    it('should update specified fields and return the updated character', () => {
      const created = characters.create('user-1', { name: 'Original', level: 1 });
      const updated = characters.update(created.id, { name: 'Renamed', level: 5 });

      expect(updated.name).toBe('Renamed');
      expect(updated.level).toBe(5);
      expect(updated.id).toBe(created.id);
    });

    it('should update JSON fields', () => {
      const created = characters.create('user-1', { name: 'Gear Up' });
      const updated = characters.update(created.id, {
        inventory: [{ itemId: 'shield', quantity: 1 }],
        currency: { cp: 0, sp: 0, gp: 250, pp: 5 },
      });

      expect(updated.inventory).toHaveLength(1);
      expect(updated.inventory[0].itemId).toBe('shield');
      expect(updated.currency.gp).toBe(250);
    });

    it('should not modify unspecified fields', () => {
      const created = characters.create('user-1', { name: 'Partial Update', level: 3 });
      const updated = characters.update(created.id, { level: 4 });

      expect(updated.name).toBe('Partial Update');
      expect(updated.level).toBe(4);
    });

    it('should return null for non-existent id', () => {
      expect(characters.update('nope', { name: 'Ghost' })).toBeNull();
    });
  });

  describe('remove', () => {
    it('should delete an existing character and return true', () => {
      const created = characters.create('user-1', { name: 'Doomed' });
      expect(characters.remove(created.id)).toBe(true);
      expect(characters.getById(created.id)).toBeNull();
    });

    it('should return false for non-existent id', () => {
      expect(characters.remove('nope')).toBe(false);
    });
  });
});
