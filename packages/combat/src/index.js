/**
 * @dnd-platform/combat — D&D 5e combat engine
 *
 * Barrel export for the combat package.
 * Prefer subpath imports (e.g. '@dnd-platform/combat/dice') for tree-shaking.
 */

// ── v1 Engine ────────────────────────────────────────────────────────────────
export * as dice from './engine/dice.js'
export * as mechanics from './engine/mechanics.js'
export * as aoeGeometry from './engine/aoeGeometry.js'
export * as targetResolver from './engine/targetResolver.js'
export * as spellResolver from './engine/spellResolver.js'
export * as encounterRunner from './engine/encounterRunner.js'

// ── AI ───────────────────────────────────────────────────────────────────────
export * as tactics from './ai/tactics.js'

// ── v2 Engine (Immutable Zero-Trust) ─────────────────────────────────────────
export { GameState } from './engine-v2/GameState.js'
export * as TurnMenu from './engine-v2/TurnMenu.js'
export * as ActionResolver from './engine-v2/ActionResolver.js'
export * as TacticsAdapter from './engine-v2/TacticsAdapter.js'
export * as StepResolver from './engine-v2/StepResolver.js'
export * as EncounterRunnerV2 from './engine-v2/EncounterRunner.js'

// ── Scenario Simulation ──────────────────────────────────────────────────────
export * as scenario from './scenarioHarness.js'
export * as scenarioV2 from './scenarioHarnessV2.js'
