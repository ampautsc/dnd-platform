import { describe, it, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';

import { MemorySynthesizer } from '../../src/services/MemorySynthesizer.js';

/**
 * MemorySynthesizer — LLM-powered encounter memory extraction.
 *
 * Requirements:
 * 1. At encounter/scene end, ask the DM LLM to synthesize memories from each participant's perspective
 * 2. Return narrative summaries suitable for storage in RelationshipRepository
 * 3. Include recognition tier promotion suggestions based on interaction depth
 * 4. Include emotional valence shifts
 * 5. Work with both encounter transcripts and scene transcripts
 * 6. Graceful fallback when LLM is unavailable — extract basic facts from transcript
 * 7. Generate appearance-based display labels for first encounters
 */

function createMockProvider(response = 'Mock memory synthesis') {
  return {
    generateResponse: mock.fn().mockResolvedValue({ text: response }),
  };
}

function createMockProviderWithParser(parsedResult) {
  return {
    generateResponse: mock.fn().mockResolvedValue({
      text: JSON.stringify(parsedResult),
    }),
  };
}

const SAMPLE_TRANSCRIPT = [
  { sender: 'player', text: 'Hello there. What are you working on?' },
  { sender: 'old_mattock', senderName: 'Old Mattock', text: 'Nets. Always nets. The river don\'t care if you\'re tired.' },
  { sender: 'player', text: 'Do you know anything about the missing shipments?' },
  { sender: 'old_mattock', senderName: 'Old Mattock', text: 'I seen boats going upriver at night. No lanterns. That ain\'t normal.' },
  { sender: 'player', text: 'Thank you. I\'ll look into it. Can I buy you an ale?' },
  { sender: 'old_mattock', senderName: 'Old Mattock', text: 'Now you\'re speaking my language. Name\'s Mattock, by the way.' },
];

const SAMPLE_MULTI_NPC_TRANSCRIPT = [
  { sender: 'player', text: 'I need information about the merchant guild.' },
  { sender: 'mira_barrelbottom', senderName: 'Mira', text: 'The guild? They\'ve been buying up river rights. Ask Aldovar — he keeps records.' },
  { sender: 'aldovar_crennick', senderName: 'Aldovar', text: 'Indeed. I have documentation of their recent acquisitions. Troubling pattern.' },
  { sender: 'player', text: 'Can you show me those records, Aldovar?' },
  { sender: 'aldovar_crennick', senderName: 'Aldovar', text: 'Come to my study tomorrow. I\'ll have them prepared.' },
  { sender: 'mira_barrelbottom', senderName: 'Mira', text: 'Be careful with that lot. They don\'t like people asking questions.' },
];

const SAMPLE_PARTICIPANTS = [
  { id: 'player', name: 'Adventurer', isPlayer: true },
  { id: 'old_mattock', name: 'Old Mattock', isPlayer: false, templateKey: 'old_mattock' },
];

const SAMPLE_MULTI_PARTICIPANTS = [
  { id: 'player', name: 'Adventurer', isPlayer: true },
  { id: 'mira_barrelbottom', name: 'Mira', isPlayer: false, templateKey: 'mira_barrelbottom' },
  { id: 'aldovar_crennick', name: 'Aldovar', isPlayer: false, templateKey: 'aldovar_crennick' },
];

describe('MemorySynthesizer', () => {
  let synthesizer;
  let mockProvider;

  describe('synthesizeEncounterMemories', () => {
    it('should call the LLM to synthesize memories for each participant pair', async () => {
      const llmResult = {
        memories: [
          {
            subjectId: 'old_mattock',
            targetId: 'player',
            summary: 'A stranger came asking about the missing shipments. Bought me an ale — decent sort. Told them about the boats with no lanterns. Gave them my name.',
            significance: 'minor',
            emotionalShift: 0.2,
            tierPromotion: 'recognized',
          },
          {
            subjectId: 'player',
            targetId: 'old_mattock',
            summary: 'Met an old fisherman mending nets. He shared intel about unmarked boats going upriver at night. Seems trustworthy. His name is Mattock.',
            significance: 'minor',
            emotionalShift: 0.15,
            tierPromotion: 'acquaintance',
          },
        ],
      };

      mockProvider = createMockProviderWithParser(llmResult);
      synthesizer = new MemorySynthesizer({ provider: mockProvider });

      const result = await synthesizer.synthesizeEncounterMemories({
        transcript: SAMPLE_TRANSCRIPT,
        participants: SAMPLE_PARTICIPANTS,
      });

      assert.strictEqual(result.memories.length, 2);
      expect(result.memories[0]).toMatchObject({
        subjectId: 'old_mattock',
        targetId: 'player',
        summary: expect.stringContaining('stranger'),
        significance: 'minor',
        emotionalShift: expect.any(Number),
      });
      assert.strictEqual(result.memories[1].subjectId, 'player');
      assert.strictEqual(result.memories[1].targetId, 'old_mattock');
      assert.ok(mockProvider.generateResponse.mock.calls.length > 0);
    });

    it('should handle multi-NPC scenes with cross-relationships', async () => {
      const llmResult = {
        memories: [
          { subjectId: 'mira_barrelbottom', targetId: 'player', summary: 'Adventurer asked about the guild. Warned them to be careful.', significance: 'minor', emotionalShift: 0.1, tierPromotion: null },
          { subjectId: 'mira_barrelbottom', targetId: 'aldovar_crennick', summary: 'Aldovar offered to share his records. Good — someone needs to push back against the guild.', significance: 'trivial', emotionalShift: 0.05, tierPromotion: null },
          { subjectId: 'aldovar_crennick', targetId: 'player', summary: 'This adventurer seems genuinely interested in the guild problem. Agreed to show them records tomorrow.', significance: 'notable', emotionalShift: 0.3, tierPromotion: 'recognized' },
          { subjectId: 'aldovar_crennick', targetId: 'mira_barrelbottom', summary: 'Mira directed them to me. She trusts them — that counts for something.', significance: 'trivial', emotionalShift: 0.05, tierPromotion: null },
          { subjectId: 'player', targetId: 'mira_barrelbottom', summary: 'The halfling barkeep pointed me to Aldovar for guild records. Warned me about danger.', significance: 'minor', emotionalShift: 0.1, tierPromotion: null },
          { subjectId: 'player', targetId: 'aldovar_crennick', summary: 'An older scholar with guild records agreed to share them. Meeting at his study tomorrow.', significance: 'notable', emotionalShift: 0.2, tierPromotion: 'recognized' },
        ],
      };

      mockProvider = createMockProviderWithParser(llmResult);
      synthesizer = new MemorySynthesizer({ provider: mockProvider });

      const result = await synthesizer.synthesizeEncounterMemories({
        transcript: SAMPLE_MULTI_NPC_TRANSCRIPT,
        participants: SAMPLE_MULTI_PARTICIPANTS,
      });

      // 3 participants × 2 others each = 6 memory entries
      assert.strictEqual(result.memories.length, 6);

      // Aldovar's agreement should be captured
      const aldovarToPlayer = result.memories.find(
        m => m.subjectId === 'aldovar_crennick' && m.targetId === 'player'
      );
      assert.ok(aldovarToPlayer.summary.includes('records'));
      assert.strictEqual(aldovarToPlayer.significance, 'notable');
    });

    it('should include the system prompt instructing DM-style memory extraction', async () => {
      mockProvider = createMockProviderWithParser({ memories: [] });
      synthesizer = new MemorySynthesizer({ provider: mockProvider });

      await synthesizer.synthesizeEncounterMemories({
        transcript: SAMPLE_TRANSCRIPT,
        participants: SAMPLE_PARTICIPANTS,
      });

      const call = mockProvider.generateResponse.mock.calls[0];
      const systemPrompt = call[0]?.systemPrompt || call[0];
      assert.strictEqual(typeof systemPrompt, 'string');
      assert.ok(systemPrompt.includes('memory'));
    });

    it('should pass the full transcript to the LLM', async () => {
      mockProvider = createMockProviderWithParser({ memories: [] });
      synthesizer = new MemorySynthesizer({ provider: mockProvider });

      await synthesizer.synthesizeEncounterMemories({
        transcript: SAMPLE_TRANSCRIPT,
        participants: SAMPLE_PARTICIPANTS,
      });

      const call = mockProvider.generateResponse.mock.calls[0];
      // The transcript should appear somewhere in the prompt/messages
      const allText = JSON.stringify(call);
      assert.ok(allText.includes('Nets. Always nets'));
      assert.ok(allText.includes('boats going upriver'));
    });
  });

  // ── Fallback behavior ───────────────────────────────────────────

  describe('fallback when LLM fails', () => {
    it('should return basic factual memories when LLM throws', async () => {
      const failingProvider = {
        generateResponse: mock.fn().mockRejectedValue(new Error('API down')),
      };
      synthesizer = new MemorySynthesizer({ provider: failingProvider });

      const result = await synthesizer.synthesizeEncounterMemories({
        transcript: SAMPLE_TRANSCRIPT,
        participants: SAMPLE_PARTICIPANTS,
      });

      // Should still produce something — basic presence-based memories
      assert.notStrictEqual(result.memories, undefined);
      assert.ok(result.memories.length > 0);
      assert.strictEqual(result.fallback, true);
    });

    it('should return basic memories when LLM returns unparseable response', async () => {
      const badProvider = createMockProvider('This is not JSON at all.');
      synthesizer = new MemorySynthesizer({ provider: badProvider });

      const result = await synthesizer.synthesizeEncounterMemories({
        transcript: SAMPLE_TRANSCRIPT,
        participants: SAMPLE_PARTICIPANTS,
      });

      assert.ok(result.memories.length > 0);
      assert.strictEqual(result.fallback, true);
    });
  });

  // ── Display label generation ────────────────────────────────────

  describe('generateDisplayLabel', () => {
    it('should generate an appearance-based label from NPC data', () => {
      const npcData = {
        name: 'Old Mattock',
        race: 'Human',
        appearance: {
          build: 'Wiry and weathered, slightly stooped',
          distinguishingFeatures: ['Hands that never stop moving', 'Smells of fish'],
          typicalAttire: 'A patched canvas vest over a faded linen shirt',
          firstImpression: 'An old fisherman, practically part of the furniture',
        },
      };

      const label = MemorySynthesizer.generateDisplayLabel(npcData);
      assert.strictEqual(typeof label, 'string');
      assert.ok(label.length > 0);
      assert.ok(label.length < 100);
      // Should NOT contain the actual name
      assert.ok(!label.toLowerCase().includes('mattock'));
    });

    it('should use firstImpression when available', () => {
      const npcData = {
        name: 'Old Mattock',
        race: 'Human',
        appearance: {
          build: 'Wiry',
          distinguishingFeatures: ['Mends nets'],
          typicalAttire: 'Canvas vest',
          firstImpression: 'an old fisherman mending nets by the fire',
        },
      };

      const label = MemorySynthesizer.generateDisplayLabel(npcData);
      assert.strictEqual(label, 'an old fisherman mending nets by the fire');
    });

    it('should construct a label from build + attire when no firstImpression', () => {
      const npcData = {
        name: 'Brennan Holt',
        race: 'Human',
        appearance: {
          build: 'Solid and square',
          distinguishingFeatures: ['A permanent furrow between his eyebrows'],
          typicalAttire: 'a worn leather jerkin with a guard badge',
        },
      };

      const label = MemorySynthesizer.generateDisplayLabel(npcData);
      assert.strictEqual(typeof label, 'string');
      assert.ok(label.length > 5);
      assert.ok(!label.toLowerCase().includes('brennan'));
    });

    it('should fall back to race description when no appearance data', () => {
      const npcData = {
        name: 'Mystery Person',
        race: 'Elf',
      };

      const label = MemorySynthesizer.generateDisplayLabel(npcData);
      assert.ok(label.toLowerCase().includes('elf'));
      assert.ok(!label.toLowerCase().includes('mystery'));
    });
  });

  // ── Empty / edge cases ──────────────────────────────────────────

  describe('edge cases', () => {
    it('should handle empty transcript gracefully', async () => {
      mockProvider = createMockProviderWithParser({ memories: [] });
      synthesizer = new MemorySynthesizer({ provider: mockProvider });

      const result = await synthesizer.synthesizeEncounterMemories({
        transcript: [],
        participants: SAMPLE_PARTICIPANTS,
      });

      assert.deepStrictEqual(result.memories, []);
    });

    it('should handle single-participant scene (monologue)', async () => {
      mockProvider = createMockProviderWithParser({ memories: [] });
      synthesizer = new MemorySynthesizer({ provider: mockProvider });

      const result = await synthesizer.synthesizeEncounterMemories({
        transcript: [{ sender: 'player', text: 'Hello?' }],
        participants: [{ id: 'player', name: 'Adventurer', isPlayer: true }],
      });

      assert.deepStrictEqual(result.memories, []);
    });

    it('should require a provider', () => {
      assert.throws(() => new MemorySynthesizer({}));
    });
  });
});
