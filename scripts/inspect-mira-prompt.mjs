/**
 * inspect-mira-prompt.mjs
 *
 * Runs the full "enter Bottoms Up" flow using MockProvider (which stores every
 * call in provider.history), then writes the exact strings to inspect-output.txt.
 *
 * No real LLM calls are made.
 *
 * Usage:
 *   node scripts/inspect-mira-prompt.mjs
 */

import { writeFileSync } from 'node:fs';

import { createDmEngine, MockProvider } from '../packages/dm/src/index.js';
import { getNpc } from '../packages/content/src/npcs/index.js';
import { getLocation } from '../packages/content/src/locations/index.js';

// ── MockProvider stores every call in .history ───────────────────────────────
const provider = new MockProvider();

// ── Wire engine (mirrors packages/api/src/index.js exactly) ─────────────────

const dmEngine = createDmEngine({
  provider,
  personalityLookup: (key) => getNpc(key) || null,
  locationLookup: (id) => getLocation(id) || null,
});

// Seed NPC runtime context — same defaults as API server
const runtime = dmEngine.runtimeContext;
const BOTTOMS_UP_REGULARS = {
  mira_barrelbottom: { areaWithin: 'The Bar', activity: 'Wiping down the bar while surveying the room', mood: 'content but watchful' },
  fen_colby:         { areaWithin: 'The Bar', activity: 'Leaning on the bar, watching people',            mood: 'cautious' },
};
for (const [npcId, state] of Object.entries(BOTTOMS_UP_REGULARS)) {
  runtime.setLocation(npcId, { locationId: 'bottoms_up', areaWithin: state.areaWithin, arrivedAt: '18:00' });
  runtime.setActivity(npcId, state.activity);
  runtime.setMood(npcId, state.mood);
}

// ── Seed relationships from personality ──────────────────────────────────────
// The SceneEngine now calls seedFromPersonality automatically, but we also seed
// explicitly here so the inspect output reflects the same state.
const relationshipRepo = dmEngine.relationshipRepo;
if (relationshipRepo) {
  for (const key of Object.keys(BOTTOMS_UP_REGULARS)) {
    const npc = getNpc(key);
    if (npc) {
      relationshipRepo.seedFromPersonality(npc);
    }
  }
}

// ── Replicate SceneController.createAtLocation flow exactly ─────────────────

const sceneEngine = dmEngine.sceneEngine;
const locationId = 'bottoms_up';
const location = getLocation(locationId);

if (!location) {
  console.error('ERROR: Could not load bottoms_up location');
  process.exit(1);
}

// Mirror SceneController participant building
const npcParticipants = (location.regulars || [])
  .map(templateKey => {
    const npc = getNpc(templateKey);
    if (!npc) return null;
    return {
      id: `npc_${templateKey}`,
      name: npc.name,
      chaMod: npc.personality?.chaMod ?? 0,
      isPlayer: false,
      templateKey,
    };
  })
  .filter(Boolean);

const participants = [
  { id: 'player1', name: 'Aldric', chaMod: 2, isPlayer: true },
  ...npcParticipants,
];

// Mirror SceneController worldContext construction
const worldContext = {
  locationId: location.id,
  locationName: location.name,
  locationType: location.type,
  description: location.description,
  atmosphere: location.atmosphere,
  ...(location.worldContext || {}),
};

// Mirror SceneController.createAtLocation exactly
const state = sceneEngine.createScene({ participants, worldContext });
const startedState = sceneEngine.startScene(state.id);

// advanceNpcTurns handles the case where NPCs go before the player
await sceneEngine.advanceNpcTurns(state.id);

// If the player went first in initiative, no NPC calls fired yet.
// Submit a player greeting to always capture at least one round of NPC responses.
const currentScene = sceneEngine.getScene(state.id);
if (currentScene.currentParticipant?.isPlayer) {
  await sceneEngine.submitAction(state.id, 'player1', { type: 'speak', content: 'Hello.' });
}

// ── Write output ─────────────────────────────────────────────────────────────
const calls = provider.getHistory();
const lines = [`TOTAL CALLS: ${calls.length}\n`];

calls.forEach((call, idx) => {
  lines.push(`\n${'='.repeat(80)}`);
  lines.push(`CALL ${idx + 1}  npcId=${call.npcId ?? '(none)'}  npcName=${call.npcName ?? '(none)'}  maxTokens=${call.maxTokens ?? '(default)'}`);
  lines.push(`${'='.repeat(80)}\n`);

  if (call.systemPrompt) {
    lines.push('--- SYSTEM PROMPT ---\n');
    lines.push(call.systemPrompt);
    lines.push('\n--- END SYSTEM PROMPT ---');
  }

  if (Array.isArray(call.messages)) {
    call.messages.forEach(m => {
      lines.push(`\n--- ${m.role.toUpperCase()} ---\n`);
      lines.push(typeof m.content === 'string' ? m.content : JSON.stringify(m.content, null, 2));
      lines.push(`\n--- END ${m.role.toUpperCase()} ---`);
    });
  } else if (call.prompt || call.userPrompt) {
    lines.push('\n--- PROMPT ---\n');
    lines.push(call.prompt || call.userPrompt);
    lines.push('\n--- END PROMPT ---');
  }
});

const outPath = new URL('../scripts/inspect-output.txt', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');
writeFileSync(outPath, lines.join('\n'), 'utf8');
console.log(`Written to ${outPath}`);
console.log(`Total calls: ${calls.length}`);
