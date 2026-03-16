/**
 * Species — registry of all D&D 5e playable species/races.
 *
 * Data loaded from species-raw.json (71 species across PHB, VGM, MMM, etc.)
 *
 * Usage:
 *   import { getSpecies, getAllSpeciesSlugs } from '@dnd-platform/content/species'
 *   const elf = getSpecies('elf')
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const raw = readFileSync(join(__dirname, 'data', 'species-raw.json'), 'utf-8')
const speciesArray = JSON.parse(raw)

// ─── Registry ───────────────────────────────────────────────────────────────

/** All species keyed by slug. */
export const SPECIES = {}

for (const entry of speciesArray) {
  SPECIES[entry.slug] = entry
}

// ─── Lookup Helpers ─────────────────────────────────────────────────────────

/** Get a species by slug. */
export function getSpecies(slug) {
  return SPECIES[slug]
}

/** Check if a species exists in the registry. */
export function hasSpecies(slug) {
  return slug in SPECIES
}

/** Return all registered species slugs. */
export function getAllSpeciesSlugs() {
  return Object.keys(SPECIES)
}

/** Return all species from a given source book (e.g. 'PHB', 'VGM'). */
export function getSpeciesBySource(source) {
  return Object.values(SPECIES).filter(s => s.source === source)
}

/** Return all species that have natural flight. */
export function getSpeciesWithFlight() {
  return Object.values(SPECIES).filter(s => s.hasFlight === true)
}
