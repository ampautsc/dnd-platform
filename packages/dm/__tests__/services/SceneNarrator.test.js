import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SceneNarrator } from '../../src/services/SceneNarrator.js';
import { SceneEngine } from '../../src/services/SceneEngine.js';
import { MockProvider } from '../../src/llm/MockProvider.js';
import { CharacterContextBuilder } from '../../src/npc/CharacterContextBuilder.js';
import { CharacterResponseService } from '../../src/npc/CharacterResponseService.js';
import { EncounterMemoryService } from '../../src/npc/EncounterMemoryService.js';
import { PersonalityEvolutionService } from '../../src/npc/PersonalityEvolutionService.js';
import { NpcRuntimeContext } from '../../src/npc/NpcRuntimeContext.js';
import { RelationshipRepository } from '../../src/services/RelationshipRepository.js';

/**
 * SceneNarrator Requirements:
 *
 * 1. Takes a batch of raw NPC actions (from privateTranscript) and scene context
 * 2. Produces a single DM narration for the player-facing transcript
 * 3. Direct NPC speech to the player → quoted with attribution
 * 4. Internal thoughts / inner monologue → NEVER shown to player
 * 5. Observable actions → described by the DM in third person
 * 6. PASS / OBSERVE → omitted or briefly noted
 * 7. LEAVE → narrated as departure
 * 8. Scene opening → produces an atmospheric introduction
 * 9. Uses LLM to compose the narration (with DM system prompt)
 * 10. Falls back to rules-based narration if LLM fails
 * 11. Resolves NPC names through RelationshipRepository — strangers get display labels, not real names
 * 12. LLM prompt includes explicit name mapping so the model uses display labels
 * 13. Fallback narration also uses resolved display labels
 */

function makeNarrator(mockResponse) {
  const provider = new MockProvider();
  if (mockResponse) provider.setMockResponse(mockResponse);
  const contextBuilder = new CharacterContextBuilder();
  const responseService = new CharacterResponseService({ provider, contextBuilder });
  return { narrator: new SceneNarrator({ responseService, provider }), provider };
}

function makeNarratorWithRepo(mockResponse) {
  const provider = new MockProvider();
  if (mockResponse) provider.setMockResponse(mockResponse);
  const contextBuilder = new CharacterContextBuilder();
  const responseService = new CharacterResponseService({ provider, contextBuilder });
  const repo = new RelationshipRepository();

  // Seed mira as recognized (stranger who has been seen) with display label
  repo.seedRelationship({
    subjectId: 'player',
    targetId: 'mira_barrelbottom',
    recognitionTier: 'recognized',
    displayLabel: 'the halfling behind the bar',
  });
  // Seed lell as acquaintance (player knows her name)
  repo.seedRelationship({
    subjectId: 'player',
    targetId: 'lell_sparrow',
    recognitionTier: 'acquaintance',
    displayLabel: 'a traveling musician',
  });

  const narrator = new SceneNarrator({ responseService, provider, relationshipRepo: repo });
  return { narrator, provider, repo };
}

function makeWorldContext() {
  return {
    locationId: 'bottoms_up',
    locationName: 'Bottoms Up',
    locationType: 'tavern',
    description: 'A two-story timber-frame tavern on the corner of Mill Road and the King\'s Road.',
    atmosphere: {
      defaultTone: 'lively',
      sounds: ['Low murmur of conversation', 'Clink of tankards'],
      smells: ['Wood smoke', 'Spilled ale'],
      lighting: 'Warm amber candlelight.',
    },
  };
}

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

describe('SceneNarrator', () => {
  // ── Construction ────────────────────────────────────────────────

  it('should construct without errors', () => {
    const { narrator } = makeNarrator();
    expect(narrator).toBeDefined();
  });

  // ── narrateNpcBatch ─────────────────────────────────────────────

  describe('narrateNpcBatch', () => {
    it('should return a DM narration string from NPC actions', async () => {
      const { narrator } = makeNarrator('Mira looks up from the bar. "Welcome to Bottoms Up," she says warmly.');
      const result = await narrator.narrateNpcBatch({
        npcActions: [
          { participantId: 'npc_mira', participantName: 'Mira', type: 'speech', content: '"Welcome to Bottoms Up!" *wipes the bar casually*' },
        ],
        worldContext: makeWorldContext(),
        round: 1,
        playerName: 'Steven',
      });
      expect(result.narration).toBeDefined();
      expect(typeof result.narration).toBe('string');
      expect(result.narration.length).toBeGreaterThan(0);
      expect(result.source).toBe('llm');
    });

    it('should produce fallback narration when LLM fails', async () => {
      const provider = new MockProvider();
      // Force LLM to throw
      provider.generateResponse = async () => { throw new Error('LLM down'); };
      const contextBuilder = new CharacterContextBuilder();
      const responseService = new CharacterResponseService({ provider, contextBuilder });
      const narrator = new SceneNarrator({ responseService, provider });

      const result = await narrator.narrateNpcBatch({
        npcActions: [
          { participantId: 'npc_mira', participantName: 'Mira', type: 'speech', content: 'Hello there, welcome!' },
          { participantId: 'npc_lell', participantName: 'Lell', type: 'observe', content: '*watches quietly*' },
        ],
        worldContext: makeWorldContext(),
        round: 1,
        playerName: 'Steven',
      });
      expect(result.source).toBe('fallback');
      expect(result.narration).toBeDefined();
      // Fallback should include speech directly
      expect(result.narration).toContain('Mira');
      expect(result.narration).toContain('Hello there, welcome!');
    });

    it('should omit PASS actions in fallback narration', async () => {
      const provider = new MockProvider();
      provider.generateResponse = async () => { throw new Error('fail'); };
      const contextBuilder = new CharacterContextBuilder();
      const responseService = new CharacterResponseService({ provider, contextBuilder });
      const narrator = new SceneNarrator({ responseService, provider });

      const result = await narrator.narrateNpcBatch({
        npcActions: [
          { participantId: 'npc_fen', participantName: 'Fen', type: 'pass', content: '' },
          { participantId: 'npc_mira', participantName: 'Mira', type: 'speech', content: 'What can I get you?' },
        ],
        worldContext: makeWorldContext(),
        round: 1,
        playerName: 'Steven',
      });
      // Fen's pass should not produce substantive narration
      expect(result.narration).toContain('Mira');
      expect(result.narration).toContain('What can I get you?');
    });

    it('should narrate LEAVE actions in fallback', async () => {
      const provider = new MockProvider();
      provider.generateResponse = async () => { throw new Error('fail'); };
      const contextBuilder = new CharacterContextBuilder();
      const responseService = new CharacterResponseService({ provider, contextBuilder });
      const narrator = new SceneNarrator({ responseService, provider });

      const result = await narrator.narrateNpcBatch({
        npcActions: [
          { participantId: 'npc_fen', participantName: 'Fen', type: 'leave', content: '*finishes drink and slips out*' },
        ],
        worldContext: makeWorldContext(),
        round: 1,
        playerName: 'Steven',
      });
      expect(result.narration).toMatch(/fen/i);
      expect(result.narration).toMatch(/leave|depart|exit|slip|head/i);
    });

    it('should handle empty NPC actions batch', async () => {
      const { narrator } = makeNarrator();
      const result = await narrator.narrateNpcBatch({
        npcActions: [],
        worldContext: makeWorldContext(),
        round: 1,
        playerName: 'Steven',
      });
      // Empty batch → no narration needed
      expect(result.narration).toBe('');
    });
  });

  // ── narrateSceneOpening ─────────────────────────────────────────

  describe('narrateSceneOpening', () => {
    it('should produce an atmospheric opening narration', async () => {
      const { narrator } = makeNarrator('You push open the heavy oak door of Bottoms Up. The warmth hits you first, then the smell of woodsmoke and ale.');
      const result = await narrator.narrateSceneOpening({
        worldContext: makeWorldContext(),
        participantNames: ['Mira Barrelbottom', 'Lell Sparrow', 'Old Mattock'],
        playerName: 'Steven',
      });
      expect(result.narration).toBeDefined();
      expect(typeof result.narration).toBe('string');
      expect(result.narration.length).toBeGreaterThan(0);
    });

    it('should fall back to a rules-based opening if LLM fails', async () => {
      const provider = new MockProvider();
      provider.generateResponse = async () => { throw new Error('fail'); };
      const contextBuilder = new CharacterContextBuilder();
      const responseService = new CharacterResponseService({ provider, contextBuilder });
      const narrator = new SceneNarrator({ responseService, provider });

      const result = await narrator.narrateSceneOpening({
        worldContext: makeWorldContext(),
        participantNames: ['Mira Barrelbottom', 'Lell Sparrow'],
        playerName: 'Steven',
      });
      expect(result.source).toBe('fallback');
      expect(result.narration).toContain('Bottoms Up');
    });
  });

  // ── DM System Prompt ────────────────────────────────────────────

  describe('buildDmNarrationPrompt', () => {
    it('should instruct the DM to narrate in second person', () => {
      const { narrator } = makeNarrator();
      const prompt = narrator.buildDmNarrationPrompt({
        worldContext: makeWorldContext(),
        playerName: 'Steven',
      });
      expect(prompt).toMatch(/second person|"you"/i);
    });

    it('should instruct never to reveal NPC inner thoughts', () => {
      const { narrator } = makeNarrator();
      const prompt = narrator.buildDmNarrationPrompt({
        worldContext: makeWorldContext(),
        playerName: 'Steven',
      });
      expect(prompt).toMatch(/inner thought|inner monologue|internal/i);
      expect(prompt).toMatch(/never|do not|must not/i);
    });

    it('should include location atmosphere', () => {
      const { narrator } = makeNarrator();
      const prompt = narrator.buildDmNarrationPrompt({
        worldContext: makeWorldContext(),
        playerName: 'Steven',
      });
      expect(prompt).toContain('Bottoms Up');
    });
  });

  // ── Name resolution via RelationshipRepository ──────────────────

  describe('name resolution via RelationshipRepository', () => {
    it('should use display labels for strangers/recognized in LLM prompt', async () => {
      let capturedPrompt = null;
      const provider = new MockProvider();
      provider.generateResponse = async (opts) => {
        capturedPrompt = opts.messages ? opts.messages[0].content : '';
        return { text: 'The halfling behind the bar nods at you.' };
      };
      const contextBuilder = new CharacterContextBuilder();
      const responseService = new CharacterResponseService({ provider, contextBuilder });
      const repo = new RelationshipRepository();
      repo.seedRelationship({
        subjectId: 'player',
        targetId: 'mira_barrelbottom',
        recognitionTier: 'recognized',
        displayLabel: 'the halfling behind the bar',
      });

      const narrator = new SceneNarrator({ responseService, provider, relationshipRepo: repo });

      await narrator.narrateNpcBatch({
        npcActions: [
          { participantId: 'npc_mira', participantName: 'Mira Barrelbottom', type: 'speech', content: 'Welcome!', templateKey: 'mira_barrelbottom' },
        ],
        worldContext: makeWorldContext(),
        round: 1,
        playerName: 'Steven',
      });

      // The prompt sent to the LLM should contain the display label, not the real name
      expect(capturedPrompt).toContain('the halfling behind the bar');
      expect(capturedPrompt).not.toContain('Mira Barrelbottom');
    });

    it('should use real names for acquaintances in LLM prompt', async () => {
      let capturedPrompt = null;
      const provider = new MockProvider();
      provider.generateResponse = async (opts) => {
        capturedPrompt = opts.messages ? opts.messages[0].content : '';
        return { text: 'Lell strums a chord.' };
      };
      const contextBuilder = new CharacterContextBuilder();
      const responseService = new CharacterResponseService({ provider, contextBuilder });
      const repo = new RelationshipRepository();
      repo.seedRelationship({
        subjectId: 'player',
        targetId: 'lell_sparrow',
        recognitionTier: 'acquaintance',
        displayLabel: 'a traveling musician',
      });

      const narrator = new SceneNarrator({ responseService, provider, relationshipRepo: repo });

      await narrator.narrateNpcBatch({
        npcActions: [
          { participantId: 'npc_lell', participantName: 'Lell Sparrow', type: 'speech', content: 'Nice tune, eh?', templateKey: 'lell_sparrow' },
        ],
        worldContext: makeWorldContext(),
        round: 1,
        playerName: 'Steven',
      });

      // Acquaintance — real name is fine
      expect(capturedPrompt).toContain('Lell Sparrow');
    });

    it('should use display labels in fallback narration for strangers', async () => {
      const provider = new MockProvider();
      provider.generateResponse = async () => { throw new Error('fail'); };
      const contextBuilder = new CharacterContextBuilder();
      const responseService = new CharacterResponseService({ provider, contextBuilder });
      const repo = new RelationshipRepository();
      repo.seedRelationship({
        subjectId: 'player',
        targetId: 'mira_barrelbottom',
        recognitionTier: 'recognized',
        displayLabel: 'the halfling behind the bar',
      });

      const narrator = new SceneNarrator({ responseService, provider, relationshipRepo: repo });

      const result = await narrator.narrateNpcBatch({
        npcActions: [
          { participantId: 'npc_mira', participantName: 'Mira Barrelbottom', type: 'speech', content: 'Hello there!', templateKey: 'mira_barrelbottom' },
        ],
        worldContext: makeWorldContext(),
        round: 1,
        playerName: 'Steven',
      });

      expect(result.source).toBe('fallback');
      expect(result.narration).toContain('the halfling behind the bar');
      expect(result.narration).not.toContain('Mira Barrelbottom');
    });

    it('should resolve names in narrateSceneOpening', async () => {
      let capturedPrompt = null;
      const provider = new MockProvider();
      provider.generateResponse = async (opts) => {
        capturedPrompt = opts.messages ? opts.messages[0].content : '';
        return { text: 'A cozy tavern.' };
      };
      const contextBuilder = new CharacterContextBuilder();
      const responseService = new CharacterResponseService({ provider, contextBuilder });
      const repo = new RelationshipRepository();
      repo.seedRelationship({
        subjectId: 'player',
        targetId: 'mira_barrelbottom',
        recognitionTier: 'recognized',
        displayLabel: 'the halfling behind the bar',
      });

      const narrator = new SceneNarrator({ responseService, provider, relationshipRepo: repo });

      await narrator.narrateSceneOpening({
        worldContext: makeWorldContext(),
        participantNames: [
          { realName: 'Mira Barrelbottom', templateKey: 'mira_barrelbottom' },
          { realName: 'Old Mattock', templateKey: 'old_mattock' },
        ],
        playerName: 'Steven',
      });

      expect(capturedPrompt).toContain('the halfling behind the bar');
      expect(capturedPrompt).not.toContain('Mira Barrelbottom');
      // Old Mattock has no relationship — should use realName as fallback
      expect(capturedPrompt).toContain('Old Mattock');
    });

    it('should resolve names in fallback opening', async () => {
      const provider = new MockProvider();
      provider.generateResponse = async () => { throw new Error('fail'); };
      const contextBuilder = new CharacterContextBuilder();
      const responseService = new CharacterResponseService({ provider, contextBuilder });
      const repo = new RelationshipRepository();
      repo.seedRelationship({
        subjectId: 'player',
        targetId: 'mira_barrelbottom',
        recognitionTier: 'recognized',
        displayLabel: 'the halfling behind the bar',
      });

      const narrator = new SceneNarrator({ responseService, provider, relationshipRepo: repo });

      const result = await narrator.narrateSceneOpening({
        worldContext: makeWorldContext(),
        participantNames: [
          { realName: 'Mira Barrelbottom', templateKey: 'mira_barrelbottom' },
        ],
        playerName: 'Steven',
      });

      expect(result.source).toBe('fallback');
      expect(result.narration).toContain('the halfling behind the bar');
      expect(result.narration).not.toContain('Mira Barrelbottom');
    });

    it('should work without relationshipRepo (backward compat)', async () => {
      const { narrator } = makeNarrator('The bartender waves you in.');
      const result = await narrator.narrateNpcBatch({
        npcActions: [
          { participantId: 'npc_mira', participantName: 'Mira', type: 'speech', content: 'Welcome!' },
        ],
        worldContext: makeWorldContext(),
        round: 1,
        playerName: 'Steven',
      });
      expect(result.narration).toBeDefined();
      expect(result.source).toBe('llm');
    });

    it('should include name mapping in system prompt when repo is available', async () => {
      let capturedSystemPrompt = null;
      const provider = new MockProvider();
      provider.generateResponse = async (opts) => {
        capturedSystemPrompt = opts.systemPrompt;
        return { text: 'The halfling nods.' };
      };
      const contextBuilder = new CharacterContextBuilder();
      const responseService = new CharacterResponseService({ provider, contextBuilder });
      const repo = new RelationshipRepository();
      repo.seedRelationship({
        subjectId: 'player',
        targetId: 'mira_barrelbottom',
        recognitionTier: 'recognized',
        displayLabel: 'the halfling behind the bar',
      });

      const narrator = new SceneNarrator({ responseService, provider, relationshipRepo: repo });

      await narrator.narrateNpcBatch({
        npcActions: [
          { participantId: 'npc_mira', participantName: 'Mira Barrelbottom', type: 'speech', content: 'Welcome!', templateKey: 'mira_barrelbottom' },
        ],
        worldContext: makeWorldContext(),
        round: 1,
        playerName: 'Steven',
      });

      // System prompt should instruct the LLM about name restrictions
      expect(capturedSystemPrompt).toMatch(/NEVER.*reveal.*real name|NEVER use.*real name|do not reveal.*name|unknown.*character/i);
    });
  });

  // ── Full appearance data in narration prompts ───────────────────

  describe('appearance data in narration prompts', () => {
    const miraPersonality = {
      templateKey: 'mira_barrelbottom',
      name: 'Mira Barrelbottom',
      race: 'Halfling',
      gender: 'female',
      appearance: {
        build: 'Compact and sturdy, halfling frame',
        hair: 'Curly auburn, pinned back with a wooden clip',
        skin: 'Warm olive complexion with flour dust on her forearms',
        eyes: 'Dark brown, quick-moving, miss nothing in the room',
        height: 'Short even for a halfling — uses a step-stool behind the bar',
        distinguishingFeatures: [
          'Constantly wiping her hands on a worn apron',
          'A small leather-bound notebook tucked into her apron pocket',
        ],
        typicalAttire: 'A practical dress with rolled sleeves under a stained canvas apron',
        firstImpression: 'The halfling behind the bar who runs this place',
      },
    };

    const fenPersonality = {
      templateKey: 'fen_colby',
      name: 'Fen Colby',
      race: 'Human',
      gender: 'male',
      appearance: {
        build: 'Compact and capable, moves like someone aware of every exit',
        hair: 'Black, cut short on the sides',
        eyes: 'Dark brown, watchful, rarely blink at the expected rate',
        distinguishingFeatures: [
          'A thin scar along the left jawline',
          'Sits with his back to the wall, always',
        ],
        typicalAttire: 'Dark, practical clothing that could be a merchant\'s or a traveler\'s',
        firstImpression: 'A quiet man at the bar',
      },
    };

    function makeLookup(personalities) {
      const map = {};
      for (const p of personalities) map[p.templateKey] = p;
      return (key) => map[key] || null;
    }

    it('should include appearance details in LLM prompt when personalityLookup is available', async () => {
      let capturedPrompt = null;
      const provider = new MockProvider();
      provider.generateResponse = async (opts) => {
        capturedPrompt = opts.messages ? opts.messages[0].content : '';
        return { text: 'She polishes a glass.' };
      };
      const contextBuilder = new CharacterContextBuilder();
      const responseService = new CharacterResponseService({ provider, contextBuilder });
      const repo = new RelationshipRepository();
      repo.seedRelationship({
        subjectId: 'player',
        targetId: 'mira_barrelbottom',
        recognitionTier: 'recognized',
        displayLabel: 'the halfling behind the bar',
      });

      const narrator = new SceneNarrator({
        responseService, provider, relationshipRepo: repo,
        personalityLookup: makeLookup([miraPersonality]),
      });

      await narrator.narrateNpcBatch({
        npcActions: [
          { participantId: 'npc_mira', participantName: 'Mira Barrelbottom', type: 'speech', content: 'Welcome!', templateKey: 'mira_barrelbottom' },
        ],
        worldContext: makeWorldContext(),
        round: 1,
        playerName: 'Steven',
      });

      // Should contain appearance details — NOT the real name
      expect(capturedPrompt).toContain('Curly auburn');
      expect(capturedPrompt).toContain('Warm olive complexion');
      expect(capturedPrompt).toContain('practical dress');
      expect(capturedPrompt).toContain('female');
      expect(capturedPrompt).not.toContain('Mira Barrelbottom');
    });

    it('should include gender/race in appearance block', async () => {
      let capturedPrompt = null;
      const provider = new MockProvider();
      provider.generateResponse = async (opts) => {
        capturedPrompt = opts.messages ? opts.messages[0].content : '';
        return { text: 'He watches.' };
      };
      const contextBuilder = new CharacterContextBuilder();
      const responseService = new CharacterResponseService({ provider, contextBuilder });
      const repo = new RelationshipRepository();
      repo.seedRelationship({
        subjectId: 'player',
        targetId: 'fen_colby',
        recognitionTier: 'recognized',
        displayLabel: 'a quiet man at the bar',
      });

      const narrator = new SceneNarrator({
        responseService, provider, relationshipRepo: repo,
        personalityLookup: makeLookup([fenPersonality]),
      });

      await narrator.narrateNpcBatch({
        npcActions: [
          { participantId: 'npc_fen', participantName: 'Fen Colby', type: 'observe', content: '*watches the room*', templateKey: 'fen_colby' },
        ],
        worldContext: makeWorldContext(),
        round: 1,
        playerName: 'Steven',
      });

      expect(capturedPrompt).toContain('male');
      expect(capturedPrompt).toContain('Human');
      expect(capturedPrompt).toContain('scar');
      expect(capturedPrompt).not.toContain('Fen Colby');
    });

    it('should include distinguishing features as bullet points', async () => {
      let capturedPrompt = null;
      const provider = new MockProvider();
      provider.generateResponse = async (opts) => {
        capturedPrompt = opts.messages ? opts.messages[0].content : '';
        return { text: 'She wipes her hands.' };
      };
      const contextBuilder = new CharacterContextBuilder();
      const responseService = new CharacterResponseService({ provider, contextBuilder });

      const narrator = new SceneNarrator({
        responseService, provider,
        personalityLookup: makeLookup([miraPersonality]),
      });

      await narrator.narrateNpcBatch({
        npcActions: [
          { participantId: 'npc_mira', participantName: 'Mira', type: 'act', content: '*wipes the bar*', templateKey: 'mira_barrelbottom' },
        ],
        worldContext: makeWorldContext(),
        round: 1,
        playerName: 'Steven',
      });

      expect(capturedPrompt).toContain('wiping her hands on a worn apron');
      expect(capturedPrompt).toContain('leather-bound notebook');
    });

    it('should still work without personalityLookup (backward compat)', async () => {
      const { narrator } = makeNarrator('Someone speaks.');
      const result = await narrator.narrateNpcBatch({
        npcActions: [
          { participantId: 'npc_mira', participantName: 'Mira', type: 'speech', content: 'Hello!', templateKey: 'mira_barrelbottom' },
        ],
        worldContext: makeWorldContext(),
        round: 1,
        playerName: 'Steven',
      });
      expect(result.narration).toBeDefined();
      expect(result.source).toBe('llm');
    });

    it('should include appearance in scene opening prompt', async () => {
      let capturedPrompt = null;
      const provider = new MockProvider();
      provider.generateResponse = async (opts) => {
        capturedPrompt = opts.messages ? opts.messages[0].content : '';
        return { text: 'The tavern is warm.' };
      };
      const contextBuilder = new CharacterContextBuilder();
      const responseService = new CharacterResponseService({ provider, contextBuilder });
      const repo = new RelationshipRepository();
      repo.seedRelationship({
        subjectId: 'player',
        targetId: 'mira_barrelbottom',
        recognitionTier: 'recognized',
        displayLabel: 'the halfling behind the bar',
      });

      const narrator = new SceneNarrator({
        responseService, provider, relationshipRepo: repo,
        personalityLookup: makeLookup([miraPersonality]),
      });

      await narrator.narrateSceneOpening({
        worldContext: makeWorldContext(),
        participantNames: [
          { realName: 'Mira Barrelbottom', templateKey: 'mira_barrelbottom' },
        ],
        playerName: 'Steven',
      });

      // Should have appearance details
      expect(capturedPrompt).toContain('Curly auburn');
      expect(capturedPrompt).toContain('female');
      expect(capturedPrompt).not.toContain('Mira Barrelbottom');
    });
  });

  // ── NPC inner state forwarding to DM consciousness ──────────────

  describe('NPC inner states in DM prompt', () => {
    it('should include NPC inner states in system prompt when provided', async () => {
      let capturedSystemPrompt = null;
      const provider = new MockProvider();
      provider.generateResponse = async (opts) => {
        capturedSystemPrompt = opts.systemPrompt;
        return { text: 'She sets a glass before you.' };
      };
      const contextBuilder = new CharacterContextBuilder();
      const responseService = new CharacterResponseService({ provider, contextBuilder });
      const narrator = new SceneNarrator({ responseService, provider });

      await narrator.narrateNpcBatch({
        npcActions: [
          { participantId: 'npc_mira', participantName: 'Mira', type: 'speech', content: 'What can I get you?' },
        ],
        worldContext: makeWorldContext(),
        round: 1,
        playerName: 'Steven',
        npcInnerStates: [
          {
            displayName: 'the halfling behind the bar',
            mood: 'content but watchful',
            consciousWant: 'To keep the tavern warm and safe',
            currentActivity: 'Wiping down the bar',
            isLying: false,
          },
        ],
      });

      expect(capturedSystemPrompt).toContain('content but watchful');
      expect(capturedSystemPrompt).toContain('keep the tavern warm');
      expect(capturedSystemPrompt).toContain('Wiping down the bar');
    });

    it('should flag deceptive NPCs in the DM prompt', async () => {
      let capturedSystemPrompt = null;
      const provider = new MockProvider();
      provider.generateResponse = async (opts) => {
        capturedSystemPrompt = opts.systemPrompt;
        return { text: 'He smiles thinly.' };
      };
      const contextBuilder = new CharacterContextBuilder();
      const responseService = new CharacterResponseService({ provider, contextBuilder });
      const narrator = new SceneNarrator({ responseService, provider });

      await narrator.narrateNpcBatch({
        npcActions: [
          { participantId: 'npc_fen', participantName: 'Fen', type: 'speech', content: 'Just passing through.' },
        ],
        worldContext: makeWorldContext(),
        round: 1,
        playerName: 'Steven',
        npcInnerStates: [
          {
            displayName: 'a quiet man at the bar',
            mood: 'tense',
            secrets: ['Carrying stolen goods'],
            isLying: true,
          },
        ],
      });

      expect(capturedSystemPrompt).toContain('tense');
      expect(capturedSystemPrompt).toContain('stolen goods');
      expect(capturedSystemPrompt).toMatch(/DECEPTIVE/i);
    });

    it('should work without npcInnerStates (backward compat)', async () => {
      const { narrator } = makeNarrator('The bar is quiet.');
      const result = await narrator.narrateNpcBatch({
        npcActions: [
          { participantId: 'npc_mira', participantName: 'Mira', type: 'speech', content: 'Hi!' },
        ],
        worldContext: makeWorldContext(),
        round: 1,
        playerName: 'Steven',
        // no npcInnerStates
      });
      expect(result.narration).toBeDefined();
      expect(result.source).toBe('llm');
    });
  });

  // ── Player action context + scene memory ────────────────────────

  describe('player action context and scene memory', () => {
    it('should include player action context in user message when provided', async () => {
      let capturedUserMsg = null;
      const provider = new MockProvider();
      provider.generateResponse = async (opts) => {
        capturedUserMsg = opts.messages?.[0]?.content || '';
        return { text: 'She raises an eyebrow.' };
      };
      const contextBuilder = new CharacterContextBuilder();
      const responseService = new CharacterResponseService({ provider, contextBuilder });
      const narrator = new SceneNarrator({ responseService, provider });

      await narrator.narrateNpcBatch({
        npcActions: [
          { participantId: 'npc_mira', participantName: 'Mira', type: 'speech', content: '"Sure, what will it be?"' },
        ],
        worldContext: makeWorldContext(),
        round: 2,
        playerName: 'Steven',
        playerAction: { type: 'speech', content: 'I\'d like a drink, please.' },
      });

      expect(capturedUserMsg).toContain("I'd like a drink, please");
    });

    it('should include scene memory in user message when provided', async () => {
      let capturedUserMsg = null;
      const provider = new MockProvider();
      provider.generateResponse = async (opts) => {
        capturedUserMsg = opts.messages?.[0]?.content || '';
        return { text: 'The tavern hums.' };
      };
      const contextBuilder = new CharacterContextBuilder();
      const responseService = new CharacterResponseService({ provider, contextBuilder });
      const narrator = new SceneNarrator({ responseService, provider });

      await narrator.narrateNpcBatch({
        npcActions: [
          { participantId: 'npc_mira', participantName: 'Mira', type: 'speech', content: '"Coming right up."' },
        ],
        worldContext: makeWorldContext(),
        round: 3,
        playerName: 'Steven',
        sceneMemory: 'Round 1: The halfling behind the bar greeted the player warmly. Round 2: The player ordered an ale.',
      });

      expect(capturedUserMsg).toContain('greeted the player warmly');
      expect(capturedUserMsg).toContain('ordered an ale');
    });
  });

  // ── Name-Leak Detection ────────────────────────────────────────

  describe('name-leak detection', () => {
    it('should pass narration through when only display labels are used', () => {
      const { narrator } = makeNarratorWithRepo('She polishes a glass.');
      const result = narrator._detectNameLeaks(
        'The halfling behind the bar polishes a glass and glances at you.',
        [{ templateKey: 'mira_barrelbottom', participantName: 'Mira Barrelbottom', displayName: 'the halfling behind the bar' }],
      );
      expect(result.leaked).toBe(false);
      expect(result.narration).toContain('halfling behind the bar');
    });

    it('should detect when a real name appears but display name differs', () => {
      const { narrator } = makeNarratorWithRepo('Mira Barrelbottom polishes a glass.');
      const result = narrator._detectNameLeaks(
        'Mira Barrelbottom polishes a glass and smiles at you.',
        [{ templateKey: 'mira_barrelbottom', participantName: 'Mira Barrelbottom', displayName: 'the halfling behind the bar' }],
      );
      expect(result.leaked).toBe(true);
      expect(result.leakedNames).toContain('Mira Barrelbottom');
    });

    it('should detect partial name leaks (first name only)', () => {
      const { narrator } = makeNarratorWithRepo('Mira polishes a glass.');
      const result = narrator._detectNameLeaks(
        'Mira polishes a glass and smiles.',
        [{ templateKey: 'mira_barrelbottom', participantName: 'Mira Barrelbottom', displayName: 'the halfling behind the bar' }],
      );
      expect(result.leaked).toBe(true);
      expect(result.leakedNames.length).toBeGreaterThan(0);
    });

    it('should NOT flag names when real name equals display name', () => {
      const { narrator } = makeNarratorWithRepo('Lell plays a tune.');
      const result = narrator._detectNameLeaks(
        'Lell Sparrow plays a lovely tune on her lute.',
        [{ templateKey: 'lell_sparrow', participantName: 'Lell Sparrow', displayName: 'Lell Sparrow' }],
      );
      expect(result.leaked).toBe(false);
    });

    it('should replace leaked names in narration text', () => {
      const { narrator } = makeNarratorWithRepo('Mira nods at you.');
      const result = narrator._detectNameLeaks(
        'Mira nods at you warmly.',
        [{ templateKey: 'mira_barrelbottom', participantName: 'Mira Barrelbottom', displayName: 'the halfling behind the bar' }],
      );
      expect(result.leaked).toBe(true);
      // The cleaned narration should use the display name, not the real name
      expect(result.cleaned).toBeDefined();
      expect(result.cleaned).not.toMatch(/\bMira\b/);
      expect(result.cleaned).toContain('the halfling behind the bar');
    });

    it('should handle multiple NPCs with mixed leak status', () => {
      const { narrator } = makeNarratorWithRepo('Scene text.');
      const result = narrator._detectNameLeaks(
        'The halfling behind the bar serves a drink. Fen Colby watches from the corner.',
        [
          { templateKey: 'mira_barrelbottom', participantName: 'Mira Barrelbottom', displayName: 'the halfling behind the bar' },
          { templateKey: 'fen_colby', participantName: 'Fen Colby', displayName: 'a quiet man at the bar' },
        ],
      );
      expect(result.leaked).toBe(true);
      expect(result.leakedNames).toContain('Fen Colby');
      expect(result.cleaned).not.toContain('Fen Colby');
    });

    it('should clean leaked names in narrateNpcBatch output', async () => {
      const provider = new MockProvider();
      // Simulate LLM leaking Mira's real name
      provider.generateResponse = async () => ({ text: 'Mira Barrelbottom smiles and pours you a drink.' });
      const contextBuilder = new CharacterContextBuilder();
      const responseService = new CharacterResponseService({ provider, contextBuilder });
      const repo = new RelationshipRepository();
      repo.seedRelationship({
        subjectId: 'player',
        targetId: 'mira_barrelbottom',
        recognitionTier: 'recognized',
        displayLabel: 'the halfling behind the bar',
      });

      const narrator = new SceneNarrator({ responseService, provider, relationshipRepo: repo });
      const result = await narrator.narrateNpcBatch({
        npcActions: [
          { participantId: 'npc_mira', participantName: 'Mira Barrelbottom', type: 'speech', content: 'Welcome!', templateKey: 'mira_barrelbottom' },
        ],
        worldContext: makeWorldContext(),
        round: 1,
        playerName: 'Aldric',
      });

      expect(result.source).toBe('llm');
      expect(result.narration).not.toContain('Mira Barrelbottom');
      expect(result.narration).not.toMatch(/\bMira\b/);
      expect(result.narration).toContain('the halfling behind the bar');
    });

    it('should clean leaked names in narrateSceneOpening output', async () => {
      const provider = new MockProvider();
      // Simulate LLM leaking Fen Colby's real name in scene opening
      provider.generateResponse = async () => ({ text: 'You push open the heavy oak door. The warmth of the tavern hits you. Fen Colby sits at the bar nursing a drink.' });
      const contextBuilder = new CharacterContextBuilder();
      const responseService = new CharacterResponseService({ provider, contextBuilder });
      const repo = new RelationshipRepository();
      repo.seedRelationship({
        subjectId: 'player',
        targetId: 'fen_colby',
        recognitionTier: 'recognized',
        displayLabel: 'a quiet man at the bar',
      });

      const narrator = new SceneNarrator({ responseService, provider, relationshipRepo: repo });
      const result = await narrator.narrateSceneOpening({
        worldContext: makeWorldContext(),
        participantNames: [
          { realName: 'Fen Colby', templateKey: 'fen_colby' },
        ],
        playerName: 'Aldric',
      });

      expect(result.source).toBe('llm');
      expect(result.narration).not.toContain('Fen Colby');
      expect(result.narration).not.toMatch(/\bFen\b/);
      expect(result.narration).toContain('a quiet man at the bar');
    });

    it('should clean leaked first names in narrateSceneOpening output', async () => {
      const provider = new MockProvider();
      // Simulate LLM leaking just the first name
      provider.generateResponse = async () => ({ text: 'A halfling wipes the bar. Mira glances up at your arrival.' });
      const contextBuilder = new CharacterContextBuilder();
      const responseService = new CharacterResponseService({ provider, contextBuilder });
      const repo = new RelationshipRepository();
      repo.seedRelationship({
        subjectId: 'player',
        targetId: 'mira_barrelbottom',
        recognitionTier: 'recognized',
        displayLabel: 'the halfling behind the bar',
      });

      const narrator = new SceneNarrator({ responseService, provider, relationshipRepo: repo });
      const result = await narrator.narrateSceneOpening({
        worldContext: makeWorldContext(),
        participantNames: [
          { realName: 'Mira Barrelbottom', templateKey: 'mira_barrelbottom' },
        ],
        playerName: 'Aldric',
      });

      expect(result.source).toBe('llm');
      expect(result.narration).not.toMatch(/\bMira\b/);
      expect(result.narration).toContain('the halfling behind the bar');
    });
  });

  // ── Storytelling Reframe ────────────────────────────────────────
  //
  // The DM's primary job is storytelling. ALL messages to the player from the
  // DM must be in storytelling form — no game-mechanic formatting, no report
  // style, no "Round X" labels, no "[TYPE]:" tags, no "Compose a brief DM
  // narration" instructions. The LLM user messages must frame the DM as a
  // storyteller continuing a live narrative.

  describe('storytelling reframe — narrateNpcBatch user message', () => {
    let capturedUserMsg;
    let capturedOpts;
    let narrator;

    beforeEach(() => {
      capturedUserMsg = null;
      capturedOpts = null;
      const provider = new MockProvider();
      provider.generateResponse = async (opts) => {
        capturedOpts = opts;
        capturedUserMsg = opts.messages?.[0]?.content || '';
        return { text: 'The halfling sets a mug before you.' };
      };
      const contextBuilder = new CharacterContextBuilder();
      const responseService = new CharacterResponseService({ provider, contextBuilder });
      narrator = new SceneNarrator({ responseService, provider });
    });

    it('should NOT contain "Round X" in user message', async () => {
      await narrator.narrateNpcBatch({
        npcActions: [
          { participantId: 'npc_mira', participantName: 'Mira', type: 'speech', content: 'Welcome!' },
        ],
        worldContext: makeWorldContext(),
        round: 3,
        playerName: 'Steven',
      });

      expect(capturedUserMsg).not.toMatch(/\bRound \d/i);
    });

    it('should NOT contain "Compose a brief DM narration" in user message', async () => {
      await narrator.narrateNpcBatch({
        npcActions: [
          { participantId: 'npc_mira', participantName: 'Mira', type: 'speech', content: 'Hi there.' },
        ],
        worldContext: makeWorldContext(),
        round: 1,
        playerName: 'Steven',
      });

      expect(capturedUserMsg).not.toMatch(/compose a brief/i);
      expect(capturedUserMsg).not.toMatch(/DM narration/i);
    });

    it('should NOT contain game-mechanic action labels like [SPEECH] or [ACT]', async () => {
      await narrator.narrateNpcBatch({
        npcActions: [
          { participantId: 'npc_mira', participantName: 'Mira', type: 'speech', content: 'Welcome!' },
          { participantId: 'npc_fen', participantName: 'Fen', type: 'act', content: '*nods quietly*' },
          { participantId: 'npc_lell', participantName: 'Lell', type: 'observe', content: '*watches*' },
        ],
        worldContext: makeWorldContext(),
        round: 1,
        playerName: 'Steven',
      });

      expect(capturedUserMsg).not.toMatch(/\[SPEECH\]/i);
      expect(capturedUserMsg).not.toMatch(/\[ACT\]/i);
      expect(capturedUserMsg).not.toMatch(/\[OBSERVE\]/i);
      expect(capturedUserMsg).not.toMatch(/\[PASS\]/i);
      expect(capturedUserMsg).not.toMatch(/\[LEAVE\]/i);
    });

    it('should use natural prose for speech actions (quoted with attribution)', async () => {
      await narrator.narrateNpcBatch({
        npcActions: [
          { participantId: 'npc_mira', participantName: 'Mira', type: 'speech', content: 'Welcome to my tavern!' },
        ],
        worldContext: makeWorldContext(),
        round: 1,
        playerName: 'Steven',
      });

      // Should describe speech naturally, e.g. 'Mira says: "Welcome to my tavern!"'
      expect(capturedUserMsg).toMatch(/says|spoke|speaking/i);
      expect(capturedUserMsg).toContain('Welcome to my tavern!');
    });

    it('should use natural prose for act actions (no brackets)', async () => {
      await narrator.narrateNpcBatch({
        npcActions: [
          { participantId: 'npc_fen', participantName: 'Fen', type: 'act', content: 'slides an ale across the bar' },
        ],
        worldContext: makeWorldContext(),
        round: 1,
        playerName: 'Steven',
      });

      // Should describe the action naturally
      expect(capturedUserMsg).toContain('Fen');
      expect(capturedUserMsg).toContain('slides an ale across the bar');
      expect(capturedUserMsg).not.toMatch(/\[ACT\]/);
    });

    it('should omit pass actions from the action summary', async () => {
      await narrator.narrateNpcBatch({
        npcActions: [
          { participantId: 'npc_fen', participantName: 'Fen', type: 'pass', content: '' },
          { participantId: 'npc_mira', participantName: 'Mira', type: 'speech', content: 'Hello!' },
        ],
        worldContext: makeWorldContext(),
        round: 1,
        playerName: 'Steven',
      });

      // Pass actions should not appear in the action descriptions
      expect(capturedUserMsg).not.toMatch(/Fen/);
      expect(capturedUserMsg).toContain('Mira');
    });

    it('should describe leave actions naturally', async () => {
      await narrator.narrateNpcBatch({
        npcActions: [
          { participantId: 'npc_fen', participantName: 'Fen', type: 'leave', content: 'finishes drink and slips out' },
        ],
        worldContext: makeWorldContext(),
        round: 1,
        playerName: 'Steven',
      });

      expect(capturedUserMsg).toMatch(/Fen/);
      expect(capturedUserMsg).toMatch(/leave|left|depart|exit|slip/i);
    });

    it('should contain storytelling instruction framing', async () => {
      await narrator.narrateNpcBatch({
        npcActions: [
          { participantId: 'npc_mira', participantName: 'Mira', type: 'speech', content: 'Welcome!' },
        ],
        worldContext: makeWorldContext(),
        round: 1,
        playerName: 'Steven',
      });

      // User message must tell the LLM to continue telling the story
      expect(capturedUserMsg).toMatch(/continue|tell|narrate|story/i);
    });

    it('should include player action context naturally when provided', async () => {
      await narrator.narrateNpcBatch({
        npcActions: [
          { participantId: 'npc_mira', participantName: 'Mira', type: 'speech', content: '"Coming right up."' },
        ],
        worldContext: makeWorldContext(),
        round: 2,
        playerName: 'Steven',
        playerAction: { type: 'speech', content: 'I\'d like an ale, please.' },
      });

      expect(capturedUserMsg).toContain("I'd like an ale, please");
      // Should NOT have game-mechanic framing around it
      expect(capturedUserMsg).not.toMatch(/\[SPEECH\]/i);
    });
  });

  describe('storytelling reframe — narrateSceneOpening user message', () => {
    let capturedUserMsg;
    let capturedOpts;
    let narrator;

    beforeEach(() => {
      capturedUserMsg = null;
      capturedOpts = null;
      const provider = new MockProvider();
      provider.generateResponse = async (opts) => {
        capturedOpts = opts;
        capturedUserMsg = opts.messages?.[0]?.content || '';
        return { text: 'The heavy door swings open...' };
      };
      const contextBuilder = new CharacterContextBuilder();
      const responseService = new CharacterResponseService({ provider, contextBuilder });
      narrator = new SceneNarrator({ responseService, provider });
    });

    it('should NOT contain "Write a brief atmospheric opening" in user message', async () => {
      await narrator.narrateSceneOpening({
        worldContext: makeWorldContext(),
        participantNames: ['Mira', 'Fen'],
        playerName: 'Steven',
      });

      expect(capturedUserMsg).not.toMatch(/write a brief atmospheric opening/i);
    });

    it('should contain storytelling framing for scene opening', async () => {
      await narrator.narrateSceneOpening({
        worldContext: makeWorldContext(),
        participantNames: ['Mira', 'Fen'],
        playerName: 'Steven',
      });

      // Opening should tell the LLM to set the stage as a storyteller
      expect(capturedUserMsg).toMatch(/story|scene|stage|walk|enter|arriv/i);
    });

    it('should accept npcInnerStates and pass them to system prompt', async () => {
      let capturedSystemPrompt = null;
      const provider = new MockProvider();
      provider.generateResponse = async (opts) => {
        capturedSystemPrompt = opts.systemPrompt;
        capturedUserMsg = opts.messages?.[0]?.content || '';
        return { text: 'The door swings open...' };
      };
      const contextBuilder = new CharacterContextBuilder();
      const responseService = new CharacterResponseService({ provider, contextBuilder });
      const narr = new SceneNarrator({ responseService, provider });

      await narr.narrateSceneOpening({
        worldContext: makeWorldContext(),
        participantNames: ['Mira', 'Fen'],
        playerName: 'Steven',
        npcInnerStates: [
          { displayName: 'Mira', mood: 'busy but cheerful', consciousWant: 'Keep the bar running' },
          { displayName: 'Fen', mood: 'watchful', consciousWant: 'Stay unnoticed' },
        ],
      });

      // Inner states should appear in system prompt (DM omniscience)
      expect(capturedSystemPrompt).toContain('busy but cheerful');
      expect(capturedSystemPrompt).toContain('watchful');
    });

    it('should use maxTokens >= 300 for scene opening', async () => {
      let capturedMaxTokens = null;
      const provider = new MockProvider();
      provider.generateResponse = async (opts) => {
        capturedMaxTokens = opts.maxTokens;
        return { text: 'The heavy door swings open...' };
      };
      const contextBuilder = new CharacterContextBuilder();
      const responseService = new CharacterResponseService({ provider, contextBuilder });
      const narr = new SceneNarrator({ responseService, provider });

      await narr.narrateSceneOpening({
        worldContext: makeWorldContext(),
        participantNames: ['Mira', 'Fen'],
        playerName: 'Steven',
      });

      expect(capturedMaxTokens).toBeGreaterThanOrEqual(300);
    });
  });

  describe('storytelling reframe — SceneEngine integration', () => {
    // These test that SceneEngine calls narrateSceneOpening and passes all states

    it('should call narrateSceneOpening on first advanceNpcTurns call', async () => {
      let openingCalled = false;
      let batchCalled = false;
      const mockNarrator = {
        narrateSceneOpening: async () => {
          openingCalled = true;
          return { narration: 'The tavern door swings open...', source: 'llm' };
        },
        narrateNpcBatch: async () => {
          batchCalled = true;
          return { narration: 'She nods.', source: 'llm' };
        },
      };

      const provider = new MockProvider();
      const contextBuilder = new CharacterContextBuilder();
      const responseService = new CharacterResponseService({ provider, contextBuilder });

      const innerEngine = new SceneEngine({
        encounterMemory: new EncounterMemoryService(),
        responseService,
        personalityLookup: () => makePersonality('mira', 'Mira', 16),
        runtimeContext: new NpcRuntimeContext(),
        evolutionService: new PersonalityEvolutionService(),
        sceneNarrator: mockNarrator,
      });

      // NPC goes first (high CHA), player second
      const scene = innerEngine.createScene({
        participants: [
          { id: 'player_1', name: 'Kael', chaMod: -5, isPlayer: true },
          { id: 'npc_mira', name: 'Mira', chaMod: 100, isPlayer: false, templateKey: 'mira' },
        ],
      });
      innerEngine.startScene(scene.id);

      await innerEngine.advanceNpcTurns(scene.id);

      expect(openingCalled).toBe(true);
    });

    it('should NOT call narrateSceneOpening on second advanceNpcTurns call', async () => {
      let openingCallCount = 0;
      const mockNarrator = {
        narrateSceneOpening: async () => {
          openingCallCount++;
          return { narration: 'You enter...', source: 'llm' };
        },
        narrateNpcBatch: async () => {
          return { narration: 'She nods.', source: 'llm' };
        },
      };

      const provider = new MockProvider();
      const contextBuilder = new CharacterContextBuilder();
      const responseService = new CharacterResponseService({ provider, contextBuilder });

      const innerEngine = new SceneEngine({
        encounterMemory: new EncounterMemoryService(),
        responseService,
        personalityLookup: () => makePersonality('mira', 'Mira', 16),
        runtimeContext: new NpcRuntimeContext(),
        evolutionService: new PersonalityEvolutionService(),
        sceneNarrator: mockNarrator,
      });

      const scene = innerEngine.createScene({
        participants: [
          { id: 'player_1', name: 'Kael', chaMod: -5, isPlayer: true },
          { id: 'npc_mira', name: 'Mira', chaMod: 100, isPlayer: false, templateKey: 'mira' },
        ],
      });
      innerEngine.startScene(scene.id);

      // First call — should trigger opening
      await innerEngine.advanceNpcTurns(scene.id);
      // Player acts
      await innerEngine.submitAction(scene.id, 'player_1', { type: 'speech', content: 'Hello.' });

      // opening should only have been called once
      expect(openingCallCount).toBe(1);
    });

    it('should include scene opening narration in transcript', async () => {
      const mockNarrator = {
        narrateSceneOpening: async () => {
          return { narration: 'The oak door groans open. Warm light spills across the threshold.', source: 'llm' };
        },
        narrateNpcBatch: async () => {
          return { narration: 'She nods.', source: 'llm' };
        },
      };

      const provider = new MockProvider();
      const contextBuilder = new CharacterContextBuilder();
      const responseService = new CharacterResponseService({ provider, contextBuilder });

      const innerEngine = new SceneEngine({
        encounterMemory: new EncounterMemoryService(),
        responseService,
        personalityLookup: () => makePersonality('mira', 'Mira', 16),
        runtimeContext: new NpcRuntimeContext(),
        evolutionService: new PersonalityEvolutionService(),
        sceneNarrator: mockNarrator,
      });

      const scene = innerEngine.createScene({
        participants: [
          { id: 'player_1', name: 'Kael', chaMod: -5, isPlayer: true },
          { id: 'npc_mira', name: 'Mira', chaMod: 100, isPlayer: false, templateKey: 'mira' },
        ],
      });
      innerEngine.startScene(scene.id);

      const result = await innerEngine.advanceNpcTurns(scene.id);
      const transcript = result.sceneState.transcript;

      // First entry should be the DM opening narration
      const openingEntry = transcript.find(e => e.participantId === 'dm' && e.content.includes('oak door'));
      expect(openingEntry).toBeDefined();
      expect(openingEntry.type).toBe('narration');
    });

    it('should pass ALL participant inner states to narrateNpcBatch, not just actors', async () => {
      let capturedBatchArgs = null;
      const mockNarrator = {
        narrateSceneOpening: async () => {
          return { narration: 'You enter the tavern.', source: 'llm' };
        },
        narrateNpcBatch: async (args) => {
          capturedBatchArgs = args;
          return { narration: 'She nods.', source: 'llm' };
        },
      };

      const personalityMap = {
        mira: makePersonality('mira', 'Mira', 16),
        fen: makePersonality('fen', 'Fen', 10),
      };

      const provider = new MockProvider();
      const contextBuilder = new CharacterContextBuilder();
      const responseService = new CharacterResponseService({ provider, contextBuilder });

      const innerEngine = new SceneEngine({
        encounterMemory: new EncounterMemoryService(),
        responseService,
        personalityLookup: (key) => personalityMap[key] || null,
        runtimeContext: new NpcRuntimeContext(),
        evolutionService: new PersonalityEvolutionService(),
        sceneNarrator: mockNarrator,
      });

      // Player goes first so both NPCs act after
      // But one NPC might observe/pass — we still want their inner state
      const scene = innerEngine.createScene({
        participants: [
          { id: 'player_1', name: 'Kael', chaMod: 100, isPlayer: true },
          { id: 'npc_mira', name: 'Mira', chaMod: 2, isPlayer: false, templateKey: 'mira' },
          { id: 'npc_fen', name: 'Fen', chaMod: 1, isPlayer: false, templateKey: 'fen' },
        ],
      });
      innerEngine.startScene(scene.id);

      await innerEngine.submitAction(scene.id, 'player_1', {
        type: 'speech', content: 'Good evening.',
      });

      expect(capturedBatchArgs).toBeDefined();
      expect(capturedBatchArgs.npcInnerStates).toBeDefined();
      // Should have BOTH NPCs, not just actors
      expect(capturedBatchArgs.npcInnerStates.length).toBeGreaterThanOrEqual(2);

      const names = capturedBatchArgs.npcInnerStates.map(s => s.displayName);
      expect(names).toContain('Mira');
      expect(names).toContain('Fen');
    });

    it('should pass ALL participant inner states to narrateSceneOpening', async () => {
      let capturedOpeningArgs = null;
      const mockNarrator = {
        narrateSceneOpening: async (args) => {
          capturedOpeningArgs = args;
          return { narration: 'The tavern is warm.', source: 'llm' };
        },
        narrateNpcBatch: async () => {
          return { narration: 'She nods.', source: 'llm' };
        },
      };

      const personalityMap = {
        mira: makePersonality('mira', 'Mira', 16),
        fen: makePersonality('fen', 'Fen', 10),
      };

      const provider = new MockProvider();
      const contextBuilder = new CharacterContextBuilder();
      const responseService = new CharacterResponseService({ provider, contextBuilder });

      const innerEngine = new SceneEngine({
        encounterMemory: new EncounterMemoryService(),
        responseService,
        personalityLookup: (key) => personalityMap[key] || null,
        runtimeContext: new NpcRuntimeContext(),
        evolutionService: new PersonalityEvolutionService(),
        sceneNarrator: mockNarrator,
      });

      const scene = innerEngine.createScene({
        participants: [
          { id: 'player_1', name: 'Kael', chaMod: -5, isPlayer: true },
          { id: 'npc_mira', name: 'Mira', chaMod: 100, isPlayer: false, templateKey: 'mira' },
          { id: 'npc_fen', name: 'Fen', chaMod: 50, isPlayer: false, templateKey: 'fen' },
        ],
      });
      innerEngine.startScene(scene.id);

      await innerEngine.advanceNpcTurns(scene.id);

      expect(capturedOpeningArgs).toBeDefined();
      expect(capturedOpeningArgs.npcInnerStates).toBeDefined();
      expect(capturedOpeningArgs.npcInnerStates.length).toBeGreaterThanOrEqual(2);
    });
  });

  // ── narrateSceneOpening — resilience ────────────────────────────

  describe('narrateSceneOpening — resilience', () => {
    it('should return fallback narration when the system prompt builder throws', async () => {
      const { narrator } = makeNarrator('Good narration text');

      // Corrupt the internal prompt builder so it throws before the LLM call
      narrator.buildDmNarrationPrompt = () => { throw new Error('prompt builder exploded'); };

      const result = await narrator.narrateSceneOpening({
        worldContext: makeWorldContext(),
        participantNames: [{ realName: 'Mira', templateKey: 'mira_barrelbottom' }],
        playerName: 'Aldric',
      });

      // Should NOT reject — must return a non-empty fallback narration
      expect(result.narration).toBeTruthy();
      expect(result.source).toBe('fallback');
    });

    it('should include opening narration in transcript after advanceNpcTurns', async () => {
      const provider = new MockProvider();
      const contextBuilder = new CharacterContextBuilder();
      const responseService = new CharacterResponseService({ provider, contextBuilder });

      const openingNarration = 'The tavern smells of wood smoke and spilled ale.';
      const mockNarrator = {
        narrateSceneOpening: async () => ({ narration: openingNarration, source: 'llm' }),
        narrateNpcBatch: async () => ({ narration: 'She nods.', source: 'llm' }),
      };

      const personalityMap = {
        mira: makePersonality('mira', 'Mira', 16),
      };

      const engine = new SceneEngine({
        encounterMemory: new EncounterMemoryService(),
        responseService,
        personalityLookup: (key) => personalityMap[key] || null,
        runtimeContext: new NpcRuntimeContext(),
        evolutionService: new PersonalityEvolutionService(),
        sceneNarrator: mockNarrator,
      });

      const scene = engine.createScene({
        participants: [
          { id: 'player_1', name: 'Aldric', chaMod: 2, isPlayer: true },
          { id: 'npc_mira', name: 'Mira', chaMod: 8, isPlayer: false, templateKey: 'mira' },
        ],
      });
      engine.startScene(scene.id);

      const { sceneState } = await engine.advanceNpcTurns(scene.id);
      const json = sceneState.toJSON();

      // Transcript must contain the scene opening narration entry
      const openingEntry = json.transcript.find(
        e => e.participantId === 'dm' && e.type === 'narration' && e.content === openingNarration,
      );
      expect(openingEntry).toBeDefined();
      expect(json.transcript.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ── Narrator conversation history threading ─────────────────────

  describe('narrator conversation history', () => {
    it('should store conversation history after narrateSceneOpening', async () => {
      const { narrator } = makeNarrator('You push open the door. Warmth hits you.');

      await narrator.narrateSceneOpening({
        worldContext: makeWorldContext(),
        participantNames: ['Mira'],
        playerName: 'Aldric',
        sceneId: 'scene_1',
      });

      const history = narrator.getNarratorHistory('scene_1');
      expect(history).toBeDefined();
      expect(history.length).toBe(2); // user + assistant
      expect(history[0].role).toBe('user');
      expect(history[1].role).toBe('assistant');
      expect(history[1].content).toBe('You push open the door. Warmth hits you.');
    });

    it('should include prior history in messages for narrateNpcBatch after opening', async () => {
      let capturedMessages = null;
      const provider = new MockProvider();
      // First call: scene opening
      provider.setMockSequence([
        'You step inside a warm tavern.',
        'She looks up. "Welcome, love."',
      ]);
      // Capture the second call's messages
      const origGenerate = provider.generateResponse.bind(provider);
      let callCount = 0;
      provider.generateResponse = async (opts) => {
        callCount++;
        if (callCount === 2) {
          capturedMessages = opts.messages;
        }
        return origGenerate(opts);
      };
      const contextBuilder = new CharacterContextBuilder();
      const responseService = new CharacterResponseService({ provider, contextBuilder });
      const narrator = new SceneNarrator({ responseService, provider });

      // Call 1: scene opening
      await narrator.narrateSceneOpening({
        worldContext: makeWorldContext(),
        participantNames: ['Mira'],
        playerName: 'Aldric',
        sceneId: 'scene_1',
      });

      // Call 2: NPC batch narration
      await narrator.narrateNpcBatch({
        npcActions: [
          { participantId: 'npc_mira', participantName: 'Mira', type: 'speech', content: 'Welcome!' },
        ],
        worldContext: makeWorldContext(),
        round: 1,
        playerName: 'Aldric',
        sceneId: 'scene_1',
      });

      // The second call should include the opening exchange as prior history
      expect(capturedMessages).toBeDefined();
      expect(capturedMessages.length).toBe(3); // prior user + prior assistant + current user
      expect(capturedMessages[0].role).toBe('user');
      expect(capturedMessages[1].role).toBe('assistant');
      expect(capturedMessages[1].content).toBe('You step inside a warm tavern.');
      expect(capturedMessages[2].role).toBe('user');
    });

    it('should accumulate history across multiple narrateNpcBatch calls', async () => {
      let capturedMessages = null;
      const provider = new MockProvider();
      provider.setMockSequence([
        'You enter the tavern.',
        'The halfling nods at you.',
        'She pours you a drink.',
      ]);
      let callCount = 0;
      const origGenerate = provider.generateResponse.bind(provider);
      provider.generateResponse = async (opts) => {
        callCount++;
        if (callCount === 3) {
          capturedMessages = opts.messages;
        }
        return origGenerate(opts);
      };
      const contextBuilder = new CharacterContextBuilder();
      const responseService = new CharacterResponseService({ provider, contextBuilder });
      const narrator = new SceneNarrator({ responseService, provider });

      // Call 1: opening
      await narrator.narrateSceneOpening({
        worldContext: makeWorldContext(),
        participantNames: ['Mira'],
        playerName: 'Aldric',
        sceneId: 'scene_1',
      });

      // Call 2: first NPC batch
      await narrator.narrateNpcBatch({
        npcActions: [
          { participantId: 'npc_mira', participantName: 'Mira', type: 'speech', content: 'Hello!' },
        ],
        worldContext: makeWorldContext(),
        round: 1,
        playerName: 'Aldric',
        sceneId: 'scene_1',
      });

      // Call 3: second NPC batch
      await narrator.narrateNpcBatch({
        npcActions: [
          { participantId: 'npc_mira', participantName: 'Mira', type: 'act', content: '*pours ale*' },
        ],
        worldContext: makeWorldContext(),
        round: 2,
        playerName: 'Aldric',
        sceneId: 'scene_1',
      });

      // Third call should see all 4 prior messages + 1 current = 5
      expect(capturedMessages).toBeDefined();
      expect(capturedMessages.length).toBe(5);
      expect(capturedMessages[0].role).toBe('user');     // opening user
      expect(capturedMessages[1].role).toBe('assistant'); // opening response
      expect(capturedMessages[2].role).toBe('user');     // batch 1 user
      expect(capturedMessages[3].role).toBe('assistant'); // batch 1 response
      expect(capturedMessages[4].role).toBe('user');     // batch 2 user (current)
    });

    it('should keep separate histories for different scenes', async () => {
      const { narrator, provider } = makeNarrator();
      provider.setMockSequence(['Opening scene 1.', 'Opening scene 2.']);

      await narrator.narrateSceneOpening({
        worldContext: makeWorldContext(),
        participantNames: ['Mira'],
        playerName: 'Aldric',
        sceneId: 'scene_1',
      });

      await narrator.narrateSceneOpening({
        worldContext: makeWorldContext(),
        participantNames: ['Fen'],
        playerName: 'Aldric',
        sceneId: 'scene_2',
      });

      const history1 = narrator.getNarratorHistory('scene_1');
      const history2 = narrator.getNarratorHistory('scene_2');
      expect(history1.length).toBe(2);
      expect(history2.length).toBe(2);
      expect(history1[1].content).toBe('Opening scene 1.');
      expect(history2[1].content).toBe('Opening scene 2.');
    });

    it('should clear history for a specific scene via clearNarratorHistory', async () => {
      const { narrator } = makeNarrator('A cozy tavern.');

      await narrator.narrateSceneOpening({
        worldContext: makeWorldContext(),
        participantNames: ['Mira'],
        playerName: 'Aldric',
        sceneId: 'scene_1',
      });

      expect(narrator.getNarratorHistory('scene_1').length).toBe(2);

      narrator.clearNarratorHistory('scene_1');
      expect(narrator.getNarratorHistory('scene_1').length).toBe(0);
    });

    it('should include anti-repetition directive in follow-up narration when history exists', async () => {
      let capturedMessages = null;
      const provider = new MockProvider();
      provider.setMockSequence(['You step into the tavern.', 'She nods warmly.']);
      let callCount = 0;
      const origGenerate = provider.generateResponse.bind(provider);
      provider.generateResponse = async (opts) => {
        callCount++;
        if (callCount === 2) capturedMessages = opts.messages;
        return origGenerate(opts);
      };
      const contextBuilder = new CharacterContextBuilder();
      const responseService = new CharacterResponseService({ provider, contextBuilder });
      const narrator = new SceneNarrator({ responseService, provider });

      // Opening
      await narrator.narrateSceneOpening({
        worldContext: makeWorldContext(),
        participantNames: ['Mira'],
        playerName: 'Aldric',
        sceneId: 'scene_anti_rep',
      });

      // Follow-up batch
      await narrator.narrateNpcBatch({
        npcActions: [
          { participantId: 'npc_mira', participantName: 'Mira', type: 'speech', content: 'Welcome!' },
        ],
        worldContext: makeWorldContext(),
        round: 1,
        playerName: 'Aldric',
        sceneId: 'scene_anti_rep',
      });

      // The user message in the follow-up call should contain anti-repetition language
      const lastUserMsg = capturedMessages[capturedMessages.length - 1];
      expect(lastUserMsg.role).toBe('user');
      expect(lastUserMsg.content).toMatch(/do not|don't|never/i);
      expect(lastUserMsg.content).toMatch(/re-?describe|re-?set|repeat|scene.*(already|been)|setting.*(already|been)/i);
    });

    it('should NOT include anti-repetition directive when there is no prior history', async () => {
      let capturedMessages = null;
      const provider = new MockProvider();
      provider.setMockResponse('She waves.');
      const origGenerate = provider.generateResponse.bind(provider);
      provider.generateResponse = async (opts) => {
        capturedMessages = opts.messages;
        return origGenerate(opts);
      };
      const contextBuilder = new CharacterContextBuilder();
      const responseService = new CharacterResponseService({ provider, contextBuilder });
      const narrator = new SceneNarrator({ responseService, provider });

      // Batch with no prior opening and no sceneId
      await narrator.narrateNpcBatch({
        npcActions: [
          { participantId: 'npc_mira', participantName: 'Mira', type: 'speech', content: 'Hey!' },
        ],
        worldContext: makeWorldContext(),
        round: 1,
        playerName: 'Aldric',
      });

      const userMsg = capturedMessages[0].content;
      expect(userMsg).not.toMatch(/re-?describe|re-?set/i);
    });

    it('should work without sceneId (backward compat — no history threading)', async () => {
      let capturedMessages = null;
      const provider = new MockProvider();
      provider.setMockSequence(['You enter.', 'She nods.']);
      let callCount = 0;
      const origGenerate = provider.generateResponse.bind(provider);
      provider.generateResponse = async (opts) => {
        callCount++;
        if (callCount === 2) {
          capturedMessages = opts.messages;
        }
        return origGenerate(opts);
      };
      const contextBuilder = new CharacterContextBuilder();
      const responseService = new CharacterResponseService({ provider, contextBuilder });
      const narrator = new SceneNarrator({ responseService, provider });

      // Opening with no sceneId
      await narrator.narrateSceneOpening({
        worldContext: makeWorldContext(),
        participantNames: ['Mira'],
        playerName: 'Aldric',
      });

      // Batch with no sceneId
      await narrator.narrateNpcBatch({
        npcActions: [
          { participantId: 'npc_mira', participantName: 'Mira', type: 'speech', content: 'Hi!' },
        ],
        worldContext: makeWorldContext(),
        round: 1,
        playerName: 'Aldric',
      });

      // Without sceneId, should still work — just single message (no history)
      expect(capturedMessages).toBeDefined();
      expect(capturedMessages.length).toBe(1);
      expect(capturedMessages[0].role).toBe('user');
    });

    it('should not include history in messages on fallback narration', async () => {
      const provider = new MockProvider();
      provider.setMockSequence(['Opening narration.']);
      const contextBuilder = new CharacterContextBuilder();
      const responseService = new CharacterResponseService({ provider, contextBuilder });
      const narrator = new SceneNarrator({ responseService, provider });

      // Opening succeeds
      await narrator.narrateSceneOpening({
        worldContext: makeWorldContext(),
        participantNames: ['Mira'],
        playerName: 'Aldric',
        sceneId: 'scene_1',
      });

      // Force LLM failure for the next call
      provider.generateResponse = async () => { throw new Error('LLM down'); };

      const result = await narrator.narrateNpcBatch({
        npcActions: [
          { participantId: 'npc_mira', participantName: 'Mira', type: 'speech', content: 'Hello!' },
        ],
        worldContext: makeWorldContext(),
        round: 1,
        playerName: 'Aldric',
        sceneId: 'scene_1',
      });

      // Should fall back gracefully
      expect(result.source).toBe('fallback');
      // History should NOT include the failed call's assistant message
      const history = narrator.getNarratorHistory('scene_1');
      expect(history.length).toBe(2); // Only the opening exchange
    });
  });
});
