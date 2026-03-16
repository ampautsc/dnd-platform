/**
 * Scenario Simulation Harness â€” v2 (Immutable Zero-Trust Engine)
 *
 * Drop-in replacement for scenarioHarness.js that uses the engine-v2 modules:
 *   - GameState for immutable state management
 *   - TurnMenu for zero-trust option generation
 *   - ActionResolver for validated action execution
 *   - EncounterRunner v2 for the immutable encounter loop
 *   - TacticsAdapter for bridging v1 AI tactics into v2 menu choices
 *
 * Returns results in the SAME shape as v1 scenarioHarness so that
 * scenarioEngine.js can consume them without changes.
 *
 * Reuses SCENARIOS and MONSTER_PROFILES from the v1 harness (single source of truth).
 */

import { createCreature } from '@dnd-platform/content/creatures'
import { buildToCreature } from '@dnd-platform/content/builds'
import { GameState } from './engine-v2/GameState.js'
import { runEncounter } from './engine-v2/EncounterRunner.js'
import { makeAdaptedAI, makeAdaptedReactionAI } from './engine-v2/TacticsAdapter.js'
import { SCENARIOS, MONSTER_PROFILES } from './scenarioHarness.js'
export { SCENARIOS, MONSTER_PROFILES }


// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// COMBATANT CREATION
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

/**
 * Create all combatants for a scenario: 1 bard + N enemies.
 * Returns a GameState ready for the encounter runner.
 *
 * @param {Object} build â€” populated build document
 * @param {Object} scenario â€” a SCENARIOS entry
 * @returns {{ state: GameState, profileMap: Object<string, string> }}
 */
export function createScenarioState(build, scenario) {
  // Create bard from build
  const bard = buildToCreature(build, {
    id: 'bard-0',
    position: { x: 0, y: 0 },
  })

  // Create enemies
  const enemies = []
  const profileMap = { 'bard-0': 'lore_bard' }
  let enemyIndex = 0

  for (const foe of scenario.foes) {
    for (let i = 0; i < foe.count; i++) {
      const id = `${foe.template}-${enemyIndex}`
      const enemy = createCreature(foe.template, {
        id,
        side: 'enemy',
        position: { x: 8 + enemyIndex, y: Math.floor(enemyIndex / 3) },
      })
      profileMap[id] = foe.profile || MONSTER_PROFILES[foe.template] || 'generic_melee'
      enemies.push(enemy)
      enemyIndex++
    }
  }

  const state = new GameState({ combatants: [bard, ...enemies] })
  return { state, profileMap }
}


// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// SIMULATION
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

/**
 * Simulate a scenario N times with a given build using the v2 engine.
 *
 * Returns data in the SAME shape as v1 simulateScenario() for compatibility
 * with scenarioEngine.js.
 *
 * @param {Object} build â€” populated build document
 * @param {Object} scenario â€” a SCENARIOS entry
 * @param {Object} [options]
 * @param {number} [options.numRuns=100]
 * @param {number} [options.logRuns=3]
 * @param {boolean} [options.verbose=false]
 * @returns {Object} aggregated results (same shape as v1 harness)
 */
export function simulateScenario(build, scenario, options = {}) {
  const { numRuns = 100, logRuns = 3 } = options

  const runs = []
  let wins = 0
  let totalRounds = 0
  let totalBardHpPct = 0

  for (let i = 0; i < numRuns; i++) {
    // Create fresh state + profile map each run
    const { state, profileMap } = createScenarioState(build, scenario)

    // Build v2-compatible AI using TacticsAdapter
    const getDecision = makeAdaptedAI(profileMap)
    const getReaction = makeAdaptedReactionAI(profileMap)

    // Run the encounter through v2 engine
    const result = runEncounter({
      state,
      getDecision,
      getReaction,
      maxRounds: 20,
    })

    // Extract bard analytics (matches v1 shape)
    const bardAnalytic = result.analytics.find(a => a.side === 'party')
    const bardHpPct = bardAnalytic
      ? Math.max(0, bardAnalytic.finalHP) / bardAnalytic.maxHP
      : 0

    const isWin = result.winner === 'party'
    if (isWin) wins++
    totalRounds += result.rounds
    totalBardHpPct += bardHpPct

    const runEntry = {
      winner: result.winner,
      rounds: result.rounds,
      bardHpPct: Math.round(bardHpPct * 1000) / 1000,
      analytics: result.analytics,
    }

    // Save full combat log and snapshots for first N runs
    if (i < logRuns) {
      runEntry.log = result.log
      // v2 uses 'snapshots', v1 uses 'positionSnapshots' â€” expose both
      runEntry.positionSnapshots = result.snapshots || []
    }

    runs.push(runEntry)
  }

  return {
    scenarioId: scenario.id,
    scenarioName: scenario.name,
    numRuns,
    winRate: Math.round((wins / numRuns) * 1000) / 1000,
    avgRounds: Math.round((totalRounds / numRuns) * 10) / 10,
    avgBardHpPct: numRuns > 0
      ? Math.round((totalBardHpPct / numRuns) * 1000) / 1000
      : 0,
    runs,
  }
}


/**
 * Run all 8 scenarios against a build using the v2 engine.
 *
 * @param {Object} build â€” populated build document
 * @param {Object} [options] â€” same as simulateScenario
 * @returns {Object[]} array of per-scenario aggregated results
 */
export function simulateAllScenarios(build, options = {}) {
  return SCENARIOS.map(scenario => simulateScenario(build, scenario, options))
}


