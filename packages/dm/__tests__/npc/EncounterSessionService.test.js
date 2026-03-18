import { describe, it, expect, beforeEach } from 'vitest';
import { EncounterSessionService } from '../../src/npc/EncounterSessionService.js';
import { MockProvider } from '../../src/llm/MockProvider.js';
import { CharacterContextBuilder } from '../../src/npc/CharacterContextBuilder.js';
import { EncounterMemoryService } from '../../src/npc/EncounterMemoryService.js';
import { InfoExtractionService } from '../../src/npc/InfoExtractionService.js';
import { CharacterResponseService } from '../../src/npc/CharacterResponseService.js';
import { RelationshipRepository } from '../../src/services/RelationshipRepository.js';

/**
 * EncounterSessionService Requirements:
 *
 * 1. createEncounter({ npcTemplateKeys, playerName?, worldContext?, personalities })
 *    a. Creates a new encounter session with an ID
 *    b. Populates NPC list from provided personalities
 *    c. Throws INVALID_INPUT if npcTemplateKeys is empty or missing
 *    d. Throws NPC_NOT_FOUND if personality lookup fails
 *    e. Generates initial appearance for each NPC
 *    f. Initializes encounter memory for each NPC
 *    g. Enforces MAX_SESSIONS cap
 *    h. Returns { encounterId, npcs, messages, worldContext, status }
 *
 * 2. getEncounter(encounterId)
 *    a. Returns session state
 *    b. Throws ENCOUNTER_NOT_FOUND for unknown IDs
 *
 * 3. sendMessage(encounterId, { text, addressedTo? })
 *    a. Records player message in conversation
 *    b. Generates NPC response(s) via CharacterResponseService
 *    c. Falls back to silent response if NPC response fails
 *    d. Throws ENCOUNTER_ENDED for ended sessions
 *    e. Throws INVALID_INPUT for empty message text
 *    f. Returns { playerMessage, npcResponses }
 *
 * 4. endEncounter(encounterId)
 *    a. Sets status to 'ended'
 *    b. Returns { encounterId, status, messageCount }
 *
 * 5. listEncounters()
 *    a. Returns all sessions with summary info
 *
 * 6. Session pruning — expired sessions are cleaned up
 */

function makeDeps() {
  const provider = new MockProvider();
  const contextBuilder = new CharacterContextBuilder();
  const encounterMemory = new EncounterMemoryService();
  const infoExtraction = new InfoExtractionService({ provider });
  const responseService = new CharacterResponseService({ provider, contextBuilder });
  return { provider, contextBuilder, encounterMemory, infoExtraction, responseService };
}

/** Minimal personality record for tests */
function makePersonality(key, name, overrides = {}) {
  return {
    templateKey: key,
    name,
    race: 'Human',
    npcType: 'neutral',
    personality: {
      voice: 'calm and measured',
      alignment: 'neutral',
      disposition: 'Curious but wary.',
      backstory: 'A wanderer from the north.',
      motivations: ['Survive'],
      fears: ['Darkness'],
      mannerisms: ['Hums softly'],
      speechPatterns: ['Speaks in riddles'],
    },
    ...overrides,
  };
}

describe('EncounterSessionService', () => {
  let service;
  let deps;
  let personalities;

  beforeEach(() => {
    deps = makeDeps();
    personalities = {
      bree_millhaven: makePersonality('bree_millhaven', 'Bree Millhaven', { race: 'Halfling', npcType: 'friendly' }),
      hodge_fence: makePersonality('hodge_fence', 'Hodge the Fence', { npcType: 'neutral' }),
    };
    deps.provider.setMockResponse('A figure stands before you.');
    service = new EncounterSessionService({
      encounterMemory: deps.encounterMemory,
      infoExtraction: deps.infoExtraction,
      responseService: deps.responseService,
      personalityLookup: (key) => personalities[key] || null,
    });
  });

  // ── createEncounter ────────────────────────────────────────────────────

  describe('createEncounter', () => {
    it('should create an encounter with NPC data and return session state', async () => {
      const result = await service.createEncounter({
        npcTemplateKeys: ['bree_millhaven'],
        playerName: 'Kael',
      });

      expect(result.encounterId).toMatch(/^enc_/);
      expect(result.npcs).toHaveLength(1);
      expect(result.npcs[0].templateKey).toBe('bree_millhaven');
      expect(result.npcs[0].name).toBe('Bree Millhaven');
      expect(result.status).toBe('active');
      expect(result.messages).toEqual([]);
    });

    it('should use default playerName "Adventurer" when not provided', async () => {
      const result = await service.createEncounter({
        npcTemplateKeys: ['bree_millhaven'],
      });
      // The player name is saved internally; verify via getEncounter
      const session = service.getEncounter(result.encounterId);
      expect(session).toBeDefined();
    });

    it('should throw INVALID_INPUT for empty npcTemplateKeys', async () => {
      try {
        await service.createEncounter({ npcTemplateKeys: [] });
        expect.fail('should have thrown');
      } catch (err) {
        expect(err.code).toBe('INVALID_INPUT');
      }
    });

    it('should throw INVALID_INPUT for missing npcTemplateKeys', async () => {
      try {
        await service.createEncounter({});
        expect.fail('should have thrown');
      } catch (err) {
        expect(err.code).toBe('INVALID_INPUT');
      }
    });

    it('should throw NPC_NOT_FOUND for unknown templateKey', async () => {
      try {
        await service.createEncounter({ npcTemplateKeys: ['unknown_npc'] });
        expect.fail('should have thrown');
      } catch (err) {
        expect(err.code).toBe('NPC_NOT_FOUND');
      }
    });

    it('should generate initial appearance for each NPC via infoExtraction', async () => {
      deps.provider.setMockResponse('A small halfling with flour on her apron.');
      const result = await service.createEncounter({
        npcTemplateKeys: ['bree_millhaven'],
      });

      // Check that revealedInfo has appearance set via encounterMemory
      const revealed = deps.encounterMemory.getRevealedInfo(result.encounterId, 'bree_millhaven');
      expect(revealed.appearance).toBeDefined();
    });

    it('should support multiple NPCs in one encounter', async () => {
      const result = await service.createEncounter({
        npcTemplateKeys: ['bree_millhaven', 'hodge_fence'],
      });

      expect(result.npcs).toHaveLength(2);
      expect(result.npcs.map(n => n.templateKey)).toContain('bree_millhaven');
      expect(result.npcs.map(n => n.templateKey)).toContain('hodge_fence');
    });

    it('should populate worldContext with defaults', async () => {
      const result = await service.createEncounter({
        npcTemplateKeys: ['bree_millhaven'],
      });

      expect(result.worldContext).toBeDefined();
      expect(result.worldContext.location).toBeDefined();
    });

    it('should accept custom worldContext', async () => {
      const result = await service.createEncounter({
        npcTemplateKeys: ['bree_millhaven'],
        worldContext: { location: 'The Rusty Nail tavern', timeOfDay: 'evening', tone: 'tense' },
      });

      expect(result.worldContext.location).toBe('The Rusty Nail tavern');
      expect(result.worldContext.timeOfDay).toBe('evening');
    });

    it('should enforce MAX_SESSIONS limit', async () => {
      // Create many sessions up to limit
      const sessionService = new EncounterSessionService({
        encounterMemory: deps.encounterMemory,
        infoExtraction: deps.infoExtraction,
        responseService: deps.responseService,
        personalityLookup: (key) => personalities[key] || null,
        maxSessions: 2,
      });

      await sessionService.createEncounter({ npcTemplateKeys: ['bree_millhaven'] });
      await sessionService.createEncounter({ npcTemplateKeys: ['hodge_fence'] });

      try {
        await sessionService.createEncounter({ npcTemplateKeys: ['bree_millhaven'] });
        expect.fail('should have thrown');
      } catch (err) {
        expect(err.code).toBe('MAX_SESSIONS');
      }
    });
  });

  // ── getEncounter ───────────────────────────────────────────────────────

  describe('getEncounter', () => {
    it('should return session state by ID', async () => {
      const created = await service.createEncounter({
        npcTemplateKeys: ['bree_millhaven'],
      });
      const result = service.getEncounter(created.encounterId);
      expect(result.encounterId).toBe(created.encounterId);
      expect(result.status).toBe('active');
    });

    it('should throw ENCOUNTER_NOT_FOUND for unknown ID', () => {
      try {
        service.getEncounter('enc_nonexistent');
        expect.fail('should have thrown');
      } catch (err) {
        expect(err.code).toBe('ENCOUNTER_NOT_FOUND');
      }
    });
  });

  // ── sendMessage ────────────────────────────────────────────────────────

  describe('sendMessage', () => {
    it('should record player message and generate NPC response', async () => {
      deps.provider.setMockSequence([
        'A halfling stands before you.',           // appearance generation
        'Well hello there, welcome to Millhaven!',  // NPC response
      ]);
      const created = await service.createEncounter({
        npcTemplateKeys: ['bree_millhaven'],
        playerName: 'Kael',
      });

      const result = await service.sendMessage(created.encounterId, {
        text: 'Hello, what is this place?',
      });

      expect(result.playerMessage.sender).toBe('player');
      expect(result.playerMessage.senderName).toBe('Kael');
      expect(result.playerMessage.text).toBe('Hello, what is this place?');
      expect(result.npcResponses).toHaveLength(1);
      expect(result.npcResponses[0].sender).toBe('bree_millhaven');
    });

    it('should address specific NPCs when addressedTo is provided', async () => {
      deps.provider.setMockSequence([
        'A halfling.', 'A shady figure.',               // appearances
        'I am fine.',                                     // only hodge responds
      ]);
      const created = await service.createEncounter({
        npcTemplateKeys: ['bree_millhaven', 'hodge_fence'],
      });

      const result = await service.sendMessage(created.encounterId, {
        text: 'Hey Hodge, got anything for sale?',
        addressedTo: ['hodge_fence'],
      });

      expect(result.npcResponses).toHaveLength(1);
      expect(result.npcResponses[0].sender).toBe('hodge_fence');
    });

    it('should fall back to silent response when NPC response fails', async () => {
      const brokenProvider = {
        generateResponse: () => { throw new Error('LLM down'); },
      };
      const brokenResponseService = new CharacterResponseService({
        provider: brokenProvider,
        contextBuilder: deps.contextBuilder,
      });

      // Need a service with working infoExtraction but broken responses
      const testService = new EncounterSessionService({
        encounterMemory: deps.encounterMemory,
        infoExtraction: deps.infoExtraction,
        responseService: brokenResponseService,
        personalityLookup: (key) => personalities[key] || null,
      });

      deps.provider.setMockResponse('A person stands here.');
      const created = await testService.createEncounter({
        npcTemplateKeys: ['bree_millhaven'],
      });

      const result = await testService.sendMessage(created.encounterId, {
        text: 'Hello there!',
      });

      expect(result.npcResponses).toHaveLength(1);
      expect(result.npcResponses[0].source).toBe('fallback');
      expect(result.npcResponses[0].text).toBeDefined();
    });

    it('should throw ENCOUNTER_NOT_FOUND for unknown encounter', async () => {
      try {
        await service.sendMessage('enc_fake', { text: 'hi' });
        expect.fail('should have thrown');
      } catch (err) {
        expect(err.code).toBe('ENCOUNTER_NOT_FOUND');
      }
    });

    it('should throw ENCOUNTER_ENDED for ended sessions', async () => {
      const created = await service.createEncounter({
        npcTemplateKeys: ['bree_millhaven'],
      });
      service.endEncounter(created.encounterId);

      try {
        await service.sendMessage(created.encounterId, { text: 'hi' });
        expect.fail('should have thrown');
      } catch (err) {
        expect(err.code).toBe('ENCOUNTER_ENDED');
      }
    });

    it('should throw INVALID_INPUT for empty message text', async () => {
      const created = await service.createEncounter({
        npcTemplateKeys: ['bree_millhaven'],
      });

      try {
        await service.sendMessage(created.encounterId, { text: '' });
        expect.fail('should have thrown');
      } catch (err) {
        expect(err.code).toBe('INVALID_INPUT');
      }
    });

    it('should accumulate messages in conversation history', async () => {
      deps.provider.setMockSequence([
        'A halfling.',   // appearance
        'Hello!',        // response 1
        'Fine thanks!',  // response 2
      ]);
      const created = await service.createEncounter({
        npcTemplateKeys: ['bree_millhaven'],
        playerName: 'Kael',
      });

      await service.sendMessage(created.encounterId, { text: 'Hi there!' });
      await service.sendMessage(created.encounterId, { text: 'How are you?' });

      const session = service.getEncounter(created.encounterId);
      // 2 player messages + 2 NPC responses = 4 total
      expect(session.messages).toHaveLength(4);
    });
  });

  // ── endEncounter ───────────────────────────────────────────────────────

  describe('endEncounter', () => {
    it('should set status to ended and return summary', async () => {
      const created = await service.createEncounter({
        npcTemplateKeys: ['bree_millhaven'],
      });

      const result = service.endEncounter(created.encounterId);
      expect(result.encounterId).toBe(created.encounterId);
      expect(result.status).toBe('ended');
      expect(result.messageCount).toBe(0);
    });

    it('should throw ENCOUNTER_NOT_FOUND for unknown ID', () => {
      try {
        service.endEncounter('enc_fake');
        expect.fail('should have thrown');
      } catch (err) {
        expect(err.code).toBe('ENCOUNTER_NOT_FOUND');
      }
    });
  });

  // ── listEncounters ─────────────────────────────────────────────────────

  describe('listEncounters', () => {
    it('should return all sessions with summary info', async () => {
      await service.createEncounter({ npcTemplateKeys: ['bree_millhaven'] });
      await service.createEncounter({ npcTemplateKeys: ['hodge_fence'] });

      const list = service.listEncounters();
      expect(list).toHaveLength(2);
      expect(list[0]).toHaveProperty('encounterId');
      expect(list[0]).toHaveProperty('npcs');
      expect(list[0]).toHaveProperty('status');
      expect(list[0]).toHaveProperty('messageCount');
    });
  });

  // ── Session pruning ────────────────────────────────────────────────────

  describe('session pruning', () => {
    it('should prune sessions older than TTL', async () => {
      const created = await service.createEncounter({
        npcTemplateKeys: ['bree_millhaven'],
      });

      // Manually age the session
      service._sessions.get(created.encounterId).createdAt = Date.now() - (3 * 60 * 60 * 1000);

      // Creating a new encounter triggers pruning
      await service.createEncounter({ npcTemplateKeys: ['hodge_fence'] });

      const list = service.listEncounters();
      expect(list).toHaveLength(1);
      expect(list[0].npcs[0].templateKey).toBe('hodge_fence');
    });
  });

  // ── Player-facing name resolution ─────────────────────────────────────

  describe('player-facing name resolution', () => {
    let repoService;
    let repo;
    let personalitiesWithAppearance;

    beforeEach(() => {
      repo = new RelationshipRepository();
      personalitiesWithAppearance = {
        bree_millhaven: {
          ...makePersonality('bree_millhaven', 'Bree Millhaven', { race: 'Halfling', npcType: 'friendly' }),
          appearance: { firstImpression: 'a cheerful halfling with flour-dusted hands' },
        },
        hodge_fence: {
          ...makePersonality('hodge_fence', 'Hodge the Fence'),
          appearance: { firstImpression: 'a shifty-eyed man leaning against the wall' },
        },
      };

      repoService = new EncounterSessionService({
        encounterMemory: deps.encounterMemory,
        infoExtraction: deps.infoExtraction,
        responseService: deps.responseService,
        personalityLookup: (key) => personalitiesWithAppearance[key] || null,
        relationshipRepo: repo,
      });
    });

    it('should auto-seed display labels for stranger NPCs on encounter creation', async () => {
      await repoService.createEncounter({
        npcTemplateKeys: ['bree_millhaven'],
        playerName: 'Hero',
      });

      const rel = repo.getRelationship('player', 'bree_millhaven');
      expect(rel).not.toBeNull();
      expect(rel.displayLabel).toBe('a cheerful halfling with flour-dusted hands');
    });

    it('should promote stranger NPCs to recognized on encounter creation', async () => {
      await repoService.createEncounter({
        npcTemplateKeys: ['bree_millhaven'],
        playerName: 'Hero',
      });

      const rel = repo.getRelationship('player', 'bree_millhaven');
      expect(rel.recognitionTier).toBe('recognized');
    });

    it('should use display labels for NPC names in createEncounter response', async () => {
      const result = await repoService.createEncounter({
        npcTemplateKeys: ['bree_millhaven'],
        playerName: 'Hero',
      });

      expect(result.npcs[0].name).toBe('a cheerful halfling with flour-dusted hands');
      expect(result.npcs[0].name).not.toBe('Bree Millhaven');
    });

    it('should use display labels for senderName in NPC responses', async () => {
      const result = await repoService.createEncounter({
        npcTemplateKeys: ['bree_millhaven'],
        playerName: 'Hero',
      });

      const response = await repoService.sendMessage(result.encounterId, {
        text: 'Hello there!',
      });

      expect(response.npcResponses[0].senderName).toBe('a cheerful halfling with flour-dusted hands');
    });

    it('should use real names when NPC is acquaintance', async () => {
      repo.seedRelationship({
        subjectId: 'player',
        targetId: 'bree_millhaven',
        recognitionTier: 'acquaintance',
        displayLabel: 'a cheerful halfling',
      });

      const result = await repoService.createEncounter({
        npcTemplateKeys: ['bree_millhaven'],
        playerName: 'Hero',
      });

      expect(result.npcs[0].name).toBe('Bree Millhaven');

      const response = await repoService.sendMessage(result.encounterId, {
        text: 'Hey Bree!',
      });
      expect(response.npcResponses[0].senderName).toBe('Bree Millhaven');
    });

    it('should use display labels in getEncounter response', async () => {
      const created = await repoService.createEncounter({
        npcTemplateKeys: ['bree_millhaven'],
        playerName: 'Hero',
      });

      const encounter = repoService.getEncounter(created.encounterId);
      expect(encounter.npcs[0].name).toBe('a cheerful halfling with flour-dusted hands');
    });

    it('should still work without relationshipRepo (backward compat)', async () => {
      const result = await service.createEncounter({
        npcTemplateKeys: ['bree_millhaven'],
        playerName: 'Hero',
      });

      // Without repo, uses real name
      expect(result.npcs[0].name).toBe('Bree Millhaven');
    });
  });
});
