/**
 * @dnd-platform/content — barrel export
 *
 * Re-exports all content sub-modules for convenient access.
 * Consumers can also import sub-modules directly:
 *   import { getSpell } from '@dnd-platform/content/spells'
 *   import { createCreature } from '@dnd-platform/content/creatures'
 */

export * as spells from './spells/index.js'
export * as creatures from './creatures/index.js'
export * as items from './items/index.js'
export * as loot from './loot/index.js'
export * as npcs from './npcs/index.js'
export * as locations from './locations/index.js'
export * as towns from './towns/index.js'
export * as species from './species/index.js'
