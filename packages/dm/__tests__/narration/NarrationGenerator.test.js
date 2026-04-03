/**
 * NarrationGenerator — Contract Tests
 *
 * Requirements:
 * 1. createNarrationGenerator({ provider, imagePromptBuilder }) — factory with injected deps.
 * 2. generatePage({ scene, characters, mood, action, environment, sceneType }) →
 *    { text, imagePrompt, speechDirective, sceneType, generatedAt }
 * 3. `text` comes from the LLM provider (prose narration of the scene).
 * 4. `imagePrompt` comes from the injected imagePromptBuilder.buildPrompt().
 * 5. `speechDirective` is a structured object { voice, pace, tone } derived from mood/sceneType.
 * 6. `generatedAt` uses injected nowFn (deterministic).
 * 7. If provider rejects, error propagates.
 * 8. The LLM system prompt instructs the DM to narrate as a book page.
 * 9. The user prompt includes scene, characters, mood, action, environment.
 * 10. If scene is missing, returns fallback page with no LLM call.
 * 11. speechDirective.pace varies by sceneType (combat → fast, rest → slow, default → moderate).
 *
 * Dependency contracts:
 *  - provider.generateResponse({ systemPrompt, userPrompt }) → { text }
 *  - imagePromptBuilder.buildPrompt({ scene, characters, mood, action, environment }) → { prompt, style, negativePrompt }
 */
import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';

import { createNarrationGenerator } from '../../src/narration/NarrationGenerator.js';

function makeMockProvider(text = 'The torchlight flickered across weathered stone walls.') {
  return {
    generateResponse: mock.fn().mockResolvedValue({ text }),
  };
}

function makeMockImageBuilder(prompt = 'A dark dungeon corridor.') {
  return {
    buildPrompt: mock.fn().mockReturnValue({
      prompt,
      style: 'fantasy illustration',
      negativePrompt: 'modern technology',
    }),
  };
}

describe('NarrationGenerator', () => {
  // ── generatePage — happy path ──────────────────────────────────────

  it('generates a book page with text, imagePrompt, and speechDirective', async () => {
    const provider = makeMockProvider('The adventurers crept forward.');
    const imageBuilder = makeMockImageBuilder('A dungeon scene.');
    const gen = createNarrationGenerator({
      provider,
      imagePromptBuilder: imageBuilder,
      nowFn: () => '2026-03-16T12:00:00.000Z',
    });

    const page = await gen.generatePage({
      scene: 'A dark dungeon corridor',
      characters: [{ name: 'Elara', descriptor: 'elven ranger' }],
      mood: 'tense',
      action: 'sneaking past guards',
      environment: 'underground ruins',
      sceneType: 'exploration',
    });

    assert.strictEqual(page.text, 'The adventurers crept forward.');
    expect(page.imagePrompt).toEqual({
      prompt: 'A dungeon scene.',
      style: 'fantasy illustration',
      negativePrompt: 'modern technology',
    });
    assert.notStrictEqual(page.speechDirective, undefined);
    assert.strictEqual(page.sceneType, 'exploration');
    assert.strictEqual(page.generatedAt, '2026-03-16T12:00:00.000Z');
  });

  // ── provider interaction ───────────────────────────────────────────

  it('sends scene context in the LLM user prompt', async () => {
    const provider = makeMockProvider();
    const imageBuilder = makeMockImageBuilder();
    const gen = createNarrationGenerator({ provider, imagePromptBuilder: imageBuilder });

    await gen.generatePage({
      scene: 'A grand throne room',
      characters: [{ name: 'King Aldric', descriptor: 'human noble' }],
      mood: 'regal',
      action: 'addressing the court',
      environment: 'royal palace',
    });

    const call = provider.generateResponse.mock.calls[0][0];
    assert.match(call.systemPrompt, /narrat|book page|DM/i);
    assert.ok(call.userPrompt.includes('throne room'));
    assert.ok(call.userPrompt.includes('King Aldric'));
    assert.ok(call.userPrompt.includes('regal'));
  });

  // ── imagePromptBuilder delegation ──────────────────────────────────

  it('delegates to imagePromptBuilder with scene context', async () => {
    const provider = makeMockProvider();
    const imageBuilder = makeMockImageBuilder();
    const gen = createNarrationGenerator({ provider, imagePromptBuilder: imageBuilder });

    await gen.generatePage({
      scene: 'A misty swamp',
      characters: [],
      mood: 'eerie',
      action: 'wading through murky water',
      environment: 'wetlands',
    });

    expect(imageBuilder.buildPrompt).toHaveBeenCalledWith({
      scene: 'A misty swamp',
      characters: [],
      mood: 'eerie',
      action: 'wading through murky water',
      environment: 'wetlands',
    });
  });

  // ── speechDirective pacing ─────────────────────────────────────────

  it('sets fast pace for combat sceneType', async () => {
    const provider = makeMockProvider();
    const imageBuilder = makeMockImageBuilder();
    const gen = createNarrationGenerator({ provider, imagePromptBuilder: imageBuilder });

    const page = await gen.generatePage({
      scene: 'A battlefield',
      sceneType: 'combat',
    });

    assert.strictEqual(page.speechDirective.pace, 'fast');
  });

  it('sets slow pace for rest sceneType', async () => {
    const provider = makeMockProvider();
    const imageBuilder = makeMockImageBuilder();
    const gen = createNarrationGenerator({ provider, imagePromptBuilder: imageBuilder });

    const page = await gen.generatePage({
      scene: 'A campfire under the stars',
      sceneType: 'rest',
    });

    assert.strictEqual(page.speechDirective.pace, 'slow');
  });

  it('sets moderate pace for default/unknown sceneType', async () => {
    const provider = makeMockProvider();
    const imageBuilder = makeMockImageBuilder();
    const gen = createNarrationGenerator({ provider, imagePromptBuilder: imageBuilder });

    const page = await gen.generatePage({
      scene: 'A village market',
      sceneType: 'social',
    });

    assert.strictEqual(page.speechDirective.pace, 'moderate');
  });

  it('derives speech tone from mood', async () => {
    const provider = makeMockProvider();
    const imageBuilder = makeMockImageBuilder();
    const gen = createNarrationGenerator({ provider, imagePromptBuilder: imageBuilder });

    const page = await gen.generatePage({
      scene: 'A dark alley',
      mood: 'menacing',
    });

    assert.strictEqual(page.speechDirective.tone, 'menacing');
  });

  // ── fallback for missing scene ─────────────────────────────────────

  it('returns fallback page when scene is missing (no LLM call)', async () => {
    const provider = makeMockProvider();
    const imageBuilder = makeMockImageBuilder();
    const gen = createNarrationGenerator({ provider, imagePromptBuilder: imageBuilder });

    const page = await gen.generatePage({});

    assert.strictEqual(typeof page.text, 'string');
    assert.ok(page.text.length > 0);
    assert.strictEqual(provider.generateResponse.mock.calls.length, 0);
    assert.notStrictEqual(page.imagePrompt, undefined);
    assert.notStrictEqual(page.speechDirective, undefined);
  });

  // ── error propagation ──────────────────────────────────────────────

  it('propagates provider errors to the caller', async () => {
    const provider = {
      generateResponse: mock.fn().mockRejectedValue(new Error('LLM_TIMEOUT')),
    };
    const imageBuilder = makeMockImageBuilder();
    const gen = createNarrationGenerator({ provider, imagePromptBuilder: imageBuilder });

    await expect(
      gen.generatePage({ scene: 'A cave entrance' })
    ).rejects.toThrow('LLM_TIMEOUT');
  });

  // ── speechDirective voice default ──────────────────────────────────

  it('speechDirective always includes a voice field', async () => {
    const provider = makeMockProvider();
    const imageBuilder = makeMockImageBuilder();
    const gen = createNarrationGenerator({ provider, imagePromptBuilder: imageBuilder });

    const page = await gen.generatePage({ scene: 'test scene' });

    assert.strictEqual(typeof page.speechDirective.voice, 'string');
    assert.ok(page.speechDirective.voice.length > 0);
  });
});
