#!/usr/bin/env node
/**
 * test-samren-consciousness.mjs — NPC consciousness test with multi-block prompt caching.
 *
 * Tests the two-block caching strategy:
 *   Block 1: World knowledge XML (shared across ALL NPCs)
 *   Block 2: NPC consciousness prompt (per-NPC)
 *
 * Call 1 → creates cache (both blocks)
 * Call 2 → reads cache (same NPC, same world knowledge)
 *
 * Usage:
 *   node scripts/test-samren-consciousness.mjs
 *
 * Requires:
 *   ANTHROPIC_API_KEY environment variable
 */

import { readFileSync } from 'node:fs';
import { buildEncounterSystemPrompt } from '../packages/dm/src/npc/buildEncounterSystemPrompt.js';
import { worldKnowledge } from '../packages/dm/src/prompts/worldKnowledge.js';
import { LLMProvider } from '../packages/dm/src/llm/LLMProvider.js';

// ── Load NPC + Location data ────────────────────────────────────────────

const samren = JSON.parse(readFileSync(
  new URL('../packages/content/src/npcs/data/samren_malondar.json', import.meta.url)
));

const bottoms = JSON.parse(readFileSync(
  new URL('../packages/content/src/locations/data/bottoms_up.json', import.meta.url)
));

// ── Build the system prompt ─────────────────────────────────────────────

const runtimeSnapshot = {
  currentLocation: { locationId: 'bottoms_up', areaWithin: 'The Bar' },
  currentActivity: 'wiping down the bar top and watching the room',
  currentMood: 'content, unhurried — a quiet evening so far',
  gameDay: 1,
  dayExperiences: [
    { summary: 'Opened the tavern at the usual hour. Checked the kegs. Two were low.' },
    { summary: 'Norvin arrived early, as always. Exchanged the usual greeting.' },
  ],
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

// ── Token estimate ──────────────────────────────────────────────────────

const worldTokens = Math.ceil(worldKnowledge.length / 4);
const npcTokens = Math.ceil(systemPrompt.length / 4);
const totalTokens = worldTokens + npcTokens;

console.log('='.repeat(80));
console.log('SAMREN MALONDAR — MULTI-BLOCK CACHING TEST');
console.log('='.repeat(80));
console.log(`Block 1 (world knowledge):  ${worldKnowledge.length.toLocaleString()} chars  ~${worldTokens.toLocaleString()} tokens`);
console.log(`Block 2 (NPC consciousness): ${systemPrompt.length.toLocaleString()} chars  ~${npcTokens.toLocaleString()} tokens`);
console.log(`Total system prompt:        ${(worldKnowledge.length + systemPrompt.length).toLocaleString()} chars  ~${totalTokens.toLocaleString()} tokens`);
console.log(`Cache threshold:            1,024 tokens (Haiku 4.5)`);
console.log(`Block 1 cache eligible:     ${worldTokens > 1024 ? 'YES ✓' : 'NO ✗ (below 1,024)'}`);
console.log(`Block 1+2 cache eligible:   ${totalTokens > 1024 ? 'YES ✓' : 'NO ✗'}`);
console.log('');

// ── Verify API key ──────────────────────────────────────────────────────

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('ERROR: ANTHROPIC_API_KEY environment variable is not set.');
  process.exit(1);
}

const provider = new LLMProvider();

// ── Helper: print full response ─────────────────────────────────────────

function printResponse(label, result, elapsed) {
  const sep = '-'.repeat(80);
  console.log(`\n${sep}`);
  console.log(`${label}  (${elapsed}ms)`);
  console.log(sep);
  console.log('');
  console.log('RESPONSE TEXT:');
  console.log(result.text);
  console.log('');
  console.log('MODEL:', result.model);
  console.log('');
  console.log('USAGE:');
  const u = result.usage || {};
  console.log(`  input_tokens:                ${u.input_tokens ?? '—'}`);
  console.log(`  output_tokens:               ${u.output_tokens ?? '—'}`);
  console.log(`  cache_creation_input_tokens:  ${u.cache_creation_input_tokens ?? '—'}`);
  console.log(`  cache_read_input_tokens:      ${u.cache_read_input_tokens ?? '—'}`);
  console.log('');
  console.log('FULL RESPONSE OBJECT:');
  console.log(JSON.stringify(result, null, 2));
  console.log(sep);
}

// ── systemBlocks for multi-block caching ────────────────────────────────

const systemBlocks = [
  { text: worldKnowledge },   // Block 1: shared across ALL NPCs (cache breakpoint)
  { text: systemPrompt },      // Block 2: per-NPC consciousness (cache breakpoint)
];

// ── Call 1: First turn — should CREATE cache ────────────────────────────

const userPrompt1 = `Samren, this is your ${ageInDays.toLocaleString()}-day-old life.  You have just been wiping down the bar top.  A hooded stranger walks in from the rain, shakes water off their cloak, and sits at the bar without saying a word.  What do you do?`;

console.log('CALL 1: First turn (expect cache CREATION)');
console.log(`User prompt: ${userPrompt1}`);

const t1 = Date.now();
const result1 = await provider.generateResponse({
  model: 'claude-haiku-4-5-20251001',
  systemBlocks,
  userPrompt: userPrompt1,
  npcId: 'samren_malondar',
  npcName: 'Samren Malondar',
  maxTokens: 1024,
});
const elapsed1 = Date.now() - t1;

printResponse('CALL 1 RESULT — Cache Creation', result1, elapsed1);

// ── Call 2: Second turn — should READ from cache ────────────────────────

// Build a multi-turn conversation: the first exchange + a new player utterance
const messages2 = [
  { role: 'user', content: userPrompt1 },
  { role: 'assistant', content: result1.text },
  { role: 'user', content: 'The stranger pulls back their hood, revealing elven features. "I hear you used to throw javelin. That true?"' },
];

console.log('\nCALL 2: Second turn (expect cache READ — same system blocks)');

const t2 = Date.now();
const result2 = await provider.generateResponse({
  model: 'claude-haiku-4-5-20251001',
  systemBlocks,
  messages: messages2,
  npcId: 'samren_malondar',
  npcName: 'Samren Malondar',
  maxTokens: 1024,
});
const elapsed2 = Date.now() - t2;

printResponse('CALL 2 RESULT — Cache Read', result2, elapsed2);

// ── Summary ─────────────────────────────────────────────────────────────

console.log('\n' + '='.repeat(80));
console.log('CACHE SUMMARY');
console.log('='.repeat(80));
const u1 = result1.usage || {};
const u2 = result2.usage || {};
console.log(`Call 1: cache_creation=${u1.cache_creation_input_tokens ?? '—'}  cache_read=${u1.cache_read_input_tokens ?? '—'}  input=${u1.input_tokens ?? '—'}  output=${u1.output_tokens ?? '—'}  time=${elapsed1}ms`);
console.log(`Call 2: cache_creation=${u2.cache_creation_input_tokens ?? '—'}  cache_read=${u2.cache_read_input_tokens ?? '—'}  input=${u2.input_tokens ?? '—'}  output=${u2.output_tokens ?? '—'}  time=${elapsed2}ms`);

if ((u2.cache_read_input_tokens ?? 0) > 0) {
  console.log('\n✓ CACHE HIT CONFIRMED — system prompt was read from cache on second call');
} else {
  console.log('\n✗ NO CACHE HIT — check if system prompt exceeds 1,024 tokens');
}

console.log('\nFull logs written to: logs/llm-' + new Date().toISOString().slice(0, 10) + '.log');
