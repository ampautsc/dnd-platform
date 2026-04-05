/**
 * Ambient Reaction Routes Tests
 *
 * Requirements:
 * - POST /api/ambient/utterance — evaluates NPC reactions to player speech
 * - Returns reactions array with npcKey, npcName, reactionStrength, priority
 * - Returns empty reactions for bland utterances
 * - Returns 400 for missing utterance
 * - Returns 400 for missing locationId
 * - Returns 404 for unknown locationId
 * - Works with mock evaluator (no real Groq calls in CI)
 */
import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import supertest from 'supertest';
import { createApp } from '../../src/app.js';
import { createAuthService } from '../../src/services/AuthService.js';
import { createCharacterService } from '../../src/services/CharacterService.js';
import { initDatabase } from '../../src/models/database.js';
import { createAmbientController } from '../../src/services/AmbientController.js';
import { AmbientSceneEngine } from '@dnd-platform/dm';
import { NpcReactionEvaluator } from '@dnd-platform/dm';
import { ReactionPriorityResolver } from '@dnd-platform/dm';
import { getNpc } from '@dnd-platform/content/npcs';
import { getLocation } from '@dnd-platform/content/locations';

const TEST_SECRET = 'test-secret-key-at-least-32-chars-long!!';

/**
 * Mock provider that returns controllable reactions.
 * Always reacts to "barkeep" with strength 4, otherwise silent.
 */
class MockReactionProvider {
  get isReady() { return true; }
  async init() {}
  async dispose() {}
  async evaluateReaction(systemPrompt, utterance) {
    const lowerUtterance = utterance.toLowerCase();
    if (lowerUtterance.includes('barkeep') || lowerUtterance.includes('swindled') || lowerUtterance.includes('fight')) {
      return { shouldReact: true, reactionStrength: 4 };
    }
    return { shouldReact: false, reactionStrength: 1 };
  }
}

function buildTestApp() {
  const db = initDatabase(':memory:');
  const auth = createAuthService({ secret: TEST_SECRET });
  const characters = createCharacterService(db);

  const provider = new MockReactionProvider();
  const evaluator = new NpcReactionEvaluator({ provider });
  const priorityResolver = new ReactionPriorityResolver();
  const ambientEngine = new AmbientSceneEngine({ evaluator, priorityResolver });

  const personalityLookup = (key) => getNpc(key) || null;
  const locationLookup = (id) => getLocation(id) || null;

  const ambientController = createAmbientController(ambientEngine, {
    personalityLookup,
    locationLookup,
  });

  const app = createApp({ authService: auth, characterService: characters, db, ambientController });
  return supertest(app);
}

describe('Ambient Routes', () => {
  let request;

  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'development');
    request = buildTestApp();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  // ── POST /api/ambient/utterance ──

  it('should return reactions for a relevant utterance (201)', async () => {
    const res = await request.post('/api/ambient/utterance').send({
      locationId: 'bottoms_up',
      utterance: 'Barkeep! Pour me your finest ale!',
      speakerName: 'Adventurer',
    });
    assert.strictEqual(res.status, 200);
    assert.notStrictEqual(res.body.reactions, undefined);
    assert.strictEqual(Array.isArray(res.body.reactions), true);
    assert.ok(res.body.reactions.length > 0);
    // Each reaction should have expected shape
    const r = res.body.reactions[0];
    assert.notStrictEqual(r.npcKey, undefined);
    assert.notStrictEqual(r.npcName, undefined);
    assert.ok(r.reactionStrength >= 1);
    assert.notStrictEqual(r.priority, undefined);
  });

  it('should return empty reactions for bland utterance', async () => {
    const res = await request.post('/api/ambient/utterance').send({
      locationId: 'bottoms_up',
      utterance: 'The weather has been surprisingly pleasant this week.',
      speakerName: 'Adventurer',
    });
    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(res.body.reactions, []);
  });

  it('should return 400 for missing utterance', async () => {
    const res = await request.post('/api/ambient/utterance').send({
      locationId: 'bottoms_up',
    });
    assert.strictEqual(res.status, 400);
    assert.notStrictEqual(res.body.error, undefined);
  });

  it('should return 400 for missing locationId', async () => {
    const res = await request.post('/api/ambient/utterance').send({
      utterance: 'Hello there!',
    });
    assert.strictEqual(res.status, 400);
    assert.notStrictEqual(res.body.error, undefined);
  });

  it('should return 404 for unknown locationId', async () => {
    const res = await request.post('/api/ambient/utterance').send({
      locationId: 'nonexistent_place',
      utterance: 'Hello there!',
    });
    assert.strictEqual(res.status, 404);
    assert.notStrictEqual(res.body.error, undefined);
  });

  it('should include npcName on all reactions', async () => {
    const res = await request.post('/api/ambient/utterance').send({
      locationId: 'bottoms_up',
      utterance: 'Someone just swindled me out of fifty gold!',
      speakerName: 'Victim',
    });
    assert.strictEqual(res.status, 200);
    for (const r of res.body.reactions) {
      assert.ok(r.npcName);
      assert.strictEqual(typeof r.npcName, 'string');
    }
  });

  it('should cap reactions to max 3 NPCs', async () => {
    const res = await request.post('/api/ambient/utterance').send({
      locationId: 'bottoms_up',
      utterance: 'There is a fight breaking out! Everyone look!',
      speakerName: 'Panicked patron',
    });
    assert.strictEqual(res.status, 200);
    // Priority resolver caps at 3
    assert.ok(res.body.reactions.length <= 3);
  });

  it('should use default speakerName when not provided', async () => {
    const res = await request.post('/api/ambient/utterance').send({
      locationId: 'bottoms_up',
      utterance: 'Barkeep! Another round!',
    });
    assert.strictEqual(res.status, 200);
    // Should work without speakerName
    assert.notStrictEqual(res.body.reactions, undefined);
  });
});
