#!/usr/bin/env node
/**
 * test-autonomy-room.mjs — Does Samren know his own prices?
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

const ageInDays = Math.floor(samren.age * 365.25);

const systemPrompt = buildEncounterSystemPrompt({
  personality: samren,
  location: bottoms,
  runtimeSnapshot: {
    currentLocation: { locationId: 'bottoms_up', areaWithin: 'The Bar' },
    currentActivity: 'wiping down the bar top and watching the room',
    currentMood: 'content, unhurried — a quiet evening so far',
    gameDay: 1,
    dayExperiences: [],
  },
  ageInDays,
  memorySummary: null,
  evolutionSummary: '',
  relationshipContext: '',
});

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('ERROR: ANTHROPIC_API_KEY not set.');
  process.exit(1);
}

const provider = new LLMProvider();

const prompt = `Samren, this is your ${ageInDays.toLocaleString()}-day-old life. You opened the tavern at the usual hour. It's been a quiet evening. A traveler just walked up to the bar and asked "How much does it cost to get a sword sharpened around here?"

What do you want to do?`;

console.log('PROMPT:');
console.log(prompt);
console.log('');

const t = Date.now();
const r = await provider.generateResponse({
  model: 'claude-sonnet-4-20250514',
  systemPrompt,
  messages: [{ role: 'user', content: prompt }],
  npcId: 'samren_malondar',
  npcName: 'Samren Malondar',
  maxTokens: 512,
});
console.log(`RESPONSE (${Date.now() - t}ms):`);
console.log(r.text);
console.log(`\nUSAGE: input=${r.usage.input_tokens}  output=${r.usage.output_tokens}  cache_create=${r.usage.cache_creation_input_tokens}  cache_read=${r.usage.cache_read_input_tokens}`);
