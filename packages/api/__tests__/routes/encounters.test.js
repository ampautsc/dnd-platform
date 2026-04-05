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
import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
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

      assert.strictEqual(res.status, 201);
      assert.notStrictEqual(res.body.encounterId, undefined);
      assert.strictEqual(res.body.npcs.length, 1);
      assert.notStrictEqual(res.body.npcs[0].name, undefined);
      assert.strictEqual(res.body.status, 'active');
      assert.deepStrictEqual(res.body.messages, []);
    });

    it('should return 400 for missing npcTemplateKeys', async () => {
      const res = await request
        .post('/api/encounters')
        .send({});

      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.body.code, 'INVALID_INPUT');
    });

    it('should return 400 for empty npcTemplateKeys array', async () => {
      const res = await request
        .post('/api/encounters')
        .send({ npcTemplateKeys: [] });

      assert.strictEqual(res.status, 400);
    });

    it('should return 404 for unknown NPC templateKey', async () => {
      const res = await request
        .post('/api/encounters')
        .send({ npcTemplateKeys: ['nonexistent_npc'] });

      assert.strictEqual(res.status, 404);
      assert.strictEqual(res.body.code, 'NPC_NOT_FOUND');
    });

    it('should support multiple NPCs in one encounter', async () => {
      const res = await request
        .post('/api/encounters')
        .send({ npcTemplateKeys: ['bree_millhaven', 'torval_grimm'] });

      assert.strictEqual(res.status, 201);
      assert.strictEqual(res.body.npcs.length, 2);
    });
  });

  describe('GET /api/encounters', () => {
    it('should list encounters (empty initially)', async () => {
      const res = await request.get('/api/encounters');
      assert.strictEqual(res.status, 200);
      assert.deepStrictEqual(res.body.encounters, []);
    });

    it('should list encounters after creating one', async () => {
      await request
        .post('/api/encounters')
        .send({ npcTemplateKeys: ['bree_millhaven'] });

      const res = await request.get('/api/encounters');
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.encounters.length, 1);
    });
  });

  describe('GET /api/encounters/:id', () => {
    it('should return encounter state', async () => {
      const createRes = await request
        .post('/api/encounters')
        .send({ npcTemplateKeys: ['bree_millhaven'] });
      const { encounterId } = createRes.body;

      const res = await request.get(`/api/encounters/${encounterId}`);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.encounterId, encounterId);
      assert.strictEqual(res.body.status, 'active');
    });

    it('should return 404 for unknown encounter', async () => {
      const res = await request.get('/api/encounters/nonexistent');
      assert.strictEqual(res.status, 404);
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

      assert.strictEqual(res.status, 200);
      assert.notStrictEqual(res.body.playerMessage, undefined);
      assert.strictEqual(res.body.playerMessage.text, 'Hello Bree!');
      assert.strictEqual(res.body.playerMessage.sender, 'player');
      assert.notStrictEqual(res.body.npcResponses, undefined);
      assert.ok(res.body.npcResponses.length > 0);
      assert.strictEqual(res.body.npcResponses[0].sender, 'bree_millhaven');
      assert.notStrictEqual(res.body.npcResponses[0].text, undefined);
    });

    it('should return 400 for empty text', async () => {
      const createRes = await request
        .post('/api/encounters')
        .send({ npcTemplateKeys: ['bree_millhaven'] });
      const { encounterId } = createRes.body;

      const res = await request
        .post(`/api/encounters/${encounterId}/messages`)
        .send({ text: '' });

      assert.strictEqual(res.status, 400);
    });

    it('should return 404 for unknown encounter', async () => {
      const res = await request
        .post('/api/encounters/nonexistent/messages')
        .send({ text: 'Hello' });

      assert.strictEqual(res.status, 404);
    });
  });

  describe('POST /api/encounters/:id/end', () => {
    it('should end an encounter', async () => {
      const createRes = await request
        .post('/api/encounters')
        .send({ npcTemplateKeys: ['bree_millhaven'] });
      const { encounterId } = createRes.body;

      const res = await request.post(`/api/encounters/${encounterId}/end`);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.status, 'ended');
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

      assert.strictEqual(res.status, 409);
    });
  });
});
