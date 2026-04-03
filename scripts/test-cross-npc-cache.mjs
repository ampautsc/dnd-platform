#!/usr/bin/env node
/**
 * test-cross-npc-cache.mjs — Cross-NPC cache sharing test.
 *
 * Tests whether block 1 (world knowledge) stays cached when switching NPCs:
 *   Call 1: Samren  → expect cache CREATION (both blocks)
 *   Call 2: Mira    → expect partial cache (block 1 read, block 2 created)
 *   Call 3: Mira    → expect full cache READ (both blocks)
 *
 * Usage:
 *   node scripts/test-cross-npc-cache.mjs
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
const mira = JSON.parse(readFileSync(
  new URL('../packages/content/src/npcs/data/mira_barrelbottom.json', import.meta.url)
));
const bottoms = JSON.parse(readFileSync(
  new URL('../packages/content/src/locations/data/bottoms_up.json', import.meta.url)
));

// ── Build system prompts ────────────────────────────────────────────────

const runtimeSamren = {
  currentLocation: { locationId: 'bottoms_up', areaWithin: 'The Bar' },
  currentActivity: 'wiping down the bar top and watching the room',
  currentMood: 'content, unhurried — a quiet evening so far',
  gameDay: 1,
  dayExperiences: [
    { summary: 'Opened the tavern at the usual hour. Checked the kegs — two were low.' },
    { summary: 'Norvin arrived early, as always. Exchanged the usual greeting.' },
  ],
};

const runtimeMira = {
  currentLocation: { locationId: 'bottoms_up', areaWithin: 'The Bar' },
  currentActivity: 'polishing glasses behind the counter, half-listening to Norvin',
  currentMood: 'sharp and alert — keeping one eye on the room',
  gameDay: 1,
  dayExperiences: [
    { summary: 'Arrived at the tavern before opening. Set out fresh mugs.' },
    { summary: 'Sam asked about the keg situation — two low. Noted it.' },
  ],
};

const samrenPrompt = buildEncounterSystemPrompt({
  personality: samren,
  location: bottoms,
  runtimeSnapshot: runtimeSamren,
  ageInDays: Math.floor(samren.age * 365.25),
});

const miraPrompt = buildEncounterSystemPrompt({
  personality: mira,
  location: bottoms,
  runtimeSnapshot: runtimeMira,
  ageInDays: Math.floor(mira.age * 365.25),
});

// ── Token estimates ─────────────────────────────────────────────────────

const worldTokens = Math.ceil(worldKnowledge.length / 4.3);
const samTokens = Math.ceil(samrenPrompt.length / 4.3);
const miraTokens = Math.ceil(miraPrompt.length / 4.3);

console.log('='.repeat(80));
console.log('CROSS-NPC CACHE SHARING TEST');
console.log('='.repeat(80));
console.log(`Block 1 (world knowledge):   ~${worldTokens.toLocaleString()} tokens  (shared)`);
console.log(`Block 2 (Samren):            ~${samTokens.toLocaleString()} tokens`);
console.log(`Block 2 (Mira):              ~${miraTokens.toLocaleString()} tokens`);
console.log('');
console.log('Expected behavior:');
console.log('  Call 1 (Samren): cache_creation = world + samren tokens');
console.log('  Call 2 (Mira):   cache_read = world tokens, cache_creation = mira tokens');
console.log('  Call 3 (Mira):   cache_read = world + mira tokens');
console.log('='.repeat(80));

// ── Verify API key ──────────────────────────────────────────────────────

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('ERROR: ANTHROPIC_API_KEY environment variable is not set.');
  process.exit(1);
}

const provider = new LLMProvider();

// ── Helper ──────────────────────────────────────────────────────────────

function printUsage(label, result, elapsed) {
  const u = result.usage || {};
  console.log(`\n${label}  (${elapsed}ms)`);
  console.log(`  input_tokens:         ${u.input_tokens ?? '—'}`);
  console.log(`  output_tokens:        ${u.output_tokens ?? '—'}`);
  console.log(`  cache_creation:       ${u.cache_creation_input_tokens ?? '—'}`);
  console.log(`  cache_read:           ${u.cache_read_input_tokens ?? '—'}`);
  console.log(`  response (truncated): ${result.text.slice(0, 120)}...`);
}

// ── Call 1: Samren — expect full cache CREATION ─────────────────────────

console.log('\n--- CALL 1: Samren (expect cache CREATION) ---');
const t1 = Date.now();
const r1 = await provider.generateResponse({
  model: 'claude-sonnet-4-6',
  systemBlocks: [
    { text: worldKnowledge },
    { text: samrenPrompt },
  ],
  userPrompt: 'A hooded stranger walks in from the rain and sits at the bar without a word. What do you do?',
  npcId: 'samren_malondar',
  npcName: 'Samren Malondar',
  maxTokens: 512,
});
printUsage('CALL 1 — Samren', r1, Date.now() - t1);

// ── Call 2: Mira — expect block 1 cache READ, block 2 cache CREATION ───

console.log('\n--- CALL 2: Mira (expect partial cache — world knowledge READ, NPC CREATION) ---');
const t2 = Date.now();
const r2 = await provider.generateResponse({
  model: 'claude-sonnet-4-6',
  systemBlocks: [
    { text: worldKnowledge },
    { text: miraPrompt },
  ],
  userPrompt: 'A hooded stranger walks in from the rain and sits at the bar without a word. What do you do?',
  npcId: 'mira_barrelbottom',
  npcName: 'Mira Barrelbottom',
  maxTokens: 512,
});
printUsage('CALL 2 — Mira', r2, Date.now() - t2);

// ── Call 3: Mira again — expect full cache READ ────────────────────────

console.log('\n--- CALL 3: Mira again (expect full cache READ) ---');
const t3 = Date.now();
const r3 = await provider.generateResponse({
  model: 'claude-sonnet-4-6',
  systemBlocks: [
    { text: worldKnowledge },
    { text: miraPrompt },
  ],
  userPrompt: 'The stranger orders an ale and slides a gold piece across the bar. What do you do?',
  npcId: 'mira_barrelbottom',
  npcName: 'Mira Barrelbottom',
  maxTokens: 512,
});
printUsage('CALL 3 — Mira (same blocks)', r3, Date.now() - t3);

// ── Summary ─────────────────────────────────────────────────────────────

const u1 = r1.usage || {};
const u2 = r2.usage || {};
const u3 = r3.usage || {};

console.log('\n' + '='.repeat(80));
console.log('CACHE SUMMARY');
console.log('='.repeat(80));
console.log(`Call 1 (Samren):     creation=${u1.cache_creation_input_tokens ?? '—'}  read=${u1.cache_read_input_tokens ?? '—'}`);
console.log(`Call 2 (Mira):       creation=${u2.cache_creation_input_tokens ?? '—'}  read=${u2.cache_read_input_tokens ?? '—'}`);
console.log(`Call 3 (Mira again): creation=${u3.cache_creation_input_tokens ?? '—'}  read=${u3.cache_read_input_tokens ?? '—'}`);

// Analyze
const c2Read = u2.cache_read_input_tokens ?? 0;
const c2Create = u2.cache_creation_input_tokens ?? 0;
const c3Read = u3.cache_read_input_tokens ?? 0;
const c3Create = u3.cache_creation_input_tokens ?? 0;

console.log('');
if (c2Read > 0 && c2Create > 0) {
  console.log('✓ CROSS-NPC SHARING CONFIRMED — Call 2 read world knowledge from cache AND created new NPC block');
  console.log(`  World knowledge cached: ~${c2Read} tokens read`);
  console.log(`  Mira consciousness new: ~${c2Create} tokens created`);
} else if (c2Read > 0 && c2Create === 0) {
  console.log('⚠ Call 2 was a full cache read — Anthropic may cache up to full prefix match');
} else if (c2Read === 0) {
  console.log('✗ No cache sharing on Call 2 — world knowledge prefix was NOT reused');
}

if (c3Read > 0 && c3Create === 0) {
  console.log('✓ SAME-NPC CACHE HIT — Call 3 read both blocks from cache');
} else {
  console.log(`⚠ Call 3: read=${c3Read} creation=${c3Create}`);
}

console.log('\nFull logs: logs/llm-' + new Date().toISOString().slice(0, 10) + '.log');
