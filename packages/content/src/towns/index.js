/**
 * Towns — registry of town/settlement data.
 *
 * Each town is a JSON file in ./data/ with location, notable locations,
 * NPC roster, factions, and atmosphere data.
 *
 * Usage:
 *   import { getTown, getAllTownKeys } from '@dnd-platform/content/towns'
 *   const millhaven = getTown('millhaven')
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const dataDir = join(__dirname, 'data')

function loadTown(filename) {
  const raw = readFileSync(join(dataDir, `${filename}.json`), 'utf-8')
  return JSON.parse(raw)
}

const TOWN_FILES = ['millhaven']

// ─── Registry ───────────────────────────────────────────────────────────────

/** All towns keyed by id. */
export const TOWNS = {}

for (const file of TOWN_FILES) {
  const town = loadTown(file)
  TOWNS[town.id] = town
}

// ─── Lookup Helpers ─────────────────────────────────────────────────────────

export function getTown(id) {
  return TOWNS[id]
}

export function hasTown(id) {
  return id in TOWNS
}

export function getAllTownKeys() {
  return Object.keys(TOWNS)
}
