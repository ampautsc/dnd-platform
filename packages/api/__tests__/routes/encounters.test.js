/**
 * Encounter Routes Tests
 *
 * Requirements:
 * - POST /api/encounters — creates encounter with NPC(s), returns 201
 * - POST /api/encounters — returns 400 for missing/invalid npcTemplateKeys
 * - POST /api/encounters — returns 404 if NPC templateKey not found
 * - GET /api/encounters — lists encounters
 * - GET /api/encounters/:id — returns encounter state
 * - GET /api/encounters/:id — returns 404 for unknown encounter
 * - POST /api/encounters/:id/messages — sends message, returns NPC response
 * - POST /api/encounters/:id/messages — returns 400 for empty text
 * - POST /api/encounters/:id/end — ends encounter
 * - Encounter routes require auth (dev bypass auto-injects dev user)
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import supertest from 'supertest';
import { createApp } from '../../src/app.js';
import { createAuthService } from '../../src/services/AuthService.js';
import { createCharacterService } from '../../src/services/CharacterService.js';
import { createEncounterController } from '../../src/services/EncounterController.js';
import { initDatabase, closeDatabase } from '../../src/models/database.js';
import { createDmEngine } from '@dnd-platform/dm';
import { getNpc } from '@dnd-platform/content/npcs';

const TEST_SECRET = 'test-secret-key-at-least-32-chars-long!!';

describe('Encounter Routes', () => {
  let request;
  let dmEngine;

  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'development');

    const db = initDatabase(':memory:');
    const auth = createAuthService({ secret: TEST_SECRET });
    const characters = createCharacterService(db);

    // DM engine with MockProvider for testing — personalityLookup resolves from content
    dmEngine = createDmEngine({
      personalityLookup: (key) => getNpc(key) || null,
    });

    const encounterController = createEncounterController(dmEngine.encounterSession);
    const app = createApp({ authService: auth, characterService: characters, db, encounterController });
    request = supertest(app);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    closeDatabase();
    dmEngine.encounterSession.clearAll();
  });

  describe('POST /api/encounters', () => {
    it('should create an encounter and return 201', async () => {
      const res = await request
        .post('/api/encounters')
        .send({ npcTemplateKeys: ['bree_millhaven'], playerName: 'Test Hero' });

      expect(res.status).toBe(201);
      expect(res.body.encounterId).toBeDefined();
      expect(res.body.npcs).toHaveLength(1);
      expect(res.body.npcs[0].name).toBeDefined();
      expect(res.body.status).toBe('active');
      expect(res.body.messages).toEqual([]);
    });

    it('should return 400 for missing npcTemplateKeys', async () => {
      const res = await request
        .post('/api/encounters')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_INPUT');
    });

    it('should return 400 for empty npcTemplateKeys array', async () => {
      const res = await request
        .post('/api/encounters')
        .send({ npcTemplateKeys: [] });

      expect(res.status).toBe(400);
    });

    it('should return 404 for unknown NPC templateKey', async () => {
      const res = await request
        .post('/api/encounters')
        .send({ npcTemplateKeys: ['nonexistent_npc'] });

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('NPC_NOT_FOUND');
    });

    it('should support multiple NPCs in one encounter', async () => {
      const res = await request
        .post('/api/encounters')
        .send({ npcTemplateKeys: ['bree_millhaven', 'torval_grimm'] });

      expect(res.status).toBe(201);
      expect(res.body.npcs).toHaveLength(2);
    });
  });

  describe('GET /api/encounters', () => {
    it('should list encounters (empty initially)', async () => {
      const res = await request.get('/api/encounters');
      expect(res.status).toBe(200);
      expect(res.body.encounters).toEqual([]);
    });

    it('should list encounters after creating one', async () => {
      await request
        .post('/api/encounters')
        .send({ npcTemplateKeys: ['bree_millhaven'] });

      const res = await request.get('/api/encounters');
      expect(res.status).toBe(200);
      expect(res.body.encounters).toHaveLength(1);
    });
  });

  describe('GET /api/encounters/:id', () => {
    it('should return encounter state', async () => {
      const createRes = await request
        .post('/api/encounters')
        .send({ npcTemplateKeys: ['bree_millhaven'] });
      const { encounterId } = createRes.body;

      const res = await request.get(`/api/encounters/${encounterId}`);
      expect(res.status).toBe(200);
      expect(res.body.encounterId).toBe(encounterId);
      expect(res.body.status).toBe('active');
    });

    it('should return 404 for unknown encounter', async () => {
      const res = await request.get('/api/encounters/nonexistent');
      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/encounters/:id/messages', () => {
    it('should send a message and receive NPC response', async () => {
      const createRes = await request
        .post('/api/encounters')
        .send({ npcTemplateKeys: ['bree_millhaven'] });
      const { encounterId } = createRes.body;

      const res = await request
        .post(`/api/encounters/${encounterId}/messages`)
        .send({ text: 'Hello Bree!' });

      expect(res.status).toBe(200);
      expect(res.body.playerMessage).toBeDefined();
      expect(res.body.playerMessage.text).toBe('Hello Bree!');
      expect(res.body.playerMessage.sender).toBe('player');
      expect(res.body.npcResponses).toBeDefined();
      expect(res.body.npcResponses.length).toBeGreaterThan(0);
      expect(res.body.npcResponses[0].sender).toBe('bree_millhaven');
      expect(res.body.npcResponses[0].text).toBeDefined();
    });

    it('should return 400 for empty text', async () => {
      const createRes = await request
        .post('/api/encounters')
        .send({ npcTemplateKeys: ['bree_millhaven'] });
      const { encounterId } = createRes.body;

      const res = await request
        .post(`/api/encounters/${encounterId}/messages`)
        .send({ text: '' });

      expect(res.status).toBe(400);
    });

    it('should return 404 for unknown encounter', async () => {
      const res = await request
        .post('/api/encounters/nonexistent/messages')
        .send({ text: 'Hello' });

      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/encounters/:id/end', () => {
    it('should end an encounter', async () => {
      const createRes = await request
        .post('/api/encounters')
        .send({ npcTemplateKeys: ['bree_millhaven'] });
      const { encounterId } = createRes.body;

      const res = await request.post(`/api/encounters/${encounterId}/end`);
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ended');
    });

    it('should return 409 when sending message to ended encounter', async () => {
      const createRes = await request
        .post('/api/encounters')
        .send({ npcTemplateKeys: ['bree_millhaven'] });
      const { encounterId } = createRes.body;

      await request.post(`/api/encounters/${encounterId}/end`);

      const res = await request
        .post(`/api/encounters/${encounterId}/messages`)
        .send({ text: 'Hello?' });

      expect(res.status).toBe(409);
    });
  });
});
