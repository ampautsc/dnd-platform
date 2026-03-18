import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SceneNarrator } from '../../src/services/SceneNarrator.js';
import { MockProvider } from '../../src/llm/MockProvider.js';
import { CharacterContextBuilder } from '../../src/npc/CharacterContextBuilder.js';
import { CharacterResponseService } from '../../src/npc/CharacterResponseService.js';
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
  });
});
