import { describe, it, expect, beforeEach } from 'vitest';
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
      expect(result).toBe('A small halfling with bright green eyes and flour-dusted clothes.');
      expect(provider.getHistory()).toHaveLength(1);
      const call = provider.getHistory()[0];
      expect(call.systemPrompt).toContain('physical appearance');
      expect(call.userPrompt).toContain('Bree Millhaven');
      expect(call.userPrompt).toContain('Halfling');
    });

    it('should fall back to race description when LLM throws', async () => {
      provider.setMockResponse(null); // will cause provider to return null
      // Force an error by making generateResponse throw
      const broken = new InfoExtractionService({
        provider: { generateResponse: () => { throw new Error('down'); } },
      });
      const result = await broken.generateAppearance(makePersonality());
      expect(result).toContain('Bree Millhaven');
      expect(result).toContain('halfling');
    });

    it('should fall back when LLM returns empty string', async () => {
      provider.setMockResponse('   ');
      const result = await service.generateAppearance(makePersonality());
      expect(result).toContain('Bree Millhaven');
      expect(result).toContain('halfling');
    });

    it('should handle missing personality fields gracefully', async () => {
      provider.setMockResponse('A mysterious figure.');
      const result = await service.generateAppearance({ name: 'Unknown' });
      expect(result).toBe('A mysterious figure.');
    });

    it('should have race-based fallbacks for known races', () => {
      // Test the static fallback directly
      const result = service._fallbackAppearance('Test', 'Elf');
      expect(result).toContain('elf');
      expect(result).toContain('Test');
    });

    it('should handle unknown races in fallback', () => {
      const result = service._fallbackAppearance('Zyx', 'Kenku');
      expect(result).toContain('kenku');
      expect(result).toContain('Zyx');
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
      expect(result).toEqual({ reveals: {} });
    });

    it('should return empty reveals for null personality', async () => {
      const result = await service.extractRevealedInfo({
        responseText: 'Hi there',
        personality: null,
        currentRevealed: {},
        playerMessage: 'hello',
      });
      expect(result).toEqual({ reveals: {} });
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

      expect(result.reveals.disposition).toBe('Friendly but cautious');
      expect(result.reveals.voice).toBe('warm country accent');
      expect(result.reveals.backstory).toBeUndefined();
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
      expect(result.reveals.fears).toEqual(['Being alone forever']);
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
      expect(result.reveals.backstory).toBeDefined();
    });

    it('should handle malformed JSON from LLM gracefully', async () => {
      provider.setMockResponse('Not valid JSON at all');
      const result = await service.extractRevealedInfo({
        responseText: 'Some NPC speech.',
        personality: makePersonality(),
        currentRevealed: {},
        playerMessage: 'hi',
      });
      expect(result).toEqual({ reveals: {} });
    });
  });

  // ── Heuristic extraction ───────────────────────────────────────────────

  describe('_heuristicExtraction', () => {
    it('should detect voice from first long response', () => {
      const text = 'Well now, let me tell you a thing or two about this town. We have had some troubles lately, but nothing we cannot handle ourselves.';
      const result = service._heuristicExtraction(text, makePersonality(), {});
      expect(result.reveals.voice).toBeDefined();
      expect(result.reveals.voice).toContain('warm');
    });

    it('should not detect voice if already revealed', () => {
      const text = 'Well now, let me tell you about the troubles in town and how we plan to deal with them.';
      const result = service._heuristicExtraction(text, makePersonality(), {
        voice: 'already known',
      });
      expect(result.reveals.voice).toBeUndefined();
    });

    it('should detect backstory from memory keywords', () => {
      const text = 'I remember when the town was different, years ago...';
      const result = service._heuristicExtraction(text, makePersonality(), {});
      expect(result.reveals.backstory).toBeDefined();
    });

    it('should not detect backstory if already revealed', () => {
      const text = 'I remember the old days well.';
      const result = service._heuristicExtraction(text, makePersonality(), {
        backstory: 'already known backstory',
      });
      expect(result.reveals.backstory).toBeUndefined();
    });

    it('should detect fears from fear keywords', () => {
      const text = 'I am afraid of what might come next.';
      const result = service._heuristicExtraction(text, makePersonality(), {});
      expect(result.reveals.fears).toBeDefined();
      expect(result.reveals.fears).toHaveLength(1);
    });

    it('should reveal next unrevealed fear only', () => {
      const text = 'I am terrified of being alone.';
      const result = service._heuristicExtraction(text, makePersonality(), {
        fears: ['Losing the farm'],
      });
      expect(result.reveals.fears).toEqual(['Being alone forever']);
    });
  });

  // ── _summarizeRevealed ─────────────────────────────────────────────────

  describe('_summarizeRevealed', () => {
    it('should return "Nothing known yet." for null/empty', () => {
      expect(service._summarizeRevealed(null)).toBe('Nothing known yet.');
      expect(service._summarizeRevealed({})).toBe('Nothing known yet.');
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
      expect(result).toContain('Appearance: A small halfling.');
      expect(result).toContain('Demeanor: Friendly.');
      expect(result).toContain('Background: Farm kid.');
      expect(result).toContain('Voice: Warm.');
      expect(result).toContain('Motivations: Protect village');
      expect(result).toContain('Fears: Losing farm');
      expect(result).toContain('Mannerisms: Fidgets');
      expect(result).toContain('Speech: Farming metaphors');
    });
  });

  // ── _buildPersonalityReference ─────────────────────────────────────────

  describe('_buildPersonalityReference', () => {
    it('should include name, race, and personality fields', () => {
      const result = service._buildPersonalityReference(makePersonality());
      expect(result).toContain('Name: Bree Millhaven');
      expect(result).toContain('Race: Halfling');
      expect(result).toContain('Disposition:');
      expect(result).toContain('Voice:');
      expect(result).toContain('Backstory:');
      expect(result).toContain('Motivations:');
      expect(result).toContain('Fears:');
      expect(result).toContain('Mannerisms:');
      expect(result).toContain('Speech patterns:');
    });

    it('should handle missing personality gracefully', () => {
      const result = service._buildPersonalityReference({ name: 'Ghost', race: 'Unknown' });
      expect(result).toContain('Name: Ghost');
      expect(result).toContain('Race: Unknown');
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
      expect(result.reveals.disposition).toBe('Gruff but kind');
      expect(result.reveals.motivations).toEqual(['Save the town']);
      expect(result.reveals.fears).toBeUndefined();
      expect(result.reveals.voice).toBeUndefined();
    });

    it('should extract JSON from text with surrounding noise', () => {
      const raw = 'Here is the analysis:\n' + JSON.stringify({
        reveals: { disposition: 'Stern' },
      }) + '\nDone.';
      const result = service._parseExtractionResult(raw, makePersonality(), {});
      expect(result.reveals.disposition).toBe('Stern');
    });

    it('should return empty reveals for invalid JSON', () => {
      const result = service._parseExtractionResult('not json', makePersonality(), {});
      expect(result).toEqual({ reveals: {} });
    });

    it('should return empty reveals when parsed object has no reveals key', () => {
      const raw = JSON.stringify({ info: 'wrong shape' });
      const result = service._parseExtractionResult(raw, makePersonality(), {});
      expect(result).toEqual({ reveals: {} });
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
      expect(result.reveals.mannerisms).toEqual(['Squints when thinking']);
    });

    it('should ignore unknown fields in reveals', () => {
      const raw = JSON.stringify({
        reveals: {
          disposition: 'Kind',
          unknownField: 'should be ignored',
        },
      });
      const result = service._parseExtractionResult(raw, makePersonality(), {});
      expect(result.reveals.disposition).toBe('Kind');
      expect(result.reveals.unknownField).toBeUndefined();
    });
  });
});
