import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SceneEngine } from '../../src/services/SceneEngine.js';
import { SceneNarrator } from '../../src/services/SceneNarrator.js';
import { MockProvider } from '../../src/llm/MockProvider.js';
import { CharacterContextBuilder } from '../../src/npc/CharacterContextBuilder.js';
import { EncounterMemoryService } from '../../src/npc/EncounterMemoryService.js';
import { InfoExtractionService } from '../../src/npc/InfoExtractionService.js';
import { CharacterResponseService } from '../../src/npc/CharacterResponseService.js';
import { PersonalityEvolutionService } from '../../src/npc/PersonalityEvolutionService.js';
import { NpcRuntimeContext } from '../../src/npc/NpcRuntimeContext.js';
import { RelationshipRepository } from '../../src/services/RelationshipRepository.js';

/**
 * SceneEngine Requirements:
 *
 * 1. createScene — validates, stores pending SceneState
 * 2. startScene — rolls initiative, sets active, sets first turn
 * 3. getScene — returns current state
 * 4. submitAction — records player action, auto-resolves NPC turns
 * 5. endScene — ends with reason
 * 6. NPC turns call responseService with correct prompt context
 * 7. Scene ends when round cap reached
 * 8. NPCs can observe/pass (no speech)
 * 9. Transcript preserves full history
 * 10. NPCs see no distinction between player and NPC in prompts
 */

function makePersonality(key, name, cha = 14) {
  return {
    templateKey: key,
    name,
    race: 'Human',
    npcType: 'friendly',
    age: 30,
    personality: {
      voice: 'calm',
      alignment: 'neutral',
      disposition: 'friendly',
      backstory: `${name} is a local.`,
      motivations: ['Survive'],
      fears: ['Darkness'],
      mannerisms: ['Nods often'],
      speechPatterns: ['Short sentences'],
    },
    stats: { intelligence: 10, wisdom: 12, charisma: cha },
    consciousnessContext: {
      innerMonologue: 'Hmm.',
      currentPreoccupation: 'Nothing special.',
      emotionalBaseline: 'content',
      socialMask: 'pleasant',
      consciousWant: 'Peace',
      unconsciousNeed: 'Purpose',
    },
    knowledge: { secretsHeld: [] },
    fallbackLines: {
      player_addressed: ['Hmm, interesting.'],
      idle: ['...'],
    },
  };
}

function makeDeps() {
  const provider = new MockProvider();
  const contextBuilder = new CharacterContextBuilder();
  const encounterMemory = new EncounterMemoryService();
  const infoExtraction = new InfoExtractionService({ provider });
  const responseService = new CharacterResponseService({ provider, contextBuilder });
  const evolutionService = new PersonalityEvolutionService();
  const runtimeContext = new NpcRuntimeContext();

  const personalities = {
    mira: makePersonality('mira', 'Mira', 16),
    lell: makePersonality('lell', 'Lell', 14),
  };

  const personalityLookup = (key) => personalities[key] || null;

  const sceneNarrator = new SceneNarrator({ responseService, provider });

  return {
    encounterMemory,
    infoExtraction,
    responseService,
    personalityLookup,
    evolutionService,
    runtimeContext,
    provider,
    personalities,
    sceneNarrator,
  };
}

describe('SceneEngine', () => {
  let engine;
  let deps;

  beforeEach(() => {
    deps = makeDeps();
    engine = new SceneEngine({
      encounterMemory: deps.encounterMemory,
      responseService: deps.responseService,
      personalityLookup: deps.personalityLookup,
      runtimeContext: deps.runtimeContext,
      evolutionService: deps.evolutionService,
      sceneNarrator: deps.sceneNarrator,
    });
  });

  // ── createScene ────────────────────────────────────────────────

  describe('createScene', () => {
    it('should create a scene with pending status', () => {
      const state = engine.createScene({
        participants: [
          { id: 'npc_mira', name: 'Mira', chaMod: 3, isPlayer: false, templateKey: 'mira' },
          { id: 'player_1', name: 'Thorn', chaMod: 1, isPlayer: true, templateKey: null },
        ],
        worldContext: { location: 'Tavern', timeOfDay: 'evening', tone: 'casual' },
      });

      expect(state.status).toBe('pending');
      expect(state.id).toMatch(/^scene_/);
      expect(state.participantCount).toBe(2);
      expect(state.worldContext.location).toBe('Tavern');
    });

    it('should throw INVALID_INPUT if participants is empty', () => {
      expect(() => engine.createScene({ participants: [] }))
        .toThrow();
    });

    it('should throw INVALID_INPUT if no participants array', () => {
      expect(() => engine.createScene({}))
        .toThrow();
    });
  });

  // ── startScene ────────────────────────────────────────────────

  describe('startScene', () => {
    it('should roll initiative and set status to active', () => {
      const scene = engine.createScene({
        participants: [
          { id: 'npc_mira', name: 'Mira', chaMod: 3, isPlayer: false, templateKey: 'mira' },
          { id: 'player_1', name: 'Thorn', chaMod: 1, isPlayer: true, templateKey: null },
        ],
      });

      const started = engine.startScene(scene.id);
      expect(started.status).toBe('active');
      expect(started.round).toBe(1);
      expect(started.initiativeOrder).toHaveLength(2);
      expect(started.initiativeRolls.size).toBe(2);
    });

    it('should throw SCENE_NOT_FOUND for unknown id', () => {
      expect(() => engine.startScene('scene_unknown'))
        .toThrow();
    });
  });

  // ── getScene ──────────────────────────────────────────────────

  describe('getScene', () => {
    it('should return current state', () => {
      const scene = engine.createScene({
        participants: [
          { id: 'npc_mira', name: 'Mira', chaMod: 3, isPlayer: false, templateKey: 'mira' },
          { id: 'player_1', name: 'Thorn', chaMod: 1, isPlayer: true, templateKey: null },
        ],
      });
      const fetched = engine.getScene(scene.id);
      expect(fetched.id).toBe(scene.id);
    });

    it('should throw SCENE_NOT_FOUND for unknown id', () => {
      expect(() => engine.getScene('scene_unknown'))
        .toThrow();
    });
  });

  // ── submitAction ──────────────────────────────────────────────

  describe('submitAction', () => {
    let sceneId;

    beforeEach(() => {
      // Create and start scene where player goes first (fixed dice)
      const scene = engine.createScene({
        participants: [
          { id: 'player_1', name: 'Thorn', chaMod: 100, isPlayer: true, templateKey: null },
          { id: 'npc_mira', name: 'Mira', chaMod: 2, isPlayer: false, templateKey: 'mira' },
          { id: 'npc_lell', name: 'Lell', chaMod: 1, isPlayer: false, templateKey: 'lell' },
        ],
      });
      engine.startScene(scene.id);
      sceneId = scene.id;
    });

    it('should record player action in transcript', async () => {
      const result = await engine.submitAction(sceneId, 'player_1', {
        type: 'speech',
        content: 'Hello everyone!',
      });

      // Player action should be in transcript
      const playerEntry = result.sceneState.transcript.find(
        t => t.participantId === 'player_1'
      );
      expect(playerEntry).toBeDefined();
      expect(playerEntry.content).toBe('Hello everyone!');
      expect(playerEntry.type).toBe('speech');
    });

    it('should auto-resolve NPC turns after player action', async () => {
      const result = await engine.submitAction(sceneId, 'player_1', {
        type: 'speech',
        content: 'Hello everyone!',
      });

      // NPC actions should be generated
      expect(result.npcActions.length).toBeGreaterThanOrEqual(1);

      // Transcript should have entries for NPCs
      const npcEntries = result.sceneState.transcript.filter(
        t => !t.participantId.startsWith('player')
      );
      expect(npcEntries.length).toBeGreaterThanOrEqual(1);
    });

    it('should reject action from wrong participant', async () => {
      await expect(
        engine.submitAction(sceneId, 'npc_mira', { type: 'speech', content: 'test' })
      ).rejects.toThrow();
    });

    it('should reject action for ended scene', async () => {
      engine.endScene(sceneId, 'dm_ended');
      await expect(
        engine.submitAction(sceneId, 'player_1', { type: 'speech', content: 'test' })
      ).rejects.toThrow();
    });

    it('should advance through full round of NPC turns', async () => {
      const result = await engine.submitAction(sceneId, 'player_1', {
        type: 'speech',
        content: 'I look around the room cautiously.',
      });

      // Should have resolved both NPCs
      expect(result.npcActions).toHaveLength(2);

      // After all NPCs go, it should be player's turn again
      expect(result.sceneState.isPlayerTurn).toBe(true);
    });

    it('should increment round when turn order cycles', async () => {
      // First round
      const r1 = await engine.submitAction(sceneId, 'player_1', {
        type: 'speech', content: 'Round 1.',
      });
      expect(r1.sceneState.round).toBe(2);

      // Second round
      const r2 = await engine.submitAction(sceneId, 'player_1', {
        type: 'speech', content: 'Round 2.',
      });
      expect(r2.sceneState.round).toBe(3);
    });
  });

  // ── endScene ──────────────────────────────────────────────────

  describe('endScene', () => {
    it('should set status to ended with reason', () => {
      const scene = engine.createScene({
        participants: [
          { id: 'player_1', name: 'Thorn', chaMod: 1, isPlayer: true, templateKey: null },
          { id: 'npc_mira', name: 'Mira', chaMod: 2, isPlayer: false, templateKey: 'mira' },
        ],
      });
      engine.startScene(scene.id);

      const ended = engine.endScene(scene.id, 'dm_ended');
      expect(ended.status).toBe('ended');
      expect(ended.endReason).toBe('dm_ended');
    });
  });

  // ── Round cap ─────────────────────────────────────────────────

  describe('round cap', () => {
    it('should end scene when round cap is reached', async () => {
      const scene = engine.createScene({
        participants: [
          { id: 'player_1', name: 'Thorn', chaMod: 100, isPlayer: true, templateKey: null },
          { id: 'npc_mira', name: 'Mira', chaMod: 2, isPlayer: false, templateKey: 'mira' },
        ],
        maxRounds: 2,
      });
      engine.startScene(scene.id);

      // Round 1 → advances to round 2
      await engine.submitAction(scene.id, 'player_1', { type: 'speech', content: 'R1' });

      // Round 2 → should trigger cap
      const result = await engine.submitAction(scene.id, 'player_1', { type: 'speech', content: 'R2' });
      expect(result.sceneState.status).toBe('ended');
      expect(result.sceneState.endReason).toBe('round_cap');
    });
  });

  // ── listScenes ────────────────────────────────────────────────

  describe('listScenes', () => {
    it('should list all scenes', () => {
      engine.createScene({
        participants: [
          { id: 'player_1', name: 'Thorn', chaMod: 1, isPlayer: true, templateKey: null },
        ],
      });
      engine.createScene({
        participants: [
          { id: 'player_2', name: 'Rune', chaMod: 0, isPlayer: true, templateKey: null },
        ],
      });
      const list = engine.listScenes();
      expect(list).toHaveLength(2);
      expect(list[0]).toHaveProperty('sceneId');
      expect(list[0]).toHaveProperty('status');
      expect(list[0]).toHaveProperty('participantCount');
    });
  });

  // ── advanceNpcTurns ───────────────────────────────────────────

  describe('advanceNpcTurns', () => {
    it('should auto-resolve NPC turns until it is the player turn', async () => {
      // NPC goes first (high chaMod), player goes second
      const scene = engine.createScene({
        participants: [
          { id: 'player_1', name: 'Thorn', chaMod: -100, isPlayer: true, templateKey: null },
          { id: 'npc_mira', name: 'Mira', chaMod: 100, isPlayer: false, templateKey: 'mira' },
        ],
      });
      engine.startScene(scene.id);

      // Mira should go first
      const started = engine.getScene(scene.id);
      expect(started.pendingAction).toBe('npc_mira');

      // Advance NPC turns
      const result = await engine.advanceNpcTurns(scene.id);
      expect(result.sceneState.pendingAction).toBe('player_1');
      expect(result.npcActions.length).toBeGreaterThanOrEqual(1);
      expect(result.sceneState.transcript.length).toBeGreaterThanOrEqual(1);
    });

    it('should resolve multiple NPC turns before the player', async () => {
      // Both NPCs go before player
      const scene = engine.createScene({
        participants: [
          { id: 'player_1', name: 'Thorn', chaMod: -100, isPlayer: true, templateKey: null },
          { id: 'npc_mira', name: 'Mira', chaMod: 100, isPlayer: false, templateKey: 'mira' },
          { id: 'npc_lell', name: 'Lell', chaMod: 50, isPlayer: false, templateKey: 'lell' },
        ],
      });
      engine.startScene(scene.id);

      const result = await engine.advanceNpcTurns(scene.id);
      expect(result.npcActions).toHaveLength(2);
      expect(result.sceneState.pendingAction).toBe('player_1');
    });

    it('should be a no-op when it is already the player turn (except scene opening)', async () => {
      const scene = engine.createScene({
        participants: [
          { id: 'player_1', name: 'Thorn', chaMod: 100, isPlayer: true, templateKey: null },
          { id: 'npc_mira', name: 'Mira', chaMod: -100, isPlayer: false, templateKey: 'mira' },
        ],
      });
      engine.startScene(scene.id);

      const result = await engine.advanceNpcTurns(scene.id);
      expect(result.npcActions).toHaveLength(0);
      // Scene opening narration is added even when no NPCs act
      const dmEntries = result.sceneState.transcript.filter(e => e.participantId === 'dm');
      expect(dmEntries.length).toBeGreaterThanOrEqual(1);
      expect(result.sceneState.pendingAction).toBe('player_1');
    });
  });

  // ── Dual Transcripts ──────────────────────────────────────────

  describe('dual transcripts', () => {
    it('should store raw NPC output in privateTranscript', async () => {
      const scene = engine.createScene({
        participants: [
          { id: 'player_1', name: 'Thorn', chaMod: 100, isPlayer: true, templateKey: null },
          { id: 'npc_mira', name: 'Mira', chaMod: 2, isPlayer: false, templateKey: 'mira' },
        ],
      });
      engine.startScene(scene.id);

      const result = await engine.submitAction(scene.id, 'player_1', { type: 'speech', content: 'Hello!' });
      // Private transcript should contain raw NPC output
      expect(result.sceneState.privateTranscript.length).toBeGreaterThanOrEqual(1);
      const npcEntry = result.sceneState.privateTranscript.find(e => e.participantId === 'npc_mira');
      expect(npcEntry).toBeDefined();
    });

    it('should store player actions in both transcripts', async () => {
      const scene = engine.createScene({
        participants: [
          { id: 'player_1', name: 'Thorn', chaMod: 100, isPlayer: true, templateKey: null },
          { id: 'npc_mira', name: 'Mira', chaMod: 2, isPlayer: false, templateKey: 'mira' },
        ],
      });
      engine.startScene(scene.id);

      const result = await engine.submitAction(scene.id, 'player_1', { type: 'speech', content: 'Hello!' });
      // Player action should be in both transcripts
      const playerInPrivate = result.sceneState.privateTranscript.find(e => e.participantId === 'player_1');
      const playerInPublic = result.sceneState.transcript.find(e => e.participantId === 'player_1');
      expect(playerInPrivate).toBeDefined();
      expect(playerInPublic).toBeDefined();
    });

    it('should include DM narration in public transcript for NPC turns', async () => {
      const scene = engine.createScene({
        participants: [
          { id: 'player_1', name: 'Thorn', chaMod: 100, isPlayer: true, templateKey: null },
          { id: 'npc_mira', name: 'Mira', chaMod: 2, isPlayer: false, templateKey: 'mira' },
        ],
      });
      engine.startScene(scene.id);

      const result = await engine.submitAction(scene.id, 'player_1', { type: 'speech', content: 'Hello!' });
      // Public transcript should have a DM narration entry (not raw NPC output)
      const dmEntry = result.sceneState.transcript.find(e => e.participantId === 'dm');
      expect(dmEntry).toBeDefined();
      expect(dmEntry.type).toBe('narration');
    });
  });

  // ── Message Isolation ─────────────────────────────────────────

  describe('message isolation', () => {
    it('should not leak inner monologue between NPCs via _buildSceneMessages', async () => {
      // Set mock to return inner thoughts for first NPC
      deps.provider.setMockResponse('[OBSERVE] *watches carefully, thinking about secrets*');

      const scene = engine.createScene({
        participants: [
          { id: 'player_1', name: 'Thorn', chaMod: -100, isPlayer: true, templateKey: null },
          { id: 'npc_mira', name: 'Mira', chaMod: 100, isPlayer: false, templateKey: 'mira' },
          { id: 'npc_lell', name: 'Lell', chaMod: 50, isPlayer: false, templateKey: 'lell' },
        ],
      });
      engine.startScene(scene.id);

      // Advance NPC turns — Mira goes, then Lell
      await engine.advanceNpcTurns(scene.id);

      // Check what was sent to the LLM for Lell (second NPC)
      // The second call should not contain Mira's inner thoughts as full text
      const lellCall = deps.provider.getHistory().find(h =>
        h.npcId === 'lell' && h.messages?.some(m => m.role === 'user')
      );
      if (lellCall) {
        const userMessages = lellCall.messages.filter(m => m.role === 'user');
        // Messages about Mira should only contain observable content, not full inner monologue
        for (const msg of userMessages) {
          if (msg.content.includes('Mira')) {
            // Should see the action type label but not raw inner narrative dump
            expect(msg.content).not.toContain('thinking about secrets');
          }
        }
      }
    });
  });

  // ── LEAVE action ──────────────────────────────────────────────

  describe('LEAVE action', () => {
    it('should remove NPC from participants when they leave', async () => {
      deps.provider.setMockResponse('[LEAVE] *finishes drink and heads out*');

      const scene = engine.createScene({
        participants: [
          { id: 'player_1', name: 'Thorn', chaMod: 100, isPlayer: true, templateKey: null },
          { id: 'npc_mira', name: 'Mira', chaMod: 2, isPlayer: false, templateKey: 'mira' },
        ],
      });
      engine.startScene(scene.id);

      const result = await engine.submitAction(scene.id, 'player_1', { type: 'speech', content: 'Hello!' });
      // Mira should have been removed from participants after leaving
      expect(result.sceneState.allParticipants.find(p => p.id === 'npc_mira')).toBeUndefined();
    });

    it('should handle all NPCs leaving (scene should end or player is alone)', async () => {
      deps.provider.setMockResponse('[LEAVE]');

      const scene = engine.createScene({
        participants: [
          { id: 'player_1', name: 'Thorn', chaMod: 100, isPlayer: true, templateKey: null },
          { id: 'npc_mira', name: 'Mira', chaMod: 2, isPlayer: false, templateKey: 'mira' },
        ],
      });
      engine.startScene(scene.id);

      const result = await engine.submitAction(scene.id, 'player_1', { type: 'speech', content: 'Bye!' });
      // Scene should end when no NPCs remain
      expect(result.sceneState.status).toBe('ended');
      expect(result.sceneState.endReason).toBe('all_left');
    });
  });

  // ── Player-facing name resolution ─────────────────────────────

  describe('NPC prompt context enrichment', () => {
    it('should pass location data to NPC system prompt when locationLookup is available', async () => {
      let capturedSystemPrompt = null;
      const provider = new MockProvider();
      provider.generateResponse = async (opts) => {
        // Capture the system prompt from the scene prompt build
        if (opts.systemPrompt && opts.systemPrompt.includes('surrender this session')) {
          capturedSystemPrompt = opts.systemPrompt;
        }
        return { text: '[SPEAK] Hello!' };
      };
      const contextBuilder = new CharacterContextBuilder();
      const responseService = new CharacterResponseService({ provider, contextBuilder });
      const encounterMemory = new EncounterMemoryService();

      const locationData = {
        id: 'bottoms_up',
        name: "The Bottom's Up",
        description: 'A cozy halfling-run tavern.',
        atmosphere: {
          lighting: 'Warm lantern glow',
          sounds: ['Murmured conversation', 'Clinking glasses'],
          smells: ['Fresh bread', 'Pipe smoke'],
        },
        layout: [
          { name: 'The Bar', description: 'A sturdy oak bar with stools' },
        ],
      };
      const locationLookup = (id) => id === 'bottoms_up' ? locationData : null;

      const personalities = { mira: makePersonality('mira', 'Mira', 16) };
      const personalityLookup = (key) => personalities[key] || null;
      const runtimeContext = new NpcRuntimeContext();
      runtimeContext.setLocation('mira', { locationId: 'bottoms_up', areaWithin: 'The Bar' });

      const locEngine = new SceneEngine({
        encounterMemory, responseService, personalityLookup,
        runtimeContext, locationLookup,
      });

      const scene = locEngine.createScene({
        participants: [
          { id: 'player_1', name: 'Thorn', chaMod: 100, isPlayer: true },
          { id: 'npc_mira', name: 'Mira', chaMod: 2, isPlayer: false, templateKey: 'mira' },
        ],
        worldContext: { locationId: 'bottoms_up', locationName: "The Bottom's Up" },
      });
      locEngine.startScene(scene.id);

      await locEngine.submitAction(scene.id, 'player_1', { type: 'speech', content: 'Hello!' });

      expect(capturedSystemPrompt).not.toBeNull();
      expect(capturedSystemPrompt).toContain("The Bottom's Up");
      expect(capturedSystemPrompt).toContain('Warm lantern glow');
      expect(capturedSystemPrompt).toContain('Clinking glasses');
      expect(capturedSystemPrompt).toContain('Fresh bread');
    });

    it('should include time of day in NPC prompt when worldContext has timeOfDay', async () => {
      let capturedSystemPrompt = null;
      const provider = new MockProvider();
      provider.generateResponse = async (opts) => {
        if (opts.systemPrompt && opts.systemPrompt.includes('surrender this session')) {
          capturedSystemPrompt = opts.systemPrompt;
        }
        return { text: '[SPEAK] Hello!' };
      };
      const contextBuilder = new CharacterContextBuilder();
      const responseService = new CharacterResponseService({ provider, contextBuilder });
      const encounterMemory = new EncounterMemoryService();

      const personalities = { mira: makePersonality('mira', 'Mira', 16) };
      const personalityLookup = (key) => personalities[key] || null;
      const runtimeContext = new NpcRuntimeContext();

      const locEngine = new SceneEngine({
        encounterMemory, responseService, personalityLookup, runtimeContext,
      });

      const scene = locEngine.createScene({
        participants: [
          { id: 'player_1', name: 'Thorn', chaMod: 100, isPlayer: true },
          { id: 'npc_mira', name: 'Mira', chaMod: 2, isPlayer: false, templateKey: 'mira' },
        ],
        worldContext: { locationId: 'bottoms_up', timeOfDay: 'late evening' },
      });
      locEngine.startScene(scene.id);

      await locEngine.submitAction(scene.id, 'player_1', { type: 'speech', content: 'Hello!' });

      expect(capturedSystemPrompt).not.toBeNull();
      expect(capturedSystemPrompt).toContain('late evening');
    });

    it('should include scene premise in first NPC message when provided', async () => {
      let capturedMessages = null;
      const provider = new MockProvider();
      provider.generateResponse = async (opts) => {
        if (opts.messages && opts.systemPrompt?.includes('surrender this session')) {
          capturedMessages = opts.messages;
        }
        return { text: '[SPEAK] Hello!' };
      };
      const contextBuilder = new CharacterContextBuilder();
      const responseService = new CharacterResponseService({ provider, contextBuilder });
      const encounterMemory = new EncounterMemoryService();

      const personalities = { mira: makePersonality('mira', 'Mira', 16) };
      const personalityLookup = (key) => personalities[key] || null;
      const runtimeContext = new NpcRuntimeContext();

      const locEngine = new SceneEngine({
        encounterMemory, responseService, personalityLookup, runtimeContext,
      });

      const scene = locEngine.createScene({
        participants: [
          { id: 'player_1', name: 'Thorn', chaMod: -100, isPlayer: true },
          { id: 'npc_mira', name: 'Mira', chaMod: 100, isPlayer: false, templateKey: 'mira' },
        ],
        worldContext: { scenePremise: 'A tall dragonborn pushes open the tavern door, bringing a gust of cold air with them.' },
      });
      locEngine.startScene(scene.id);

      // NPC goes first — they should see the scene premise
      await locEngine.advanceNpcTurns(scene.id);

      expect(capturedMessages).not.toBeNull();
      const firstMsg = capturedMessages[0];
      expect(firstMsg.role).toBe('user');
      expect(firstMsg.content).toContain('dragonborn pushes open the tavern door');
    });
  });

  describe('player-facing name resolution', () => {
    let repoEngine;
    let repo;

    function makePersonalityWithAppearance(key, name, firstImpression) {
      const p = makePersonality(key, name);
      p.appearance = {
        build: 'average',
        firstImpression,
        typicalAttire: 'plain clothes',
      };
      return p;
    }

    beforeEach(() => {
      repo = new RelationshipRepository();
      const personalitiesWithAppearance = {
        mira: makePersonalityWithAppearance('mira', 'Mira', 'a compact halfling standing on a step-stool behind the bar'),
        lell: makePersonalityWithAppearance('lell', 'Lell', 'a lean figure in a patched traveling cloak, lute on their back'),
      };

      repoEngine = new SceneEngine({
        encounterMemory: deps.encounterMemory,
        responseService: deps.responseService,
        personalityLookup: (key) => personalitiesWithAppearance[key] || null,
        runtimeContext: deps.runtimeContext,
        evolutionService: deps.evolutionService,
        sceneNarrator: deps.sceneNarrator,
        relationshipRepo: repo,
      });
    });

    it('should auto-seed display labels for stranger NPCs when scene is created', () => {
      repoEngine.createScene({
        participants: [
          { id: 'player_1', name: 'Thorn', chaMod: 1, isPlayer: true },
          { id: 'npc_mira', name: 'Mira', chaMod: 3, isPlayer: false, templateKey: 'mira' },
        ],
      });

      const rel = repo.getRelationship('player', 'mira');
      expect(rel).not.toBeNull();
      expect(rel.displayLabel).toBe('a compact halfling standing on a step-stool behind the bar');
    });

    it('should promote stranger NPCs to recognized when scene is created', () => {
      repoEngine.createScene({
        participants: [
          { id: 'player_1', name: 'Thorn', chaMod: 1, isPlayer: true },
          { id: 'npc_mira', name: 'Mira', chaMod: 3, isPlayer: false, templateKey: 'mira' },
        ],
      });

      const rel = repo.getRelationship('player', 'mira');
      expect(rel.recognitionTier).toBe('recognized');
    });

    it('should not overwrite existing display labels on repeated scene creation', () => {
      repo.seedRelationship({
        subjectId: 'player',
        targetId: 'mira',
        recognitionTier: 'recognized',
        displayLabel: 'the cheerful barmaid',
      });

      repoEngine.createScene({
        participants: [
          { id: 'player_1', name: 'Thorn', chaMod: 1, isPlayer: true },
          { id: 'npc_mira', name: 'Mira', chaMod: 3, isPlayer: false, templateKey: 'mira' },
        ],
      });

      const rel = repo.getRelationship('player', 'mira');
      expect(rel.displayLabel).toBe('the cheerful barmaid');
    });

    it('should use display labels in npcActions when NPC is a stranger/recognized', async () => {
      const scene = repoEngine.createScene({
        participants: [
          { id: 'player_1', name: 'Thorn', chaMod: 100, isPlayer: true },
          { id: 'npc_mira', name: 'Mira', chaMod: 2, isPlayer: false, templateKey: 'mira' },
        ],
      });
      repoEngine.startScene(scene.id);

      const result = await repoEngine.submitAction(scene.id, 'player_1', {
        type: 'speech', content: 'Hello!',
      });

      const miraAction = result.npcActions.find(a => a.participantId === 'npc_mira');
      expect(miraAction).toBeDefined();
      expect(miraAction.participantName).toBe('a compact halfling standing on a step-stool behind the bar');
      expect(miraAction.participantName).not.toBe('Mira');
    });

    it('should use real names in npcActions when NPC is acquaintance', async () => {
      // Pre-seed as acquaintance — player knows the name
      repo.seedRelationship({
        subjectId: 'player',
        targetId: 'mira',
        recognitionTier: 'acquaintance',
        displayLabel: 'a compact halfling',
      });

      const scene = repoEngine.createScene({
        participants: [
          { id: 'player_1', name: 'Thorn', chaMod: 100, isPlayer: true },
          { id: 'npc_mira', name: 'Mira', chaMod: 2, isPlayer: false, templateKey: 'mira' },
        ],
      });
      repoEngine.startScene(scene.id);

      const result = await repoEngine.submitAction(scene.id, 'player_1', {
        type: 'speech', content: 'Hello!',
      });

      const miraAction = result.npcActions.find(a => a.participantId === 'npc_mira');
      expect(miraAction.participantName).toBe('Mira');
    });

    it('should use display labels in public transcript entries', async () => {
      // Use an engine WITHOUT narrator so NPC actions go directly to public transcript
      const noNarratorEngine = new SceneEngine({
        encounterMemory: deps.encounterMemory,
        responseService: deps.responseService,
        personalityLookup: (key) => {
          const p = makePersonality(key, key === 'mira' ? 'Mira' : 'Lell');
          p.appearance = { firstImpression: 'a stranger in the crowd' };
          return p;
        },
        runtimeContext: deps.runtimeContext,
        evolutionService: deps.evolutionService,
        relationshipRepo: repo,
        // No sceneNarrator — so NPC actions go directly to public transcript
      });

      const scene = noNarratorEngine.createScene({
        participants: [
          { id: 'player_1', name: 'Thorn', chaMod: 100, isPlayer: true },
          { id: 'npc_mira', name: 'Mira', chaMod: 2, isPlayer: false, templateKey: 'mira' },
        ],
      });
      noNarratorEngine.startScene(scene.id);

      const result = await noNarratorEngine.submitAction(scene.id, 'player_1', {
        type: 'speech', content: 'Hello!',
      });

      // Public transcript NPC entry should use display label
      const miraEntry = result.sceneState.transcript.find(e => e.participantId === 'npc_mira');
      expect(miraEntry).toBeDefined();
      expect(miraEntry.participantName).toBe('a stranger in the crowd');
      expect(miraEntry.participantName).not.toBe('Mira');
    });

    it('should keep real names in private transcript entries', async () => {
      const scene = repoEngine.createScene({
        participants: [
          { id: 'player_1', name: 'Thorn', chaMod: 100, isPlayer: true },
          { id: 'npc_mira', name: 'Mira', chaMod: 2, isPlayer: false, templateKey: 'mira' },
        ],
      });
      repoEngine.startScene(scene.id);

      const result = await repoEngine.submitAction(scene.id, 'player_1', {
        type: 'speech', content: 'Hello!',
      });

      // Private transcript should keep real names (for DM/engine use)
      const miraPrivate = result.sceneState.privateTranscript.find(e => e.participantId === 'npc_mira');
      expect(miraPrivate).toBeDefined();
      expect(miraPrivate.participantName).toBe('Mira');
    });

    it('should pass display labels to SceneNarrator in npcActions', async () => {
      const narratorSpy = vi.spyOn(deps.sceneNarrator, 'narrateNpcBatch');

      const scene = repoEngine.createScene({
        participants: [
          { id: 'player_1', name: 'Thorn', chaMod: 100, isPlayer: true },
          { id: 'npc_mira', name: 'Mira', chaMod: 2, isPlayer: false, templateKey: 'mira' },
        ],
      });
      repoEngine.startScene(scene.id);

      await repoEngine.submitAction(scene.id, 'player_1', {
        type: 'speech', content: 'Hello!',
      });

      expect(narratorSpy).toHaveBeenCalled();
      const callArgs = narratorSpy.mock.calls[0][0];
      const miraAction = callArgs.npcActions.find(a => a.participantId === 'npc_mira');
      expect(miraAction.participantName).toBe('a compact halfling standing on a step-stool behind the bar');
    });

    it('should resolve participant names in resolveForPlayer output', () => {
      const scene = repoEngine.createScene({
        participants: [
          { id: 'player_1', name: 'Thorn', chaMod: 1, isPlayer: true },
          { id: 'npc_mira', name: 'Mira', chaMod: 3, isPlayer: false, templateKey: 'mira' },
          { id: 'npc_lell', name: 'Lell', chaMod: 2, isPlayer: false, templateKey: 'lell' },
        ],
      });

      const json = scene.toJSON();
      const resolved = repoEngine.resolveForPlayer(json);

      const mira = resolved.participants.find(p => p.id === 'npc_mira');
      const lell = resolved.participants.find(p => p.id === 'npc_lell');
      const player = resolved.participants.find(p => p.id === 'player_1');

      expect(mira.name).toBe('a compact halfling standing on a step-stool behind the bar');
      expect(lell.name).toBe('a lean figure in a patched traveling cloak, lute on their back');
      expect(player.name).toBe('Thorn'); // Player name unchanged
    });

    it('should resolve names in advanceNpcTurns npcActions', async () => {
      // NPC goes first (high chaMod), player goes second
      const scene = repoEngine.createScene({
        participants: [
          { id: 'player_1', name: 'Thorn', chaMod: -100, isPlayer: true },
          { id: 'npc_mira', name: 'Mira', chaMod: 100, isPlayer: false, templateKey: 'mira' },
        ],
      });
      repoEngine.startScene(scene.id);

      const result = await repoEngine.advanceNpcTurns(scene.id);
      const miraAction = result.npcActions.find(a => a.participantId === 'npc_mira');
      expect(miraAction).toBeDefined();
      expect(miraAction.participantName).toBe('a compact halfling standing on a step-stool behind the bar');
    });

    it('should still work without relationshipRepo (backward compat)', async () => {
      // Engine without repo — should use real names as before
      const scene = engine.createScene({
        participants: [
          { id: 'player_1', name: 'Thorn', chaMod: 100, isPlayer: true },
          { id: 'npc_mira', name: 'Mira', chaMod: 2, isPlayer: false, templateKey: 'mira' },
        ],
      });
      engine.startScene(scene.id);

      const result = await engine.submitAction(scene.id, 'player_1', {
        type: 'speech', content: 'Hello!',
      });

      const miraAction = result.npcActions.find(a => a.participantId === 'npc_mira');
      expect(miraAction.participantName).toBe('Mira');
    });
  });

  // ── NPC inner states passed to narrator ────────────────────────

  describe('NPC inner states for DM consciousness', () => {
    it('should pass NPC inner state data to narrator via narrateNpcBatch', async () => {
      let capturedBatchArgs = null;
      const mockNarrator = {
        narrateNpcBatch: async (args) => {
          capturedBatchArgs = args;
          return { narration: 'She nods.', source: 'llm' };
        },
      };

      // Setup runtime context with mood/activity for mira
      deps.runtimeContext.setMood('mira', 'content but watchful');
      deps.runtimeContext.setActivity('mira', 'Wiping down the bar');

      const innerEngine = new SceneEngine({
        encounterMemory: deps.encounterMemory,
        responseService: deps.responseService,
        personalityLookup: deps.personalityLookup,
        runtimeContext: deps.runtimeContext,
        evolutionService: deps.evolutionService,
        sceneNarrator: mockNarrator,
      });

      // Player goes first (high chaMod), then mira
      const scene = innerEngine.createScene({
        participants: [
          { id: 'player_1', name: 'Kael', chaMod: 100, isPlayer: true },
          { id: 'npc_mira', name: 'Mira', chaMod: 2, isPlayer: false, templateKey: 'mira' },
        ],
      });
      innerEngine.startScene(scene.id);

      await innerEngine.submitAction(scene.id, 'player_1', {
        type: 'speech', content: 'Good evening.',
      });

      // Verify narrator received inner state data
      expect(capturedBatchArgs).toBeDefined();
      expect(capturedBatchArgs.npcInnerStates).toBeDefined();
      expect(capturedBatchArgs.npcInnerStates.length).toBe(1);

      const miraState = capturedBatchArgs.npcInnerStates[0];
      expect(miraState.displayName).toBe('Mira');
      expect(miraState.mood).toBe('content but watchful');
      expect(miraState.currentActivity).toBe('Wiping down the bar');
      expect(miraState.consciousWant).toBe('Peace');
    });

    it('should include secrets from personality data in inner states', async () => {
      let capturedBatchArgs = null;
      const mockNarrator = {
        narrateNpcBatch: async (args) => {
          capturedBatchArgs = args;
          return { narration: 'He shifts.', source: 'llm' };
        },
      };

      // Personality with secrets
      const secretPersonality = makePersonality('spy', 'Marcus', 14);
      secretPersonality.knowledge.secretsHeld = ['Works for the Shadow Guild'];
      const lookup = (key) => {
        if (key === 'spy') return secretPersonality;
        return deps.personalityLookup(key);
      };

      const innerEngine = new SceneEngine({
        encounterMemory: deps.encounterMemory,
        responseService: deps.responseService,
        personalityLookup: lookup,
        runtimeContext: deps.runtimeContext,
        evolutionService: deps.evolutionService,
        sceneNarrator: mockNarrator,
      });

      const scene = innerEngine.createScene({
        participants: [
          { id: 'player_1', name: 'Kael', chaMod: 100, isPlayer: true },
          { id: 'npc_spy', name: 'Marcus', chaMod: 2, isPlayer: false, templateKey: 'spy' },
        ],
      });
      innerEngine.startScene(scene.id);

      await innerEngine.submitAction(scene.id, 'player_1', {
        type: 'speech', content: 'Who are you?',
      });

      expect(capturedBatchArgs.npcInnerStates).toBeDefined();
      const spyState = capturedBatchArgs.npcInnerStates[0];
      expect(spyState.secrets).toContain('Works for the Shadow Guild');
    });

    it('should include gender, race, and appearance data from personality in inner states', async () => {
      let capturedBatchArgs = null;
      const mockNarrator = {
        narrateNpcBatch: async (args) => {
          capturedBatchArgs = args;
          return { narration: 'She nods.', source: 'llm' };
        },
      };

      // Personality with full appearance data
      const miraFull = makePersonality('mira_full', 'Mira', 16);
      miraFull.gender = 'female';
      miraFull.race = 'Halfling';
      miraFull.appearance = {
        build: 'Compact and sturdy, halfling frame',
        hair: 'Curly auburn, pinned back with a wooden clip',
        skin: 'Warm olive complexion',
        eyes: 'Dark brown, quick-moving',
        height: 'Short even for a halfling',
        typicalAttire: 'A practical dress with rolled sleeves',
        distinguishingFeatures: ['Constantly wiping her hands on a worn apron'],
      };
      const lookup = (key) => {
        if (key === 'mira_full') return miraFull;
        return deps.personalityLookup(key);
      };

      const innerEngine = new SceneEngine({
        encounterMemory: deps.encounterMemory,
        responseService: deps.responseService,
        personalityLookup: lookup,
        runtimeContext: deps.runtimeContext,
        evolutionService: deps.evolutionService,
        sceneNarrator: mockNarrator,
      });

      deps.runtimeContext.setMood('mira_full', 'content');
      deps.runtimeContext.setActivity('mira_full', 'Polishing glasses');

      const scene = innerEngine.createScene({
        participants: [
          { id: 'player_1', name: 'Kael', chaMod: 100, isPlayer: true },
          { id: 'npc_mira', name: 'Mira', chaMod: 2, isPlayer: false, templateKey: 'mira_full' },
        ],
      });
      innerEngine.startScene(scene.id);

      await innerEngine.submitAction(scene.id, 'player_1', {
        type: 'speech', content: 'Hello.',
      });

      expect(capturedBatchArgs.npcInnerStates).toBeDefined();
      const miraState = capturedBatchArgs.npcInnerStates[0];
      expect(miraState.gender).toBe('female');
      expect(miraState.race).toBe('Halfling');
      expect(miraState.appearance).toBeDefined();
      expect(miraState.appearance.build).toBe('Compact and sturdy, halfling frame');
      expect(miraState.appearance.hair).toBe('Curly auburn, pinned back with a wooden clip');
      expect(miraState.appearance.typicalAttire).toBe('A practical dress with rolled sleeves');
      expect(miraState.appearance.distinguishingFeatures).toContain('Constantly wiping her hands on a worn apron');
    });
  });

  // ── NPC-to-NPC relationships in inner states ─────────────────

  describe('NPC-to-NPC relationships in inner states', () => {
    it('should include NPC-to-NPC relationships in inner states when relationshipRepo has data', async () => {
      let capturedBatchArgs = null;
      const mockNarrator = {
        narrateNpcBatch: async (args) => {
          capturedBatchArgs = args;
          return { narration: 'They exchange a glance.', source: 'llm' };
        },
        narrateSceneOpening: async () => {
          return { narration: 'The tavern is warm.', source: 'llm' };
        },
      };

      const miraP = makePersonality('mira', 'Mira', 16);
      miraP.gender = 'female';
      miraP.race = 'Halfling';
      miraP.appearance = { firstImpression: 'a compact halfling behind the bar' };
      miraP.consciousnessContext.opinionsAbout = {
        fen_colby: 'Part of the furniture. Mostly harmless. Occasionally useful.',
      };

      const fenP = makePersonality('fen_colby', 'Fen Colby', 10);
      fenP.gender = 'male';
      fenP.race = 'Human';
      fenP.appearance = { firstImpression: 'a quiet man at the bar' };
      fenP.consciousnessContext.opinionsAbout = {
        mira: 'Tolerates me. Kinder than she has to be.',
      };

      const personalityMap = { mira: miraP, fen_colby: fenP };
      const lookup = (key) => personalityMap[key] || null;

      const repo = new RelationshipRepository();
      // Seed NPC-to-NPC relationships
      repo.seedFromPersonality(miraP);
      repo.seedFromPersonality(fenP);
      // Seed player-to-NPC (for display label resolution)
      repo.seedRelationship({
        subjectId: 'player',
        targetId: 'mira',
        recognitionTier: 'recognized',
        displayLabel: 'the halfling behind the bar',
      });
      repo.seedRelationship({
        subjectId: 'player',
        targetId: 'fen_colby',
        recognitionTier: 'recognized',
        displayLabel: 'a quiet man at the bar',
      });

      const innerEngine = new SceneEngine({
        encounterMemory: deps.encounterMemory,
        responseService: deps.responseService,
        personalityLookup: lookup,
        runtimeContext: deps.runtimeContext,
        evolutionService: deps.evolutionService,
        sceneNarrator: mockNarrator,
        relationshipRepo: repo,
      });

      const scene = innerEngine.createScene({
        participants: [
          { id: 'player_1', name: 'Kael', chaMod: 100, isPlayer: true },
          { id: 'npc_mira', name: 'Mira', chaMod: 2, isPlayer: false, templateKey: 'mira' },
          { id: 'npc_fen', name: 'Fen Colby', chaMod: 1, isPlayer: false, templateKey: 'fen_colby' },
        ],
      });
      innerEngine.startScene(scene.id);

      await innerEngine.submitAction(scene.id, 'player_1', {
        type: 'speech', content: 'Hello.',
      });

      expect(capturedBatchArgs.npcInnerStates).toBeDefined();
      expect(capturedBatchArgs.npcInnerStates.length).toBeGreaterThanOrEqual(2);

      const miraState = capturedBatchArgs.npcInnerStates.find(s => s.displayName === 'the halfling behind the bar');
      expect(miraState).toBeDefined();
      expect(miraState.relationships).toBeDefined();
      expect(miraState.relationships.length).toBeGreaterThanOrEqual(1);

      const miraToFen = miraState.relationships.find(r => r.targetDisplayName === 'a quiet man at the bar');
      expect(miraToFen).toBeDefined();
      expect(miraToFen.opinion).toBe('Part of the furniture. Mostly harmless. Occasionally useful.');
      expect(miraToFen.recognitionTier).toBe('familiar');

      const fenState = capturedBatchArgs.npcInnerStates.find(s => s.displayName === 'a quiet man at the bar');
      expect(fenState).toBeDefined();
      expect(fenState.relationships).toBeDefined();
      const fenToMira = fenState.relationships.find(r => r.targetDisplayName === 'the halfling behind the bar');
      expect(fenToMira).toBeDefined();
      expect(fenToMira.opinion).toBe('Tolerates me. Kinder than she has to be.');
    });

    it('should return null relationships when no repo is wired', async () => {
      let capturedBatchArgs = null;
      const mockNarrator = {
        narrateNpcBatch: async (args) => {
          capturedBatchArgs = args;
          return { narration: 'She nods.', source: 'llm' };
        },
      };

      const innerEngine = new SceneEngine({
        encounterMemory: deps.encounterMemory,
        responseService: deps.responseService,
        personalityLookup: deps.personalityLookup,
        runtimeContext: deps.runtimeContext,
        evolutionService: deps.evolutionService,
        sceneNarrator: mockNarrator,
      });

      const scene = innerEngine.createScene({
        participants: [
          { id: 'player_1', name: 'Kael', chaMod: 100, isPlayer: true },
          { id: 'npc_mira', name: 'Mira', chaMod: 2, isPlayer: false, templateKey: 'mira' },
        ],
      });
      innerEngine.startScene(scene.id);

      await innerEngine.submitAction(scene.id, 'player_1', {
        type: 'speech', content: 'Hello.',
      });

      const miraState = capturedBatchArgs.npcInnerStates[0];
      expect(miraState.relationships).toBeNull();
    });
  });

  // ── Player action context passed to narrator ───────────────────

  describe('player action context for narrator', () => {
    it('should pass the player action to narrator via narrateNpcBatch', async () => {
      let capturedBatchArgs = null;
      const mockNarrator = {
        narrateNpcBatch: async (args) => {
          capturedBatchArgs = args;
          return { narration: 'She nods.', source: 'llm' };
        },
      };

      const innerEngine = new SceneEngine({
        encounterMemory: deps.encounterMemory,
        responseService: deps.responseService,
        personalityLookup: deps.personalityLookup,
        runtimeContext: deps.runtimeContext,
        evolutionService: deps.evolutionService,
        sceneNarrator: mockNarrator,
      });

      const scene = innerEngine.createScene({
        participants: [
          { id: 'player_1', name: 'Kael', chaMod: 100, isPlayer: true },
          { id: 'npc_mira', name: 'Mira', chaMod: 2, isPlayer: false, templateKey: 'mira' },
        ],
      });
      innerEngine.startScene(scene.id);

      await innerEngine.submitAction(scene.id, 'player_1', {
        type: 'speech', content: 'Good evening, may I have an ale?',
      });

      expect(capturedBatchArgs).toBeDefined();
      expect(capturedBatchArgs.playerAction).toBeDefined();
      expect(capturedBatchArgs.playerAction.type).toBe('speech');
      expect(capturedBatchArgs.playerAction.content).toBe('Good evening, may I have an ale?');
    });
  });

  // ── sceneId threading to narrator ──────────────────────────────

  describe('sceneId threading to narrator', () => {
    it('should pass sceneId to narrateSceneOpening in advanceNpcTurns', async () => {
      let capturedArgs = null;
      const mockNarrator = {
        narrateSceneOpening: async (args) => {
          capturedArgs = args;
          return { narration: 'You enter the tavern.', source: 'llm' };
        },
        narrateNpcBatch: async () => ({ narration: '', source: 'fallback' }),
      };

      const innerEngine = new SceneEngine({
        encounterMemory: deps.encounterMemory,
        responseService: deps.responseService,
        personalityLookup: deps.personalityLookup,
        runtimeContext: deps.runtimeContext,
        evolutionService: deps.evolutionService,
        sceneNarrator: mockNarrator,
      });

      const scene = innerEngine.createScene({
        participants: [
          { id: 'player_1', name: 'Aldric', chaMod: 100, isPlayer: true },
          { id: 'npc_mira', name: 'Mira', chaMod: 2, isPlayer: false, templateKey: 'mira' },
        ],
      });
      innerEngine.startScene(scene.id);
      await innerEngine.advanceNpcTurns(scene.id);

      expect(capturedArgs).toBeDefined();
      expect(capturedArgs.sceneId).toBe(scene.id);
    });

    it('should pass sceneId to narrateNpcBatch in advanceNpcTurns', async () => {
      let capturedBatchArgs = null;
      const mockNarrator = {
        narrateSceneOpening: async () => ({ narration: 'Opening.', source: 'llm' }),
        narrateNpcBatch: async (args) => {
          capturedBatchArgs = args;
          return { narration: 'Mira nods.', source: 'llm' };
        },
      };

      const innerEngine = new SceneEngine({
        encounterMemory: deps.encounterMemory,
        responseService: deps.responseService,
        personalityLookup: deps.personalityLookup,
        runtimeContext: deps.runtimeContext,
        evolutionService: deps.evolutionService,
        sceneNarrator: mockNarrator,
      });

      const scene = innerEngine.createScene({
        participants: [
          { id: 'player_1', name: 'Aldric', chaMod: 2, isPlayer: true },
          { id: 'npc_mira', name: 'Mira', chaMod: 100, isPlayer: false, templateKey: 'mira' },
        ],
      });
      innerEngine.startScene(scene.id);
      await innerEngine.advanceNpcTurns(scene.id);

      expect(capturedBatchArgs).toBeDefined();
      expect(capturedBatchArgs.sceneId).toBe(scene.id);
    });

    it('should pass sceneId to narrateNpcBatch in submitAction', async () => {
      let capturedBatchArgs = null;
      const mockNarrator = {
        narrateNpcBatch: async (args) => {
          capturedBatchArgs = args;
          return { narration: 'She smiles.', source: 'llm' };
        },
      };

      const innerEngine = new SceneEngine({
        encounterMemory: deps.encounterMemory,
        responseService: deps.responseService,
        personalityLookup: deps.personalityLookup,
        runtimeContext: deps.runtimeContext,
        evolutionService: deps.evolutionService,
        sceneNarrator: mockNarrator,
      });

      const scene = innerEngine.createScene({
        participants: [
          { id: 'player_1', name: 'Kael', chaMod: 100, isPlayer: true },
          { id: 'npc_mira', name: 'Mira', chaMod: 2, isPlayer: false, templateKey: 'mira' },
        ],
      });
      innerEngine.startScene(scene.id);

      await innerEngine.submitAction(scene.id, 'player_1', {
        type: 'speech', content: 'Hello!',
      });

      expect(capturedBatchArgs).toBeDefined();
      expect(capturedBatchArgs.sceneId).toBe(scene.id);
    });

    it('should clear narrator history on endScene', async () => {
      const { narrator, provider } = (() => {
        const p = new MockProvider();
        const ctxBuilder = new CharacterContextBuilder();
        const rs = new CharacterResponseService({ provider: p, contextBuilder: ctxBuilder });
        const n = new SceneNarrator({ responseService: rs, provider: p });
        return { narrator: n, provider: p };
      })();

      const innerEngine = new SceneEngine({
        encounterMemory: deps.encounterMemory,
        responseService: deps.responseService,
        personalityLookup: deps.personalityLookup,
        runtimeContext: deps.runtimeContext,
        evolutionService: deps.evolutionService,
        sceneNarrator: narrator,
      });

      const scene = innerEngine.createScene({
        participants: [
          { id: 'player_1', name: 'Aldric', chaMod: 100, isPlayer: true },
          { id: 'npc_mira', name: 'Mira', chaMod: 2, isPlayer: false, templateKey: 'mira' },
        ],
      });
      innerEngine.startScene(scene.id);
      await innerEngine.advanceNpcTurns(scene.id);

      // After opening, narrator should have history
      const historyBefore = narrator.getNarratorHistory(scene.id);
      expect(historyBefore.length).toBeGreaterThan(0);

      // End the scene
      innerEngine.endScene(scene.id, 'player_left');

      // History should be cleared
      const historyAfter = narrator.getNarratorHistory(scene.id);
      expect(historyAfter.length).toBe(0);
    });
  });
});
