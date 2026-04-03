/**
 * GroqReactionProvider — unit tests with mocked OpenAI client.
 *
 * These tests run in CI without an API key. They verify:
 * - Constructor and init behavior
 * - evaluateReaction parses and validates JSON responses
 * - reactionStrength is clamped to [1, 5]
 * - Error handling for malformed responses, empty responses, missing fields
 * - dispose cleans up state
 */

import { describe, it, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';

import { GroqReactionProvider } from '../../src/ambient/GroqReactionProvider.js';

// ─── Mock factory ───────────────────────────────────────────────────────────

function mockCompletionResponse(content) {
  return {
    choices: [{ message: { content: JSON.stringify(content) } }],
  };
}

function mockRawResponse(raw) {
  return {
    choices: [{ message: { content: raw } }],
  };
}

function mockEmptyResponse() {
  return { choices: [{ message: { content: null } }] };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('GroqReactionProvider', () => {
  let provider;

  beforeEach(() => {
    provider = new GroqReactionProvider({ apiKey: 'test-key-fake' });
  });

  describe('constructor', () => {
    it('should use default model and settings', () => {
      assert.strictEqual(provider.model, 'llama-3.1-8b-instant');
      assert.strictEqual(provider.maxTokens, 30);
      assert.strictEqual(provider.temperature, 0);
    });

    it('should accept custom settings', () => {
      const custom = new GroqReactionProvider({
        apiKey: 'key',
        model: 'gemma2-9b-it',
        maxTokens: 50,
        temperature: 0.5,
        timeoutMs: 10000,
      });
      assert.strictEqual(custom.model, 'gemma2-9b-it');
      assert.strictEqual(custom.maxTokens, 50);
      assert.strictEqual(custom.temperature, 0.5);
      assert.strictEqual(custom.timeoutMs, 10000);
    });
  });

  describe('init', () => {
    it('should throw when no API key is available', async () => {
      const orig = process.env.GROQ_API_KEY;
      delete process.env.GROQ_API_KEY;
      try {
        const noKey = new GroqReactionProvider({ apiKey: '' });
        await await assert.rejects(noKey.init(), 'GROQ_API_KEY');
      } finally {
        if (orig) process.env.GROQ_API_KEY = orig;
      }
    });

    it('should set isReady after successful init', async () => {
      assert.strictEqual(provider.isReady, false);
      await provider.init();
      assert.strictEqual(provider.isReady, true);
    });

    it('should be idempotent', async () => {
      await provider.init();
      await provider.init(); // second call should not throw
      assert.strictEqual(provider.isReady, true);
    });
  });

  describe('evaluateReaction', () => {
    it('should throw when not initialized', async () => {
      await assert.rejects(
        () => provider.evaluateReaction('prompt', 'utterance'),
        /not initialized/
      );
    });

    it('should parse valid 2-field response', async () => {
      await provider.init();
      // Manual async stub
      const calls = [];
      provider._client = {
        chat: {
          completions: {
            create: async (...args) => {
              calls.push(args);
              return mockCompletionResponse({ shouldReact: true, reactionStrength: 4 });
            },
          },
        },
      };

      const result = await provider.evaluateReaction('You are a bartender.', 'Nice bar!');
      assert.deepStrictEqual(result, { shouldReact: true, reactionStrength: 4 });
    });

    it('should clamp reactionStrength above 5 to 5', async () => {
      await provider.init();
      provider._client = {
        chat: {
          completions: {
            create: async () => mockCompletionResponse({ shouldReact: true, reactionStrength: 10 })
          },
        },
      };

      const result = await provider.evaluateReaction('prompt', 'utterance');
      assert.strictEqual(result.reactionStrength, 5);
    });

    it('should clamp reactionStrength below 1 to 1', async () => {
      await provider.init();
      provider._client = {
        chat: {
          completions: {
            create: async () => mockCompletionResponse({ shouldReact: false, reactionStrength: -2 })
          },
        },
      };

      const result = await provider.evaluateReaction('prompt', 'utterance');
      assert.strictEqual(result.reactionStrength, 1);
    });

    it('should round fractional reactionStrength', async () => {
      await provider.init();
      provider._client = {
        chat: {
          completions: {
            create: async () => mockCompletionResponse({ shouldReact: true, reactionStrength: 3.7 })
          },
        },
      };

      const result = await provider.evaluateReaction('prompt', 'utterance');
      assert.strictEqual(result.reactionStrength, 4);
      assert.strictEqual(Number.isInteger(result.reactionStrength), true);
    });

    it('should throw on empty response', async () => {
      await provider.init();
      provider._client = {
        chat: {
          completions: {
            create: async () => mockEmptyResponse()
          },
        },
      };

      await assert.rejects(
        () => provider.evaluateReaction('prompt', 'utterance'),
        /empty response/
      );
    });

    it('should throw on invalid JSON', async () => {
      await provider.init();
      provider._client = {
        chat: {
          completions: {
            create: async () => mockRawResponse('not json at all')
          },
        },
      };

      await assert.rejects(
        () => provider.evaluateReaction('prompt', 'utterance')
      );
    });

    it('should throw when shouldReact is not a boolean', async () => {
      await provider.init();
      provider._client = {
        chat: {
          completions: {
            create: async () => mockCompletionResponse({ shouldReact: 'yes', reactionStrength: 3 })
          },
        },
      };

      await assert.rejects(
        () => provider.evaluateReaction('prompt', 'utterance'),
        /Invalid shouldReact/
      );
    });

    it('should throw when reactionStrength is not a number', async () => {
      await provider.init();
      provider._client = {
        chat: {
          completions: {
            create: async () => mockCompletionResponse({ shouldReact: true, reactionStrength: 'high' })
          },
        },
      };

      await assert.rejects(
        () => provider.evaluateReaction('prompt', 'utterance'),
        /Invalid reactionStrength/
      );
    });

    it('should strip extra fields from response', async () => {
      await provider.init();
      provider._client = {
        chat: {
          completions: {
            create: async () => mockCompletionResponse({
              shouldReact: false,
              reactionStrength: 1,
              reactionType: 'speak',
              reason: 'leftover field',
            })
          },
        },
      };

      const result = await provider.evaluateReaction('prompt', 'utterance');
      assert.deepStrictEqual(result, { shouldReact: false, reactionStrength: 1 });
      assert.ok(!Object.prototype.hasOwnProperty.call(result, 'reactionType'));
      assert.ok(!Object.prototype.hasOwnProperty.call(result, 'reason'));
    });
  });

  describe('dispose', () => {
    it('should reset state after dispose', async () => {
      await provider.init();
      assert.strictEqual(provider.isReady, true);
      await provider.dispose();
      assert.strictEqual(provider.isReady, false);
    });
  });

  describe('checkRateLimits', () => {
    it('should return free tier info', async () => {
      const limits = await provider.checkRateLimits();
      assert.strictEqual(limits.provider, 'groq');
      assert.strictEqual(limits.freeTier.rpm, 30);
      assert.strictEqual(limits.freeTier.rpd, 14400);
    });
  });
});
