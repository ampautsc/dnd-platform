#!/usr/bin/env node
/**
 * test-autonomy-format.mjs — Test the single-user-message autonomy format.
 *
 * Sends Samren's consciousness as the system prompt (cached), and a single
 * user message containing his continuous day narrative ending with
 * "What do you want to do?" — no conversation, no alternating roles.
 *
 * Then sends a second call where the adventurer has spoken, to confirm
 * Samren can choose to respond OR ignore OR do something else entirely.
 *
 * Usage:
 *   node scripts/test-autonomy-format.mjs
 *
 * Requires:
 *   ANTHROPIC_API_KEY environment variable
 */

import { readFileSync } from 'node:fs';
import { buildEncounterSystemPrompt } from '../packages/dm/src/npc/buildEncounterSystemPrompt.js';
import { LLMProvider } from '../packages/dm/src/llm/LLMProvider.js';

// ── Load NPC + Location data ────────────────────────────────────────────

const samren = JSON.parse(readFileSync(
  new URL('../packages/content/src/npcs/data/samren_malondar.json', import.meta.url)
));

const bottoms = JSON.parse(readFileSync(
  new URL('../packages/content/src/locations/data/bottoms_up.json', import.meta.url)
));

// ── Build the system prompt WITHOUT dayExperiences ──────────────────────
// dayExperiences go in the user message, not the system prompt, so the
// system prompt stays cacheable across rounds.

const runtimeSnapshot = {
  currentLocation: { locationId: 'bottoms_up', areaWithin: 'The Bar' },
  currentActivity: 'wiping down the bar top and watching the room',
  currentMood: 'content, unhurried — a quiet evening so far',
  gameDay: 1,
  dayExperiences: [],  // empty — day narrative goes in user message
};

const ageInDays = Math.floor(samren.age * 365.25);

const systemPrompt = buildEncounterSystemPrompt({
  personality: samren,
  location: bottoms,
  runtimeSnapshot,
  ageInDays,
  memorySummary: null,
  evolutionSummary: '',
  relationshipContext: '',
});

// ── Verify API key ──────────────────────────────────────────────────────

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('ERROR: ANTHROPIC_API_KEY environment variable is not set.');
  process.exit(1);
}

const provider = new LLMProvider();

// ── Helper: print response ──────────────────────────────────────────────

function printResponse(label, result, elapsed) {
  const sep = '-'.repeat(80);
  console.log(`\n${sep}`);
  console.log(`${label}  (${elapsed}ms)`);
  console.log(sep);
  console.log('');
  console.log('RESPONSE:');
  console.log(result.text);
  console.log('');
  const u = result.usage || {};
  console.log(`USAGE: input=${u.input_tokens}  output=${u.output_tokens}  cache_create=${u.cache_creation_input_tokens}  cache_read=${u.cache_read_input_tokens}`);
  console.log(sep);
}

// ═══════════════════════════════════════════════════════════════════════
// CALL 1: Samren's day so far, a stranger walks in. What does he do?
// ═══════════════════════════════════════════════════════════════════════

const dayNarrative1 = [
  `Samren, this is your ${ageInDays.toLocaleString()}-day-old life.`,
  `You opened the tavern at the usual hour. Checked the kegs — two were low.`,
  `Norvin arrived early, as always. You exchanged the usual greeting.`,
  `You've been wiping down the bar top and watching the room for a while now.`,
  `A hooded stranger just walked in from the rain, shook water off their cloak, and sat at the bar without saying a word.`,
  ``,
  `What do you want to do?`,
].join('  ');

console.log('='.repeat(80));
console.log('AUTONOMY FORMAT TEST — Samren Malondar');
console.log('='.repeat(80));
console.log(`System prompt: ${systemPrompt.length.toLocaleString()} chars`);
console.log('');
console.log('CALL 1 — User message (single continuous narrative):');
console.log(dayNarrative1);

const t1 = Date.now();
const result1 = await provider.generateResponse({
  model: 'claude-haiku-4-5-20251001',
  systemPrompt,
  messages: [{ role: 'user', content: dayNarrative1 }],
  npcId: 'samren_malondar',
  npcName: 'Samren Malondar',
  maxTokens: 512,
});
const elapsed1 = Date.now() - t1;

printResponse('CALL 1 — Stranger walks in', result1, elapsed1);

// ═══════════════════════════════════════════════════════════════════════
// CALL 2: Same day, but now the stranger has spoken AND Norvin reacted.
// Samren could respond to the stranger, respond to Norvin, ignore both,
// go check the kegs, or anything else.
// ═══════════════════════════════════════════════════════════════════════

const dayNarrative2 = [
  `Samren, this is your ${ageInDays.toLocaleString()}-day-old life.`,
  `You opened the tavern at the usual hour. Checked the kegs — two were low.`,
  `Norvin arrived early, as always. You exchanged the usual greeting.`,
  `You wiped down the bar top for a while. A hooded stranger walked in from the rain and sat at the bar.`,
  // Include what Samren did last round (his own prior action)
  `You ${result1.text.toLowerCase().startsWith('[') ? result1.text.replace(/^\[.*?\]\s*/, '') : result1.text}`,
  `The stranger just said "Barkeep! Pour me your finest ale!"`,
  `Norvin muttered "Bit loud for this hour."`,
  ``,
  `What do you want to do?`,
].join('  ');

console.log('\nCALL 2 — User message (day continues, stranger spoke, Norvin reacted):');
console.log(dayNarrative2);

const t2 = Date.now();
const result2 = await provider.generateResponse({
  model: 'claude-haiku-4-5-20251001',
  systemPrompt,
  messages: [{ role: 'user', content: dayNarrative2 }],
  npcId: 'samren_malondar',
  npcName: 'Samren Malondar',
  maxTokens: 512,
});
const elapsed2 = Date.now() - t2;

printResponse('CALL 2 — Stranger spoke, Norvin reacted', result2, elapsed2);

// ═══════════════════════════════════════════════════════════════════════
// CALL 3: Nothing happened. It's just quiet. Does Samren do something
// on his own, or does he just keep wiping?
// ═══════════════════════════════════════════════════════════════════════

const dayNarrative3 = [
  `Samren, this is your ${ageInDays.toLocaleString()}-day-old life.`,
  `You opened the tavern at the usual hour. Checked the kegs — two were low.`,
  `Norvin arrived early, as always. You exchanged the usual greeting.`,
  `You wiped down the bar top for a while. A hooded stranger walked in from the rain and sat at the bar.`,
  `You ${result1.text.toLowerCase().startsWith('[') ? result1.text.replace(/^\[.*?\]\s*/, '') : result1.text}`,
  `The stranger asked for your finest ale. Norvin muttered about it being too loud.`,
  `You ${result2.text.toLowerCase().startsWith('[') ? result2.text.replace(/^\[.*?\]\s*/, '') : result2.text}`,
  `A few minutes have passed. The bar is quiet. Nothing new has happened.`,
  ``,
  `What do you want to do?`,
].join('  ');

console.log('\nCALL 3 — User message (nothing happened, just quiet):');
console.log(dayNarrative3);

const t3 = Date.now();
const result3 = await provider.generateResponse({
  model: 'claude-haiku-4-5-20251001',
  systemPrompt,
  messages: [{ role: 'user', content: dayNarrative3 }],
  npcId: 'samren_malondar',
  npcName: 'Samren Malondar',
  maxTokens: 512,
});
const elapsed3 = Date.now() - t3;

printResponse('CALL 3 — Nothing happened, quiet bar', result3, elapsed3);

// ═══════════════════════════════════════════════════════════════════════
// Summary
// ═══════════════════════════════════════════════════════════════════════

console.log('\n' + '='.repeat(80));
console.log('SUMMARY');
console.log('='.repeat(80));
const u1 = result1.usage || {};
const u2 = result2.usage || {};
const u3 = result3.usage || {};
console.log(`Call 1: cache_create=${u1.cache_creation_input_tokens}  cache_read=${u1.cache_read_input_tokens}  input=${u1.input_tokens}  output=${u1.output_tokens}`);
console.log(`Call 2: cache_create=${u2.cache_creation_input_tokens}  cache_read=${u2.cache_read_input_tokens}  input=${u2.input_tokens}  output=${u2.output_tokens}`);
console.log(`Call 3: cache_create=${u3.cache_creation_input_tokens}  cache_read=${u3.cache_read_input_tokens}  input=${u3.input_tokens}  output=${u3.output_tokens}`);
console.log('');
console.log('Full logs: logs/llm-' + new Date().toISOString().slice(0, 10) + '.log');
