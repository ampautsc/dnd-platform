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
import { describe, it, expect } from 'vitest';
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

    expect(typeof result.prompt).toBe('string');
    expect(result.prompt).toContain('tavern');
    expect(result.prompt).toContain('Elara');
    expect(result.prompt).toContain('tense');
    expect(result.prompt).toContain('negotiating');
  });

  it('returns default fantasy illustration style', () => {
    const builder = createImagePromptBuilder();
    const result = builder.buildPrompt({ scene: 'A forest clearing' });

    expect(result.style).toBe('fantasy illustration');
  });

  it('accepts a custom default style via factory options', () => {
    const builder = createImagePromptBuilder({ defaultStyle: 'dark oil painting' });
    const result = builder.buildPrompt({ scene: 'A castle gate' });

    expect(result.style).toBe('dark oil painting');
  });

  it('includes a negative prompt string', () => {
    const builder = createImagePromptBuilder();
    const result = builder.buildPrompt({ scene: 'A mountain pass' });

    expect(typeof result.negativePrompt).toBe('string');
    expect(result.negativePrompt.length).toBeGreaterThan(0);
  });

  // ── edge cases ─────────────────────────────────────────────────────

  it('returns fallback prompt when scene is missing', () => {
    const builder = createImagePromptBuilder();
    const result = builder.buildPrompt({});

    expect(typeof result.prompt).toBe('string');
    expect(result.prompt.length).toBeGreaterThan(0);
    expect(result.style).toBe('fantasy illustration');
    expect(typeof result.negativePrompt).toBe('string');
  });

  it('returns fallback prompt when scene is empty string', () => {
    const builder = createImagePromptBuilder();
    const result = builder.buildPrompt({ scene: '' });

    expect(typeof result.prompt).toBe('string');
    expect(result.prompt.length).toBeGreaterThan(0);
  });

  it('handles empty characters array (environment-only prompt)', () => {
    const builder = createImagePromptBuilder();
    const result = builder.buildPrompt({
      scene: 'An ancient ruin overgrown with vines',
      characters: [],
      mood: 'mysterious',
      environment: 'jungle',
    });

    expect(result.prompt).toContain('ruin');
    expect(result.prompt).toContain('mysterious');
    expect(result.prompt).not.toContain('undefined');
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

    expect(result.prompt).toContain('Thorin');
    expect(result.prompt).toContain('Lyra');
    expect(result.prompt).toContain('dwarven fighter');
  });

  it('includes mood/tone in the prompt when provided', () => {
    const builder = createImagePromptBuilder();
    const result = builder.buildPrompt({
      scene: 'A throne room',
      mood: 'foreboding',
    });

    expect(result.prompt).toContain('foreboding');
  });

  it('all returned fields are strings (never undefined)', () => {
    const builder = createImagePromptBuilder();
    const result = builder.buildPrompt({ scene: 'test' });

    expect(typeof result.prompt).toBe('string');
    expect(typeof result.style).toBe('string');
    expect(typeof result.negativePrompt).toBe('string');
  });
});
