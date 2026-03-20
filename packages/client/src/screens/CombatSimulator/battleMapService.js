/**
 * BattleMap persistence service.
 * Currently backed by localStorage. Swap the storage functions for API calls
 * when ready — all callers are unchanged.
 */

import { createBattleMap } from './battleMapSchema.js'

const INDEX_KEY = 'battlemap_index'
const MAP_PREFIX = 'battlemap_'

function readIndex() {
  try {
    return JSON.parse(localStorage.getItem(INDEX_KEY) ?? '[]')
  } catch {
    return []
  }
}

function writeIndex(index) {
  localStorage.setItem(INDEX_KEY, JSON.stringify(index))
}

/**
 * Save a BattleMap. Creates or overwrites by id.
 * Returns the saved map (with updated `modified` timestamp).
 */
export function saveBattleMap(map) {
  const saved = { ...map, modified: new Date().toISOString() }
  localStorage.setItem(MAP_PREFIX + saved.id, JSON.stringify(saved))

  const index = readIndex().filter(e => e.id !== saved.id)
  index.push({ id: saved.id, name: saved.name, modified: saved.modified })
  writeIndex(index)

  return saved
}

/**
 * Load a BattleMap by id. Returns null if not found.
 */
export function loadBattleMap(id) {
  try {
    const raw = localStorage.getItem(MAP_PREFIX + id)
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

/**
 * Delete a BattleMap by id.
 */
export function deleteBattleMap(id) {
  localStorage.removeItem(MAP_PREFIX + id)
  writeIndex(readIndex().filter(e => e.id !== id))
}

/**
 * List all saved BattleMap summaries: { id, name, modified }[]
 */
export function listBattleMaps() {
  return readIndex()
}

/**
 * Export a BattleMap as a JSON string (for file download / clipboard).
 */
export function exportBattleMap(map) {
  return JSON.stringify(map, null, 2)
}

/**
 * Import a BattleMap from a JSON string. Validates basic shape.
 * Throws on invalid input.
 */
export function importBattleMap(jsonString) {
  let parsed
  try {
    parsed = JSON.parse(jsonString)
  } catch {
    throw new Error('Invalid JSON')
  }
  if (!parsed.id || !parsed.name || typeof parsed.radius !== 'number') {
    throw new Error('Missing required BattleMap fields: id, name, radius')
  }
  // Ensure all required top-level arrays/objects exist
  return createBattleMap({
    ...parsed,
    hexes: parsed.hexes ?? {},
    entities: parsed.entities ?? [],
    meta: parsed.meta ?? {},
  })
}
