/**
 * buildReactionPrompt — Sends the NPC's full identity, psychology, and role.
 * Strips only sections irrelevant to reaction decisions (appearance, show quotes,
 * fallback lines, character arc) to stay under Groq free tier's 6K token limit.
 * @module buildReactionPrompt
 */

// Keys to strip — they don't affect whether an NPC would react to speech
const STRIP_KEYS = new Set([
  'appearance',
  'canonicalShowLines',
  'directQuotes',
  'fallbackLines',
  'characterArc',
  'wakeUpQuestions',
]);

function stripForReaction(obj) {
  if (Array.isArray(obj)) return obj;
  if (obj === null || typeof obj !== 'object') return obj;
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (STRIP_KEYS.has(k)) continue;
    out[k] = (typeof v === 'object' && v !== null) ? stripForReaction(v) : v;
  }
  return out;
}

/**
 * @param {object} personality — Full NPC data from content/npcs
 * @param {object} [options={}]
 * @param {string} [options.speakerName='a stranger']
 * @param {string} [options.locationName='the tavern']
 * @returns {string} System prompt
 */
export function buildReactionPrompt(personality, options = {}) {
  if (!personality) throw new Error('personality is required');
  if (!personality.templateKey) throw new Error('personality.templateKey is required');

  const speakerName = options.speakerName || 'a stranger';
  const locationName = options.locationName || 'the tavern';
  const stripped = stripForReaction(personality);

  return `You are an NPC reaction evaluator. You respond ONLY with JSON.

You ARE the following character. This is your complete identity, psychology, history, and social context:

${JSON.stringify(stripped, null, 2)}

You are currently at ${locationName}.

TASK: ${speakerName} just said something in your presence. Would you — this specific person, with this history, this job, these relationships — respond?

Respond with ONLY a JSON object:
{"shouldReact": true, "reactionStrength": 5}
or
{"shouldReact": false, "reactionStrength": 1}

reactionStrength: 1 (barely noticed) to 5 (absolutely must respond).`;
}

/**
 * Extract the key personality fields used by buildReactionPrompt.
 * Useful for testing that all required fields are present.
 */
export function getPromptFields() {
  return [
    'name', 'race', 'gender',
    'personality.disposition', 'personality.voice',
    'personality.motivations', 'personality.fears',
    'personality.speechPatterns',
    'consciousnessContext.innerMonologue',
    'consciousnessContext.socialMask',
    'consciousnessContext.contradictions',
    'consciousnessContext.opinionsAbout',
    'consciousnessContext.consciousWant',
    'stats.charisma', 'stats.wisdom', 'stats.intelligence',
  ];
}
