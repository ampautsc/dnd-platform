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
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
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
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.spells)).toBe(true);
      expect(res.body.spells.length).toBeGreaterThan(0);
    });

    it('should return spells with expected fields', async () => {
      const res = await request.get('/api/content/spells');
      const spell = res.body.spells[0];
      expect(spell).toHaveProperty('name');
      expect(spell).toHaveProperty('level');
    });
  });

  describe('GET /api/content/spells/:id', () => {
    it('should return a specific spell by name', async () => {
      const res = await request.get('/api/content/spells/Fireball');
      expect(res.status).toBe(200);
      expect(res.body.spell.name).toBe('Fireball');
    });

    it('should return 404 for unknown spell', async () => {
      const res = await request.get('/api/content/spells/Nonexistent%20Spell');
      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/content/creatures', () => {
    it('should return an array of creatures', async () => {
      const res = await request.get('/api/content/creatures');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.creatures)).toBe(true);
      expect(res.body.creatures.length).toBeGreaterThan(0);
    });
  });

  describe('GET /api/content/items', () => {
    it('should return an array of items', async () => {
      const res = await request.get('/api/content/items');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.items)).toBe(true);
      expect(res.body.items.length).toBeGreaterThan(0);
    });
  });

  describe('GET /api/content/items/:id', () => {
    it('should return a specific item by id', async () => {
      // Get the list first to find a valid ID
      const listRes = await request.get('/api/content/items');
      const firstItem = listRes.body.items[0];
      const res = await request.get(`/api/content/items/${firstItem.id}`);
      expect(res.status).toBe(200);
      expect(res.body.item.id).toBe(firstItem.id);
    });

    it('should return 404 for unknown item', async () => {
      const res = await request.get('/api/content/items/nonexistent');
      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/content/species', () => {
    it('should return an array of species', async () => {
      const res = await request.get('/api/content/species');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.species)).toBe(true);
      expect(res.body.species.length).toBeGreaterThan(0);
    });
  });

  describe('no auth required', () => {
    it('should access content routes without Bearer token', async () => {
      const res = await request.get('/api/content/spells');
      expect(res.status).toBe(200);
    });
  });
});
