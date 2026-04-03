import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { InfoExtractionService } from '../../src/npc/InfoExtractionService.js';
import { MockProvider } from '../../src/llm/MockProvider.js';

/**
 * InfoExtractionService Requirements:
 *
 * 1. generateAppearance(personality) — produces a first-glance physical description
 *    a. Uses LLM provider to generate appearance
 *    b. Falls back to race-based description when provider fails
 *    c. Falls back when provider returns empty string
 *    d. Handles missing personality fields gracefully
 *
 * 2. extractRevealedInfo({ responseText, personality, currentRevealed, playerMessage })
 *    a. Returns { reveals: {} } for empty/null inputs
 *    b. Uses LLM to extract revealed fields from NPC response
 *    c. Parses structured JSON from LLM output
 *    d. Falls back to heuristic extraction when LLM fails
 *    e. Heuristic: detects voice from long first response
 *    f. Heuristic: detects backstory from memory keywords
 *    g. Heuristic: detects fears from fear keywords
 *    h. Filters out already-known array items
 *
 * 3. Internal helpers
 *    a. _fallbackAppearance — race lookup table
 *    b. _summarizeRevealed — produces prompt-ready text of known info
 *    c. _buildPersonalityReference — compact personality for prompt
 *    d. _parseExtractionResult — validates and cleans LLM JSON
 */

function makePersonality(overrides = {}) {
  return {
    name: 'Bree Millhaven',
    race: 'Halfling',
    personality: {
      voice: 'warm and direct, with a slight country lilt',
      alignment: 'neutral good',
      disposition: 'Cheerful but keeps her guard up around strangers.',
      backstory: 'Grew up on the family farm. Left home once and came back wiser.',
      motivations: ['Protect her village', 'Find her lost brother'],
      fears: ['Losing the farm', 'Being alone forever'],
      mannerisms: ['Fidgets with her apron strings', 'Laughs too loud'],
      speechPatterns: ['Uses farming metaphors', 'Ends questions with "right?"'],
    },
    ...overrides,
  };
}

describe('InfoExtractionService', () => {
  let service;
  let provider;

  beforeEach(() => {
    provider = new MockProvider();
    service = new InfoExtractionService({ provider });
  });

  // ── generateAppearance ──────────────────────────────────────────────────

  describe('generateAppearance', () => {
    it('should use LLM to generate appearance', async () => {
      provider.setMockResponse('A small halfling with bright green eyes and flour-dusted clothes.');
      const result = await service.generateAppearance(makePersonality());
      assert.strictEqual(result, 'A small halfling with bright green eyes and flour-dusted clothes.');
      assert.strictEqual(provider.getHistory().length, 1);
      const call = provider.getHistory()[0];
      assert.ok(call.systemPrompt.includes('physical appearance'));
      assert.ok(call.userPrompt.includes('Bree Millhaven'));
      assert.ok(call.userPrompt.includes('Halfling'));
    });

    it('should fall back to race description when LLM throws', async () => {
      provider.setMockResponse(null); // will cause provider to return null
      // Force an error by making generateResponse throw
      const broken = new InfoExtractionService({
        provider: { generateResponse: () => { throw new Error('down'); } },
      });
      const result = await broken.generateAppearance(makePersonality());
      assert.ok(result.includes('Bree Millhaven'));
      assert.ok(result.includes('halfling'));
    });

    it('should fall back when LLM returns empty string', async () => {
      provider.setMockResponse('   ');
      const result = await service.generateAppearance(makePersonality());
      assert.ok(result.includes('Bree Millhaven'));
      assert.ok(result.includes('halfling'));
    });

    it('should handle missing personality fields gracefully', async () => {
      provider.setMockResponse('A mysterious figure.');
      const result = await service.generateAppearance({ name: 'Unknown' });
      assert.strictEqual(result, 'A mysterious figure.');
    });

    it('should have race-based fallbacks for known races', () => {
      // Test the static fallback directly
      const result = service._fallbackAppearance('Test', 'Elf');
      assert.ok(result.includes('elf'));
      assert.ok(result.includes('Test'));
    });

    it('should handle unknown races in fallback', () => {
      const result = service._fallbackAppearance('Zyx', 'Kenku');
      assert.ok(result.includes('kenku'));
      assert.ok(result.includes('Zyx'));
    });
  });

  // ── extractRevealedInfo ─────────────────────────────────────────────────

  describe('extractRevealedInfo', () => {
    it('should return empty reveals for null responseText', async () => {
      const result = await service.extractRevealedInfo({
        responseText: null,
        personality: makePersonality(),
        currentRevealed: {},
        playerMessage: 'hello',
      });
      assert.deepStrictEqual(result, { reveals: {} });
    });

    it('should return empty reveals for null personality', async () => {
      const result = await service.extractRevealedInfo({
        responseText: 'Hi there',
        personality: null,
        currentRevealed: {},
        playerMessage: 'hello',
      });
      assert.deepStrictEqual(result, { reveals: {} });
    });

    it('should use LLM to extract revealed info and parse JSON result', async () => {
      provider.setMockResponse(JSON.stringify({
        reveals: {
          disposition: 'Friendly but cautious',
          backstory: null,
          voice: 'warm country accent',
          motivations: null,
          fears: null,
          mannerisms: null,
          speechPatterns: null,
        },
      }));

      const result = await service.extractRevealedInfo({
        responseText: 'Well hey there! Welcome to Millhaven. Don\'t get many visitors.',
        personality: makePersonality(),
        currentRevealed: {},
        playerMessage: 'We just arrived in town.',
      });

      assert.strictEqual(result.reveals.disposition, 'Friendly but cautious');
      assert.strictEqual(result.reveals.voice, 'warm country accent');
      assert.strictEqual(result.reveals.backstory, undefined);
    });

    it('should filter out already-known array items from extraction', async () => {
      provider.setMockResponse(JSON.stringify({
        reveals: {
          fears: ['Losing the farm', 'Being alone forever'],
        },
      }));

      const result = await service.extractRevealedInfo({
        responseText: 'I worry about... everything.',
        personality: makePersonality(),
        currentRevealed: { fears: ['Losing the farm'] },
        playerMessage: 'What are you afraid of?',
      });

      // Only the NEW item should be in reveals
      assert.deepStrictEqual(result.reveals.fears, ['Being alone forever']);
    });

    it('should fall back to heuristic extraction when LLM throws', async () => {
      const broken = new InfoExtractionService({
        provider: { generateResponse: () => { throw new Error('nope'); } },
      });

      const result = await broken.extractRevealedInfo({
        responseText: 'Well, I remember when I was young...',
        personality: makePersonality(),
        currentRevealed: {},
        playerMessage: 'Tell me about yourself.',
      });

      // Heuristic should detect backstory from "remember" keyword
      assert.notStrictEqual(result.reveals.backstory, undefined);
    });

    it('should handle malformed JSON from LLM gracefully', async () => {
      provider.setMockResponse('Not valid JSON at all');
      const result = await service.extractRevealedInfo({
        responseText: 'Some NPC speech.',
        personality: makePersonality(),
        currentRevealed: {},
        playerMessage: 'hi',
      });
      assert.deepStrictEqual(result, { reveals: {} });
    });
  });

  // ── Heuristic extraction ───────────────────────────────────────────────

  describe('_heuristicExtraction', () => {
    it('should detect voice from first long response', () => {
      const text = 'Well now, let me tell you a thing or two about this town. We have had some troubles lately, but nothing we cannot handle ourselves.';
      const result = service._heuristicExtraction(text, makePersonality(), {});
      assert.notStrictEqual(result.reveals.voice, undefined);
      assert.ok(result.reveals.voice.includes('warm'));
    });

    it('should not detect voice if already revealed', () => {
      const text = 'Well now, let me tell you about the troubles in town and how we plan to deal with them.';
      const result = service._heuristicExtraction(text, makePersonality(), {
        voice: 'already known',
      });
      assert.strictEqual(result.reveals.voice, undefined);
    });

    it('should detect backstory from memory keywords', () => {
      const text = 'I remember when the town was different, years ago...';
      const result = service._heuristicExtraction(text, makePersonality(), {});
      assert.notStrictEqual(result.reveals.backstory, undefined);
    });

    it('should not detect backstory if already revealed', () => {
      const text = 'I remember the old days well.';
      const result = service._heuristicExtraction(text, makePersonality(), {
        backstory: 'already known backstory',
      });
      assert.strictEqual(result.reveals.backstory, undefined);
    });

    it('should detect fears from fear keywords', () => {
      const text = 'I am afraid of what might come next.';
      const result = service._heuristicExtraction(text, makePersonality(), {});
      assert.notStrictEqual(result.reveals.fears, undefined);
      assert.strictEqual(result.reveals.fears.length, 1);
    });

    it('should reveal next unrevealed fear only', () => {
      const text = 'I am terrified of being alone.';
      const result = service._heuristicExtraction(text, makePersonality(), {
        fears: ['Losing the farm'],
      });
      assert.deepStrictEqual(result.reveals.fears, ['Being alone forever']);
    });
  });

  // ── _summarizeRevealed ─────────────────────────────────────────────────

  describe('_summarizeRevealed', () => {
    it('should return "Nothing known yet." for null/empty', () => {
      assert.strictEqual(service._summarizeRevealed(null), 'Nothing known yet.');
      assert.strictEqual(service._summarizeRevealed({}), 'Nothing known yet.');
    });

    it('should build multi-line summary of known info', () => {
      const revealed = {
        appearance: 'A small halfling.',
        disposition: 'Friendly.',
        backstory: 'Farm kid.',
        voice: 'Warm.',
        motivations: ['Protect village'],
        fears: ['Losing farm'],
        mannerisms: ['Fidgets'],
        speechPatterns: ['Farming metaphors'],
      };
      const result = service._summarizeRevealed(revealed);
      assert.ok(result.includes('Appearance: A small halfling.'));
      assert.ok(result.includes('Demeanor: Friendly.'));
      assert.ok(result.includes('Background: Farm kid.'));
      assert.ok(result.includes('Voice: Warm.'));
      assert.ok(result.includes('Motivations: Protect village'));
      assert.ok(result.includes('Fears: Losing farm'));
      assert.ok(result.includes('Mannerisms: Fidgets'));
      assert.ok(result.includes('Speech: Farming metaphors'));
    });
  });

  // ── _buildPersonalityReference ─────────────────────────────────────────

  describe('_buildPersonalityReference', () => {
    it('should include name, race, and personality fields', () => {
      const result = service._buildPersonalityReference(makePersonality());
      assert.ok(result.includes('Name: Bree Millhaven'));
      assert.ok(result.includes('Race: Halfling'));
      assert.ok(result.includes('Disposition:'));
      assert.ok(result.includes('Voice:'));
      assert.ok(result.includes('Backstory:'));
      assert.ok(result.includes('Motivations:'));
      assert.ok(result.includes('Fears:'));
      assert.ok(result.includes('Mannerisms:'));
      assert.ok(result.includes('Speech patterns:'));
    });

    it('should handle missing personality gracefully', () => {
      const result = service._buildPersonalityReference({ name: 'Ghost', race: 'Unknown' });
      assert.ok(result.includes('Name: Ghost'));
      assert.ok(result.includes('Race: Unknown'));
    });
  });

  // ── _parseExtractionResult ─────────────────────────────────────────────

  describe('_parseExtractionResult', () => {
    it('should parse valid JSON with mixed reveals', () => {
      const raw = JSON.stringify({
        reveals: {
          disposition: 'Gruff but kind',
          motivations: ['Save the town'],
          fears: null,
          voice: null,
        },
      });
      const result = service._parseExtractionResult(raw, makePersonality(), {});
      assert.strictEqual(result.reveals.disposition, 'Gruff but kind');
      assert.deepStrictEqual(result.reveals.motivations, ['Save the town']);
      assert.strictEqual(result.reveals.fears, undefined);
      assert.strictEqual(result.reveals.voice, undefined);
    });

    it('should extract JSON from text with surrounding noise', () => {
      const raw = 'Here is the analysis:\n' + JSON.stringify({
        reveals: { disposition: 'Stern' },
      }) + '\nDone.';
      const result = service._parseExtractionResult(raw, makePersonality(), {});
      assert.strictEqual(result.reveals.disposition, 'Stern');
    });

    it('should return empty reveals for invalid JSON', () => {
      const result = service._parseExtractionResult('not json', makePersonality(), {});
      assert.deepStrictEqual(result, { reveals: {} });
    });

    it('should return empty reveals when parsed object has no reveals key', () => {
      const raw = JSON.stringify({ info: 'wrong shape' });
      const result = service._parseExtractionResult(raw, makePersonality(), {});
      assert.deepStrictEqual(result, { reveals: {} });
    });

    it('should filter out already-known array items', () => {
      const raw = JSON.stringify({
        reveals: {
          mannerisms: ['Fidgets with her apron strings', 'Squints when thinking'],
        },
      });
      const result = service._parseExtractionResult(raw, makePersonality(), {
        mannerisms: ['Fidgets with her apron strings'],
      });
      assert.deepStrictEqual(result.reveals.mannerisms, ['Squints when thinking']);
    });

    it('should ignore unknown fields in reveals', () => {
      const raw = JSON.stringify({
        reveals: {
          disposition: 'Kind',
          unknownField: 'should be ignored',
        },
      });
      const result = service._parseExtractionResult(raw, makePersonality(), {});
      assert.strictEqual(result.reveals.disposition, 'Kind');
      assert.strictEqual(result.reveals.unknownField, undefined);
    });
  });
});
