/**
 * ChapterGenerator
 *
 * Reads game log entries and uses an LLM provider to produce prose chapters
 * summarizing the adventure. Also supports short summary generation for
 * previews and tables of contents.
 */

const CHAPTER_SYSTEM_PROMPT = [
  'You are a skilled fantasy author writing a chapter of an ongoing D&D campaign story.',
  'Write vivid, engaging prose that captures the events described in the game log entries.',
  'Maintain a third-person past-tense narrative voice.',
  'Include dialogue, atmosphere, and character reactions where the log entries suggest them.',
  'Do not invent events that are not represented in the log. Embellish tone and description only.',
].join(' ');

const SUMMARY_SYSTEM_PROMPT = [
  'You are a skilled fantasy author.',
  'Write a single short paragraph that summarizes the following game log entries.',
  'Keep it concise — two to four sentences maximum.',
].join(' ');

const EMPTY_CHAPTER_PROSE = 'No significant events occurred during this chapter.';
const EMPTY_SUMMARY = 'No significant events to summarize.';

function serializeLogEntries(entries) {
  return entries.map((entry, i) => {
    const payloadStr = Object.keys(entry.payload || {}).length > 0
      ? ` | ${JSON.stringify(entry.payload)}`
      : '';
    return `[${i + 1}] ${entry.timestamp} — ${entry.type}${payloadStr}`;
  }).join('\n');
}

export function createChapterGenerator(options = {}) {
  const { provider } = options;
  const nowFn = options.nowFn || (() => new Date().toISOString());

  async function generateChapter({ logEntries, sessionId, chapterNumber }) {
    if (!logEntries || logEntries.length === 0) {
      return {
        sessionId,
        chapterNumber,
        prose: EMPTY_CHAPTER_PROSE,
        generatedAt: nowFn(),
      };
    }

    const serialized = serializeLogEntries(logEntries);
    const userPrompt = [
      `Session: ${sessionId}`,
      `Chapter: ${chapterNumber}`,
      '',
      'Game Log Entries:',
      serialized,
    ].join('\n');

    const response = await provider.generateResponse({
      systemPrompt: CHAPTER_SYSTEM_PROMPT,
      userPrompt,
    });

    return {
      sessionId,
      chapterNumber,
      prose: response.text,
      generatedAt: nowFn(),
    };
  }

  async function generateSummary({ logEntries }) {
    if (!logEntries || logEntries.length === 0) {
      return EMPTY_SUMMARY;
    }

    const serialized = serializeLogEntries(logEntries);
    const response = await provider.generateResponse({
      systemPrompt: SUMMARY_SYSTEM_PROMPT,
      userPrompt: serialized,
    });

    return response.text;
  }

  return {
    generateChapter,
    generateSummary,
  };
}
