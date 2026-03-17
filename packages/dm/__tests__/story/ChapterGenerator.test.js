/**
 * ChapterGenerator — Contract Tests
 *
 * Requirements:
 * 1. createChapterGenerator({ provider }) — factory accepting an LLM provider dependency.
 * 2. generateChapter({ logEntries, sessionId, chapterNumber }) → { sessionId, chapterNumber, prose, generatedAt }
 * 3. `logEntries` is an array of GameLog-shaped events: { type, payload, timestamp }.
 * 4. The provider is called with a system prompt instructing it to write prose and a user prompt
 *    containing the serialized log entries.
 * 5. If logEntries is empty, returns a chapter with a "no events" fallback prose (no LLM call).
 * 6. generatedAt is an ISO timestamp string.
 * 7. If provider.generateResponse rejects, the error propagates (caller handles).
 * 8. The provider request includes the sessionId and chapterNumber for context.
 * 9. generateSummary({ logEntries }) → short summary string via LLM (for previews/TOC).
 * 10. generateSummary with empty log returns a fallback string without calling provider.
 *
 * Dependency contracts:
 *  - provider.generateResponse({ systemPrompt, userPrompt, ...rest }) → { text }
 *  - logEntries: Array<{ type: string, payload: object, timestamp: string }>
 */
import { describe, it, expect, vi } from 'vitest';
import { createChapterGenerator } from '../../src/story/ChapterGenerator.js';

function makeMockProvider(responseText = 'Once upon a time…') {
  return {
    generateResponse: vi.fn().mockResolvedValue({ text: responseText }),
  };
}

function sampleLogEntries() {
  return [
    { type: 'session.started', payload: { sessionId: 's1' }, timestamp: '2026-03-16T10:00:00.000Z' },
    { type: 'scene.changed', payload: { scene: 'tavern' }, timestamp: '2026-03-16T10:01:00.000Z' },
    { type: 'action.resolved', payload: { action: 'persuade', result: 'success' }, timestamp: '2026-03-16T10:05:00.000Z' },
  ];
}

describe('ChapterGenerator', () => {
  // ── generateChapter ────────────────────────────────────────────────

  it('generates prose chapter from log entries via provider', async () => {
    const provider = makeMockProvider('The adventurers gathered in the dim tavern.');
    const gen = createChapterGenerator({ provider });

    const chapter = await gen.generateChapter({
      logEntries: sampleLogEntries(),
      sessionId: 's1',
      chapterNumber: 1,
    });

    expect(chapter.sessionId).toBe('s1');
    expect(chapter.chapterNumber).toBe(1);
    expect(chapter.prose).toBe('The adventurers gathered in the dim tavern.');
    expect(typeof chapter.generatedAt).toBe('string');
    expect(() => new Date(chapter.generatedAt)).not.toThrow();
  });

  it('passes sessionId and chapterNumber in the provider request', async () => {
    const provider = makeMockProvider('prose');
    const gen = createChapterGenerator({ provider });

    await gen.generateChapter({
      logEntries: sampleLogEntries(),
      sessionId: 's42',
      chapterNumber: 7,
    });

    const call = provider.generateResponse.mock.calls[0][0];
    expect(call.systemPrompt).toContain('chapter');
    expect(call.userPrompt).toContain('s42');
    expect(call.userPrompt).toContain('7');
  });

  it('includes serialized log entries in the user prompt', async () => {
    const provider = makeMockProvider('prose');
    const gen = createChapterGenerator({ provider });
    const entries = sampleLogEntries();

    await gen.generateChapter({ logEntries: entries, sessionId: 's1', chapterNumber: 1 });

    const call = provider.generateResponse.mock.calls[0][0];
    // Each event type should appear in the prompt
    expect(call.userPrompt).toContain('session.started');
    expect(call.userPrompt).toContain('scene.changed');
    expect(call.userPrompt).toContain('action.resolved');
  });

  it('returns fallback prose for empty log without calling provider', async () => {
    const provider = makeMockProvider();
    const gen = createChapterGenerator({ provider });

    const chapter = await gen.generateChapter({
      logEntries: [],
      sessionId: 's1',
      chapterNumber: 1,
    });

    expect(chapter.prose).toMatch(/no events|no significant events|nothing/i);
    expect(provider.generateResponse).not.toHaveBeenCalled();
  });

  it('propagates provider errors to the caller', async () => {
    const provider = {
      generateResponse: vi.fn().mockRejectedValue(new Error('LLM_UNAVAILABLE')),
    };
    const gen = createChapterGenerator({ provider });

    await expect(
      gen.generateChapter({ logEntries: sampleLogEntries(), sessionId: 's1', chapterNumber: 1 })
    ).rejects.toThrow('LLM_UNAVAILABLE');
  });

  it('uses injected nowFn for generatedAt timestamp', async () => {
    const provider = makeMockProvider('prose');
    const fixed = '2026-03-16T12:00:00.000Z';
    const gen = createChapterGenerator({ provider, nowFn: () => fixed });

    const chapter = await gen.generateChapter({
      logEntries: sampleLogEntries(),
      sessionId: 's1',
      chapterNumber: 1,
    });

    expect(chapter.generatedAt).toBe(fixed);
  });

  // ── generateSummary ────────────────────────────────────────────────

  it('generates a short summary string via provider', async () => {
    const provider = makeMockProvider('The party persuaded the innkeeper and moved on.');
    const gen = createChapterGenerator({ provider });

    const summary = await gen.generateSummary({ logEntries: sampleLogEntries() });

    expect(summary).toBe('The party persuaded the innkeeper and moved on.');
    expect(provider.generateResponse).toHaveBeenCalledTimes(1);
    const call = provider.generateResponse.mock.calls[0][0];
    expect(call.systemPrompt).toMatch(/summary|summarize/i);
  });

  it('returns fallback summary for empty log without calling provider', async () => {
    const provider = makeMockProvider();
    const gen = createChapterGenerator({ provider });

    const summary = await gen.generateSummary({ logEntries: [] });

    expect(summary).toMatch(/no events|nothing|no significant/i);
    expect(provider.generateResponse).not.toHaveBeenCalled();
  });

  // ── edge: single-event log ────────────────────────────────────────

  it('handles a single-event log gracefully', async () => {
    const provider = makeMockProvider('A brief beginning.');
    const gen = createChapterGenerator({ provider });

    const chapter = await gen.generateChapter({
      logEntries: [{ type: 'session.started', payload: {}, timestamp: '2026-03-16T10:00:00.000Z' }],
      sessionId: 's1',
      chapterNumber: 1,
    });

    expect(chapter.prose).toBe('A brief beginning.');
    expect(provider.generateResponse).toHaveBeenCalledTimes(1);
  });
});
