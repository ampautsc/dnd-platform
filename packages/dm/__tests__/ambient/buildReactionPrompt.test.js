/**
 * buildReactionPrompt — unit tests.
 *
 * Requirements:
 * - Prompt includes NPC name, race, personality disposition
 * - Prompt includes motivations and fears
 * - Prompt includes inner monologue and social mask
 * - Prompt includes stats (CHA, WIS, INT)
 * - Prompt includes speech patterns
 * - Prompt includes task instruction with speaker name
 * - Prompt includes opinion about speaker when available
 * - Throws when personality is missing or has no templateKey
 * - Works with minimal NPC data (just required fields)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { buildReactionPrompt } from '../../src/ambient/buildReactionPrompt.js';

// A minimal personality for testing
const MINIMAL_NPC = {
  templateKey: 'test_npc',
  name: 'Test NPC',
  race: 'Human',
  gender: 'male',
  personality: {
    disposition: 'Grumpy but loyal',
    voice: 'Low and gravelly',
  },
  stats: { intelligence: 10, wisdom: 12, charisma: 14 },
};

// A rich personality (subset of samren_malondar)
const RICH_NPC = {
  templateKey: 'samren_malondar',
  name: 'Samren Malondar',
  race: 'Leonin',
  gender: 'male',
  personality: {
    disposition: 'Meets strangers as though he already likes them.',
    voice: 'warm, unhurried, slightly boyish',
    motivations: [
      'The bar first — not its profitability but its fullness',
      'Being remembered as a craftsman',
    ],
    fears: [
      'That Coach knew Samren loved him and never said it',
      'That he sold the bar once and could again',
    ],
    speechPatterns: [
      "Leads with 'hey' as a beat-filler",
      "Drops his voice when he wants to sound sincere",
      "Calls people 'pal' or 'buddy'",
    ],
  },
  consciousnessContext: {
    innerMonologue: 'Samren\'s internal voice is fast, associative, and runs on people.',
    socialMask: 'Former athlete, successful tavern owner, effortlessly charming.',
    contradictions: [
      'He performs dumb and is not',
      'His sobriety lives inside a tavern',
    ],
    consciousWant: 'To be the kind of man who stayed.',
    opinionsAbout: {
      norvin_stonebottom: 'Norvin has been on that stool since before I could keep the lights on.',
      carza_bitetongue: 'Carza has called me an idiot to my face no fewer than a thousand times.',
    },
  },
  stats: { intelligence: 10, wisdom: 9, charisma: 18 },
};

describe('buildReactionPrompt', () => {
  describe('required content', () => {
    it('should include NPC name and race', () => {
      const prompt = buildReactionPrompt(RICH_NPC);
      assert.ok(prompt.includes('Samren Malondar'));
      assert.ok(prompt.includes('Leonin'));
    });

    it('should include personality disposition', () => {
      const prompt = buildReactionPrompt(RICH_NPC);
      assert.ok(prompt.includes('Meets strangers as though he already likes them'));
    });

    it('should include voice', () => {
      const prompt = buildReactionPrompt(RICH_NPC);
      assert.ok(prompt.includes('warm, unhurried, slightly boyish'));
    });

    it('should include motivations', () => {
      const prompt = buildReactionPrompt(RICH_NPC);
      assert.ok(prompt.includes('The bar first'));
      assert.ok(prompt.includes('Being remembered as a craftsman'));
    });

    it('should include fears', () => {
      const prompt = buildReactionPrompt(RICH_NPC);
      assert.ok(prompt.includes('Coach knew Samren loved him'));
      assert.ok(prompt.includes('sold the bar once'));
    });

    it('should include inner monologue', () => {
      const prompt = buildReactionPrompt(RICH_NPC);
      assert.ok(prompt.includes('internal voice is fast, associative'));
    });

    it('should include social mask', () => {
      const prompt = buildReactionPrompt(RICH_NPC);
      assert.ok(prompt.includes('effortlessly charming'));
    });

    it('should include contradictions', () => {
      const prompt = buildReactionPrompt(RICH_NPC);
      assert.ok(prompt.includes('performs dumb and is not'));
      assert.ok(prompt.includes('sobriety lives inside a tavern'));
    });

    it('should include consciousWant', () => {
      const prompt = buildReactionPrompt(RICH_NPC);
      assert.ok(prompt.includes('kind of man who stayed'));
    });

    it('should include stats', () => {
      const prompt = buildReactionPrompt(RICH_NPC);
      assert.ok(prompt.includes('"charisma": 18'));
      assert.ok(prompt.includes('"wisdom": 9'));
      assert.ok(prompt.includes('"intelligence": 10'));
    });

    it('should include speech patterns (up to 3)', () => {
      const prompt = buildReactionPrompt(RICH_NPC);
      assert.ok(prompt.includes("'hey'"));
      assert.ok(prompt.includes('sincere'));
      assert.ok(prompt.includes("'pal'"));
    });

    it('should include task instruction', () => {
      const prompt = buildReactionPrompt(RICH_NPC);
      assert.ok(prompt.includes('TASK:'));
      assert.ok(prompt.includes('shouldReact'));
      assert.ok(prompt.includes('reactionStrength'));
      assert.ok(!prompt.includes('reactionType'));
    });
  });

  describe('speaker context', () => {
    it('should use default speaker name when not specified', () => {
      const prompt = buildReactionPrompt(RICH_NPC);
      assert.ok(prompt.includes('a stranger'));
    });

    it('should include speaker name when specified', () => {
      const prompt = buildReactionPrompt(RICH_NPC, { speakerName: 'Norvin' });
      assert.ok(prompt.includes('Norvin'));
    });

    it('should include opinion about speaker when known', () => {
      const prompt = buildReactionPrompt(RICH_NPC, { speakerName: 'Norvin' });
      assert.ok(prompt.includes('on that stool since before I could keep the lights on'));
    });

    it('should include opinions in JSON even when speaker is a stranger', () => {
      const prompt = buildReactionPrompt(RICH_NPC, { speakerName: 'a stranger' });
      // Full JSON always contains opinionsAbout
      assert.ok(prompt.includes('on that stool'));
    });

    it('should include location name when specified', () => {
      const prompt = buildReactionPrompt(RICH_NPC, { locationName: 'Bottoms Up tavern' });
      assert.ok(prompt.includes('Bottoms Up tavern'));
    });
  });

  describe('minimal NPC data', () => {
    it('should work with minimal personality fields', () => {
      const prompt = buildReactionPrompt(MINIMAL_NPC);
      assert.ok(prompt.includes('Test NPC'));
      assert.ok(prompt.includes('Grumpy but loyal'));
      assert.ok(prompt.includes('"charisma": 14'));
      assert.ok(prompt.includes('TASK:'));
    });

    it('should handle missing optional fields gracefully', () => {
      const bare = { templateKey: 'bare', name: 'Bare', race: 'Elf' };
      const prompt = buildReactionPrompt(bare);
      assert.ok(prompt.includes('Bare'));
      assert.ok(prompt.includes('Elf'));
      assert.ok(prompt.includes('TASK:'));
    });
  });

  describe('error handling', () => {
    it('should throw when personality is null', () => {
      assert.throws(() => buildReactionPrompt(null), /personality is required/);
    });

    it('should throw when personality is undefined', () => {
      assert.throws(() => buildReactionPrompt(undefined), /personality is required/);
    });

    it('should throw when templateKey is missing', () => {
      assert.throws(() => buildReactionPrompt({ name: 'Test' }), 'templateKey is required');
    });
  });

  describe('stripping', () => {
    it('should strip appearance and canonicalShowLines but keep personality', () => {
      const npcWithAppearance = {
        ...RICH_NPC,
        appearance: { build: 'Tall and broad' },
        personality: {
          ...RICH_NPC.personality,
          canonicalShowLines: ['[Sam] Hey there.'],
          directQuotes: ['Hey pal.'],
        },
      };
      const prompt = buildReactionPrompt(npcWithAppearance);
      assert.ok(!prompt.includes('Tall and broad'));
      assert.ok(!prompt.includes('[Sam] Hey there'));
      assert.ok(!prompt.includes('Hey pal'));
      assert.ok(prompt.includes('Meets strangers'));
    });
  });
});
