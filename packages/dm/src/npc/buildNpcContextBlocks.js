/**
 * buildNpcContextBlocks — Builds a multi-block system prompt array for NPC prompt caching.
 *
 * Each block in the returned array is passed to LLMProvider.generateResponse({ systemBlocks })
 * and receives its own cache_control breakpoint in the Anthropic API. This allows each layer
 * of context to be cached independently and shared across calls.
 *
 * Block ordering (most stable → least stable):
 *   Block 1: World knowledge XML    — shared across all Faerûn NPCs, never changes
 *   Block 2: Town context XML       — shared across all NPCs in the same town (optional)
 *   Block 3: Venue context XML      — shared across all NPCs at the same location (optional)
 *   Block N: NPC consciousness      — identity, backstory, inner life, day plan; changes per session
 *
 * Caching notes:
 *   - Each block must exceed the model's minimum cache threshold to be individually cacheable.
 *   - Sonnet 4.6 minimum: 1,024 tokens. Haiku 4.5 minimum: 4,096 tokens.
 *   - The NPC consciousness block (~5,500+ tokens) always exceeds both thresholds.
 *   - World-common (~1,100 tokens) is eligible on Sonnet 4.6 but not Haiku 4.5.
 *   - Town/venue XML context blocks (~2,000-2,400 tokens) are eligible on Sonnet 4.6.
 *
 * @module buildNpcContextBlocks
 */

import { buildEncounterSystemPrompt } from './buildEncounterSystemPrompt.js';
import { loadContextFile } from '../prompts/npc-context/loader.js';

/**
 * Builds a multi-block system prompt array for use with LLMProvider's `systemBlocks` param.
 *
 * @param {object}  params
 * @param {object}  params.npc                              — Full NPC data from content/ (the JSON)
 * @param {object|null}  [params.location]                  — Location data from content/locations
 * @param {string}       [params.worldContextName='world-common'] — Context file name for world knowledge
 * @param {string|null}  [params.townContextName]           — e.g. 'town-millhaven'
 * @param {string|null}  [params.venueContextName]          — e.g. 'location-bottoms-up'
 * @param {object|null}  [params.runtimeSnapshot]           — From NpcRuntimeContext.getSnapshot()
 * @param {number|null}  [params.ageInDays]                 — From NpcRuntimeContext.computeAgeInDays()
 * @param {string|null}  [params.memorySummary]             — From EncounterMemoryService
 * @param {string}       [params.evolutionSummary]          — From PersonalityEvolutionService
 * @param {string}       [params.relationshipContext]       — From RelationshipRepository
 * @returns {Array<{ text: string }>} System blocks ready for LLMProvider.generateResponse
 */
export function buildNpcContextBlocks({
  npc,
  location = null,
  worldContextName = 'world-common',
  townContextName = null,
  venueContextName = null,
  runtimeSnapshot = null,
  ageInDays = null,
  memorySummary = null,
  evolutionSummary = '',
  relationshipContext = '',
}) {
  const blocks = [];

  // ── Block 1: World knowledge ─────────────────────────────────────────────
  // Most stable layer — shared across ALL Faerûn NPCs. This block is never
  // modified between sessions and should accumulate the most cache hits.
  blocks.push({ text: loadContextFile(worldContextName) });

  // ── Block 2: Town context (optional) ────────────────────────────────────
  // Shared across all NPCs in the same town. Static unless the town itself changes.
  if (townContextName) {
    blocks.push({ text: loadContextFile(townContextName) });
  }

  // ── Block 3: Venue context (optional) ───────────────────────────────────
  // Shared across all NPCs at the same physical location. Static unless the
  // venue itself changes (staff, layout, notable hooks).
  if (venueContextName) {
    blocks.push({ text: loadContextFile(venueContextName) });
  }

  // ── Block N: NPC consciousness prompt ───────────────────────────────────
  // The most dynamic block. Contains vessel surrender, identity, backstory,
  // relationships, day plan, state of mind, and emotional baseline.
  // Changes when: day plan changes, mood changes, memory summary changes.
  const consciousnessPrompt = buildEncounterSystemPrompt({
    personality: npc,
    location,
    runtimeSnapshot,
    ageInDays,
    memorySummary,
    evolutionSummary,
    relationshipContext,
  });
  blocks.push({ text: consciousnessPrompt });

  return blocks;
}

/**
 * Builds the user prompt for the first turn of an NPC scene.
 *
 * Combines a brief day narrative (orienting the consciousness to what has
 * already happened today) with a scene trigger (what just happened to prompt
 * a response). The day plan details live in the system prompt's "Remember what
 * you are planning to do today" section via runtimeSnapshot.dayExperiences;
 * this user prompt provides the transition from that context into the live scene.
 *
 * @param {object}  params
 * @param {string}  params.npcName      — NPC's display name
 * @param {number}  params.ageInDays    — Total days alive
 * @param {string}  [params.dayNarrative] — Short prose summary of the day so far
 * @param {string}  params.sceneTrigger — What just happened / what the NPC must respond to
 * @returns {string}
 */
export function buildNpcDayUserPrompt({ npcName, ageInDays, dayNarrative = '', sceneTrigger }) {
  const parts = [`${npcName}, this is your ${ageInDays.toLocaleString()}-day-old life.`];
  if (dayNarrative) {
    parts.push(dayNarrative);
  }
  parts.push(sceneTrigger);
  return parts.join('  ');
}
