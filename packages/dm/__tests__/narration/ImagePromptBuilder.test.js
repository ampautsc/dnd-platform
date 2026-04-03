/**
 * ImagePromptBuilder — Contract Tests
 *
 * Requirements:
 * 1. createImagePromptBuilder(options?) — factory returning { buildPrompt }.
 * 2. buildPrompt({ scene, characters, mood, action, environment }) → { prompt, style, negativePrompt }
 * 3. `prompt` is a descriptive string combining scene, characters, mood, action, and environment.
 * 4. `style` defaults to 'fantasy illustration' but is configurable via factory options.
 * 5. `negativePrompt` is a fixed string of common exclusions (modern tech, logos, text overlays).
 * 6. If scene is missing/empty, returns a generic fallback prompt.
 * 7. Characters array is serialized into the prompt (names + brief descriptors).
 * 8. Empty characters array is fine — prompt focuses on environment.
 * 9. All fields in the returned object are strings (never undefined).
 * 10. Prompt includes the mood/tone when provided.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createImagePromptBuilder } from '../../src/narration/ImagePromptBuilder.js';

describe('ImagePromptBuilder', () => {
  // ── buildPrompt basics ─────────────────────────────────────────────

  it('builds a prompt string from scene context', () => {
    const builder = createImagePromptBuilder();
    const result = builder.buildPrompt({
      scene: 'A dimly lit tavern with a roaring fireplace',
      characters: [{ name: 'Elara', descriptor: 'elven ranger' }],
      mood: 'tense',
      action: 'negotiating with the innkeeper',
      environment: 'medieval village',
    });

    assert.strictEqual(typeof result.prompt, 'string');
    assert.ok(result.prompt.includes('tavern'));
    assert.ok(result.prompt.includes('Elara'));
    assert.ok(result.prompt.includes('tense'));
    assert.ok(result.prompt.includes('negotiating'));
  });

  it('returns default fantasy illustration style', () => {
    const builder = createImagePromptBuilder();
    const result = builder.buildPrompt({ scene: 'A forest clearing' });

    assert.strictEqual(result.style, 'fantasy illustration');
  });

  it('accepts a custom default style via factory options', () => {
    const builder = createImagePromptBuilder({ defaultStyle: 'dark oil painting' });
    const result = builder.buildPrompt({ scene: 'A castle gate' });

    assert.strictEqual(result.style, 'dark oil painting');
  });

  it('includes a negative prompt string', () => {
    const builder = createImagePromptBuilder();
    const result = builder.buildPrompt({ scene: 'A mountain pass' });

    assert.strictEqual(typeof result.negativePrompt, 'string');
    assert.ok(result.negativePrompt.length > 0);
  });

  // ── edge cases ─────────────────────────────────────────────────────

  it('returns fallback prompt when scene is missing', () => {
    const builder = createImagePromptBuilder();
    const result = builder.buildPrompt({});

    assert.strictEqual(typeof result.prompt, 'string');
    assert.ok(result.prompt.length > 0);
    assert.strictEqual(result.style, 'fantasy illustration');
    assert.strictEqual(typeof result.negativePrompt, 'string');
  });

  it('returns fallback prompt when scene is empty string', () => {
    const builder = createImagePromptBuilder();
    const result = builder.buildPrompt({ scene: '' });

    assert.strictEqual(typeof result.prompt, 'string');
    assert.ok(result.prompt.length > 0);
  });

  it('handles empty characters array (environment-only prompt)', () => {
    const builder = createImagePromptBuilder();
    const result = builder.buildPrompt({
      scene: 'An ancient ruin overgrown with vines',
      characters: [],
      mood: 'mysterious',
      environment: 'jungle',
    });

    assert.ok(result.prompt.includes('ruin'));
    assert.ok(result.prompt.includes('mysterious'));
    assert.ok(!result.prompt.includes('undefined'));
  });

  it('serializes multiple characters into the prompt', () => {
    const builder = createImagePromptBuilder();
    const result = builder.buildPrompt({
      scene: 'A battlefield',
      characters: [
        { name: 'Thorin', descriptor: 'dwarven fighter' },
        { name: 'Lyra', descriptor: 'human cleric' },
      ],
    });

    assert.ok(result.prompt.includes('Thorin'));
    assert.ok(result.prompt.includes('Lyra'));
    assert.ok(result.prompt.includes('dwarven fighter'));
  });

  it('includes mood/tone in the prompt when provided', () => {
    const builder = createImagePromptBuilder();
    const result = builder.buildPrompt({
      scene: 'A throne room',
      mood: 'foreboding',
    });

    assert.ok(result.prompt.includes('foreboding'));
  });

  it('all returned fields are strings (never undefined)', () => {
    const builder = createImagePromptBuilder();
    const result = builder.buildPrompt({ scene: 'test' });

    assert.strictEqual(typeof result.prompt, 'string');
    assert.strictEqual(typeof result.style, 'string');
    assert.strictEqual(typeof result.negativePrompt, 'string');
  });
});
