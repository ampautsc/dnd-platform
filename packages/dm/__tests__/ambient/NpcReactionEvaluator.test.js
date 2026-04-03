/**
 * NpcReactionEvaluator — Character-specific tests against the Groq cloud API.
 *
 * 96+ test cases exercising personality-driven reaction evaluation for all 8
 * Bottoms Up tavern NPCs. Each test targets a specific personality trait:
 * - Utterances touching their motivations, fears, expertise → should react
 * - Utterances completely outside their domain → should NOT react
 *
 * Uses Groq free API (llama-3.1-8b-instant). ~100ms per call.
 * Skips the entire suite if GROQ_API_KEY is not set (CI-safe).
 *
 * NO MOCKS. NO FALLBACKS. If the model gets it wrong, the test fails.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { GroqReactionProvider } from '../../src/ambient/GroqReactionProvider.js';
import { NpcReactionEvaluator } from '../../src/ambient/NpcReactionEvaluator.js';
import { getNpc } from '@dnd-platform/content/npcs';

// ─── Provider Setup ─────────────────────────────────────────────────────────

const HAS_KEY = !!process.env.GROQ_API_KEY;

let provider;
let evaluator;

before(async () => {
  if (!HAS_KEY) return;
  provider = new GroqReactionProvider();
  await provider.init();
  evaluator = new NpcReactionEvaluator({ provider });
}, 15_000);

after(async () => {
  if (provider) await provider.dispose();
}, 5_000);

// ─── Helper ─────────────────────────────────────────────────────────────────

/**
 * Evaluate a single NPC's reaction to an utterance.
 * Returns the full result including shouldReact, reactionStrength, etc.
 */
async function evaluate(npcKey, utterance, speakerName = 'a stranger') {
  const npc = getNpc(npcKey);
  if (!npc) throw new Error(`NPC not found: ${npcKey}`);
  return evaluator.evaluateOne(npc, utterance, {
    speakerName,
    locationName: 'the Bottoms Up tavern',
  });
}

// ─── Test Utilities ─────────────────────────────────────────────────────────

describe('NpcReactionEvaluator — constructor', () => {
  it('should throw when provider is missing', () => {
    assert.throws(() => new NpcReactionEvaluator({ provider: null }), /provider is required/);
  });
});

describe('NpcReactionEvaluator — evaluateAll', () => {
  it('should return empty array for empty NPC list', async () => {
    if (!HAS_KEY) return;
    const result = await evaluator.evaluateAll([], 'Hello!');
    assert.deepStrictEqual(result, []);
  });

  it('should return empty array for empty utterance', async () => {
    if (!HAS_KEY) return;
    const npc = getNpc('samren_malondar');
    const result = await evaluator.evaluateAll([npc], '');
    assert.deepStrictEqual(result, []);
  });

  it('should filter out non-reacting NPCs from evaluateAll results', async () => {
    if (!HAS_KEY) return;
    const samren = getNpc('samren_malondar');
    const result = await evaluator.evaluateAll(
      [samren],
      'The arcane theory of third-order transmutation circles requires seventeen years of study.'
    );
    // This academic utterance should not trigger the bartender
    // evaluateAll filters to only shouldReact=true
    for (const r of result) {
      assert.strictEqual(r.shouldReact, true);
    }
  }, 30_000);
});

// ═══════════════════════════════════════════════════════════════════════════════
// CHARACTER-SPECIFIC TESTS — data-driven from npc.reactionScenarios
// 6 shouldReact + 6 shouldNotReact per NPC × 8 NPCs = 96 cases minimum
// Add scenarios to the NPC JSON to add test coverage.
// Skipped when GROQ_API_KEY is not set (CI-safe).
// ═══════════════════════════════════════════════════════════════════════════════

const CHARACTERS = [
  { key: 'samren_malondar',    label: 'Samren Malondar — tavern owner, former javelin thrower' },
  { key: 'norvin_stonebottom', label: 'Norvin Stonebottom — quintessential regular, stool philosopher' },
  { key: 'clifton_rattleknow', label: 'Clifton Rattleknow — courier, compulsive fact-deliverer' },
  { key: 'carza_bitetongue',   label: 'Carza Bitetongue — waitress, fierce protector, sharp tongue' },
  { key: 'frasirel_cranewing', label: 'Frasirel Cranewing — mind-healer, intellectual, diagnoses everything' },
  { key: 'rebeciel_ashgrace',  label: 'Rebeciel Ashgrace — fallen manager, trying to climb back' },
  { key: 'woody_tallfield',    label: 'Woody Tallfield — apprentice barkeep, literally innocent' },
  { key: 'harrik_hatfield',    label: 'Harrik Hatfield — con artist, card sharp, speaks only when there is an angle' },
];

if (HAS_KEY) {
  describe('Character-specific reaction scenarios (Groq)', () => {
    for (const { key, label } of CHARACTERS) {
      const npc = getNpc(key);
      if (!npc?.reactionScenarios) {
        throw new Error(`NPC ${key} is missing reactionScenarios — add shouldReact and shouldNotReact arrays to the JSON`);
      }
      const { shouldReact, shouldNotReact } = npc.reactionScenarios;

      describe(label, () => {
        // ── Should react ──────────────────────────────────────────────────────────
        for (const utterance of shouldReact) {
          it(`reacts: "${utterance.length > 65 ? utterance.substring(0, 65) + '\u2026' : utterance}"`, async () => {
            const r = await evaluate(key, utterance);
            assert.strictEqual(r.shouldReact, true);
          }, 30_000);
        }

        // ── Should not react ──────────────────────────────────────────────────────
        for (const utterance of shouldNotReact) {
          it(`silent: "${utterance.length > 65 ? utterance.substring(0, 65) + '\u2026' : utterance}"`, async () => {
            const r = await evaluate(key, utterance);
            assert.strictEqual(r.shouldReact, false);
          }, 30_000);
        }
      });
    }
  });
}

