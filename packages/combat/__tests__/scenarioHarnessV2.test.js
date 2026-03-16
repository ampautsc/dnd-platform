/**
 * Scenario Simulation Harness V2 — Integration Tests (vitest)
 *
 * Verifies that the v2 harness (immutable zero-trust engine):
 *   1. Produces results in the same shape as the v1 harness
 *   2. Uses GameState + v2 EncounterRunner + TacticsAdapter
 *   3. All simulations complete without errors
 *   4. Result values are within valid ranges
 *   5. Runs all 8 scenarios with a real build
 */

import { describe, it, beforeEach, expect } from 'vitest'
import * as dice from '../src/engine/dice.js'
import {
  SCENARIOS,
  MONSTER_PROFILES,
  createScenarioState,
  simulateScenario,
  simulateAllScenarios,
} from '../src/scenarioHarnessV2.js'
import { GameState } from '../src/engine-v2/GameState.js'
import {
  SCENARIOS as V1_SCENARIOS,
  MONSTER_PROFILES as V1_MONSTER_PROFILES,
} from '../src/scenarioHarness.js'


// ═══════════════════════════════════════════════════════════════════════════
// MOCK BUILD — same as v1 harness tests for apples-to-apples comparison
// ═══════════════════════════════════════════════════════════════════════════

function mockBuild() {
  return {
    _id: 'build-test-iron',
    name: 'Gem Dragonborn — Iron Concentration',
    level: 8,
    baseStats: { str: 8, dex: 14, con: 14, int: 8, wis: 12, cha: 16 },
    speciesAsi: [
      { stat: 'CHA', bonus: 2 },
      { stat: 'CON', bonus: 1 },
    ],
    species: {
      name: 'Gem Dragonborn',
      creatureType: 'Humanoid',
      size: ['Medium'],
      speed: { walk: 30 },
      hasFlight: true,
      darkvision: 60,
      resistances: [],
      conditionImmunities: [],
      naturalArmorAC: null,
      traitList: [
        { name: 'Gem Ancestry', description: 'Force damage type.' },
        { name: 'Breath Weapon', description: '15ft cone, 2d8 force, DEX save.' },
        { name: 'Draconic Resistance', description: 'Resistance to force damage.' },
        { name: 'Psionic Mind', description: 'Telepathy 30ft.' },
        { name: 'Gem Flight', description: 'PB/long rest, 1 minute.' },
      ],
    },
    levelChoices: [
      {
        level: 4, type: 'feat',
        feat: {
          name: 'War Caster', isHalfFeat: false,
          grantsAdvConSaves: true, grantsProfConSaves: false,
          grantsArmorProficiency: null, bonusSpells: [],
        },
        halfFeatStat: null,
      },
      {
        level: 8, type: 'feat',
        feat: {
          name: 'Resilient (CON)', isHalfFeat: true,
          grantsAdvConSaves: false, grantsProfConSaves: true,
          grantsArmorProficiency: null, bonusSpells: [],
        },
        halfFeatStat: 'CON',
      },
    ],
    items: [
      { name: 'Bracers of Defense', acBonus: 2, saveBonus: 0, spellDcBonus: 0, spellAttackBonus: 0, requiresNoArmor: true, imposesCharmDisadvantage: false },
      { name: 'Cloak of Protection', acBonus: 1, saveBonus: 1, spellDcBonus: 0, spellAttackBonus: 0, requiresNoArmor: false, imposesCharmDisadvantage: false },
    ],
  }
}


// ═══════════════════════════════════════════════════════════════════════════
// STATE CREATION TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe('createScenarioState — v2', () => {
  it('returns a GameState + profileMap', () => {
    const build = mockBuild()
    const scenario = SCENARIOS.find(s => s.id === 'undead-swarm')
    const { state, profileMap } = createScenarioState(build, scenario)

    expect(state).toBeInstanceOf(GameState)
    expect(typeof profileMap).toBe('object')
  })

  it('GameState has correct number of combatants for undead-swarm', () => {
    const build = mockBuild()
    const scenario = SCENARIOS.find(s => s.id === 'undead-swarm')
    const { state } = createScenarioState(build, scenario)

    // 1 bard + 4 zombie + 4 skeleton + 2 ghoul = 11
    expect(state.combatantCount).toBe(11)
  })

  it('bard is party side, enemies are enemy side', () => {
    const build = mockBuild()
    const scenario = SCENARIOS.find(s => s.id === 'dragon-assault')
    const { state } = createScenarioState(build, scenario)

    const bard = state.getCombatant('bard-0')
    expect(bard).toBeTruthy()
    expect(bard.side).toBe('party')

    const all = state.getAllCombatants()
    const enemies = all.filter(c => c.side === 'enemy')
    expect(enemies.length).toBe(1)
    expect(enemies[0].id.startsWith('young_red_dragon')).toBe(true)
  })

  it('profileMap maps bard to lore_bard', () => {
    const build = mockBuild()
    const scenario = SCENARIOS.find(s => s.id === 'dragon-assault')
    const { profileMap } = createScenarioState(build, scenario)

    expect(profileMap['bard-0']).toBe('lore_bard')
  })

  it('profileMap maps every enemy to a valid profile', () => {
    const build = mockBuild()
    const scenario = SCENARIOS.find(s => s.id === 'mixed-encounter')
    const { state, profileMap } = createScenarioState(build, scenario)

    const enemies = state.getAllCombatants().filter(c => c.side === 'enemy')
    for (const enemy of enemies) {
      expect(profileMap[enemy.id]).toBeTruthy()
    }
  })

  it('all combatant IDs are unique', () => {
    const build = mockBuild()
    const scenario = SCENARIOS.find(s => s.id === 'mixed-encounter')
    const { state } = createScenarioState(build, scenario)

    const all = state.getAllCombatants()
    const ids = all.map(c => c.id)
    const unique = new Set(ids)
    expect(unique.size).toBe(ids.length)
  })
})


// ═══════════════════════════════════════════════════════════════════════════
// SIMULATION RESULT SHAPE — must match v1 harness format
// ═══════════════════════════════════════════════════════════════════════════

describe('simulateScenario v2 — result shape', () => {
  beforeEach(() => {
    dice.setDiceMode('average')
  })

  it('returns result with expected shape', () => {
    const build = mockBuild()
    const scenario = SCENARIOS.find(s => s.id === 'undead-swarm')

    const result = simulateScenario(build, scenario, { numRuns: 1 })

    expect(result).toBeTruthy()
    expect(result.scenarioId).toBe('undead-swarm')
    expect(result.scenarioName).toBe(scenario.name)
    expect(result.numRuns).toBe(1)
    expect(typeof result.winRate).toBe('number')
    expect(typeof result.avgRounds).toBe('number')
    expect(typeof result.avgBardHpPct).toBe('number')
    expect(Array.isArray(result.runs)).toBe(true)
    expect(result.runs.length).toBe(1)
  })

  it('each run has winner, rounds, bardHpPct, analytics', () => {
    const build = mockBuild()
    const scenario = SCENARIOS.find(s => s.id === 'werewolf-pack')

    const result = simulateScenario(build, scenario, { numRuns: 1 })
    const run = result.runs[0]

    expect(['party', 'enemy', 'draw']).toContain(run.winner)
    expect(typeof run.rounds).toBe('number')
    expect(run.rounds).toBeGreaterThanOrEqual(1)
    expect(run.rounds).toBeLessThanOrEqual(20)
    expect(typeof run.bardHpPct).toBe('number')
    expect(run.bardHpPct).toBeGreaterThanOrEqual(0)
    expect(run.bardHpPct).toBeLessThanOrEqual(1)
    expect(Array.isArray(run.analytics)).toBe(true)
    expect(run.analytics.length).toBeGreaterThan(0)
  })

  it('analytics entries have expected fields', () => {
    const build = mockBuild()
    const scenario = SCENARIOS.find(s => s.id === 'werewolf-pack')

    const result = simulateScenario(build, scenario, { numRuns: 1 })
    const analytic = result.runs[0].analytics[0]

    expect(typeof analytic.id).toBe('string')
    expect(typeof analytic.name).toBe('string')
    expect(typeof analytic.side).toBe('string')
    expect(typeof analytic.survived).toBe('boolean')
    expect(typeof analytic.finalHP).toBe('number')
    expect(typeof analytic.maxHP).toBe('number')
    expect(typeof analytic.damageDealt).toBe('number')
    expect(typeof analytic.attacksMade).toBe('number')
    expect(typeof analytic.hitRate).toBe('number')
    expect(typeof analytic.spellsCast).toBe('number')
  })

  it('first N runs include combat log and positionSnapshots', () => {
    const build = mockBuild()
    const scenario = SCENARIOS.find(s => s.id === 'werewolf-pack')

    const result = simulateScenario(build, scenario, { numRuns: 3, logRuns: 2 })

    // First 2 runs should have logs
    expect(Array.isArray(result.runs[0].log)).toBe(true)
    expect(result.runs[0].log.length).toBeGreaterThan(0)
    expect(Array.isArray(result.runs[0].positionSnapshots)).toBe(true)

    expect(Array.isArray(result.runs[1].log)).toBe(true)

    // Third run should NOT have log
    expect(result.runs[2].log).toBeUndefined()
  })

  it('winRate is between 0 and 1', () => {
    const build = mockBuild()
    const scenario = SCENARIOS.find(s => s.id === 'werewolf-pack')

    const result = simulateScenario(build, scenario, { numRuns: 3 })
    expect(result.winRate).toBeGreaterThanOrEqual(0)
    expect(result.winRate).toBeLessThanOrEqual(1)
  })

  it('bardHpPct is between 0 and 1', () => {
    const build = mockBuild()
    const scenario = SCENARIOS.find(s => s.id === 'werewolf-pack')

    const result = simulateScenario(build, scenario, { numRuns: 3 })
    expect(result.avgBardHpPct).toBeGreaterThanOrEqual(0)
    expect(result.avgBardHpPct).toBeLessThanOrEqual(1)
  })
})


// ═══════════════════════════════════════════════════════════════════════════
// FULL SIMULATION — ALL 8 SCENARIOS
// ═══════════════════════════════════════════════════════════════════════════

describe('simulateAllScenarios v2 — all 8 scenarios', () => {
  beforeEach(() => {
    dice.setDiceMode('average')
  })

  it('runs all 8 scenarios and returns valid results', () => {
    const build = mockBuild()
    const results = simulateAllScenarios(build, { numRuns: 1 })

    expect(results.length).toBe(8)

    const expectedIds = [
      'undead-swarm', 'werewolf-pack', 'cult-fanatics', 'dragon-assault',
      'frost-giant-smash', 'lich-encounter', 'archmage-duel', 'mixed-encounter',
    ]

    for (const id of expectedIds) {
      const r = results.find(r => r.scenarioId === id)
      expect(r).toBeTruthy()
      expect(r.numRuns).toBe(1)
      expect(r.runs.length).toBe(1)
    }
  })

  it('each scenario produces a winner (no crashes)', () => {
    const build = mockBuild()
    const results = simulateAllScenarios(build, { numRuns: 1 })

    for (const r of results) {
      const run = r.runs[0]
      expect(['party', 'enemy', 'draw']).toContain(run.winner)
    }
  })

  it('encounters run within round limits', () => {
    const build = mockBuild()
    const results = simulateAllScenarios(build, { numRuns: 1 })

    for (const r of results) {
      const run = r.runs[0]
      expect(run.rounds).toBeGreaterThanOrEqual(1)
      expect(run.rounds).toBeLessThanOrEqual(20)
    }
  })
})


// ═══════════════════════════════════════════════════════════════════════════
// CONSISTENCY — V2 USES SAME SCENARIOS AS V1
// ═══════════════════════════════════════════════════════════════════════════

describe('v2 harness — scenario consistency', () => {
  it('uses the same SCENARIOS as v1 harness', () => {
    expect(SCENARIOS).toBe(V1_SCENARIOS)
  })

  it('uses the same MONSTER_PROFILES as v1 harness', () => {
    expect(MONSTER_PROFILES).toBe(V1_MONSTER_PROFILES)
  })
})


// ═══════════════════════════════════════════════════════════════════════════
// MULTIPLE RUNS — AGGREGATION
// ═══════════════════════════════════════════════════════════════════════════

describe('simulateScenario v2 — multiple runs aggregation', () => {
  beforeEach(() => {
    dice.setDiceMode('average')
  })

  it('aggregates correctly across multiple runs', () => {
    const build = mockBuild()
    const scenario = SCENARIOS.find(s => s.id === 'undead-swarm')

    const result = simulateScenario(build, scenario, { numRuns: 5 })

    expect(result.numRuns).toBe(5)
    expect(result.runs.length).toBe(5)

    // With average dice all runs should produce identical results
    const winners = new Set(result.runs.map(r => r.winner))
    expect(winners.size).toBe(1)
  })

  it('avgRounds is the mean of all runs', () => {
    const build = mockBuild()
    const scenario = SCENARIOS.find(s => s.id === 'werewolf-pack')

    const result = simulateScenario(build, scenario, { numRuns: 3 })

    const manualAvg = result.runs.reduce((s, r) => s + r.rounds, 0) / result.runs.length
    expect(Math.abs(result.avgRounds - manualAvg)).toBeLessThan(0.2)
  })
})
