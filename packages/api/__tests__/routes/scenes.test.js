/**
 * Scene Routes Tests
 *
 * Requirements:
 * - POST /api/scenes — creates scene, returns 201
 * - POST /api/scenes — returns 400 for missing participants
 * - POST /api/scenes/:id/start — rolls initiative, returns scene with order
 * - GET /api/scenes/:id — returns scene state
 * - GET /api/scenes/:id — returns 404 for unknown scene
 * - POST /api/scenes/:id/action — submits action, auto-resolves NPC turns
 * - POST /api/scenes/:id/action — returns 409 for wrong participant's turn
 * - POST /api/scenes/:id/end — ends scene
 * - GET /api/scenes — lists scenes
 * - Scene routes require auth (dev bypass auto-injects dev user)
 */
import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import supertest from 'supertest';
import { createApp } from '../../src/app.js';
import { createAuthService } from '../../src/services/AuthService.js';
import { createCharacterService } from '../../src/services/CharacterService.js';
import { createSceneController } from '../../src/services/SceneController.js';
import { initDatabase } from '../../src/models/database.js';
import { createDmEngine } from '@dnd-platform/dm';
import { getNpc } from '@dnd-platform/content/npcs';
import { getLocation } from '@dnd-platform/content/locations';

const TEST_SECRET = 'test-secret-key-at-least-32-chars-long!!';

function makeParticipants() {
  return [
    { id: 'player_1', name: 'Thorn', chaMod: 100, isPlayer: true, templateKey: null },
    { id: 'npc_mira', name: 'Mira', chaMod: 2, isPlayer: false, templateKey: 'mira_barrelbottom' },
  ];
}

describe('Scene Routes', () => {
  let request;

  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'development');

    const db = initDatabase(':memory:');
    const auth = createAuthService({ secret: TEST_SECRET });
    const characters = createCharacterService(db);

    const dmEngine = createDmEngine({
      personalityLookup: (key) => getNpc(key) || null,
      locationLookup: (id) => getLocation(id) || null,
    });

    const sceneController = createSceneController(dmEngine.sceneEngine, {
      locationLookup: (id) => getLocation(id) || null,
      personalityLookup: (key) => getNpc(key) || null,
    });
    const app = createApp({ authService: auth, characterService: characters, db, sceneController });
    request = supertest(app);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  // ── POST /api/scenes ──────────────────────────────────────────

  it('should create a scene (201)', async () => {
    const res = await request.post('/api/scenes').send({
      participants: makeParticipants(),
      worldContext: { location: 'Bottoms Up Tavern', timeOfDay: 'evening' },
    });
    assert.strictEqual(res.status, 201);
    assert.match(res.body.id, /^scene_/);
    assert.strictEqual(res.body.status, 'pending');
    assert.strictEqual(res.body.participants.length, 2);
  });

  it('should return 400 for empty participants', async () => {
    const res = await request.post('/api/scenes').send({ participants: [] });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.code, 'INVALID_INPUT');
  });

  it('should return 400 for missing participants', async () => {
    const res = await request.post('/api/scenes').send({});
    assert.strictEqual(res.status, 400);
  });

  // ── POST /api/scenes/:id/start ────────────────────────────────

  it('should start scene and roll initiative', async () => {
    const create = await request.post('/api/scenes').send({ participants: makeParticipants() });
    const sceneId = create.body.id;

    const res = await request.post(`/api/scenes/${sceneId}/start`);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.status, 'active');
    assert.strictEqual(res.body.round, 1);
    assert.strictEqual(res.body.initiativeOrder.length, 2);
    assert.strictEqual(Object.keys(res.body.initiativeRolls).length, 2);
    // Should include openingActions (may be empty if player goes first)
    assert.notStrictEqual(res.body.openingActions, undefined);
    assert.strictEqual(Array.isArray(res.body.openingActions), true);
  });

  it('should return 404 for starting unknown scene', async () => {
    const res = await request.post('/api/scenes/scene_unknown/start');
    assert.strictEqual(res.status, 404);
  });

  // ── GET /api/scenes/:id ───────────────────────────────────────

  it('should get scene state', async () => {
    const create = await request.post('/api/scenes').send({ participants: makeParticipants() });
    const res = await request.get(`/api/scenes/${create.body.id}`);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.id, create.body.id);
  });

  it('should return 404 for unknown scene', async () => {
    const res = await request.get('/api/scenes/scene_nope');
    assert.strictEqual(res.status, 404);
  });

  // ── POST /api/scenes/:id/action ───────────────────────────────

  it('should submit action and auto-resolve NPC turns', async () => {
    const create = await request.post('/api/scenes').send({ participants: makeParticipants() });
    await request.post(`/api/scenes/${create.body.id}/start`);

    const res = await request.post(`/api/scenes/${create.body.id}/action`).send({
      participantId: 'player_1',
      type: 'speech',
      content: 'Hello Mira!',
    });

    assert.strictEqual(res.status, 200);
    assert.ok(res.body.sceneState.transcript.length >= 2); // player + NPC
    assert.ok(res.body.npcActions.length >= 1);
  });

  it('should return 409 for wrong participant turn', async () => {
    const create = await request.post('/api/scenes').send({ participants: makeParticipants() });
    await request.post(`/api/scenes/${create.body.id}/start`);

    // The player has chaMod 100 so they go first; trying as NPC should fail
    const res = await request.post(`/api/scenes/${create.body.id}/action`).send({
      participantId: 'npc_mira',
      type: 'speech',
      content: 'Not my turn!',
    });
    assert.strictEqual(res.status, 409);
    assert.strictEqual(res.body.code, 'NOT_YOUR_TURN');
  });

  // ── POST /api/scenes/:id/end ─────────────────────────────────

  it('should end scene', async () => {
    const create = await request.post('/api/scenes').send({ participants: makeParticipants() });
    await request.post(`/api/scenes/${create.body.id}/start`);

    const res = await request.post(`/api/scenes/${create.body.id}/end`).send({ reason: 'dm_ended' });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.status, 'ended');
    assert.strictEqual(res.body.endReason, 'dm_ended');
  });

  // ── GET /api/scenes ───────────────────────────────────────────

  it('should list scenes', async () => {
    await request.post('/api/scenes').send({ participants: makeParticipants() });
    await request.post('/api/scenes').send({ participants: makeParticipants() });

    const res = await request.get('/api/scenes');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.scenes.length, 2);
  });

  // ── POST /api/scenes/at-location ──────────────────────────────

  describe('POST /api/scenes/at-location', () => {
    it('should create and start a scene from a location', async () => {
      const res = await request.post('/api/scenes/at-location').send({
        locationId: 'bottoms_up',
      });
      assert.strictEqual(res.status, 201);
      assert.match(res.body.id, /^scene_/);
      assert.strictEqual(res.body.status, 'active');
      assert.strictEqual(res.body.round, 1);
      assert.notStrictEqual(res.body.initiativeOrder, undefined);
      assert.ok(res.body.initiativeOrder.length >= 2); // player + at least 1 NPC
      assert.strictEqual(res.body.participants.some(p => p.isPlayer), true);
      // Should include openingActions for NPCs that went before the player
      assert.notStrictEqual(res.body.openingActions, undefined);
      assert.strictEqual(Array.isArray(res.body.openingActions), true);
    });

    it('should include Bottoms Up regulars as participants', async () => {
      const res = await request.post('/api/scenes/at-location').send({
        locationId: 'bottoms_up',
      });
      const location = getLocation('bottoms_up');
      const npcParticipants = res.body.participants.filter(p => !p.isPlayer);
      // Should have at least some of the regulars (some may not have NPC data)
      assert.ok(npcParticipants.length >= 1);
      // Each NPC participant should have a templateKey from the regulars list
      for (const p of npcParticipants) {
        assert.ok(location.regulars.includes(p.templateKey));
      }
    });

    it('should include worldContext from the location', async () => {
      const res = await request.post('/api/scenes/at-location').send({
        locationId: 'bottoms_up',
      });
      assert.notStrictEqual(res.body.worldContext, undefined);
      assert.strictEqual(res.body.worldContext.locationId, 'bottoms_up');
      assert.strictEqual(res.body.worldContext.locationName, 'Bottoms Up');
    });

    it('should return 404 for unknown location', async () => {
      const res = await request.post('/api/scenes/at-location').send({
        locationId: 'nonexistent_place',
      });
      assert.strictEqual(res.status, 404);
    });

    it('should return 400 when locationId is missing', async () => {
      const res = await request.post('/api/scenes/at-location').send({});
      assert.strictEqual(res.status, 400);
    });

    it('should include player in the scene', async () => {
      const res = await request.post('/api/scenes/at-location').send({
        locationId: 'bottoms_up',
        playerName: 'Thorn',
      });
      const player = res.body.participants.find(p => p.isPlayer);
      assert.notStrictEqual(player, undefined);
      assert.strictEqual(player.name, 'Thorn');
    });

    it('should return a non-empty transcript containing a DM opening narration', async () => {
      const res = await request.post('/api/scenes/at-location').send({
        locationId: 'bottoms_up',
        playerName: 'Thorn',
      });
      assert.strictEqual(res.status, 201);
      assert.strictEqual(Array.isArray(res.body.transcript), true);
      assert.ok(res.body.transcript.length >= 1);
      const openingEntry = res.body.transcript.find(
        e => e.participantId === 'dm' && e.type === 'narration',
      );
      assert.notStrictEqual(openingEntry, undefined);
      assert.strictEqual(typeof openingEntry.content, 'string');
      assert.ok(openingEntry.content.length > 0);
    });
  });
});
