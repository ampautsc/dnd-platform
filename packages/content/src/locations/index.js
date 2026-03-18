/**
 * Locations — registry of specific places (taverns, shops, dungeons, etc.).
 *
 * Each location is a JSON file in ./data/ with atmosphere, layout, regulars,
 * hooks, and world context data. Locations have their own "personality" that
 * gets injected into NPC encounter prompts so the environment feels real.
 *
 * Usage:
 *   import { getLocation, getAllLocationKeys } from '@dnd-platform/content/locations'
 *   const tavern = getLocation('bottoms_up')
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const dataDir = join(__dirname, 'data')

function loadLocation(filename) {
  const raw = readFileSync(join(dataDir, `${filename}.json`), 'utf-8')
  return JSON.parse(raw)
}

const LOCATION_FILES = [
  'bottoms_up',
  'cogsworth_workshop',
  'millhaven_mill',
  'general_store',
  'town_hall',
  'healers_house',
  'lumber_yard',
  'butcher_shop',
  'cemetery',
  'schoolhouse',
  'counting_house',
  'warehouse',
  'tannery',
  'tea_house',
  'theater',
  'bookshop',
  'bathhouse',
  'driftwood_tavern',
  'tinctures_shop',
  'curiosity_shop',
]

// ─── Registry ───────────────────────────────────────────────────────────────

/** All locations keyed by id. */
export const LOCATIONS = {}

for (const file of LOCATION_FILES) {
  const loc = loadLocation(file)
  LOCATIONS[loc.id] = loc
}

// ─── Lookup Helpers ─────────────────────────────────────────────────────────

export function getLocation(id) {
  return LOCATIONS[id]
}

export function hasLocation(id) {
  return id in LOCATIONS
}

export function getAllLocationKeys() {
  return Object.keys(LOCATIONS)
}

export function getLocationsByType(type) {
  return Object.values(LOCATIONS).filter(l => l.type === type)
}
