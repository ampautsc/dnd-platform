#!/usr/bin/env node
/**
 * Bottoms Up Tavern — Interactive Ambient Reaction REPL
 *
 * Walk into the Bottoms Up, say something, and see which NPCs react.
 * Uses the full ambient pipeline: Groq Tier 1 → Priority Resolver → results.
 *
 * Usage:
 *   node scripts/bottoms-up-repl.mjs
 *
 * Requires: GROQ_API_KEY environment variable (or .keys/groq.env)
 */

import { createInterface } from 'readline';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// ── Load .keys/groq.env if not already set ──────────────────────────────────
const __dir = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dir, '..');
const envFile = resolve(root, '.keys', 'groq.env');
if (!process.env.GROQ_API_KEY && existsSync(envFile)) {
  const content = readFileSync(envFile, 'utf8');
  const match = content.match(/GROQ_API_KEY=(.+)/);
  if (match) process.env.GROQ_API_KEY = match[1].trim();
}

if (!process.env.GROQ_API_KEY) {
  console.error('\n  ✗ GROQ_API_KEY not set. Get a free key at https://console.groq.com/keys\n');
  process.exit(1);
}

// ── Imports ─────────────────────────────────────────────────────────────────
import { getNpc, getAllNpcKeys } from '@dnd-platform/content/npcs';
import { GroqReactionProvider } from '../packages/dm/src/ambient/GroqReactionProvider.js';
import { NpcReactionEvaluator } from '../packages/dm/src/ambient/NpcReactionEvaluator.js';
import { ReactionPriorityResolver, getChaMod } from '../packages/dm/src/ambient/ReactionPriorityResolver.js';
import { AmbientSceneEngine } from '../packages/dm/src/ambient/AmbientSceneEngine.js';

// ── The Bottoms Up Regulars ─────────────────────────────────────────────────
const BOTTOMS_UP_NPCS = [
  'samren_malondar',
  'norvin_stonebottom',
  'clifton_rattleknow',
  'carza_bitetongue',
  'frasirel_cranewing',
  'rebeciel_ashgrace',
  'woody_tallfield',
  'harrik_hatfield',
];

const REACTION_BAR = ['░', '▒', '▓', '█', '█'];

function strengthBar(s) {
  return REACTION_BAR.slice(0, s).join('');
}

function shortRole(key) {
  const roles = {
    samren_malondar: 'tavern owner',
    norvin_stonebottom: 'bar regular',
    clifton_rattleknow: 'courier',
    carza_bitetongue: 'waitress',
    frasirel_cranewing: 'mind-healer',
    rebeciel_ashgrace: 'fallen manager',
    woody_tallfield: 'apprentice barkeep',
    harrik_hatfield: 'con artist',
  };
  return roles[key] || '';
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n  ╔═══════════════════════════════════════════════╗');
  console.log('  ║         🍺  THE BOTTOMS UP TAVERN  🍺         ║');
  console.log('  ╚═══════════════════════════════════════════════╝\n');

  // Load NPCs
  const npcs = BOTTOMS_UP_NPCS.map(key => getNpc(key)).filter(Boolean);
  console.log('  Present tonight:');
  for (const npc of npcs) {
    const cha = npc.stats?.charisma ?? 10;
    console.log(`    • ${npc.name} — ${shortRole(npc.templateKey)} (CHA ${cha})`);
  }

  // Build NPC stats map
  const npcStats = {};
  for (const npc of npcs) {
    npcStats[npc.templateKey] = { charisma: npc.stats?.charisma ?? 10 };
  }

  // Init Groq provider
  console.log('\n  Connecting to Groq...');
  const provider = new GroqReactionProvider({ rpmLimit: 20 });
  await provider.init();
  console.log('  ✓ Ready.\n');

  // Build the engine
  const evaluator = new NpcReactionEvaluator({ provider });
  const priorityResolver = new ReactionPriorityResolver();
  const engine = new AmbientSceneEngine({ evaluator, priorityResolver });

  // REPL — manual loop to properly await async processing
  console.log('  Type something to say at the bar. Type "quit" to leave.\n');

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const ask = () => new Promise((resolve, reject) => {
    rl.question('  You say > ', resolve);
    rl.once('close', () => reject(new Error('EOF')));
  });

  while (true) {
    let input;
    try {
      input = (await ask()).trim();
    } catch {
      break; // stdin closed (piped input exhausted)
    }
    if (!input) continue;
    if (input.toLowerCase() === 'quit' || input.toLowerCase() === 'exit') {
      console.log('\n  You finish your drink and step out into the night.\n');
      break;
    }

    console.log('');

    try {
      const t0 = Date.now();
      const { reactions } = await engine.processUtterance({
        utterance: input,
        presentNpcs: npcs,
        speakerName: 'a stranger',
        locationName: 'the Bottoms Up tavern',
        npcStats,
      });
      const elapsed = Date.now() - t0;

      if (reactions.length === 0) {
        console.log('  ... nobody looks up from their drink.\n');
      } else {
        console.log(`  ${reactions.length} NPC${reactions.length > 1 ? 's' : ''} would react:  (${elapsed}ms)\n`);
        for (const r of reactions) {
          const role = shortRole(r.npcKey);
          const bar = strengthBar(r.reactionStrength);
          const cha = getChaMod(npcStats[r.npcKey]?.charisma ?? 10);
          console.log(`    ${String(r.priority ?? '?').padStart(2)}  ${bar.padEnd(5)}  ${r.npcName} (${role})`);
          console.log(`       strength ${r.reactionStrength}/5 · d20=${r.d20 ?? '?'} · CHA mod=${cha >= 0 ? '+' : ''}${cha} · priority=${r.priority}`);
        }
        console.log('');
      }
    } catch (err) {
      console.error(`  ✗ Error: ${err.message}\n`);
    }
  }

  await provider.dispose();
  rl.close();
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
