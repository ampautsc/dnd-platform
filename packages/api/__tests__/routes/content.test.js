/**
 * Content Proxy Routes Tests
 * 
 * Requirements:
 * - GET /api/content/spells → returns array of spells
 * - GET /api/content/spells/:id → returns specific spell or 404
 * - GET /api/content/creatures → returns array of creatures
 * - GET /api/content/creatures/:key → returns specific creature or 404
 * - GET /api/content/items → returns array of items
 * - GET /api/content/items/:id → returns specific item or 404
 * - GET /api/content/species → returns array of species
 * - GET /api/content/species/:id → returns specific species or 404
 * - Content routes do NOT require auth (public read-only)
 */
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import supertest from 'supertest';
import { createApp } from '../../src/app.js';
import { createAuthService } from '../../src/services/AuthService.js';
import { createCharacterService } from '../../src/services/CharacterService.js';
import { initDatabase, closeDatabase } from '../../src/models/database.js';

const TEST_SECRET = 'test-secret-key-at-least-32-chars-long!!';

describe('Content Routes', () => {
  let request;

  beforeEach(() => {
    const db = initDatabase(':memory:');
    const auth = createAuthService({ secret: TEST_SECRET });
    const characters = createCharacterService(db);
    const app = createApp({ authService: auth, characterService: characters, db });
    request = supertest(app);
  });

  afterEach(() => {
    closeDatabase();
  });

  describe('GET /api/content/spells', () => {
    it('should return an array of spells', async () => {
      const res = await request.get('/api/content/spells');
      assert.strictEqual(res.status, 200);
      assert.strictEqual(Array.isArray(res.body.spells), true);
      assert.ok(res.body.spells.length > 0);
    });

    it('should return spells with expected fields', async () => {
      const res = await request.get('/api/content/spells');
      const spell = res.body.spells[0];
      assert.notStrictEqual(spell['name'], undefined);
      assert.notStrictEqual(spell['level'], undefined);
    });
  });

  describe('GET /api/content/spells/:id', () => {
    it('should return a specific spell by name', async () => {
      const res = await request.get('/api/content/spells/Fireball');
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.spell.name, 'Fireball');
    });

    it('should return 404 for unknown spell', async () => {
      const res = await request.get('/api/content/spells/Nonexistent%20Spell');
      assert.strictEqual(res.status, 404);
    });
  });

  describe('GET /api/content/creatures', () => {
    it('should return an array of creatures', async () => {
      const res = await request.get('/api/content/creatures');
      assert.strictEqual(res.status, 200);
      assert.strictEqual(Array.isArray(res.body.creatures), true);
      assert.ok(res.body.creatures.length > 0);
    });
  });

  describe('GET /api/content/items', () => {
    it('should return an array of items', async () => {
      const res = await request.get('/api/content/items');
      assert.strictEqual(res.status, 200);
      assert.strictEqual(Array.isArray(res.body.items), true);
      assert.ok(res.body.items.length > 0);
    });
  });

  describe('GET /api/content/items/:id', () => {
    it('should return a specific item by id', async () => {
      // Get the list first to find a valid ID
      const listRes = await request.get('/api/content/items');
      const firstItem = listRes.body.items[0];
      const res = await request.get(`/api/content/items/${firstItem.id}`);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.item.id, firstItem.id);
    });

    it('should return 404 for unknown item', async () => {
      const res = await request.get('/api/content/items/nonexistent');
      assert.strictEqual(res.status, 404);
    });
  });

  describe('GET /api/content/species', () => {
    it('should return an array of species', async () => {
      const res = await request.get('/api/content/species');
      assert.strictEqual(res.status, 200);
      assert.strictEqual(Array.isArray(res.body.species), true);
      assert.ok(res.body.species.length > 0);
    });
  });

  describe('no auth required', () => {
    it('should access content routes without Bearer token', async () => {
      const res = await request.get('/api/content/spells');
      assert.strictEqual(res.status, 200);
    });
  });

  describe('GET /api/content/npcs', () => {
    it('should return an array of NPC summaries', async () => {
      const res = await request.get('/api/content/npcs');
      assert.strictEqual(res.status, 200);
      assert.strictEqual(Array.isArray(res.body.npcs), true);
      assert.ok(res.body.npcs.length > 0);
    });

    it('should return summary fields only (not full data)', async () => {
      const res = await request.get('/api/content/npcs');
      const npc = res.body.npcs[0];
      assert.notStrictEqual(npc['templateKey'], undefined);
      assert.notStrictEqual(npc['name'], undefined);
      assert.notStrictEqual(npc['race'], undefined);
      assert.notStrictEqual(npc['npcType'], undefined);
      assert.notStrictEqual(npc['personality'], undefined);
      // Full data fields should not be present in summary
      expect(npc).not.toHaveProperty('consciousnessContext');
      expect(npc).not.toHaveProperty('fallbackLines');
    });
  });

  describe('GET /api/content/npcs/:key', () => {
    it('should return full NPC data by templateKey', async () => {
      const res = await request.get('/api/content/npcs/bree_millhaven');
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.npc.templateKey, 'bree_millhaven');
      assert.notStrictEqual(res.body.npc['consciousnessContext'], undefined);
      assert.notStrictEqual(res.body.npc['personality'], undefined);
    });

    it('should return 404 for unknown NPC', async () => {
      const res = await request.get('/api/content/npcs/nonexistent_npc');
      assert.strictEqual(res.status, 404);
    });
  });
});
