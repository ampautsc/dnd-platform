#!/usr/bin/env node
/**
 * test-autonomy-v2.mjs — Alternating user/assistant but NOT a conversation.
 *
 * user = "here's what's happening in your life right now. What do you want to do?"
 * assistant = what Samren chose to do
 * user = "here's what happened next. What do you want to do?"
 * assistant = what Samren chose to do next
 *
 * The player's speech is just one event in the scene update — not a conversation partner.
 */

import { readFileSync } from 'node:fs';
import { buildEncounterSystemPrompt } from '../packages/dm/src/npc/buildEncounterSystemPrompt.js';
import { LLMProvider } from '../packages/dm/src/llm/LLMProvider.js';

const samren = JSON.parse(readFileSync(
  new URL('../packages/content/src/npcs/data/samren_malondar.json', import.meta.url)
));
const bottoms = JSON.parse(readFileSync(
  new URL('../packages/content/src/locations/data/bottoms_up.json', import.meta.url)
));

const runtimeSnapshot = {
  currentLocation: { locationId: 'bottoms_up', areaWithin: 'The Bar' },
  currentActivity: 'wiping down the bar top and watching the room',
  currentMood: 'content, unhurried — a quiet evening so far',
  gameDay: 1,
  dayExperiences: [],
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

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('ERROR: ANTHROPIC_API_KEY environment variable is not set.');
  process.exit(1);
}

const provider = new LLMProvider();
const sep = '-'.repeat(80);

function printResponse(label, result, elapsed) {
  console.log(`\n${sep}`);
  console.log(`${label}  (${elapsed}ms)`);
  console.log(sep);
  console.log(result.text);
  const u = result.usage || {};
  console.log(`\nUSAGE: input=${u.input_tokens}  output=${u.output_tokens}  cache_create=${u.cache_creation_input_tokens}  cache_read=${u.cache_read_input_tokens}`);
  console.log(sep);
}

console.log('='.repeat(80));
console.log('AUTONOMY V2 — prompt/action alternation (not conversation)');
console.log('='.repeat(80));
console.log(`System prompt: ${systemPrompt.length.toLocaleString()} chars\n`);

// ═══════════════════════════════════════════════════════════════════════
// ROUND 1: Samren's day so far. A stranger walks in.
// ═══════════════════════════════════════════════════════════════════════

const prompt1 = `Samren, this is your ${ageInDays.toLocaleString()}-day-old life. You opened the tavern at the usual hour. Checked the kegs — two were low. Norvin arrived early, as always. You exchanged the usual greeting. You've been wiping down the bar top and watching the room for a while now. A hooded stranger just walked in from the rain, shook water off their cloak, and sat at the bar without saying a word.

What do you want to do?`;

const messages = [{ role: 'user', content: prompt1 }];

console.log('ROUND 1 prompt:');
console.log(prompt1);

const t1 = Date.now();
const r1 = await provider.generateResponse({
  model: 'claude-sonnet-4-6',
  systemPrompt,
  messages,
  npcId: 'samren_malondar',
  npcName: 'Samren Malondar',
  maxTokens: 512,
});
printResponse('ROUND 1 — Samren decides', r1, Date.now() - t1);

// ═══════════════════════════════════════════════════════════════════════
// ROUND 2: Samren did what he did. Now the stranger spoke, Norvin reacted.
// ═══════════════════════════════════════════════════════════════════════

// Samren's action becomes an assistant message (what he chose to do)
messages.push({ role: 'assistant', content: r1.text });

const prompt2 = `The stranger said "Barkeep! Pour me your finest ale!" Norvin muttered "Bit loud for this hour."

What do you want to do?`;

messages.push({ role: 'user', content: prompt2 });

console.log('\nROUND 2 prompt:');
console.log(prompt2);

const t2 = Date.now();
const r2 = await provider.generateResponse({
  model: 'claude-sonnet-4-6',
  systemPrompt,
  messages,
  npcId: 'samren_malondar',
  npcName: 'Samren Malondar',
  maxTokens: 512,
});
printResponse('ROUND 2 — Samren decides', r2, Date.now() - t2);

// ═══════════════════════════════════════════════════════════════════════
// ROUND 3: Nothing happened. Quiet bar. Does Samren act on his own?
// ═══════════════════════════════════════════════════════════════════════

messages.push({ role: 'assistant', content: r2.text });

const prompt3 = `A few minutes have passed. The bar is quiet. Nothing new has happened.

What do you want to do?`;

messages.push({ role: 'user', content: prompt3 });

console.log('\nROUND 3 prompt:');
console.log(prompt3);

const t3 = Date.now();
const r3 = await provider.generateResponse({
  model: 'claude-sonnet-4-6',
  systemPrompt,
  messages,
  npcId: 'samren_malondar',
  npcName: 'Samren Malondar',
  maxTokens: 512,
});
printResponse('ROUND 3 — Samren decides (nothing happened)', r3, Date.now() - t3);

// ═══════════════════════════════════════════════════════════════════════
// ROUND 4: A crash from the back room.
// ═══════════════════════════════════════════════════════════════════════

messages.push({ role: 'assistant', content: r3.text });

const prompt4 = `There's a loud crash from the back storeroom. Sounds like something heavy fell.

What do you want to do?`;

messages.push({ role: 'user', content: prompt4 });

console.log('\nROUND 4 prompt:');
console.log(prompt4);

const t4 = Date.now();
const r4 = await provider.generateResponse({
  model: 'claude-sonnet-4-6',
  systemPrompt,
  messages,
  npcId: 'samren_malondar',
  npcName: 'Samren Malondar',
  maxTokens: 512,
});
printResponse('ROUND 4 — Samren decides (crash in back)', r4, Date.now() - t4);

// ═══════════════════════════════════════════════════════════════════════
console.log('\n' + '='.repeat(80));
console.log('SUMMARY');
console.log('='.repeat(80));
for (const [i, r] of [[1,r1],[2,r2],[3,r3],[4,r4]]) {
  const u = r.usage || {};
  console.log(`Round ${i}: input=${u.input_tokens}  output=${u.output_tokens}  cache_create=${u.cache_creation_input_tokens}  cache_read=${u.cache_read_input_tokens}`);
}
console.log('\nFull messages array sent on round 4:');
console.log(JSON.stringify(messages.map(m => ({ role: m.role, content: m.content.slice(0, 80) + '...' })), null, 2));
console.log('\nFull logs: logs/llm-' + new Date().toISOString().slice(0, 10) + '.log');
