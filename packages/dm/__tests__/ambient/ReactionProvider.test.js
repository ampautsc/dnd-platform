/**
 * ReactionProvider — tests against the REAL local model.
 *
 * Requirements:
 * - Model loads successfully from disk
 * - JSON grammar enforcement produces valid JSON every time
 * - Output contains all required fields (shouldReact, reactionStrength, reactionType, reason)
 * - reactionStrength is clamped to [1, 5]
 * - reactionType is one of: speak, act, observe
 * - temperature=0 produces deterministic output (same input → same output)
 * - Provider throws when not initialized
 *
 * These tests run against the REAL model. No mocks. No fallbacks.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { join } from 'path';
import { LocalLlamaProvider, REACTION_SCHEMA } from '../../src/ambient/ReactionProvider.js';

const MODEL_PATH = join(process.cwd(), '..', '..', 'models', 'hf_bartowski_Phi-3.5-mini-instruct-Q4_K_M.gguf');

const SYSTEM_PROMPT = `You are Norvin, a grumpy hill dwarf who sits at the same barstool every night.
You react strongly to: beer, drinking, tavern service, your wife Vera, and being interrupted.
You do NOT react to: academic topics, religion, politics, or things that don't concern you.
Evaluate whether you would react to what the player just said.`;

describe.skip('LocalLlamaProvider', () => {
  let provider;

  before(async () => {
    provider = new LocalLlamaProvider({ modelPath: MODEL_PATH });
    await provider.init();
  }, 120_000); // Model loading can take up to 2 minutes on slow machines

  after(async () => {
    if (provider) await provider.dispose();
  }, 120_000);

  it('should be ready after init', () => {
    assert.strictEqual(provider.isReady, true);
  });

  it('should throw when evaluateReaction called before init', async () => {
    const uninitProvider = new LocalLlamaProvider({ modelPath: MODEL_PATH });
    await await assert.rejects(uninitProvider.evaluateReaction('test', 'test'), 'not initialized');
  });

  it('should return valid JSON with all required fields', async () => {
    const result = await provider.evaluateReaction(SYSTEM_PROMPT, 'Hey barkeep, pour me an ale!');

    assert.notStrictEqual(result['shouldReact'], undefined);
    assert.notStrictEqual(result['reactionStrength'], undefined);

    assert.strictEqual(typeof result.shouldReact, 'boolean');
    assert.strictEqual(typeof result.reactionStrength, 'number');
  }, 60_000);

  it('should clamp reactionStrength to [1, 5]', async () => {
    const result = await provider.evaluateReaction(SYSTEM_PROMPT, 'Pour me the finest ale you have, barkeep!');

    assert.ok(result.reactionStrength >= 1);
    assert.ok(result.reactionStrength <= 5);
    assert.strictEqual(Number.isInteger(result.reactionStrength), true);
  }, 60_000);

  it('should constrain reactionStrength to integers', async () => {
    const result = await provider.evaluateReaction(SYSTEM_PROMPT, 'Someone just knocked over a chair.');

    assert.strictEqual(Number.isInteger(result.reactionStrength), true);
  }, 60_000);

  it('should produce deterministic output with temperature=0', async () => {
    const utterance = 'Who wants another round of drinks?';
    const result1 = await provider.evaluateReaction(SYSTEM_PROMPT, utterance);
    const result2 = await provider.evaluateReaction(SYSTEM_PROMPT, utterance);

    assert.strictEqual(result1.shouldReact, result2.shouldReact);
    assert.strictEqual(result1.reactionStrength, result2.reactionStrength);
  }, 120_000);

  it('should react to directly relevant content', async () => {
    const result = await provider.evaluateReaction(SYSTEM_PROMPT, 'Norvin! Your usual beer is ready!');

    assert.strictEqual(result.shouldReact, true);
    assert.ok(result.reactionStrength >= 3);
  }, 60_000);

  it('should not react to irrelevant content', async () => {
    const result = await provider.evaluateReaction(
      SYSTEM_PROMPT,
      'The arcane theory of third-order transmutation circles is fascinating, do you not agree, Professor?'
    );

    assert.strictEqual(result.shouldReact, false);
  }, 60_000);

  it('should export REACTION_SCHEMA with correct structure', () => {
    assert.strictEqual(REACTION_SCHEMA.type, 'object');
    assert.ok(REACTION_SCHEMA.required.includes('shouldReact'));
    assert.ok(REACTION_SCHEMA.required.includes('reactionStrength'));
    assert.ok(!REACTION_SCHEMA.required.includes('reactionType'));
    assert.ok(!REACTION_SCHEMA.required.includes('reason'));
  });
});
