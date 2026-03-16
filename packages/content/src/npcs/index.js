/**
 * NPC Personalities — registry of all NPC personality/consciousness data.
 *
 * Each NPC is a JSON file in ./data/ with rich personality, knowledge,
 * relationships, consciousness context, and conversation persona data.
 *
 * Usage:
 *   import { getNpc, getAllNpcKeys } from '@dnd-platform/content/npcs'
 *   const bree = getNpc('bree_millhaven')
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const dataDir = join(__dirname, 'data')

/** Load a single NPC JSON from the data directory. */
function loadNpc(filename) {
  const raw = readFileSync(join(dataDir, `${filename}.json`), 'utf-8')
  return JSON.parse(raw)
}

// ─── NPC Files ──────────────────────────────────────────────────────────────

const NPC_FILES = [
  'aldovar_crennick',
  'archmage',
  'bandit',
  'bree_millhaven',
  'brennan_holt',
  'brother_aldwin',
  'captain_edric_vane',
  'cult_fanatic',
  'davan_merchant',
  'dolly_thurn',
  'fen_colby',
  'floris_embrich',
  'goblin',
  'hodge_fence',
  'knight',
  'lell_sparrow',
  'lich',
  'mira_barrelbottom',
  'old_mattock',
  'oma_steadwick',
  'orc',
  'pip_apprentice',
  'sera_dunwick',
  'skeleton',
  'torval_grimm',
  'tuck_millhaven',
  'vesna_calloway',
  'widow_marsh',
  'wolf',
  'wren_stable',
  'young_red_dragon',
  'zombie',
]

// ─── Registry ───────────────────────────────────────────────────────────────

/** All NPC personalities keyed by templateKey. */
export const NPC_PERSONALITIES = {}

for (const file of NPC_FILES) {
  const npc = loadNpc(file)
  NPC_PERSONALITIES[npc.templateKey] = npc
}

// ─── Lookup Helpers ─────────────────────────────────────────────────────────

/** Get an NPC personality by templateKey. */
export function getNpc(key) {
  return NPC_PERSONALITIES[key]
}

/** Check if an NPC exists in the registry. */
export function hasNpc(key) {
  return key in NPC_PERSONALITIES
}

/** Return all registered NPC templateKeys. */
export function getAllNpcKeys() {
  return Object.keys(NPC_PERSONALITIES)
}

/** Return all NPCs matching a given npcType (e.g. 'friendly', 'monster'). */
export function getNpcsByType(type) {
  return Object.values(NPC_PERSONALITIES).filter(n => n.npcType === type)
}
