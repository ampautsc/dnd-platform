#!/usr/bin/env node
/**
 * samren-day-scenarios.mjs — Samren Malondar cacheable context package test.
 *
 * Builds a 4-block cacheable system prompt for Samren and runs multiple
 * conversation scenarios to demonstrate his consciousness at the Bottoms Up.
 *
 * System prompt blocks (each independently cacheable):
 *   Block 1: world-common.xml        — Faerûn 1492 DR baseline
 *   Block 2: town-millhaven.xml      — Millhaven town knowledge
 *   Block 3: location-bottoms-up.xml — Bottoms Up bar operational context
 *   Block 4: Samren consciousness    — vessel surrender → identity → day plan → come in to focus
 *
 * Scenarios (single multi-turn conversation):
 *   0. Day plan seeded — Samren's full day before the adventurer arrives
 *   1. An adventurer walks in and asks for the finest ale
 *   2. Norvin makes a comment about adventurers from the end stool
 *   3. The adventurer asks what there is to do in Millhaven
 *   4. The adventurer mentions they heard Samren used to throw javelin
 *   5. The adventurer asks for a room for the night
 *
 * Usage:
 *   node scripts/samren-day-scenarios.mjs
 *
 * Requires:
 *   ANTHROPIC_API_KEY environment variable
 *
 * Model note:
 *   Uses claude-sonnet-4-6 (1,024 token cache minimum) so individual XML
 *   context blocks are cache-eligible. Switch to claude-haiku-4-5-20251001
 *   for cheaper calls — same-NPC caching still works, but individual XML
 *   blocks below 4,096 tokens won't be cached cross-NPC.
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildNpcContextBlocks, buildNpcDayUserPrompt } from '../packages/dm/src/npc/buildNpcContextBlocks.js';
import { LLMProvider } from '../packages/dm/src/llm/LLMProvider.js';

// ── Load API key from .keys/anthropic.env if not already set ────────────────

const __dir = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dir, '..');
for (const candidate of ['.keys/anthropic.env', '.keys/anthropic.key']) {
  const envFile = resolve(root, candidate);
  if (!process.env.ANTHROPIC_API_KEY && existsSync(envFile)) {
    const match = readFileSync(envFile, 'utf8').match(/ANTHROPIC_API_KEY=(.+)/);
    if (match) process.env.ANTHROPIC_API_KEY = match[1].trim();
  }
}

// ── Verify API key ───────────────────────────────────────────────────────────

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('\n  ✗ ANTHROPIC_API_KEY is not set.');
  console.error('  Set the environment variable or create .keys/anthropic.env with ANTHROPIC_API_KEY=sk-ant-...');
  process.exit(1);
}

// ── Load NPC + Location data ─────────────────────────────────────────────────

const samren = JSON.parse(readFileSync(
  new URL('../packages/content/src/npcs/data/samren_malondar.json', import.meta.url),
));

const bottomsUp = JSON.parse(readFileSync(
  new URL('../packages/content/src/locations/data/bottoms_up.json', import.meta.url),
));

// ── Runtime snapshot: Samren's full day ─────────────────────────────────────
// These dayExperiences populate the "Remember what you are planning to do today"
// section of the system prompt (section 7 of buildEncounterSystemPrompt).

const runtimeSnapshot = {
  currentLocation: { locationId: 'bottoms_up', areaWithin: 'The Bar' },
  currentActivity: 'behind the bar, half-watching the room, polishing a glass that is already clean',
  currentMood: 'content, steady — an evening that is building toward something good',
  gameDay: 47,
  dayExperiences: [
    {
      summary: 'Woke at dawn. Went to the alley. Threw the weighted javelin at the barrel for fifteen minutes. Nobody saw this. Nobody needs to.',
    },
    {
      summary: 'Breakfast: bread and a fried egg on the kitchen stove. A cup of chicory. Read nothing, thought about nothing in particular. The bar was quiet and smelled like last night.',
    },
    {
      summary: "Opened at the usual hour. Checked the kegs — the amber was getting low. Sent a message to the Stoneback supplier for a Tenthday delivery.",
    },
    {
      summary: "Oma's bread basket appeared at the door before the lock turned, same as every morning. Tucked it behind the bar.",
    },
    {
      summary: 'Carza arrived, assessed the state of the tavern in approximately eight seconds, and got to work without saying anything meaningful. They are past the stage of saying good morning.',
    },
    {
      summary: 'Woody came in, said good morning to everything — the bar, the stools, the hearth. He wipes the same three glasses for fifteen minutes every morning. Never mentioned it.',
    },
    {
      summary: "Rebeciel came down from the office with the ledger and a look that said something in the accounts needed discussing. She said 'later.' That was fine.",
    },
    {
      summary: 'Lunch crowd: usual — east-road farmers, two merchants from the market circuit staying upstairs, Dolly Thurn with a question about a barrel she was selling. Normal.',
    },
    {
      summary: "Norvin arrived at his usual time. The 'What's shakin'?' came out before he had fully sat down. Third stool from the left, as always.",
    },
    {
      summary: "Clifton arrived with a full market report — new grain prices from the Stoneback farms, a traveling apothecary setting up near the forge, something about the count's road inspection that was probably exaggerated. Stayed two hours.",
    },
    {
      summary: 'The afternoon filled in naturally. Three or four groups of locals, one argument about a fence line that got talked down without taking sides. A normal afternoon.',
    },
    {
      summary: 'Lit the hearth at the fourth hour. Bar is at good capacity now — not full, but full enough. The evening regulars are in, the fire is going, and there is the particular warmth that means the night is going well.',
    },
  ],
};

const ageInDays = Math.floor(samren.age * 365.25);

// ── Build the 4-block system prompt ─────────────────────────────────────────

const systemBlocks = buildNpcContextBlocks({
  npc: samren,
  location: bottomsUp,
  worldContextName: 'world-common',
  townContextName: 'town-millhaven',
  venueContextName: 'location-bottoms-up',
  runtimeSnapshot,
  ageInDays,
});

// ── Token estimates ──────────────────────────────────────────────────────────

function tokenEst(text) {
  return Math.round(text.length / 4);
}

console.log('='.repeat(80));
console.log('SAMREN MALONDAR — CACHEABLE CONTEXT PACKAGE');
console.log('='.repeat(80));
console.log('');
console.log('System prompt blocks:');
const blockLabels = [
  'Block 1: world-common.xml (Faerûn baseline)',
  'Block 2: town-millhaven.xml (Millhaven)',
  'Block 3: location-bottoms-up.xml (Bottoms Up)',
  'Block 4: NPC consciousness (Samren)',
];
let totalChars = 0;
for (let i = 0; i < systemBlocks.length; i++) {
  const chars = systemBlocks[i].text.length;
  const tokens = tokenEst(systemBlocks[i].text);
  totalChars += chars;
  const eligible1024 = tokens >= 1024 ? '✓ Sonnet' : '✗ Sonnet';
  const eligible4096 = tokens >= 4096 ? '✓ Haiku' : '✗ Haiku';
  console.log(`  ${blockLabels[i] || `Block ${i + 1}`}`);
  console.log(`    ${chars.toLocaleString()} chars  ~${tokens.toLocaleString()} tokens  [${eligible1024}] [${eligible4096}]`);
}
console.log('');
console.log(`  Total: ${totalChars.toLocaleString()} chars  ~${tokenEst(systemBlocks.map(b => b.text).join('')).toLocaleString()} tokens`);
console.log('  Model: claude-sonnet-4-6  (1,024 token cache minimum)');
console.log('');

// ── Day narrative summary (user prompt intro) ────────────────────────────────
// This is the brief prose bridge between "the day so far" (which lives in the
// system prompt via dayExperiences) and the live scene trigger.

const DAY_NARRATIVE = [
  'The day moved through its usual rhythms — morning throw in the alley, breakfast, the keys, Oma\'s basket at the door.',
  'Carza and Woody, the accounts conversation with Rebeciel that will happen when there\'s time.',
  'Norvin arrived at his stool and the bar settled into itself the way it does when the evening regulars are in.',
  'Clifton\'s full market report.',
  'The hearth lit at the fourth hour.',
  'The bar is at good capacity.',
  'A normal evening building.',
].join('  ');

// ── Scenario definitions ─────────────────────────────────────────────────────

const SCENARIOS = [
  {
    label: 'SCENARIO 1 — The Adventurer Arrives',
    description: 'A road-worn adventurer walks in and asks for the finest ale.',
    trigger: [
      'The door swings open.',
      'In steps a road-worn adventurer — travel-stained cloak, pack still on their back, the particular way of moving that says they\'ve been walking for days.',
      'They drop onto a stool at the bar, look directly at you, and call out: "Barkeep! Pour me your finest ale!"',
    ].join('  '),
    isFirst: true,
  },
  {
    label: 'SCENARIO 2 — Norvin Weighs In',
    description: 'Norvin makes a comment about adventurers from his end stool.',
    trigger: [
      'From the end stool, without looking up from his tankard, Norvin says:',
      '"They always want the finest. You know what the finest is? Whatever keeps \'em from ordering twice."',
      'He takes a long slow drink.',
    ].join('  '),
    isFirst: false,
  },
  {
    label: 'SCENARIO 3 — What Is There to Do?',
    description: 'The adventurer asks what there is to do in Millhaven.',
    trigger: [
      'The adventurer looks around the bar, taking in the room.',
      '"So. Town like this — what\'s there to do? Any work? Anything worth knowing about around here?"',
    ].join('  '),
    isFirst: false,
  },
  {
    label: 'SCENARIO 4 — The Javelin Question',
    description: 'The adventurer mentions they heard about his past.',
    trigger: [
      'The adventurer leans on the bar.',
      '"Someone at the last town told me the barkeep here used to throw javelin on the circuit.',
      'Said they called you Mayday.',
      'That true?"',
    ].join('  '),
    isFirst: false,
  },
  {
    label: 'SCENARIO 5 — A Room for the Night',
    description: 'The adventurer asks about staying the night.',
    trigger: [
      '"I\'ve been riding for three days.',
      'You got rooms here?"',
    ].join('  '),
    isFirst: false,
  },
];

// ── Provider ─────────────────────────────────────────────────────────────────

const provider = new LLMProvider();
const MODEL = 'claude-sonnet-4-6';

// ── Helper: print response ───────────────────────────────────────────────────

function printResponse(label, result, elapsed) {
  const sep = '─'.repeat(80);
  console.log(`\n${sep}`);
  console.log(`${label}  (${elapsed}ms)`);
  console.log(sep);
  console.log('');
  console.log(result.text);
  console.log('');
  const u = result.usage || {};
  const created = u.cache_creation_input_tokens ?? 0;
  const read = u.cache_read_input_tokens ?? 0;
  const inp = u.input_tokens ?? '—';
  const out = u.output_tokens ?? '—';
  let cacheStatus;
  if (read > 0) {
    cacheStatus = `✓ CACHE HIT   read=${read.toLocaleString()} tokens  (created=${created})`;
  } else if (created > 0) {
    cacheStatus = `  cache write  created=${created.toLocaleString()} tokens  (read=0)`;
  } else {
    cacheStatus = '  no caching data';
  }
  console.log(`  [usage] input=${inp}  output=${out}  ${cacheStatus}`);
  console.log(sep);
}

// ── Run all scenarios ────────────────────────────────────────────────────────

console.log('Running scenarios...');
console.log('');

const messages = [];
let cacheWritten = 0;
let cacheRead = 0;

for (const scenario of SCENARIOS) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(scenario.label);
  console.log(scenario.description);
  console.log('='.repeat(80));

  // Build the user message for this turn
  let userMessage;
  if (scenario.isFirst) {
    // First turn: include the day narrative to orient the consciousness
    userMessage = buildNpcDayUserPrompt({
      npcName: samren.name,
      ageInDays,
      dayNarrative: DAY_NARRATIVE,
      sceneTrigger: scenario.trigger,
    });
  } else {
    // Subsequent turns: just the scene event
    userMessage = scenario.trigger;
  }

  console.log(`\nPlayer/Scene: ${userMessage.slice(0, 200)}${userMessage.length > 200 ? '...' : ''}`);

  // Add this user message to the growing conversation
  messages.push({ role: 'user', content: userMessage });

  const t0 = Date.now();
  let result;
  try {
    result = await provider.generateResponse({
      model: MODEL,
      systemBlocks,
      messages: [...messages],  // snapshot of current conversation state
      npcId: 'samren_malondar',
      npcName: samren.name,
      maxTokens: 512,
    });
  } catch (err) {
    console.error(`  ✗ API error: ${err.message}`);
    process.exit(1);
  }
  const elapsed = Date.now() - t0;

  // Add Samren's response to the conversation history for the next turn
  messages.push({ role: 'assistant', content: result.text });

  printResponse(`Samren responds`, result, elapsed);

  // Track cache stats
  const u = result.usage || {};
  cacheWritten += u.cache_creation_input_tokens ?? 0;
  cacheRead += u.cache_read_input_tokens ?? 0;

  // Small pause between calls to allow cache to settle
  if (SCENARIOS.indexOf(scenario) < SCENARIOS.length - 1) {
    await new Promise(r => setTimeout(r, 300));
  }
}

// ── Final summary ────────────────────────────────────────────────────────────

console.log('\n' + '='.repeat(80));
console.log('CACHE SUMMARY');
console.log('='.repeat(80));
console.log(`  Model: ${MODEL}`);
console.log(`  Scenarios run: ${SCENARIOS.length}`);
console.log(`  Total cache created: ${cacheWritten.toLocaleString()} tokens`);
console.log(`  Total cache read: ${cacheRead.toLocaleString()} tokens`);
if (cacheRead > 0) {
  console.log('');
  console.log('  ✓ Prompt caching confirmed — system blocks were read from cache');
} else {
  console.log('');
  console.log('  ✗ No cache reads observed (first call always writes; re-run within 5 minutes)');
}
console.log('');
console.log(`  Full logs: logs/llm-${new Date().toISOString().slice(0, 10)}.log`);
console.log('');
